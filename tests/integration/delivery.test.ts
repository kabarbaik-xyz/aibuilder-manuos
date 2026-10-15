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
  let lotId: string;
  let shipmentId: string;

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
  });

  afterAll(async () => {
    await fixture.close();
  });

  it('allocates shipment from eligible FG stock and creates hard reservation', async () => {
    const { alpha } = fixture;

    const res = await deliveryService.allocateShipment(
      alpha.users.warehouse.principal,
      {
        orderId,
        destinationAddress: '123 Industrial Way, Sector 4, Batam',
        lines: [
          {
            itemId: alpha.masters.fgItemId,
            lotId,
            sourceLocationId: alpha.masters.fgLocationId,
            allocatedAtoms: parseQuantity('10'),
          },
        ],
      },
      'key-allocate-shipment-10'
    );
    const shipment = res.data;

    expect(shipment).toBeDefined();
    expect(shipment.shipmentNumber).toMatch(/^SH-/);
    expect(shipment.status).toBe('ALLOCATED');
    expect(shipment.lines.length).toBe(1);
    expect(shipment.lines[0].allocatedAtoms).toBe(parseQuantity('10'));

    shipmentId = shipment.id;

    // Verify stock balance has reservedAtoms = 10 units
    const balances = await inventoryService.getBalances(
      alpha.users.warehouse.principal,
      { itemId: alpha.masters.fgItemId, locationId: alpha.masters.fgLocationId }
    );
    expect(balances.length).toBe(1);
    expect(balances[0].onHandAtoms).toBe(parseQuantity('10'));
    expect(balances[0].reservedAtoms).toBe(parseQuantity('10'));
    expect(balances[0].availableAtoms).toBe(0n);
  });

  it('rejects over-allocation when available FG stock is insufficient', async () => {
    const { alpha } = fixture;

    // Attempting to allocate another shipment of 1 unit should fail
    await expect(
      deliveryService.allocateShipment(
        alpha.users.warehouse.principal,
        {
          orderId,
          destinationAddress: '123 Industrial Way, Sector 4, Batam',
          lines: [
            {
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

  it('dispatches shipment, consumes reservation, and moves physical stock to customer', async () => {
    const { alpha } = fixture;

    const res = await deliveryService.dispatchShipment(
      alpha.users.warehouse.principal,
      {
        shipmentId,
        carrierName: 'FastCargo Logistics',
        trackingNumber: 'TRK-99281-ID',
      },
      'key-dispatch-shipment-10'
    );
    const dispatched = res.data;

    expect(dispatched.status).toBe('DISPATCHED');
    expect(dispatched.carrierName).toBe('FastCargo Logistics');
    expect(dispatched.trackingNumber).toBe('TRK-99281-ID');
    expect(dispatched.dispatchedAt).toBeDefined();

    // Verify stock balance at FG: onHand is now 0, reserved is 0
    const balances = await inventoryService.getBalances(
      alpha.users.warehouse.principal,
      { itemId: alpha.masters.fgItemId, locationId: alpha.masters.fgLocationId, includeZero: true }
    );
    expect(balances[0].onHandAtoms).toBe(0n);
    expect(balances[0].reservedAtoms).toBe(0n);
    expect(balances[0].availableAtoms).toBe(0n);

    // Verify stock balance at Customer Location: onHand is 10 units
    const custBalances = await inventoryService.getBalances(
      alpha.users.warehouse.principal,
      { itemId: alpha.masters.fgItemId, locationId: alpha.masters.customerLocationId }
    );
    expect(custBalances[0].onHandAtoms).toBe(parseQuantity('10'));
  });

  it('confirms delivery, records proof of custody, and updates order status to DELIVERED', async () => {
    const { alpha } = fixture;

    const res = await deliveryService.confirmDelivery(
      alpha.users.warehouse.principal,
      {
        shipmentId,
        receivedBy: 'Ir. Budi Santoso (Site Manager)',
        proofOfDelivery: 'Signed POD Doc #POD-2026-1042',
      },
      'key-confirm-delivery-10'
    );
    const confirmed = res.data;

    expect(confirmed.status).toBe('DELIVERED');
    expect(confirmed.receivedBy).toBe('Ir. Budi Santoso (Site Manager)');
    expect(confirmed.proofOfDelivery).toBe('Signed POD Doc #POD-2026-1042');
    expect(confirmed.deliveredAt).toBeDefined();

    // Verify Order status has advanced to DELIVERED
    const order = await fixture.db.order.findUnique({
      where: { id: orderId },
    });
    expect(order).toBeDefined();
    expect(order!.status).toBe('DELIVERED');
  });
});
