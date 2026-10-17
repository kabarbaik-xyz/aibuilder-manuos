import { createHash, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { BadRequestError, ConflictError, NotFoundError } from '@/domain/errors';
import { executeCommand } from '@/server/db/transaction';
import { callGeminiStructured } from '@/server/ai/gemini-client';
import { DocumentRepository } from '@/server/modules/documents/repository';
import { DocumentService } from '@/server/modules/documents/service';

const IntakeCitationSchema = z.object({
  field: z.enum(['customer', 'partName', 'partNumber', 'qty', 'material', 'tolerances', 'draftBOM', 'draftRouting', 'qcChecklist']),
  quote: z.string().trim().min(1).max(1000),
}).strict();

export const IntakeExtractionSchema = z.object({
  customer: z.string().trim().min(1).max(160),
  partName: z.string().trim().min(1).max(200),
  partNumber: z.string().trim().max(100).optional(),
  qty: z.number().int().positive().safe(),
  material: z.string().trim().min(1).max(200),
  tolerances: z.array(z.string().trim().min(1).max(500)).max(50).default([]),
  ambiguities: z.array(z.string().trim().min(1).max(1000)).max(50).default([]),
  draftBOM: z.array(z.object({
    partNumber: z.string().trim().max(100), name: z.string().trim().min(1).max(200),
    qtyPerUnit: z.number().positive().finite(), leadTimeDays: z.number().int().nonnegative().optional(),
  }).strict()).max(100).default([]),
  draftRouting: z.array(z.object({
    sequence: z.number().int().positive(), operation: z.string().trim().min(1).max(200),
    machineClass: z.string().trim().max(100).optional(), plannedHours: z.number().positive().finite(),
  }).strict()).max(100).default([]),
  qcChecklist: z.array(z.string().trim().min(1).max(500)).max(100).default([]),
  citations: z.array(IntakeCitationSchema).max(200).default([]),
}).strict();

export type IntakeExtraction = z.infer<typeof IntakeExtractionSchema>;
type IntakeExtractionFields = Omit<IntakeExtraction, 'citations'>;
type ProviderResult = { aiResult: unknown | null; reason?: string };
type ReviewRecord = {
  id: string;
  orderId: string | null;
  rawText: string;
  sourceDocumentId: string | null;
  sourceFileName: string | null;
  citations: Array<z.infer<typeof IntakeCitationSchema>>;
  sourceHash: string;
  promptVersion: string;
  model: string | null;
  reviewState: 'NEEDS_REVIEW' | 'REVIEWED';
  originalExtraction: IntakeExtractionFields;
  extraction: IntakeExtractionFields;
  matchedMasters: { customerId: string | null; itemId: string | null; uomId: string | null };
  reviewerId: string | null;
  reviewedAt: string | null;
};

const PromptVersion = 'rfq-intake-v2';

function citationSupportsExtractedValue(citation: z.infer<typeof IntakeCitationSchema>, extraction: IntakeExtraction): boolean {
  const candidates: string[] = (() => {
    switch (citation.field) {
      case 'customer': return [extraction.customer];
      case 'partName': return [extraction.partName];
      case 'partNumber': return extraction.partNumber ? [extraction.partNumber] : [];
      case 'qty': return [String(extraction.qty)];
      case 'material': return [extraction.material];
      case 'tolerances': return extraction.tolerances;
      case 'draftBOM': return extraction.draftBOM.flatMap((row) => [row.partNumber, row.name, String(row.qtyPerUnit)]);
      case 'draftRouting': return extraction.draftRouting.flatMap((row) => [String(row.sequence), row.operation, row.machineClass ?? '', String(row.plannedHours)]);
      case 'qcChecklist': return extraction.qcChecklist;
    }
  })().filter(Boolean);
  const quote = citation.quote.toLocaleLowerCase();
  return candidates.some((candidate) => {
    if (citation.field === 'qty' || citation.field === 'draftBOM' && /^\d+(?:\.\d+)?$/.test(candidate)) {
      return new RegExp(`(^|[^0-9.])${candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^0-9.]|$)`).test(citation.quote);
    }
    return quote.includes(candidate.toLocaleLowerCase());
  });
}

function readReview(raw: string): Omit<ReviewRecord, 'id' | 'rawText' | 'orderId'> | null {
  try {
    const record = JSON.parse(raw) as Record<string, unknown>;
    const original = IntakeExtractionSchema.safeParse(record.originalExtraction);
    const extraction = IntakeExtractionSchema.safeParse(record.extraction);
    const matches = record.matchedMasters as Record<string, unknown> | undefined;
    if (!original.success || !extraction.success || typeof record.sourceHash !== 'string' || typeof record.promptVersion !== 'string' || !matches) return null;
    const citations = z.array(IntakeCitationSchema).max(200).catch([]).parse(record.citations ?? []);
    return {
      sourceDocumentId: typeof record.sourceDocumentId === 'string' ? record.sourceDocumentId : null,
      sourceFileName: typeof record.sourceFileName === 'string' ? record.sourceFileName : null,
      citations,
      sourceHash: record.sourceHash,
      promptVersion: record.promptVersion,
      model: typeof record.model === 'string' ? record.model : null,
      reviewState: record.reviewState === 'REVIEWED' ? 'REVIEWED' : 'NEEDS_REVIEW',
      originalExtraction: original.data,
      extraction: extraction.data,
      matchedMasters: {
        customerId: typeof matches.customerId === 'string' ? matches.customerId : null,
        itemId: typeof matches.itemId === 'string' ? matches.itemId : null,
        uomId: typeof matches.uomId === 'string' ? matches.uomId : null,
      },
      reviewerId: typeof record.reviewerId === 'string' ? record.reviewerId : null,
      reviewedAt: typeof record.reviewedAt === 'string' ? record.reviewedAt : null,
    };
  } catch {
    return null;
  }
}

export class EngineeringIntakeService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly extract: (text: string, cacheKey: string) => Promise<ProviderResult> = async (text, cacheKey) => {
      const prompt = `Extract only facts explicitly present in this RFQ. Do not invent missing values; list them as ambiguities. For every extracted field, include a short exact source quote as a citation. A quote must be copied verbatim from the RFQ; omit a citation when no exact supporting quote exists. Return the requested structured fields.\nRFQ:\n${text}`;
      const responseSchema = {
        type: 'object',
        properties: {
          customer: { type: 'string' }, partName: { type: 'string' }, partNumber: { type: 'string' }, qty: { type: 'integer' }, material: { type: 'string' },
          tolerances: { type: 'array', items: { type: 'string' } }, ambiguities: { type: 'array', items: { type: 'string' } },
          draftBOM: { type: 'array', items: { type: 'object', properties: { partNumber: { type: 'string' }, name: { type: 'string' }, qtyPerUnit: { type: 'number' }, leadTimeDays: { type: 'integer' } }, required: ['partNumber', 'name', 'qtyPerUnit'] } },
          draftRouting: { type: 'array', items: { type: 'object', properties: { sequence: { type: 'integer' }, operation: { type: 'string' }, machineClass: { type: 'string' }, plannedHours: { type: 'number' } }, required: ['sequence', 'operation', 'plannedHours'] } },
          qcChecklist: { type: 'array', items: { type: 'string' } },
          citations: { type: 'array', items: { type: 'object', properties: { field: { type: 'string', enum: ['customer', 'partName', 'partNumber', 'qty', 'material', 'tolerances', 'draftBOM', 'draftRouting', 'qcChecklist'] }, quote: { type: 'string' } }, required: ['field', 'quote'] } },
        },
        required: ['customer', 'partName', 'qty', 'material', 'tolerances', 'ambiguities', 'draftBOM', 'draftRouting', 'qcChecklist'],
      };
      return callGeminiStructured(prompt, cacheKey, { responseSchema, maxOutputTokens: 4096 });
    },
    private readonly documents: DocumentService = new DocumentService(new DocumentRepository(prisma), prisma),
  ) {}

  async extractAndSave(principal: Principal, text: string, idempotencyKey: string) {
    return this.extractSourceAndSave(principal, text, idempotencyKey, null);
  }

  async extractDocumentAndSave(principal: Principal, documentId: string, idempotencyKey: string) {
    const { document, content } = await this.documents.authorizeDocumentDownload(principal, documentId);
    if (!['text/plain', 'text/csv'].includes(document.mimeType)) {
      throw new BadRequestError('Only plain text and CSV RFQs can be extracted here. PDF and image OCR are not connected.');
    }
    let decoded: string;
    try {
      decoded = new TextDecoder('utf-8', { fatal: true }).decode(content).replace(/^\uFEFF/, '');
    } catch {
      throw new BadRequestError('The stored RFQ is not valid UTF-8 text. Upload a UTF-8 plain text or CSV file.');
    }
    return this.extractSourceAndSave(principal, decoded, idempotencyKey, { id: document.id, fileName: document.fileName });
  }

  private async extractSourceAndSave(principal: Principal, text: string, idempotencyKey: string, sourceDocument: { id: string; fileName: string } | null) {
    requireAnyPermission(principal, ['order.create', 'engineering.write']);
    const cleanText = text.trim();
    if (!cleanText || cleanText.length > 20_000) throw new BadRequestError('RFQ source must contain 1 to 20,000 UTF-8 characters.');
    const sourceHash = createHash('sha256').update(cleanText).digest('hex');
    const result = await this.extract(cleanText, `rfq-intake:${principal.workspaceId}:${PromptVersion}:${sourceHash}`);
    const parsed = IntakeExtractionSchema.safeParse(result.aiResult);
    if (!parsed.success) return { data: null, reason: result.reason ?? (result.aiResult ? 'invalid_schema' : 'unavailable') };

    const extraction = parsed.data;
    const citations = extraction.citations.filter((citation) => cleanText.includes(citation.quote) && citationSupportsExtractedValue(citation, extraction));
    const { citations: _providerCitations, ...extractedFields } = extraction;
    const [customer, item, uom] = await Promise.all([
      this.prisma.customer.findFirst({ where: { workspaceId: principal.workspaceId, archivedAt: null, OR: [{ code: extraction.customer }, { name: { equals: extraction.customer } }] }, select: { id: true } }),
      extraction.partNumber ? this.prisma.item.findFirst({ where: { workspaceId: principal.workspaceId, archivedAt: null, code: extraction.partNumber }, select: { id: true } }) : null,
      this.prisma.uom.findFirst({ where: { workspaceId: principal.workspaceId, code: 'PCS' }, select: { id: true } }),
    ]);
    const review: Omit<ReviewRecord, 'id' | 'rawText'> = {
      orderId: null,
      sourceDocumentId: sourceDocument?.id ?? null,
      sourceFileName: sourceDocument?.fileName ?? null,
      citations,
      sourceHash,
      promptVersion: PromptVersion,
      model: process.env.GEMINI_FLASH_MODEL || 'gemini-flash-lite-latest',
      reviewState: 'NEEDS_REVIEW',
      originalExtraction: extractedFields,
      extraction: extractedFields,
      matchedMasters: { customerId: customer?.id ?? null, itemId: item?.id ?? null, uomId: uom?.id ?? null },
      reviewerId: null,
      reviewedAt: null,
    };
    const id = randomUUID();
    const committed = await executeCommand<{ sourceHash: string; sourceDocumentId: string | null }, { id: string }>({
      principal,
      commandType: 'engineering.intake.extraction.create',
      idempotencyKey,
      payload: { sourceHash, sourceDocumentId: sourceDocument?.id ?? null },
      prismaClient: this.prisma,
      handler: async (tx) => {
        const record = await tx.rfqDraft.create({
          data: { id, workspaceId: principal.workspaceId, rawText: cleanText, sourceType: sourceDocument ? 'DOCUMENT' : 'TEXT', extractedFieldsJson: JSON.stringify(review) },
          select: { id: true },
        });
        return { data: record, aggregateType: 'RfqDraft', aggregateId: record.id, resourceVersion: 1, auditDetails: { sourceHash, sourceDocumentId: sourceDocument?.id ?? null, promptVersion: PromptVersion } };
      },
    });
    return { data: { ...review, id: committed.data.id, rawText: cleanText } };
  }

  async getReview(principal: Principal, id: string): Promise<ReviewRecord> {
    requireAnyPermission(principal, ['order.create', 'engineering.write']);
    const row = await this.prisma.rfqDraft.findFirst({ where: { id, workspaceId: principal.workspaceId }, select: { id: true, orderId: true, rawText: true, extractedFieldsJson: true } });
    if (!row) throw new NotFoundError(`RFQ review '${id}' not found`);
    const review = readReview(row.extractedFieldsJson);
    if (!review) throw new ConflictError('RFQ review metadata is invalid and must be re-extracted.');
    return { ...review, id: row.id, orderId: row.orderId, rawText: row.rawText };
  }

  async saveReview(principal: Principal, id: string, rawExtraction: unknown, idempotencyKey: string) {
    requireAnyPermission(principal, ['order.create', 'engineering.write']);
    const extraction = IntakeExtractionSchema.parse(rawExtraction);
    return executeCommand({
      principal,
      commandType: 'engineering.intake.extraction.review',
      idempotencyKey,
      payload: { id, extraction },
      prismaClient: this.prisma,
      handler: async (tx) => {
        const row = await tx.rfqDraft.findFirst({ where: { id, workspaceId: principal.workspaceId } });
        if (!row || row.orderId) throw new NotFoundError(`Unapplied RFQ review '${id}' not found`);
        const previous = readReview(row.extractedFieldsJson);
        if (!previous) throw new ConflictError('RFQ review metadata is invalid and cannot be updated.');
        if (previous.reviewState === 'REVIEWED') throw new ConflictError('This RFQ review has already been finalized. Re-extract to start a new review.');
        const now = new Date().toISOString();
        const next = { ...previous, extraction, reviewState: 'REVIEWED' as const, reviewerId: principal.userId, reviewedAt: now };
        const updated = await tx.rfqDraft.update({ where: { id }, data: { extractedFieldsJson: JSON.stringify(next), updatedAt: new Date(now) }, select: { id: true, updatedAt: true } });
        return { data: { id: updated.id, reviewState: next.reviewState, reviewerId: next.reviewerId, reviewedAt: next.reviewedAt }, aggregateType: 'RfqDraft', aggregateId: updated.id, resourceVersion: 2, auditDetails: { sourceHash: next.sourceHash, reviewState: next.reviewState } };
      },
    });
  }
}
