import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { DeliveryService } from '@/server/modules/delivery/service';
import { OrderService } from '@/server/modules/orders/service';
import { InventoryService } from '@/server/modules/inventory/service';
import { parseQuantity } from '@/domain/quantity';
import { BadRequestError } from '@/domain/errors';

describe('O07: Shipment Allocation, Dispatch, and Delivery Confirmation', () => {
  let fixture: FactoryFixture;
  let deliveryService: DeliveryService;
  let orderService: OrderService;
  let inventoryService: InventoryService;

  let orderId: string;
  let orderLineId: string;
  let lotId: string;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    deliveryService = new DeliveryService(fixture.db);
    orderService = new OrderService(fixture.db);
    inventoryService = new InventoryService(fixture.db);

    const { alpha } = fixture;

    // 1. Create Lot for finished goods
    const lot = await fixture.db.lot.create({
      data: {
        workspaceId: alpha.workspaceId,
        itemId: alpha.masters.fgItemId,
        lotNumber: 'LOT-FG-SHIP-001',
      },
    });
    lotId = lot.id;

    // 2. Post opening FG stock: 10 units (10,000,000 atoms) to FG location
    await inventoryService.postOpeningBalance(
      alpha.users.owner.principal,
      {
        itemId: alpha.masters.fgItemId,
        locationId: alpha.masters.fgLocationId,
        lotNumber: 'LOT-FG-SHIP-001',
        atoms: parseQuantity('10'),
        notes: 'Initial FG stock for delivery testing',
      },
      'key-open-fg-ship-10'
    );

    // 3. Create customer order for 10 units
    const orderRes = await orderService.createOrderDraft(
      alpha.users.owner.principal,
      {
        customerId: alpha.masters.customerId,
        orderTypeId: alpha.masters.orderTypeId,
        itemId: alpha.masters.fgItemId,
        orderedQuantity: 10,
        requestedDate: '2026-11-25T00:00:00Z',
      },
      'key-order-ship-001'
    );
    orderId = orderRes.data.id;
    orderLineId = orderRes.data.lines[0].id;
  });

  afterAll(async () => {
    await fixture.close();
  });

  it('rejects FG stock without order-linked final QC acceptance', async () => {
    const { alpha } = fixture;
    await expect(deliveryService.allocateShipment(
      alpha.users.warehouse.principal,
      {
        orderId,
        destinationAddress: '123 Industrial Way, Sector 4, Batam',
        lines: [
          {
            orderLineId,
            itemId: alpha.masters.fgItemId,
            lotId,
            sourceLocationId: alpha.masters.fgLocationId,
            allocatedAtoms: parseQuantity('10'),
          },
        ],
      },
      'key-allocate-shipment-10'
    )).rejects.toThrow(/finalized QC-passed quantity/);

    // Verify stock balance has reservedAtoms = 10 units
    const balances = await inventoryService.getBalances(
      alpha.users.warehouse.principal,
      { itemId: alpha.masters.fgItemId, locationId: alpha.masters.fgLocationId }
    );
    expect(balances.length).toBe(1);
    expect(balances[0].onHandAtoms).toBe(parseQuantity('10'));
    expect(balances[0].reservedAtoms).toBe(0n);
    expect(balances[0].availableAtoms).toBe(parseQuantity('10'));
  });

  it('does not reserve FG stock after a rejected QC gate', async () => {
    const { alpha } = fixture;

    // Attempting to allocate any further quantity still fails without finalized QC.
    await expect(
      deliveryService.allocateShipment(
        alpha.users.warehouse.principal,
        {
          orderId,
          destinationAddress: '123 Industrial Way, Sector 4, Batam',
          lines: [
            {
              orderLineId,
              itemId: alpha.masters.fgItemId,
              lotId,
              sourceLocationId: alpha.masters.fgLocationId,
              allocatedAtoms: parseQuantity('1'),
            },
          ],
        },
        'key-over-allocation-attempt'
      )
    ).rejects.toThrow(BadRequestError);
  });

  it('rejects allocation above an item line even when the order aggregate has room', async () => {
    const { alpha } = fixture;
    await inventoryService.postOpeningBalance(
      alpha.users.owner.principal,
      {
        itemId: alpha.masters.fgItemId,
        locationId: alpha.masters.fgLocationId,
        lotNumber: 'LOT-FG-SHIP-LINE-CAP',
        atoms: parseQuantity('11'),
        notes: 'Line-cap regression stock',
      },
      'key-open-fg-line-cap'
    );
    const lineCapLot = await fixture.db.lot.findFirstOrThrow({
      where: {
        workspaceId: alpha.workspaceId,
        itemId: alpha.masters.fgItemId,
        lotNumber: 'LOT-FG-SHIP-LINE-CAP',
      },
    });
    const multiItemOrder = await orderService.createOrderDraft(
      alpha.users.owner.principal,
      {
        customerId: alpha.masters.customerId,
        orderTypeId: alpha.masters.orderTypeId,
        lines: [
          { itemId: alpha.masters.fgItemId, orderedQuantity: 10 },
          { itemId: alpha.masters.rawItemId, orderedQuantity: 100 },
        ],
        requestedDate: '2026-11-26T00:00:00Z',
      },
      'key-order-ship-line-cap'
    );

    await expect(
      deliveryService.allocateShipment(
        alpha.users.warehouse.principal,
        {
          orderId: multiItemOrder.data.id,
          lines: [
            {
              orderLineId: multiItemOrder.data.lines[0].id,
              itemId: alpha.masters.fgItemId,
              lotId: lineCapLot.id,
              sourceLocationId: alpha.masters.fgLocationId,
              allocatedAtoms: parseQuantity('11'),
            },
          ],
        },
        'key-allocate-shipment-line-cap'
      )
    ).rejects.toThrow(BadRequestError);
  });

  it('requires each shipment line to reference the matching product order line', async () => {
    const { alpha } = fixture;
    const multiItemOrder = await orderService.createOrderDraft(
      alpha.users.owner.principal,
      {
        customerId: alpha.masters.customerId,
        orderTypeId: alpha.masters.orderTypeId,
        lines: [
          { itemId: alpha.masters.fgItemId, orderedQuantity: '10' },
          { itemId: alpha.masters.rawItemId, orderedQuantity: '100' },
        ],
        requestedDate: '2026-11-27T00:00:00Z',
      },
      'key-order-ship-multi-lines'
    );
    const [firstLine, secondLine] = multiItemOrder.data.lines;
    await expect(deliveryService.allocateShipment(
      alpha.users.warehouse.principal,
      {
        orderId: multiItemOrder.data.id,
        lines: [{ orderLineId: secondLine.id, itemId: firstLine.itemId, sourceLocationId: alpha.masters.fgLocationId, allocatedAtoms: parseQuantity('1') }],
      },
      'key-allocate-cross-line'
    )).rejects.toThrow(/does not belong to order/);
  });
});
