import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { EngineeringIntakeService, IntakeExtraction } from '@/server/modules/engineering/intake';
import { BadRequestError, NotFoundError } from '@/domain/errors';
import { OrderService } from '@/server/modules/orders/service';
import { DocumentRepository } from '@/server/modules/documents/repository';
import { DocumentService } from '@/server/modules/documents/service';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const extraction: IntakeExtraction = {
  customer: 'Apex Dynamics Corp', partName: 'Precision Mounting Bracket', partNumber: 'BRK-1001', qty: 80, material: 'Titanium Ti-6Al-4V',
  tolerances: ['Bore diameter ±0.012 mm'], ambiguities: ['Confirm anodize specification'], draftBOM: [], draftRouting: [], qcChecklist: [], citations: [],
};

describe('Engineering intake persisted review', () => {
  let fixture: FactoryFixture;
  let service: EngineeringIntakeService;
  let documentService: DocumentService;
  let storageRoot: string;
  let originalStorageRoot: string | undefined;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    originalStorageRoot = process.env.STORAGE_ROOT;
    storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'manuos-rfq-intake-'));
    process.env.STORAGE_ROOT = storageRoot;
    documentService = new DocumentService(new DocumentRepository(fixture.db), fixture.db);
    const item = await fixture.db.item.findUniqueOrThrow({ where: { id: fixture.alpha.masters.fgItemId } });
    service = new EngineeringIntakeService(fixture.db, async () => ({ aiResult: { ...extraction, partNumber: item.code, citations: [{ field: 'material', quote: 'Material: Titanium Ti-6Al-4V' }, { field: 'qty', quote: 'Quantity: 80 pcs' }, { field: 'qty', quote: 'Customer: Apex Dynamics Corp' }, { field: 'partName', quote: 'Invented supporting quote' }] } }), documentService);
  });

  afterAll(async () => { await fixture.close(); await fs.rm(storageRoot, { recursive: true, force: true }); if (originalStorageRoot === undefined) delete process.env.STORAGE_ROOT; else process.env.STORAGE_ROOT = originalStorageRoot; });

  it('extracts from an authorized stored text document and keeps only exact source citations', async () => {
    const principal = fixture.alpha.users.owner.principal;
    const text = 'Customer: Apex Dynamics Corp\nPart: BRK-1001\nQuantity: 80 pcs\nMaterial: Titanium Ti-6Al-4V';
    const document = await documentService.uploadDocument(principal, {
      fileName: 'customer-rfq.txt', mimeType: 'text/plain', content: Buffer.from(text, 'utf8'), description: 'Customer RFQ',
    });
    const created = await service.extractDocumentAndSave(principal, document.id, 'rfq-document-intake-create');
    expect(created.data?.sourceDocumentId).toBe(document.id);
    expect(created.data?.sourceFileName).toBe('customer-rfq.txt');
    expect(created.data?.rawText).toBe(text);
    expect(created.data?.citations).toEqual([{ field: 'material', quote: 'Material: Titanium Ti-6Al-4V' }, { field: 'qty', quote: 'Quantity: 80 pcs' }]);
    const reviewed = created.data && await service.getReview(principal, created.data.id);
    expect(reviewed?.sourceDocumentId).toBe(document.id);
    expect(reviewed?.citations.every((citation) => reviewed.rawText.includes(citation.quote))).toBe(true);
    const persisted = await fixture.db.rfqDraft.findUniqueOrThrow({ where: { id: created.data!.id } });
    expect(persisted.sourceType).toBe('DOCUMENT');
    expect(JSON.parse(persisted.extractedFieldsJson).sourceDocumentId).toBe(document.id);
    const sameContentDifferentDocument = await documentService.uploadDocument(principal, {
      fileName: 'duplicate-content.csv', mimeType: 'text/csv', content: Buffer.from(text, 'utf8'),
    });
    await expect(service.extractDocumentAndSave(principal, sameContentDifferentDocument.id, 'rfq-document-intake-create')).rejects.toThrow(/Idempotency key.*different request payload/i);
  });

  it('rejects unsupported document formats and documents from another workspace', async () => {
    const principal = fixture.alpha.users.owner.principal;
    const pdf = await documentService.uploadDocument(principal, { fileName: 'unsupported.pdf', mimeType: 'application/pdf', content: Buffer.from('%PDF-1.4 fake') });
    const foreign = await documentService.uploadDocument(fixture.beta.users.owner.principal, { fileName: 'foreign.txt', mimeType: 'text/plain', content: Buffer.from('secret') });
    const beforeDrafts = await fixture.db.rfqDraft.count({ where: { workspaceId: fixture.alpha.workspaceId } });
    await expect(service.extractDocumentAndSave(principal, pdf.id, 'rfq-document-pdf')).rejects.toThrow(/Only plain text and CSV RFQs/);
    await expect(service.extractDocumentAndSave(principal, foreign.id, 'rfq-document-foreign')).rejects.toThrowError(NotFoundError);
    expect(await fixture.db.rfqDraft.count({ where: { workspaceId: fixture.alpha.workspaceId } })).toBe(beforeDrafts);
  });

  it('stores bounded source provenance, exposes only workspace-scoped records, and locks reviewer edits', async () => {
    const principal = fixture.alpha.users.owner.principal;
    const created = await service.extractAndSave(principal, 'Customer: Apex Dynamics Corp\nPart: BRK-1001\nQuantity: 80 pcs', 'rfq-intake-create');
    expect(created.data).toBeDefined();
    if (!created.data) return;
    expect(created.data.reviewState).toBe('NEEDS_REVIEW');
    expect(created.data.sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(created.data.matchedMasters.customerId).toBe(fixture.alpha.masters.customerId);
    expect(created.data.matchedMasters.itemId).toBe(fixture.alpha.masters.fgItemId);

    const review = await service.getReview(principal, created.data.id);
    expect(review.rawText).toContain('Quantity: 80 pcs');
    const reviewedExtraction = { ...review.extraction, material: 'Reviewed titanium specification' };
    const saved = await service.saveReview(principal, review.id, reviewedExtraction, 'rfq-intake-review');
    expect(saved.data.reviewState).toBe('REVIEWED');
    const verified = await service.getReview(principal, review.id);
    expect(verified.extraction.material).toBe('Reviewed titanium specification');
    expect(verified.originalExtraction.material).toBe('Titanium Ti-6Al-4V');
    expect(verified.reviewerId).toBe(principal.userId);
    expect(verified.reviewedAt).toBeTruthy();
    await expect(service.getReview(fixture.beta.users.owner.principal, review.id)).rejects.toThrowError(NotFoundError);

    const orderService = new OrderService(fixture.db);
    const order = await orderService.createOrderDraft(principal, {
      customerId: fixture.alpha.masters.customerId,
      orderTypeId: fixture.alpha.masters.orderTypeId,
      itemId: fixture.alpha.masters.fgItemId,
      orderedQuantity: '80',
      requestedDate: '2026-12-30T00:00:00.000Z',
      rfqDraftId: review.id,
    } as never, 'rfq-intake-order-handoff');
    const linkedSource = await fixture.db.rfqDraft.findUniqueOrThrow({ where: { id: review.id } });
    expect(linkedSource.orderId).toBe(order.data.id);
    expect(JSON.parse(linkedSource.extractedFieldsJson).handoffOrderId).toBe(order.data.id);
    await expect(orderService.createOrderDraft(principal, {
      customerId: fixture.alpha.masters.customerId, orderTypeId: fixture.alpha.masters.orderTypeId,
      itemId: fixture.alpha.masters.fgItemId, orderedQuantity: '80', requestedDate: '2026-12-30T00:00:00.000Z', rfqDraftId: review.id,
    } as never, 'rfq-intake-order-handoff-again')).rejects.toThrowError(BadRequestError);
  });

  it('does not persist source text when extraction is unavailable', async () => {
    const unavailable = new EngineeringIntakeService(fixture.db, async () => ({ aiResult: null, reason: 'unavailable' }));
    const result = await unavailable.extractAndSave(fixture.alpha.users.owner.principal, 'No provider result', 'rfq-intake-unavailable');
    expect(result).toEqual({ data: null, reason: 'unavailable' });
    expect(await fixture.db.rfqDraft.count({ where: { workspaceId: fixture.alpha.workspaceId, rawText: 'No provider result' } })).toBe(0);
  });
});
