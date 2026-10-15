import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { InventoryService } from '@/server/modules/inventory/service';
import { OrderService } from '@/server/modules/orders/service';
import { EngineeringService } from '@/server/modules/engineering/service';
import { releaseOrder } from '@/server/modules/orders/release';
import { parseQuantity } from '@/domain/quantity';
import { ForbiddenError, BadRequestError } from '@/domain/errors';
import { reconcileStock } from '@/server/modules/inventory/ledger';

describe('O04 — Inventory Counts, Stock Cards, Transfers and Reversals', () => {
  let fixture: FactoryFixture;
  let invService: InventoryService;
  let orderService: OrderService;
  let engService: EngineeringService;

  let rawItemId: string;
  let rawLocationId: string;
  let wipLocationId: string;
  let fgLocationId: string;
  let lotId: string;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    invService = new InventoryService(fixture.db);
    orderService = new OrderService(fixture.db);
    engService = new EngineeringService(fixture.db);

    const ws = fixture.alpha;
    rawItemId = ws.masters.rawItemId;
    rawLocationId = ws.masters.rawLocationId;
    wipLocationId = ws.masters.wipLocationId;
    fgLocationId = ws.masters.fgLocationId;

    // Post opening raw material: 100 units (100,000,000 atoms)
    await invService.postOpeningBalance(
      ws.users.owner.principal,
      {
        itemId: rawItemId,
        locationId: rawLocationId,
        lotNumber: 'LOT-RAW-COUNT-01',
        atoms: 100_000_000n,
        notes: 'Initial stock for count testing',
      },
      'idem-opening-counts'
    );

    const lot = await fixture.db.lot.findFirst({
      where: { workspaceId: ws.workspaceId, lotNumber: 'LOT-RAW-COUNT-01' },
    });
    lotId = lot!.id;
  });

  afterAll(async () => {
    await fixture.close();
  });

  it('allows warehouse to create a stock count capturing versioned book snapshot', async () => {
    const ws = fixture.alpha;

    // Warehouse performs physical count of Raw location: found 95 units instead of 100
    const count = await invService.createStockCount(
      ws.users.warehouse.principal,
      {
        locationId: rawLocationId,
        reason: 'Monthly cycle count',
        lines: [
          {
            itemId: rawItemId,
            locationId: rawLocationId,
            lotId,
            countedAtoms: 95_000_000n, // 95 units counted (shortage of 5 units)
            notes: 'Physical count showed 95 units',
          },
        ],
      },
      'idem-count-01'
    );

    expect(count.data.status).toBe('SUBMITTED');
    expect(count.data.countNumber).toMatch(/^CNT-\d{4}-\d{4}$/);
    expect(count.data.lines).toHaveLength(1);
    expect(count.data.lines[0].snapshotAtoms).toBe(100_000_000n);
    expect(count.data.lines[0].countedAtoms).toBe(95_000_000n);
    expect(count.data.lines[0].discrepancyAtoms).toBe(-5_000_000n);
    expect(count.data.lines[0].movementId).toBeNull();
  });

  it('enforces segregation of duties: warehouse cannot approve discrepancies, only owner', async () => {
    const ws = fixture.alpha;

    const counts = await invService.listStockCounts(ws.users.warehouse.principal);
    const countId = counts[0].id;

    // Warehouse attempts to approve their own count discrepancy
    await expect(
      invService.approveStockCount(ws.users.warehouse.principal, countId, 'idem-approve-wh')
    ).rejects.toThrow(ForbiddenError);

    // Operator also cannot approve
    await expect(
      invService.approveStockCount(ws.users.operator.principal, countId, 'idem-approve-op')
    ).rejects.toThrow(ForbiddenError);

    // Owner approves the count discrepancy
    const approved = await invService.approveStockCount(
      ws.users.owner.principal,
      countId,
      'idem-approve-owner'
    );

    expect(approved.data.status).toBe('APPROVED');
    expect(approved.data.approvedById).toBe(ws.users.owner.principal.userId);
    expect(approved.data.lines[0].movementId).toBeTruthy();

    // Verify stock balance has updated to exactly the counted quantity (95 units)
    const balances = await invService.getBalances(ws.users.owner.principal, {
      itemId: rawItemId,
      locationId: rawLocationId,
    });
    expect(balances).toHaveLength(1);
    expect(balances[0].onHandAtoms).toBe(95_000_000n);

    // Verify reconciliation
    const recon = await reconcileStock(fixture.db, ws.workspaceId);
    expect(recon.balanced).toBe(true);
  });

  it('rejects stale count approvals if stock changed between count snapshot and approval', async () => {
    const ws = fixture.alpha;

    // 1. Warehouse creates a new count for current stock (95 units)
    const count = await invService.createStockCount(
      ws.users.warehouse.principal,
      {
        locationId: rawLocationId,
        reason: 'Follow-up count',
        lines: [
          {
            itemId: rawItemId,
            locationId: rawLocationId,
            lotId,
            countedAtoms: 95_000_000n, // snapshot is 95_000_000n
          },
        ],
      },
      'idem-count-02'
    );
    const countId = count.data.id;

    // 2. An intermediate transfer occurs that moves 10 units from Raw to Quarantine
    await invService.transferStock(
      ws.users.warehouse.principal,
      {
        itemId: rawItemId,
        sourceLocationId: rawLocationId,
        destinationLocationId: ws.masters.quarantineLocationId,
        sourceLotId: lotId,
        atoms: 10_000_000n,
        notes: 'Transfer 10 units to quarantine for inspection',
      },
      'idem-transfer-stale-test'
    );

    // Raw balance is now 85 units!
    const balances = await invService.getBalances(ws.users.owner.principal, {
      itemId: rawItemId,
      locationId: rawLocationId,
    });
    expect(balances[0].onHandAtoms).toBe(85_000_000n);

    // 3. Owner attempts to approve the earlier count: snapshot was 95, current is 85 -> STALE!
    await expect(
      invService.approveStockCount(ws.users.owner.principal, countId, 'idem-approve-stale')
    ).rejects.toThrow(BadRequestError);
  });

  it('allows owner to reverse a movement and rejects reversal if stock was already consumed', async () => {
    const ws = fixture.alpha;

    // 1. Warehouse transfers 10 units from Quarantine back to Raw
    const transfer = await invService.transferStock(
      ws.users.warehouse.principal,
      {
        itemId: rawItemId,
        sourceLocationId: ws.masters.quarantineLocationId,
        destinationLocationId: rawLocationId,
        sourceLotId: lotId,
        atoms: 10_000_000n,
        notes: 'Return from quarantine to raw',
      },
      'idem-transfer-to-reverse'
    );
    const movementId = transfer.data.id;

    // Raw is now 95 again (85 + 10)
    let rawBal = await invService.getBalances(ws.users.owner.principal, {
      itemId: rawItemId,
      locationId: rawLocationId,
    });
    expect(rawBal[0].onHandAtoms).toBe(95_000_000n);

    // 2. Owner reverses the transfer movement
    const reversal = await invService.reverseMovement(
      ws.users.owner.principal,
      {
        movementId,
        reason: 'Transfer made in error, reverting',
      },
      'idem-reversal-01'
    );

    expect(reversal.data.movementType).toBe('ADJUSTMENT');
    expect(reversal.data.referenceType).toBe('REVERSAL');
    expect(reversal.data.referenceId).toBe(movementId);

    // Raw is back to 85, Quarantine has 10 back
    rawBal = await invService.getBalances(ws.users.owner.principal, {
      itemId: rawItemId,
      locationId: rawLocationId,
    });
    expect(rawBal[0].onHandAtoms).toBe(85_000_000n);

    // 3. Attempting to reverse an already reversed movement fails
    await expect(
      invService.reverseMovement(
        ws.users.owner.principal,
        {
          movementId,
          reason: 'Duplicate reversal attempt',
        },
        'idem-reversal-dup'
      )
    ).rejects.toThrow(BadRequestError);

    // 4. Test consumption guard: if destination stock is missing, reversal fails
    // Post an opening receipt of 5 units to scrap location
    const scrapMovement = await invService.postOpeningBalance(
      ws.users.owner.principal,
      {
        itemId: rawItemId,
        locationId: ws.masters.scrapLocationId,
        lotNumber: 'LOT-RAW-SCRAP-01',
        atoms: 5_000_000n,
      },
      'idem-scrap-temp'
    );

    const scrapLot = await fixture.db.lot.findFirst({
      where: { workspaceId: ws.workspaceId, lotNumber: 'LOT-RAW-SCRAP-01' },
    });

    // Write-off / move the scrap away so balance becomes 0
    await invService.transferStock(
      ws.users.warehouse.principal,
      {
        itemId: rawItemId,
        sourceLocationId: ws.masters.scrapLocationId,
        destinationLocationId: ws.masters.quarantineLocationId,
        sourceLotId: scrapLot!.id,
        destinationLotId: scrapLot!.id,
        atoms: 5_000_000n,
      },
      'idem-drain-scrap'
    );

    // Now trying to reverse the opening movement to scrap fails because scrap has 0 on-hand!
    await expect(
      invService.reverseMovement(
        ws.users.owner.principal,
        {
          movementId: scrapMovement.data.id,
          reason: 'Reversing scrap receipt',
        },
        'idem-rev-fail-drained'
      )
    ).rejects.toThrow(BadRequestError);
  });

  it('demonstrates unused-material return and approved count discrepancy apart from main fixture', async () => {
    const ws = fixture.alpha;

    // 1. Create and release an Order requiring raw material
    const orderRes = await orderService.createOrderDraft(
      ws.users.owner.principal,
      {
        customerId: ws.masters.customerId,
        orderTypeId: ws.masters.orderTypeId,
        itemId: ws.masters.fgItemId,
        orderedQuantity: 5,
        requestedDate: '2026-12-10T00:00:00.000Z',
      },
      'idem-order-unused-test'
    );
    const orderId = orderRes.data.id;

    const { WorkflowService } = await import('@/server/modules/workflow/service');
    const wfService = new WorkflowService(fixture.db);
    const tmplRes = await wfService.createTemplate(
      ws.users.owner.principal,
      {
        orderTypeId: ws.masters.orderTypeId,
        code: 'WF-UNUSED-01',
        name: 'Unused Test Routing',
      },
      'cmd-wf-unused-tmpl'
    );
    const wfVersionId = tmplRes.data.initialVersionId;

    await wfService.saveVersionDraft(
      ws.users.owner.principal,
      wfVersionId,
      {
        definition: {
          schemaVersion: 1,
          name: 'Unused Test Routing',
          nodes: [
            {
              key: 'OP10-MACHINING',
              name: 'Machining',
              type: 'OPERATION',
              departmentId: ws.masters.departmentId,
              plannedDurationMinutes: 30,
            },
          ],
          edges: [],
        },
      },
      'cmd-wf-unused-save'
    );

    await wfService.publishVersion(
      ws.users.owner.principal,
      wfVersionId,
      'cmd-wf-unused-pub'
    );

    const initialRev = orderRes.data.engineeringRevisions[0];
    await engService.saveEngineeringDraft(
      ws.users.owner.principal,
      initialRev.id,
      {
        workflowVersionId: wfVersionId,
        bomLines: [
          {
            itemId: rawItemId,
            inputUomId: ws.masters.uomPcsId,
            operationNodeKey: 'OP10-MACHINING',
            requirementQuantity: 2, // 2 raw per 1 FG -> 10 raw total
            outputBasis: 1,
            allowancePercent: 0,
          },
        ],
      },
      'idem-eng-unused-draft'
    );

    await engService.approveEngineeringRevision(
      ws.users.owner.principal,
      initialRev.id,
      'idem-approve-eng-unused'
    );

    await releaseOrder(ws.users.owner.principal, orderId, 'idem-rel-order-unused', fixture.db);

    const demand = await fixture.db.materialDemand.findFirst({
      where: { workspaceId: ws.workspaceId, orderId },
    });
    expect(demand).toBeTruthy();
    // Required = 5 * 2 = 10 units = 10,000,000 atoms
    expect(demand!.requiredAtoms).toBe(10_000_000n);

    // 2. Warehouse reserves and issues 10 units to WIP
    await invService.reserveStock(
      ws.users.planner.principal,
      {
        demandId: demand!.id,
        locationId: rawLocationId,
        lotId,
        atoms: 10_000_000n,
      },
      'idem-res-unused'
    );

    await invService.issueToProduction(
      ws.users.warehouse.principal,
      {
        demandId: demand!.id,
        sourceLocationId: rawLocationId,
        wipLocationId,
        sourceLotId: lotId,
        atoms: 10_000_000n,
      },
      'idem-issue-unused'
    );

    // WIP now has 10 units
    let wipBal = await invService.getBalances(ws.users.owner.principal, {
      itemId: rawItemId,
      locationId: wipLocationId,
    });
    expect(wipBal[0].onHandAtoms).toBe(10_000_000n);

    // 3. Return unused material: 3 units returned from WIP back to Raw without creating fake supplier receipts
    const returnResult = await invService.returnUnusedMaterial(
      ws.users.warehouse.principal,
      {
        demandId: demand!.id,
        wipLocationId,
        destinationLocationId: rawLocationId,
        lotId,
        atoms: 3_000_000n, // 3 units unused
        notes: 'Production optimization: 3 units returned unused',
      },
      'idem-return-unused-3'
    );

    expect(returnResult.data.movementType).toBe('RETURN_FROM_WIP');
    expect(returnResult.data.sourceLocationId).toBe(wipLocationId);
    expect(returnResult.data.destinationLocationId).toBe(rawLocationId);

    // Check WIP balance is now 7 units (10 - 3)
    wipBal = await invService.getBalances(ws.users.owner.principal, {
      itemId: rawItemId,
      locationId: wipLocationId,
    });
    expect(wipBal[0].onHandAtoms).toBe(7_000_000n);

    // 4. Warehouse performs a count discrepancy on WIP: actual physical check finds 6 units (1 unit damaged/short)
    const countWip = await invService.createStockCount(
      ws.users.warehouse.principal,
      {
        locationId: wipLocationId,
        reason: 'WIP end-of-shift count',
        lines: [
          {
            itemId: rawItemId,
            locationId: wipLocationId,
            lotId,
            countedAtoms: 6_000_000n, // 6 units (discrepancy of -1 unit)
          },
        ],
      },
      'idem-count-wip'
    );

    // Owner approves the count discrepancy
    await invService.approveStockCount(
      ws.users.owner.principal,
      countWip.data.id,
      'idem-appr-count-wip'
    );

    wipBal = await invService.getBalances(ws.users.owner.principal, {
      itemId: rawItemId,
      locationId: wipLocationId,
    });
    expect(wipBal[0].onHandAtoms).toBe(6_000_000n);

    // 5. Final double-entry reconciliation across all movements and projected balances
    const finalRecon = await reconcileStock(fixture.db, ws.workspaceId);
    expect(finalRecon.balanced).toBe(true);
    expect(finalRecon.mismatches).toHaveLength(0);
  });
});
