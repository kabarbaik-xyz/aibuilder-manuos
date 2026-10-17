import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { OrderService } from '@/server/modules/orders/service';
import { SupplyService } from '@/server/modules/supply/service';
import { createInspection, finalizeInspection } from '@/server/modules/quality/service';
import { BadRequestError, ForbiddenError } from '@/domain/errors';

describe('Supply-to-demand allocations', () => {
  let fixture: FactoryFixture;
  let supply: SupplyService;
  let orderService: OrderService;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    supply = new SupplyService(fixture.db);
    orderService = new OrderService(fixture.db);
  });

  afterAll(async () => {
    await fixture.close();
  });

  it('allocates approved inbound quantity to a matching open demand within both limits', async () => {
    const { alpha } = fixture;
    const order = await orderService.createOrderDraft(alpha.users.owner.principal, {
      customerId: alpha.masters.customerId,
      orderTypeId: alpha.masters.orderTypeId,
      itemId: alpha.masters.fgItemId,
      orderedQuantity: 10,
      requestedDate: '2026-12-01T00:00:00.000Z',
    }, 'allocation-order-draft');
    await fixture.db.order.update({ where: { id: order.data.id }, data: { status: 'IN_PRODUCTION' } });
    const demand = await fixture.db.materialDemand.create({
      data: {
        workspaceId: alpha.workspaceId,
        orderId: order.data.id,
        itemId: alpha.masters.rawItemId,
        requiredAtoms: 8_000_000n,
      },
    });
    const po = await supply.createSupplyOrder(alpha.users.buyer.principal, {
      supplierId: alpha.masters.supplierId,
      expectedDate: '2026-11-20T00:00:00.000Z',
      lines: [{ itemId: alpha.masters.rawItemId, orderedAtoms: '10000000' }],
    }, 'allocation-po-create');
    const approved = await supply.approveSupplyOrder(alpha.users.owner.principal, po.data.id, 'allocation-po-approve');

    await expect(supply.allocateMaterialDemand(alpha.users.operator.principal, approved.data.id, {
      allocations: [{ supplyOrderLineId: approved.data.lines[0].id, demandId: demand.id, allocatedAtoms: '6000000' }],
    }, 'allocation-denied')).rejects.toThrow(ForbiddenError);

    const result = await supply.allocateMaterialDemand(alpha.users.buyer.principal, approved.data.id, {
      allocations: [{ supplyOrderLineId: approved.data.lines[0].id, demandId: demand.id, allocatedAtoms: '6000000' }],
    }, 'allocation-apply');

    expect(result.data.allocations).toMatchObject([{
      supplyOrderLineId: approved.data.lines[0].id,
      demandId: demand.id,
      allocatedAtoms: 6_000_000n,
      receivedAtoms: 0n,
      reservedAtoms: 0n,
    }]);

    await expect(supply.receiveSupply(alpha.users.warehouse.principal, {
      supplyOrderId: approved.data.id,
      lines: [{
        supplyOrderLineId: approved.data.lines[0].id,
        locationId: alpha.masters.rawLocationId,
        receivedAtoms: '6000000',
        lotNumber: 'LOT-DEMAND-UNLINKED',
      }],
    }, 'allocation-receipt-requires-demand-link')).rejects.toThrow(BadRequestError);

    await supply.receiveSupply(alpha.users.warehouse.principal, {
      supplyOrderId: approved.data.id,
      lines: [{
        supplyOrderLineId: approved.data.lines[0].id,
        locationId: alpha.masters.rawLocationId,
        receivedAtoms: '6000000',
        lotNumber: 'LOT-DEMAND-01',
        demandAllocations: [{ demandId: demand.id, receivedAtoms: '6000000' }],
      }],
    }, 'allocation-receipt');
    const afterReceipt = await fixture.db.materialSupplyAllocation.findFirst({ where: { demandId: demand.id } });
    expect(afterReceipt).toMatchObject({ receivedAtoms: 6_000_000n, reservedAtoms: 6_000_000n });
    const receiptReservation = await fixture.db.stockReservation.findFirst({ where: { demandId: demand.id, status: 'ACTIVE' } });
    expect(receiptReservation?.reservedAtoms).toBe(6_000_000n);

    await expect(supply.allocateMaterialDemand(alpha.users.buyer.principal, approved.data.id, {
      allocations: [{ supplyOrderLineId: approved.data.lines[0].id, demandId: demand.id, allocatedAtoms: '6000000' }],
    }, 'allocation-preserve-received')).resolves.toMatchObject({ data: { allocations: [{ receivedAtoms: 6_000_000n, reservedAtoms: 6_000_000n }] } });

    const context = await supply.getMaterialDemandAllocationContext(alpha.users.planner.principal, approved.data.id);
    expect(context.data.candidates).toMatchObject([{
      supplyOrderLineId: approved.data.lines[0].id,
      id: demand.id,
      availableToAllocateAtoms: 8_000_000n,
      currentAllocatedAtoms: 6_000_000n,
    }]);

    await expect(supply.allocateMaterialDemand(alpha.users.buyer.principal, approved.data.id, {
      allocations: [{ supplyOrderLineId: approved.data.lines[0].id, demandId: demand.id, allocatedAtoms: '9000000' }],
    }, 'allocation-over-demand')).rejects.toThrow(BadRequestError);

    await expect(supply.allocateMaterialDemand(alpha.users.buyer.principal, approved.data.id, {
      allocations: [{ supplyOrderLineId: approved.data.lines[0].id, demandId: demand.id, allocatedAtoms: '11000000' }],
    }, 'allocation-over-po')).rejects.toThrow(BadRequestError);

    const wrongItemDemand = await fixture.db.materialDemand.create({
      data: { workspaceId: alpha.workspaceId, orderId: order.data.id, itemId: alpha.masters.fgItemId, requiredAtoms: 1_000_000n },
    });
    await expect(supply.allocateMaterialDemand(alpha.users.buyer.principal, approved.data.id, {
      allocations: [{ supplyOrderLineId: approved.data.lines[0].id, demandId: wrongItemDemand.id, allocatedAtoms: '1000000' }],
    }, 'allocation-wrong-item')).rejects.toThrow(BadRequestError);

    const persisted = await fixture.db.materialSupplyAllocation.findMany({ where: { demandId: demand.id } });
    expect(persisted).toHaveLength(1);
    expect(persisted[0].allocatedAtoms).toBe(6_000_000n);
  });

  it('keeps demand-linked receipts in quarantine unreserved and not production-ready', async () => {
    const { alpha } = fixture;
    const order = await orderService.createOrderDraft(alpha.users.owner.principal, {
      customerId: alpha.masters.customerId,
      orderTypeId: alpha.masters.orderTypeId,
      itemId: alpha.masters.fgItemId,
      orderedQuantity: 5,
      requestedDate: '2026-12-10T00:00:00.000Z',
    }, 'quarantine-allocation-order');
    await fixture.db.order.update({ where: { id: order.data.id }, data: { status: 'IN_PRODUCTION' } });
    const demand = await fixture.db.materialDemand.create({
      data: { workspaceId: alpha.workspaceId, orderId: order.data.id, itemId: alpha.masters.rawItemId, requiredAtoms: 5_000_000n },
    });
    const created = await supply.createSupplyOrder(alpha.users.buyer.principal, {
      supplierId: alpha.masters.supplierId,
      expectedDate: '2026-11-25T00:00:00.000Z',
      lines: [{ itemId: alpha.masters.rawItemId, orderedAtoms: '5000000' }],
    }, 'quarantine-allocation-po');
    const approved = await supply.approveSupplyOrder(alpha.users.owner.principal, created.data.id, 'quarantine-allocation-approve');
    await supply.allocateMaterialDemand(alpha.users.buyer.principal, approved.data.id, {
      allocations: [{ supplyOrderLineId: approved.data.lines[0].id, demandId: demand.id, allocatedAtoms: '5000000' }],
    }, 'quarantine-allocation-set');

    await supply.receiveSupply(alpha.users.warehouse.principal, {
      supplyOrderId: approved.data.id,
      lines: [{
        supplyOrderLineId: approved.data.lines[0].id,
        locationId: alpha.masters.quarantineLocationId,
        receivedAtoms: '5000000',
        lotNumber: 'LOT-QUAR-01',
        demandAllocations: [{ demandId: demand.id, receivedAtoms: '5000000' }],
      }],
    }, 'quarantine-allocation-receipt');

    const allocation = await fixture.db.materialSupplyAllocation.findFirst({ where: { demandId: demand.id } });
    expect(allocation).toMatchObject({ receivedAtoms: 5_000_000n, reservedAtoms: 0n });
    expect(await fixture.db.stockReservation.count({ where: { demandId: demand.id, status: 'ACTIVE' } })).toBe(0);
  });

  it('releases a quarantined demand-linked receipt only after line-scoped QC passes', async () => {
    const { alpha } = fixture;
    const order = await orderService.createOrderDraft(alpha.users.owner.principal, {
      customerId: alpha.masters.customerId,
      orderTypeId: alpha.masters.orderTypeId,
      itemId: alpha.masters.fgItemId,
      orderedQuantity: 5,
      requestedDate: '2026-12-10T00:00:00.000Z',
    }, 'quarantine-qc-order');
    await fixture.db.order.update({ where: { id: order.data.id }, data: { status: 'IN_PRODUCTION' } });
    const demand = await fixture.db.materialDemand.create({
      data: { workspaceId: alpha.workspaceId, orderId: order.data.id, itemId: alpha.masters.rawItemId, requiredAtoms: 5_000_000n },
    });
    const created = await supply.createSupplyOrder(alpha.users.buyer.principal, {
      supplierId: alpha.masters.supplierId,
      expectedDate: '2026-11-25T00:00:00.000Z',
      lines: [{ itemId: alpha.masters.rawItemId, orderedAtoms: '5000000' }],
    }, 'quarantine-qc-po');
    const approved = await supply.approveSupplyOrder(alpha.users.owner.principal, created.data.id, 'quarantine-qc-approve');
    await supply.allocateMaterialDemand(alpha.users.buyer.principal, approved.data.id, {
      allocations: [{ supplyOrderLineId: approved.data.lines[0].id, demandId: demand.id, allocatedAtoms: '5000000' }],
    }, 'quarantine-qc-allocation');
    const receipt = await supply.receiveSupply(alpha.users.warehouse.principal, {
      supplyOrderId: approved.data.id,
      lines: [{
        supplyOrderLineId: approved.data.lines[0].id,
        locationId: alpha.masters.quarantineLocationId,
        receivedAtoms: '5000000',
        lotNumber: 'LOT-QUAR-QC',
        demandAllocations: [{ demandId: demand.id, receivedAtoms: '5000000' }],
      }],
    }, 'quarantine-qc-receipt');
    const receiptLineId = receipt.data.lines[0].id;

    const inspection = await createInspection(fixture.db, alpha.users.qc.principal, {
      sourceType: 'GOODS_RECEIPT',
      supplyReceiptLineId: receiptLineId,
    }, 'quarantine-qc-inspection');
    expect(inspection.data.inspectedAtoms).toBe(5_000_000n);
    await expect(createInspection(fixture.db, alpha.users.qc.principal, {
      sourceType: 'GOODS_RECEIPT',
      supplyReceiptLineId: receiptLineId,
    }, 'quarantine-qc-duplicate')).rejects.toThrow(BadRequestError);

    await expect(finalizeInspection(fixture.db, alpha.users.qc.principal, {
      inspectionId: inspection.data.id,
      passedAtoms: '4000000',
      reworkAtoms: '1000000',
    }, 'quarantine-qc-rework-held')).rejects.toThrow(BadRequestError);
    expect(await fixture.db.stockReservation.count({ where: { demandId: demand.id, status: 'ACTIVE' } })).toBe(0);

    const finalized = await finalizeInspection(fixture.db, alpha.users.qc.principal, {
      inspectionId: inspection.data.id,
      passedAtoms: '5000000',
    }, 'quarantine-qc-finalize');
    expect(finalized.data.status).toBe('FINALIZED');
    const allocation = await fixture.db.materialSupplyReceiptAllocation.findFirst({ where: { receiptLineId } });
    expect(allocation).toMatchObject({ receivedAtoms: 5_000_000n, reservedAtoms: 5_000_000n });
    expect(allocation?.stockReservationId).toBeTruthy();
    expect(await fixture.db.stockReservation.count({ where: { demandId: demand.id, status: 'ACTIVE' } })).toBe(1);
    const lotId = receipt.data.lines[0].lotId;
    const rawBalance = await fixture.db.stockBalance.findFirst({ where: { workspaceId: alpha.workspaceId, itemId: alpha.masters.rawItemId, locationId: alpha.masters.rawLocationId, lotId } });
    const quarantineBalance = await fixture.db.stockBalance.findFirst({ where: { workspaceId: alpha.workspaceId, itemId: alpha.masters.rawItemId, locationId: alpha.masters.quarantineLocationId, lotId } });
    expect(rawBalance?.onHandAtoms).toBe(5_000_000n);
    expect(rawBalance?.reservedAtoms).toBe(5_000_000n);
    expect(quarantineBalance?.onHandAtoms).toBe(0n);
  });
});
