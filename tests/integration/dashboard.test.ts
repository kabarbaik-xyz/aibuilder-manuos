import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { DashboardService } from '@/server/modules/intelligence/dashboard';
import { OrderService } from '@/server/modules/orders/service';

describe('I07: Command Center & Cross-Module Live Dashboard', () => {
  let fixture: FactoryFixture;
  let dashboardService: DashboardService;
  let orderService: OrderService;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    dashboardService = new DashboardService(fixture.db);
    orderService = new OrderService(fixture.db);
  });

  afterAll(async () => {
    await fixture.close();
  });

  it('reports initial baseline metrics and zero exceptions in clean workspace', async () => {
    const { alpha } = fixture;

    const overview = await dashboardService.getDashboardOverview(alpha.users.planner.principal);

    expect(overview).toBeDefined();
    expect(overview.workspaceId).toBe(alpha.workspaceId);
    expect(overview.metrics.activeOrdersCount).toBe(0);
    expect(overview.metrics.qcPassedUnits).toBe('0');
    expect(overview.metrics.materialShortagesCount).toBe(0);
    expect(overview.orders.length).toBe(0);
  });

  it('aggregates live active orders and flags pending engineering approvals in exception queue', async () => {
    const { alpha } = fixture;

    // Create order draft with pending engineering review
    const orderRes = await orderService.createOrderDraft(
      alpha.users.owner.principal,
      {
        customerId: alpha.masters.customerId,
        orderTypeId: alpha.masters.orderTypeId,
        itemId: alpha.masters.fgItemId,
        orderedQuantity: 25,
        requestedDate: '2026-11-20T00:00:00Z',
      },
      'key-dash-order-1'
    );

    const overview = await dashboardService.getDashboardOverview(alpha.users.planner.principal);

    expect(overview.metrics.activeOrdersCount).toBe(1);
    expect(overview.metrics.pendingApprovalsCount).toBe(1);
    expect(overview.orders.length).toBe(1);
    expect(overview.orders[0].orderNumber).toBe(orderRes.data.orderNumber);

    // Exception queue must contain pending review alert
    const engException = overview.exceptions.find((e) => e.type === 'PENDING_APPROVAL');
    expect(engException).toBeDefined();
    expect(engException?.referenceId).toBe(orderRes.data.id);
  });

  it('restricts customer portal rep strictly to their company orders', async () => {
    const { alpha } = fixture;

    const custOverview = await dashboardService.getDashboardOverview(
      alpha.users.customerUser.principal
    );

    expect(custOverview).toBeDefined();
    for (const ord of custOverview.orders) {
      expect(ord.customerName).toBe('Apex Dynamics Corp');
    }
  });

  it('returns unavailable machine utilization when the workspace has no active machine records', async () => {
    const { alpha } = fixture;
    await fixture.db.machine.updateMany({
      where: { workspaceId: alpha.workspaceId, archivedAt: null },
      data: { archivedAt: new Date() },
    });

    const overview = await dashboardService.getDashboardOverview(alpha.users.planner.principal);

    expect(overview.metrics.machineUtilizationPct).toBeNull();
  });
});
