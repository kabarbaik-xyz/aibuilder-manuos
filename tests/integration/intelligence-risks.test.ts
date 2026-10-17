import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFactoryFixture, type FactoryFixture } from '../fixtures/factory';
import { ForbiddenError, NotFoundError } from '@/domain/errors';
import { OrderService } from '@/server/modules/orders/service';
import { RisksService } from '@/server/modules/intelligence/risks';
import { parseQuantity } from '@/domain/quantity';

describe('derived intelligence risk inbox', () => {
  let fixture: FactoryFixture;
  let risks: RisksService;
  let orderId: string;
  let demandId: string;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    risks = new RisksService(fixture.db);
    const order = await new OrderService(fixture.db).createOrderDraft(
      fixture.alpha.users.owner.principal,
      {
        customerId: fixture.alpha.masters.customerId,
        orderTypeId: fixture.alpha.masters.orderTypeId,
        itemId: fixture.alpha.masters.fgItemId,
        orderedQuantity: 25,
        requestedDate: '2026-11-20T00:00:00Z',
      },
      'key-risk-inbox-order'
    );
    orderId = order.data.id;
    const demand = await fixture.db.materialDemand.create({
      data: { workspaceId: fixture.alpha.workspaceId, orderId, itemId: fixture.alpha.masters.rawItemId, requiredAtoms: parseQuantity('3'), status: 'OPEN' },
    });
    demandId = demand.id;
  });

  afterAll(async () => {
    await fixture.close();
  });

  it('filters, paginates, and resolves the current source record', async () => {
    const principal = fixture.alpha.users.planner.principal;
    const result = await risks.list(principal, { type: 'PENDING_APPROVAL', page: 1, pageSize: 10 });

    expect(result.coverage.complete).toBe(false);
    expect(result.coverage.orderDerivedLimit).toBe(50);
    expect(result.pagination.total).toBe(1);
    expect(result.items[0].referenceId).toBe(orderId);

    const detail = await risks.get(principal, result.items[0].id);
    expect(detail.risk.referenceId).toBe(orderId);
    expect(detail.source).toMatchObject({ type: 'ORDER', id: orderId, href: `/orders/${orderId}` });
    expect(detail.coverageNote).toContain('50 most recently created');
    expect(detail.cause).toContain('awaits engineering approval');
    expect(detail.affectedRecords).toContainEqual(expect.objectContaining({ type: 'ORDER', id: orderId }));
    expect(detail.evidence).toContainEqual(expect.objectContaining({ label: 'Engineering status', value: 'DRAFT' }));
    expect(detail.permittedActions).toContainEqual(expect.objectContaining({ label: 'Review order', href: `/orders/${orderId}` }));
  });

  it('does not authorize roles that cannot read the dashboard source data', async () => {
    const noReadAccess = { ...fixture.alpha.users.owner.principal, permissions: new Set<string>() };
    await expect(risks.list(noReadAccess, {})).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('resolves material shortage facts and hides internal demand evidence from customer principals', async () => {
    const planner = fixture.alpha.users.planner.principal;
    const list = await risks.list(planner, { type: 'MATERIAL_SHORTAGE' });
    const risk = list.items.find(item => item.referenceId === demandId);
    expect(risk).toBeDefined();
    const detail = await risks.get(planner, risk!.id);
    expect(detail.evidence).toContainEqual(expect.objectContaining({ label: 'Required quantity', value: '3' }));
    expect(detail.affectedRecords).toContainEqual(expect.objectContaining({ type: 'ORDER', id: orderId }));
    expect(detail.permittedActions).toContainEqual(expect.objectContaining({ label: 'Review affected order', href: `/orders/${orderId}` }));

    const customer = fixture.alpha.users.customerUser.principal;
    const customerList = await risks.list(customer, { type: 'MATERIAL_SHORTAGE' });
    expect(customerList.items).toHaveLength(0);
    await expect(risks.get(customer, risk!.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('does not resolve risks outside the principal current dashboard scope', async () => {
    const planner = fixture.alpha.users.planner.principal;
    const detail = await risks.list(planner, { type: 'PENDING_APPROVAL', page: 1, pageSize: 10 });
    const id = detail.items.find(item => item.referenceId === orderId)?.id;
    expect(id).toBeTruthy();
    await expect(risks.get(fixture.beta.users.owner.principal, id!)).rejects.toBeInstanceOf(NotFoundError);
  });
});
