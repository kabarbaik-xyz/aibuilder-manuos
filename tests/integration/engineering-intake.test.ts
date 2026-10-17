import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { EngineeringIntakeService, IntakeExtraction } from '@/server/modules/engineering/intake';
import { BadRequestError, NotFoundError } from '@/domain/errors';
import { OrderService } from '@/server/modules/orders/service';

const extraction: IntakeExtraction = {
  customer: 'Apex Dynamics Corp', partName: 'Precision Mounting Bracket', partNumber: 'BRK-1001', qty: 80, material: 'Titanium Ti-6Al-4V',
  tolerances: ['Bore diameter ±0.012 mm'], ambiguities: ['Confirm anodize specification'], draftBOM: [], draftRouting: [], qcChecklist: [],
};

describe('Engineering intake persisted review', () => {
  let fixture: FactoryFixture;
  let service: EngineeringIntakeService;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    const item = await fixture.db.item.findUniqueOrThrow({ where: { id: fixture.alpha.masters.fgItemId } });
    service = new EngineeringIntakeService(fixture.db, async () => ({ aiResult: { ...extraction, partNumber: item.code } }));
  });

  afterAll(async () => { await fixture.close(); });

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
