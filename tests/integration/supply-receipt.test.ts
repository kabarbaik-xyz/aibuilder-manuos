import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { SupplyService } from '@/server/modules/supply/service';
import { InventoryService } from '@/server/modules/inventory/service';
import { SupplyOrderStatus } from '@/server/modules/supply/contracts';
import { ForbiddenError, BadRequestError } from '@/domain/errors';

describe('O02 — Basic Supply Orders and Actual Partial Receipt', () => {
  let fixture: FactoryFixture;
  let supplyService: SupplyService;
  let invService: InventoryService;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    supplyService = new SupplyService(fixture.db);
    invService = new InventoryService(fixture.db);
  });

  afterAll(async () => {
    await fixture.close();
  });

  it('creates supply order in DRAFT status without posting physical stock', async () => {
    const rawItemId = fixture.alpha.masters.rawItemId;
    const supplierId = fixture.alpha.masters.supplierId;

    // 1. Operator lacks 'supply.create' -> Forbidden
    await expect(
      supplyService.createSupplyOrder(
        fixture.alpha.users.operator.principal,
        {
          supplierId,
          expectedDate: '2026-11-20T00:00:00.000Z',
          lines: [
            {
              itemId: rawItemId,
              orderedAtoms: '100000000', // 100 units
              unitPriceCents: 50000,
            },
          ],
        },
        'idem-op-create-fail'
      )
    ).rejects.toThrow(ForbiddenError);

    // 2. Buyer has 'supply.create' -> Success
    const po = await supplyService.createSupplyOrder(
      fixture.alpha.users.buyer.principal,
      {
        supplierId,
        expectedDate: '2026-11-20T00:00:00.000Z',
        notes: 'Replenishment for Q4 Production schedule',
        lines: [
          {
            itemId: rawItemId,
            orderedAtoms: '100000000', // 100 units
            unitPriceCents: 50000,
            notes: 'Raw rod 6061-T6',
          },
        ],
      },
      'idem-po-create-01'
    );

    expect(po.data).toBeDefined();
    expect(po.data.orderNumber).toMatch(/^PO-\d{4}-\d{4}$/);
    expect(po.data.status).toBe(SupplyOrderStatus.DRAFT);
    expect(po.data.lines.length).toBe(1);
    expect(po.data.lines[0].orderedAtoms).toBe(100000000n);
    expect(po.data.lines[0].receivedAtoms).toBe(0n);
    expect(po.data.lines[0].openAtoms).toBe(100000000n);

    // 3. Verify zero physical stock was posted
    const balances = await invService.getBalances(fixture.alpha.users.owner.principal, {
      itemId: rawItemId,
    });
    expect(balances.length).toBe(0);
  });

  it('approves supply order posting audit but zero physical stock', async () => {
    const rawItemId = fixture.alpha.masters.rawItemId;
    const orders = await supplyService.listOrders(fixture.alpha.users.owner.principal);
    const draftPo = orders.find((o) => o.status === SupplyOrderStatus.DRAFT)!;

    // Approve PO
    const approved = await supplyService.approveSupplyOrder(
      fixture.alpha.users.owner.principal,
      draftPo.id,
      'idem-po-approve-01'
    );

    expect(approved.data.status).toBe(SupplyOrderStatus.APPROVED);
    expect(approved.data.approvedById).toBe(fixture.alpha.users.owner.userId);

    // Physical stock MUST remain zero: approved supply is distinct from stock
    const balances = await invService.getBalances(fixture.alpha.users.owner.principal, {
      itemId: rawItemId,
    });
    expect(balances.length).toBe(0);
  });

  it('updates expected delivery ETA with audit reason', async () => {
    const orders = await supplyService.listOrders(fixture.alpha.users.owner.principal);
    const approvedPo = orders.find((o) => o.status === SupplyOrderStatus.APPROVED)!;

    const updated = await supplyService.changeSupplyEta(
      fixture.alpha.users.owner.principal,
      approvedPo.id,
      {
        expectedDate: '2026-11-25T00:00:00.000Z',
        reason: 'Vendor expedited freight arrangement',
      },
      'idem-po-eta-01'
    );

    expect(updated.data.expectedDate).toBe('2026-11-25T00:00:00.000Z');
    expect(updated.data.notes).toContain('Vendor expedited freight arrangement');
  });

  it('executes partial receipt into warehouse location, creating lot and updating open quantity', async () => {
    const rawItemId = fixture.alpha.masters.rawItemId;
    const rawLocationId = fixture.alpha.masters.rawLocationId;
    const orders = await supplyService.listOrders(fixture.alpha.users.owner.principal);
    const approvedPo = orders.find((o) => o.status === SupplyOrderStatus.APPROVED)!;
    const line = approvedPo.lines[0];

    // Receive 60 units (60,000,000 atoms) of 100
    const receipt = await supplyService.receiveSupply(
      fixture.alpha.users.warehouse.principal,
      {
        supplyOrderId: approvedPo.id,
        notes: 'First tranche delivery via logistics carrier',
        lines: [
          {
            supplyOrderLineId: line.id,
            locationId: rawLocationId,
            receivedAtoms: '60000000', // 60 units
            lotNumber: 'LOT-AL-REC-01',
            supplierLotNumber: 'MILL-HEAT-8842',
          },
        ],
      },
      'idem-receipt-tranche-1'
    );

    expect(receipt.data).toBeDefined();
    expect(receipt.data.receiptNumber).toMatch(/^REC-\d{4}-\d{4}$/);
    expect(receipt.data.lines.length).toBe(1);
    expect(receipt.data.lines[0].receivedAtoms).toBe(60000000n);
    expect(receipt.data.lines[0].lotNumber).toBe('LOT-AL-REC-01');

    // Verify PO status and open quantity read model
    const updatedPo = await supplyService.getOrderById(
      fixture.alpha.users.owner.principal,
      approvedPo.id
    );
    expect(updatedPo.status).toBe(SupplyOrderStatus.PARTIALLY_RECEIVED);
    expect(updatedPo.lines[0].receivedAtoms).toBe(60000000n);
    expect(updatedPo.lines[0].openAtoms).toBe(40000000n); // 40 units remain open

    // Verify stock balance now shows exactly 60 units on-hand
    const balances = await invService.getBalances(fixture.alpha.users.owner.principal, {
      itemId: rawItemId,
      locationId: rawLocationId,
    });
    expect(balances.length).toBe(1);
    expect(balances[0].onHandAtoms).toBe(60000000n);
    expect(balances[0].availableAtoms).toBe(60000000n);
    expect(balances[0].lotNumber).toBe('LOT-AL-REC-01');
  });

  it('rejects over-receipt beyond remaining open quantity', async () => {
    const rawLocationId = fixture.alpha.masters.rawLocationId;
    const orders = await supplyService.listOrders(fixture.alpha.users.owner.principal);
    const partialPo = orders.find((o) => o.status === SupplyOrderStatus.PARTIALLY_RECEIVED)!;
    const line = partialPo.lines[0];
    // Remaining open is 40 units (40,000,000 atoms)

    // Attempting to receive 50 units
    await expect(
      supplyService.receiveSupply(
        fixture.alpha.users.warehouse.principal,
        {
          supplyOrderId: partialPo.id,
          lines: [
            {
              supplyOrderLineId: line.id,
              locationId: rawLocationId,
              receivedAtoms: '50000000', // 50 > 40
              lotNumber: 'LOT-OVER-FAIL',
            },
          ],
        },
        'idem-over-receipt-fail'
      )
    ).rejects.toThrow(BadRequestError);

    // Readback verification: open atoms remains 40,000,000
    const checkPo = await supplyService.getOrderById(
      fixture.alpha.users.owner.principal,
      partialPo.id
    );
    expect(checkPo.lines[0].openAtoms).toBe(40000000n);
  });

  it('idempotently replays duplicate receipt command returning cached result', async () => {
    const orders = await supplyService.listOrders(fixture.alpha.users.owner.principal);
    const partialPo = orders.find((o) => o.status === SupplyOrderStatus.PARTIALLY_RECEIVED)!;
    const line = partialPo.lines[0];

    // Replay with identical key 'idem-receipt-tranche-1'
    const replayed = await supplyService.receiveSupply(
      fixture.alpha.users.warehouse.principal,
      {
        supplyOrderId: partialPo.id,
        notes: 'First tranche delivery via logistics carrier',
        lines: [
          {
            supplyOrderLineId: line.id,
            locationId: fixture.alpha.masters.rawLocationId,
            receivedAtoms: '60000000',
            lotNumber: 'LOT-AL-REC-01',
            supplierLotNumber: 'MILL-HEAT-8842',
          },
        ],
      },
      'idem-receipt-tranche-1'
    );

    expect(replayed.meta.replayed).toBe(true);

    // Balance does NOT double count
    const balances = await invService.getBalances(fixture.alpha.users.owner.principal, {
      itemId: fixture.alpha.masters.rawItemId,
      locationId: fixture.alpha.masters.rawLocationId,
    });
    expect(balances[0].onHandAtoms).toBe(60000000n);
  });

  it('receives final tranche into quarantine location and transitions PO to RECEIVED', async () => {
    const rawItemId = fixture.alpha.masters.rawItemId;
    const quarLocationId = fixture.alpha.masters.quarantineLocationId;
    const orders = await supplyService.listOrders(fixture.alpha.users.owner.principal);
    const partialPo = orders.find((o) => o.status === SupplyOrderStatus.PARTIALLY_RECEIVED)!;
    const line = partialPo.lines[0];

    // Receive remaining 40 units into QUARANTINE
    const receipt2 = await supplyService.receiveSupply(
      fixture.alpha.users.warehouse.principal,
      {
        supplyOrderId: partialPo.id,
        notes: 'Second and final tranche received into quarantine holding',
        lines: [
          {
            supplyOrderLineId: line.id,
            locationId: quarLocationId,
            receivedAtoms: '40000000', // 40 units
            lotNumber: 'LOT-AL-REC-02',
          },
        ],
      },
      'idem-receipt-tranche-2'
    );

    expect(receipt2.data.lines[0].receivedAtoms).toBe(40000000n);

    // Verify PO transitioned to RECEIVED
    const finalPo = await supplyService.getOrderById(
      fixture.alpha.users.owner.principal,
      partialPo.id
    );
    expect(finalPo.status).toBe(SupplyOrderStatus.RECEIVED);
    expect(finalPo.lines[0].receivedAtoms).toBe(100000000n);
    expect(finalPo.lines[0].openAtoms).toBe(0n);

    // Verify total physical balances across locations equals 100 units:
    // 60 in RAW + 40 in QUARANTINE = 100 total
    const allBalances = await invService.getBalances(fixture.alpha.users.owner.principal, {
      itemId: rawItemId,
    });
    const totalOnHand = allBalances.reduce((sum, b) => sum + b.onHandAtoms, 0n);
    expect(totalOnHand).toBe(100000000n);

    // Verify independent double-entry ledger reconciliation
    const recon = await invService.reconcile(fixture.alpha.users.owner.principal);
    expect(recon.balanced).toBe(true);
    expect(recon.mismatches.length).toBe(0);
  });
});
