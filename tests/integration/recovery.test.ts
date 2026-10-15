import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { RecoveryService } from '@/server/modules/intelligence/recovery';
import { OrderService } from '@/server/modules/orders/service';
import { parseQuantity } from '@/domain/quantity';
import { NotFoundError, BadRequestError } from '@/domain/errors';

describe('I03: Self-Healing Recovery Simulations & Atomic Approval', () => {
  let fixture: FactoryFixture;
  let recoveryService: RecoveryService;
  let orderService: OrderService;
  let testOrderId: string;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    recoveryService = new RecoveryService(fixture.db);
    orderService = new OrderService(fixture.db);

    const { alpha } = fixture;

    // Create a real order for recovery tests
    const orderRes = await orderService.createOrderDraft(
      alpha.users.owner.principal,
      {
        customerId: alpha.masters.customerId,
        orderTypeId: alpha.masters.orderTypeId,
        itemId: alpha.masters.fgItemId,
        orderedQuantity: 120,
        requestedDate: '2026-11-25T00:00:00.000Z',
      },
      'key-order-recovery-101'
    );
    testOrderId = orderRes.data.id;

    await fixture.db.order.update({
      where: { id: testOrderId },
      data: {
        promisedDate: new Date('2026-11-25T00:00:00.000Z'),
      },
    });
  });

  afterAll(async () => {
    await fixture.close();
  });

  it('generates recovery proposals with constraint violations and recommendations', async () => {
    const { alpha } = fixture;

    const proposal = await recoveryService.proposeRecovery(
      alpha.users.planner.principal,
      {
        orderId: testOrderId,
        disruptionType: 'MATERIAL_DELAY',
        delayDays: 3,
        materialArrivesDate: '2026-11-27',
      }
    );

    expect(proposal).toBeDefined();
    expect(proposal.orderId).toBe(testOrderId);
    expect(proposal.totalQty).toBe(120);
    expect(proposal.options.length).toBeGreaterThanOrEqual(3);

    // Overtime shift MUST be marked infeasible due to missing physical material
    const shiftOption = proposal.options.find((o) => o.type === 'ADD_SHIFT');
    expect(shiftOption).toBeDefined();
    expect(shiftOption!.feasible).toBe(false);
    expect(shiftOption!.infeasibleReason).toContain('Physical material shortage');

    // Partner subcontract is pending capability check
    const subcontractOption = proposal.options.find((o) => o.type === 'SUBCONTRACT');
    expect(subcontractOption).toBeDefined();
    expect(subcontractOption!.feasible).toBe(false);

    // Split batch is recommended
    const splitOption = proposal.options.find((o) => o.type === 'SPLIT_BATCH');
    expect(splitOption).toBeDefined();
    expect(splitOption!.isRecommended).toBe(true);
    expect(splitOption!.allocation).toBeDefined();
    expect(splitOption!.allocation!.tranche1Qty + splitOption!.allocation!.tranche2Qty).toBe(120);
  });

  it('throws NotFoundError when proposing recovery for non-existent order', async () => {
    const { alpha } = fixture;
    await expect(
      recoveryService.proposeRecovery(alpha.users.planner.principal, {
        orderId: '00000000-0000-0000-0000-000000000999',
        disruptionType: 'MATERIAL_DELAY',
      })
    ).rejects.toThrow(NotFoundError);
  });

  it('commits atomic recovery approval and updates order promise with audit trail', async () => {
    const { alpha } = fixture;

    const proposal = await recoveryService.proposeRecovery(
      alpha.users.planner.principal,
      {
        orderId: testOrderId,
        disruptionType: 'MATERIAL_DELAY',
        delayDays: 3,
      }
    );

    const approveRes = await recoveryService.approveRecovery(
      alpha.users.owner.principal,
      {
        orderId: testOrderId,
        proposalId: proposal.id,
        optionId: 'opt-split-batch',
        tranche1Qty: 40,
        tranche1Date: '2026-11-25',
        tranche2Qty: 80,
        tranche2Date: '2026-11-28',
        notes: 'Approved split delivery: 40 units Nov 25, 80 units Nov 28',
      },
      'key-approve-recovery-101'
    );

    expect(approveRes.data.status).toBe('APPLIED');
    expect(approveRes.data.approvedTranche1Qty).toBe(40);
    expect(approveRes.data.approvedTranche2Qty).toBe(80);

    // Verify order was updated in DB
    const updatedOrder = await fixture.db.order.findUnique({
      where: { id: testOrderId },
    });
    expect(updatedOrder).toBeDefined();
    expect(updatedOrder!.promisedDate?.toISOString().slice(0, 10)).toBe('2026-11-25');
    expect(updatedOrder!.customerAcknowledged).toBe(false);

    // Verify audit event entry
    const audit = await fixture.db.auditEvent.findFirst({
      where: {
        workspaceId: alpha.workspaceId,
        action: 'recovery.plan.approve',
        aggregateId: testOrderId,
      },
    });
    expect(audit).toBeDefined();
  });

  it('rejects approval on delivered or cancelled orders', async () => {
    const { alpha } = fixture;

    // Create an order and mark cancelled
    const cancelledOrder = await orderService.createOrderDraft(
      alpha.users.owner.principal,
      {
        customerId: alpha.masters.customerId,
        orderTypeId: alpha.masters.orderTypeId,
        itemId: alpha.masters.fgItemId,
        orderedQuantity: 50,
        requestedDate: '2026-11-25T00:00:00.000Z',
      },
      'key-order-cancelled-99'
    );

    await fixture.db.order.update({
      where: { id: cancelledOrder.data.id },
      data: { status: 'CANCELLED' },
    });

    await expect(
      recoveryService.approveRecovery(
        alpha.users.owner.principal,
        {
          orderId: cancelledOrder.data.id,
          proposalId: '00000000-0000-0000-0000-000000000123',
          optionId: 'opt-split-batch',
          tranche1Qty: 20,
          tranche1Date: '2026-11-25',
        },
        'key-approve-cancelled'
      )
    ).rejects.toThrow(BadRequestError);
  });
});
