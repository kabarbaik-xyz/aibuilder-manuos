import { createHash, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { ConflictError, NotFoundError } from '@/domain/errors';
import { executeCommand } from '@/server/db/transaction';
import { callGeminiStructured } from '@/server/ai/gemini-client';

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
}).strict();

export type IntakeExtraction = z.infer<typeof IntakeExtractionSchema>;
type ProviderResult = { aiResult: unknown | null; reason?: string };
type ReviewRecord = {
  id: string;
  orderId: string | null;
  rawText: string;
  sourceHash: string;
  promptVersion: string;
  model: string | null;
  reviewState: 'NEEDS_REVIEW' | 'REVIEWED';
  originalExtraction: IntakeExtraction;
  extraction: IntakeExtraction;
  matchedMasters: { customerId: string | null; itemId: string | null; uomId: string | null };
  reviewerId: string | null;
  reviewedAt: string | null;
};

const PromptVersion = 'rfq-intake-v1';

function readReview(raw: string): Omit<ReviewRecord, 'id' | 'rawText' | 'orderId'> | null {
  try {
    const record = JSON.parse(raw) as Record<string, unknown>;
    const original = IntakeExtractionSchema.safeParse(record.originalExtraction);
    const extraction = IntakeExtractionSchema.safeParse(record.extraction);
    const matches = record.matchedMasters as Record<string, unknown> | undefined;
    if (!original.success || !extraction.success || typeof record.sourceHash !== 'string' || typeof record.promptVersion !== 'string' || !matches) return null;
    return {
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
      const prompt = `Extract only facts explicitly present in this RFQ. Do not invent missing values; list them as ambiguities. Return the requested structured fields.\nRFQ:\n${text}`;
      const responseSchema = {
        type: 'object',
        properties: {
          customer: { type: 'string' }, partName: { type: 'string' }, partNumber: { type: 'string' }, qty: { type: 'integer' }, material: { type: 'string' },
          tolerances: { type: 'array', items: { type: 'string' } }, ambiguities: { type: 'array', items: { type: 'string' } },
          draftBOM: { type: 'array', items: { type: 'object', properties: { partNumber: { type: 'string' }, name: { type: 'string' }, qtyPerUnit: { type: 'number' }, leadTimeDays: { type: 'integer' } }, required: ['partNumber', 'name', 'qtyPerUnit'] } },
          draftRouting: { type: 'array', items: { type: 'object', properties: { sequence: { type: 'integer' }, operation: { type: 'string' }, machineClass: { type: 'string' }, plannedHours: { type: 'number' } }, required: ['sequence', 'operation', 'plannedHours'] } },
          qcChecklist: { type: 'array', items: { type: 'string' } },
        },
        required: ['customer', 'partName', 'qty', 'material', 'tolerances', 'ambiguities', 'draftBOM', 'draftRouting', 'qcChecklist'],
      };
      return callGeminiStructured(prompt, cacheKey, { responseSchema, maxOutputTokens: 4096 });
    },
  ) {}

  async extractAndSave(principal: Principal, text: string, idempotencyKey: string) {
    requireAnyPermission(principal, ['order.create', 'engineering.write']);
    const cleanText = text.trim();
    const sourceHash = createHash('sha256').update(cleanText).digest('hex');
    const result = await this.extract(cleanText, `rfq-intake:${principal.workspaceId}:${PromptVersion}:${sourceHash}`);
    const parsed = IntakeExtractionSchema.safeParse(result.aiResult);
    if (!parsed.success) return { data: null, reason: result.reason ?? (result.aiResult ? 'invalid_schema' : 'unavailable') };

    const extraction = parsed.data;
    const [customer, item, uom] = await Promise.all([
      this.prisma.customer.findFirst({ where: { workspaceId: principal.workspaceId, archivedAt: null, OR: [{ code: extraction.customer }, { name: { equals: extraction.customer } }] }, select: { id: true } }),
      extraction.partNumber ? this.prisma.item.findFirst({ where: { workspaceId: principal.workspaceId, archivedAt: null, code: extraction.partNumber }, select: { id: true } }) : null,
      this.prisma.uom.findFirst({ where: { workspaceId: principal.workspaceId, code: 'PCS' }, select: { id: true } }),
    ]);
    const review: Omit<ReviewRecord, 'id' | 'rawText'> = {
      orderId: null,
      sourceHash,
      promptVersion: PromptVersion,
      model: process.env.GEMINI_FLASH_MODEL || 'gemini-2.5-flash',
      reviewState: 'NEEDS_REVIEW',
      originalExtraction: extraction,
      extraction,
      matchedMasters: { customerId: customer?.id ?? null, itemId: item?.id ?? null, uomId: uom?.id ?? null },
      reviewerId: null,
      reviewedAt: null,
    };
    const id = randomUUID();
    const committed = await executeCommand<{ sourceHash: string }, { id: string }>({
      principal,
      commandType: 'engineering.intake.extraction.create',
      idempotencyKey,
      payload: { sourceHash },
      prismaClient: this.prisma,
      handler: async (tx) => {
        const record = await tx.rfqDraft.create({
          data: { id, workspaceId: principal.workspaceId, rawText: cleanText, sourceType: 'TEXT', extractedFieldsJson: JSON.stringify(review) },
          select: { id: true },
        });
        return { data: record, aggregateType: 'RfqDraft', aggregateId: record.id, resourceVersion: 1, auditDetails: { sourceHash, promptVersion: PromptVersion } };
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
