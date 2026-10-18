import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { OrderService } from '@/server/modules/orders/service';
import { getOrderEvidenceTimeline } from '@/server/modules/order-lifecycle/traceability';
import { ForbiddenError, NotFoundError } from '@/domain/errors';

describe('Order evidence timeline', () => {
  let fixture: FactoryFixture;

  beforeAll(async () => { fixture = await createFactoryFixture(); });
  afterAll(async () => { await fixture.close(); });

  it('links shipment evidence to its order with readable labels and supports bounded search', async () => {
    const { alpha } = fixture;
    const order = await new OrderService(fixture.db).createOrderDraft(alpha.users.owner.principal, {
      customerId: alpha.masters.customerId, orderTypeId: alpha.masters.orderTypeId,
      itemId: alpha.masters.fgItemId, orderedQuantity: '2', requestedDate: '2026-12-22T00:00:00.000Z',
    }, 'evidence-timeline-order');
    const deliveredAt = new Date('2026-12-23T08:30:00.000Z');
    const shipment = await fixture.db.shipment.create({ data: {
      workspaceId: alpha.workspaceId, shipmentNumber: 'SHP-TIMELINE-1', orderId: order.data.id,
      customerId: alpha.masters.customerId, status: 'DELIVERED', deliveredAt,
      destinationAddress: 'Customer receiving dock',
    } });
    await fixture.db.shipmentLine.create({ data: {
      workspaceId: alpha.workspaceId, shipmentId: shipment.id, itemId: alpha.masters.fgItemId,
      sourceLocationId: alpha.masters.fgLocationId, allocatedAtoms: 2_000_000n,
      dispatchedAtoms: 2_000_000n, deliveredAtoms: 2_000_000n,
    } });
    const secondShipment = await fixture.db.shipment.create({ data: {
      workspaceId: alpha.workspaceId, shipmentNumber: 'SHP-TIMELINE-2', orderId: order.data.id,
      customerId: alpha.masters.customerId, status: 'DISPATCHED',
      allocatedAt: new Date('2026-12-24T07:00:00.000Z'), dispatchedAt: new Date('2026-12-24T09:00:00.000Z'),
      destinationAddress: 'Customer receiving dock',
    } });
    await fixture.db.shipmentLine.create({ data: {
      workspaceId: alpha.workspaceId, shipmentId: secondShipment.id, itemId: alpha.masters.fgItemId,
      sourceLocationId: alpha.masters.fgLocationId, allocatedAtoms: 1_000_000n,
      dispatchedAtoms: 1_000_000n,
    } });
    const passport = await fixture.db.passport.create({ data: {
      workspaceId: alpha.workspaceId, serialNumber: 'SN-TIMELINE-1', orderId: order.data.id,
      itemId: alpha.masters.fgItemId, digestSha256: 'a'.repeat(64), snapshotJson: JSON.stringify({ serialNumber: 'SN-TIMELINE-1' }),
      publishedById: alpha.users.owner.principal.userId,
    } });

    const timeline = await getOrderEvidenceTimeline(fixture.db, alpha.users.owner.principal, order.data.id);
    expect(timeline.events).toContainEqual(expect.objectContaining({
      reference: `SHIPMENT:${shipment.id}:DELIVERED`, category: 'DELIVERY', title: 'Shipment delivered',
      label: 'SHP-TIMELINE-1', occurredAt: deliveredAt.toISOString(),
      orderId: order.data.id, shipmentId: shipment.id,
    }));
    expect(timeline.events).toContainEqual(expect.objectContaining({
      reference: `SHIPMENT:${secondShipment.id}:DISPATCHED`, title: 'Shipment dispatched',
      label: 'SHP-TIMELINE-2', shipmentId: secondShipment.id,
    }));
    expect(timeline.events).toContainEqual(expect.objectContaining({
      reference: `PASSPORT_PUBLICATION:${passport.id}:v1`, category: 'PASSPORT',
      title: 'Unit passport published', label: 'SN-TIMELINE-1', href: '/passports/SN-TIMELINE-1',
    }));
    const searched = await getOrderEvidenceTimeline(fixture.db, alpha.users.owner.principal, order.data.id, { search: 'shipment delivered' });
    expect(searched.events).toHaveLength(1);
    expect(searched.events[0].shipmentId).toBe(shipment.id);
    expect(searched.events[0].references).not.toContain(shipment.id);
  });

  it('does not reveal another facility order or customer-internal evidence', async () => {
    const { alpha } = fixture;
    const order = await new OrderService(fixture.db).createOrderDraft(alpha.users.owner.principal, {
      customerId: alpha.masters.customerId, orderTypeId: alpha.masters.orderTypeId,
      itemId: alpha.masters.fgItemId, orderedQuantity: '1', requestedDate: '2026-12-22T00:00:00.000Z',
    }, 'evidence-timeline-private-order');
    const facility = await fixture.db.facility.create({ data: {
      workspaceId: alpha.workspaceId, code: 'EVIDENCE-PRIVATE', name: 'Evidence private facility',
    } });
    await fixture.db.order.update({ where: { id: order.data.id }, data: { facilityId: facility.id } });
    await expect(getOrderEvidenceTimeline(fixture.db, alpha.users.planner.principal, order.data.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getOrderEvidenceTimeline(fixture.db, alpha.users.customerUser.principal, order.data.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('shows recovery proposals as pending until the applied result is persisted', async () => {
    const { alpha } = fixture;
    const order = await new OrderService(fixture.db).createOrderDraft(alpha.users.owner.principal, {
      customerId: alpha.masters.customerId, orderTypeId: alpha.masters.orderTypeId,
      itemId: alpha.masters.fgItemId, orderedQuantity: '1', requestedDate: '2026-12-22T00:00:00.000Z',
    }, 'evidence-timeline-recovery-order');
    const pending = await fixture.db.recoveryProposal.create({ data: {
      workspaceId: alpha.workspaceId, orderId: order.data.id, orderVersion: order.data.version,
      proposalJson: JSON.stringify({ mode: 'SCHEDULE_REVIEW' }), proposedById: alpha.users.owner.principal.userId,
    } });
    const applied = await fixture.db.recoveryProposal.create({ data: {
      workspaceId: alpha.workspaceId, orderId: order.data.id, orderVersion: order.data.version,
      proposalJson: JSON.stringify({ mode: 'SCHEDULE_REVIEW' }), status: 'APPROVED',
      proposedById: alpha.users.owner.principal.userId, resolvedById: alpha.users.owner.principal.userId,
      resolvedAt: new Date('2026-12-23T10:00:00.000Z'), resolutionNote: 'Applied 2 reviewed task assignments.',
    } });

    const timeline = await getOrderEvidenceTimeline(fixture.db, alpha.users.owner.principal, order.data.id);
    expect(timeline.events).toContainEqual(expect.objectContaining({
      reference: `RECOVERY_PROPOSAL:${pending.id}:PROPOSED`, title: 'Schedule review awaiting decision',
      summary: 'Proposal is a review only; no schedule change is recorded until the apply command succeeds.',
    }));
    expect(timeline.events).toContainEqual(expect.objectContaining({
      reference: `RECOVERY_PROPOSAL:${applied.id}:APPROVED`, title: 'Reviewed schedule applied',
      summary: 'Applied 2 reviewed task assignments.',
    }));
  });
});
