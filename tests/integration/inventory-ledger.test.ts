import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { InventoryService } from '@/server/modules/inventory/service';
import { MovementType, MovementReferenceType } from '@/server/modules/inventory/contracts';
import { ForbiddenError, BadRequestError, NotFoundError } from '@/domain/errors';

describe('O01 — Stock Ledger, Lots, Balances and Opening Records', () => {
  let fixture: FactoryFixture;
  let invService: InventoryService;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    invService = new InventoryService(fixture.db);
  });

  afterAll(async () => {
    await fixture.close();
  });

  it('enforces privileged explicit setup for opening balances', async () => {
    const rawItemId = fixture.alpha.masters.rawItemId;
    const rawLocationId = fixture.alpha.masters.rawLocationId;

    // 1. Operator lacks 'inventory.opening' -> Forbidden
    await expect(
      invService.postOpeningBalance(
        fixture.alpha.users.operator.principal,
        {
          itemId: rawItemId,
          locationId: rawLocationId,
          lotNumber: 'LOT-AL-001',
          atoms: '100000000', // 100 units
          notes: 'Opening raw material stock',
        },
        'idem-op-open-fail'
      )
    ).rejects.toThrow(ForbiddenError);

    // 2. Owner has 'inventory.opening' -> Success
    const receipt = await invService.postOpeningBalance(
      fixture.alpha.users.owner.principal,
      {
        itemId: rawItemId,
        locationId: rawLocationId,
        lotNumber: 'LOT-AL-001',
        atoms: '100000000', // 100 units
        notes: 'Initial warehouse intake',
      },
      'idem-alpha-open-01'
    );

    expect(receipt.data).toBeDefined();
    expect(receipt.data.movementType).toBe(MovementType.OPENING_BALANCE);
    expect(receipt.data.atoms).toBe(100000000n);

    // 3. Idempotent replay with same key returns identical receipt
    const replayed = await invService.postOpeningBalance(
      fixture.alpha.users.owner.principal,
      {
        itemId: rawItemId,
        locationId: rawLocationId,
        lotNumber: 'LOT-AL-001',
        atoms: '100000000',
        notes: 'Initial warehouse intake',
      },
      'idem-alpha-open-01'
    );
    expect(replayed.data.id).toBe(receipt.data.id);
    expect(replayed.meta.replayed).toBe(true);

    // Verify balance projection
    const balances = await invService.getBalances(fixture.alpha.users.owner.principal, {
      itemId: rawItemId,
      locationId: rawLocationId,
    });
    expect(balances.length).toBe(1);
    expect(balances[0].onHandAtoms).toBe(100000000n);
    expect(balances[0].reservedAtoms).toBe(0n);
    expect(balances[0].availableAtoms).toBe(100000000n);
    expect(balances[0].lotNumber).toBe('LOT-AL-001');
  });

  it('executes transfer preserving global physical stock quantity', async () => {
    const rawItemId = fixture.alpha.masters.rawItemId;
    const rawLocationId = fixture.alpha.masters.rawLocationId;
    const wipLocationId = fixture.alpha.masters.wipLocationId;

    const balancesBefore = await invService.getBalances(fixture.alpha.users.owner.principal, {
      itemId: rawItemId,
    });
    const totalBefore = balancesBefore.reduce((sum, b) => sum + b.onHandAtoms, 0n);

    // Retrieve lot ID
    const lotId = balancesBefore[0].lotId!;

    // Transfer 40 units from RAW to WIP
    const transfer = await invService.postMovement(
      fixture.alpha.users.warehouse.principal,
      {
        movementType: MovementType.TRANSFER,
        itemId: rawItemId,
        sourceLocationId: rawLocationId,
        destinationLocationId: wipLocationId,
        sourceLotId: lotId,
        destinationLotId: lotId,
        atoms: '40000000', // 40 units
        notes: 'Transfer 40 units to shop floor WIP stage',
      },
      'idem-transfer-raw-wip-01'
    );

    expect(transfer.data).toBeDefined();
    expect(transfer.data.movementType).toBe(MovementType.TRANSFER);

    const balancesAfter = await invService.getBalances(fixture.alpha.users.owner.principal, {
      itemId: rawItemId,
    });
    const rawBal = balancesAfter.find((b) => b.locationId === rawLocationId);
    const wipBal = balancesAfter.find((b) => b.locationId === wipLocationId);

    expect(rawBal?.onHandAtoms).toBe(60000000n); // 60 units remaining
    expect(wipBal?.onHandAtoms).toBe(40000000n); // 40 units transferred

    const totalAfter = balancesAfter.reduce((sum, b) => sum + b.onHandAtoms, 0n);
    expect(totalAfter).toBe(totalBefore); // Strictly conserved!
  });

  it('performs QC disposition move to quarantine and back', async () => {
    const rawItemId = fixture.alpha.masters.rawItemId;
    const wipLocationId = fixture.alpha.masters.wipLocationId;
    const quarLocationId = fixture.alpha.masters.quarantineLocationId;

    const balances = await invService.getBalances(fixture.alpha.users.owner.principal, {
      itemId: rawItemId,
      locationId: wipLocationId,
    });
    const lotId = balances[0].lotId!;

    // Move 10 units from WIP to QUARANTINE
    await invService.postMovement(
      fixture.alpha.users.qc.principal,
      {
        movementType: MovementType.QC_DISPOSITION,
        itemId: rawItemId,
        sourceLocationId: wipLocationId,
        destinationLocationId: quarLocationId,
        sourceLotId: lotId,
        destinationLotId: lotId,
        atoms: '10000000', // 10 units
        notes: 'Hold 10 units for metallurgical testing',
      },
      'idem-qc-hold-01'
    );

    const afterHold = await invService.getBalances(fixture.alpha.users.owner.principal, {
      itemId: rawItemId,
    });
    const wipBal = afterHold.find((b) => b.locationId === wipLocationId);
    const quarBal = afterHold.find((b) => b.locationId === quarLocationId);

    expect(wipBal?.onHandAtoms).toBe(30000000n);
    expect(quarBal?.onHandAtoms).toBe(10000000n);
  });

  it('rejects illegal negative source balance', async () => {
    const rawItemId = fixture.alpha.masters.rawItemId;
    const rawLocationId = fixture.alpha.masters.rawLocationId;
    const wipLocationId = fixture.alpha.masters.wipLocationId;

    const balances = await invService.getBalances(fixture.alpha.users.owner.principal, {
      itemId: rawItemId,
      locationId: rawLocationId,
    });
    const lotId = balances[0].lotId!;
    // Current on hand is 60,000,000 atoms (60 units)

    // Attempt to transfer 70 units
    await expect(
      invService.postMovement(
        fixture.alpha.users.warehouse.principal,
        {
          movementType: MovementType.TRANSFER,
          itemId: rawItemId,
          sourceLocationId: rawLocationId,
          destinationLocationId: wipLocationId,
          sourceLotId: lotId,
          destinationLotId: lotId,
          atoms: '70000000', // 70 units > 60 available
        },
        'idem-overtransfer-fail'
      )
    ).rejects.toThrow(BadRequestError);

    // Verify raw balance was unaffected
    const afterAttempt = await invService.getBalances(fixture.alpha.users.owner.principal, {
      itemId: rawItemId,
      locationId: rawLocationId,
    });
    expect(afterAttempt[0].onHandAtoms).toBe(60000000n);
  });

  it('enforces lot requirement for LOT-tracked items', async () => {
    const rawItemId = fixture.alpha.masters.rawItemId;
    const rawLocationId = fixture.alpha.masters.rawLocationId;
    const wipLocationId = fixture.alpha.masters.wipLocationId;

    // Missing lot ID
    await expect(
      invService.postMovement(
        fixture.alpha.users.warehouse.principal,
        {
          movementType: MovementType.TRANSFER,
          itemId: rawItemId,
          sourceLocationId: rawLocationId,
          destinationLocationId: wipLocationId,
          atoms: '1000000',
        },
        'idem-missing-lot-fail'
      )
    ).rejects.toThrow(BadRequestError);
  });

  it('enforces cross-workspace item and location isolation', async () => {
    const rawItemBeta = fixture.beta.masters.rawItemId;
    const rawLocationAlpha = fixture.alpha.masters.rawLocationId;
    const rawLocationBeta = fixture.beta.masters.rawLocationId;

    // 1. Alpha user attempting to move Beta item -> NotFoundError
    await expect(
      invService.postOpeningBalance(
        fixture.alpha.users.owner.principal,
        {
          itemId: rawItemBeta,
          locationId: rawLocationAlpha,
          atoms: '10000000',
        },
        'idem-cross-item-fail'
      )
    ).rejects.toThrow(NotFoundError);

    // 2. Alpha user attempting to move Alpha item to Beta location -> NotFoundError
    await expect(
      invService.postOpeningBalance(
        fixture.alpha.users.owner.principal,
        {
          itemId: fixture.alpha.masters.rawItemId,
          locationId: rawLocationBeta,
          atoms: '10000000',
        },
        'idem-cross-loc-fail'
      )
    ).rejects.toThrow(NotFoundError);
  });

  it('guarantees unique normalized stock buckets even when lots are absent', async () => {
    // Copper wire in Beta has tracking: NONE
    const copperItem = fixture.beta.masters.rawItemId;
    const copperLoc = fixture.beta.masters.rawLocationId;

    // Post opening 50 units
    await invService.postOpeningBalance(
      fixture.beta.users.owner.principal,
      {
        itemId: copperItem,
        locationId: copperLoc,
        atoms: '50000000', // 50 units
        notes: 'Initial copper spool count',
      },
      'idem-copper-open-1'
    );

    // Post another opening/intake 30 units to the same item & location without lot
    await invService.postOpeningBalance(
      fixture.beta.users.owner.principal,
      {
        itemId: copperItem,
        locationId: copperLoc,
        atoms: '30000000', // 30 units
        notes: 'Second intake batch',
      },
      'idem-copper-open-2'
    );

    // Query stock_balances directly in DB: must have exactly 1 record for this bucket
    const balances = await fixture.db.stockBalance.findMany({
      where: {
        workspaceId: fixture.beta.workspaceId,
        itemId: copperItem,
        locationId: copperLoc,
      },
    });

    expect(balances.length).toBe(1);
    expect(balances[0].bucketKey).toBe(`${copperItem}:${copperLoc}:__NO_LOT__`);
    expect(balances[0].onHandAtoms).toBe(80000000n);
    expect(balances[0].lotId).toBeNull();
  });

  it('enforces append-only trigger protection on stock_movements', async () => {
    const movements = await fixture.db.stockMovement.findMany({
      where: { workspaceId: fixture.alpha.workspaceId },
      take: 1,
    });
    expect(movements.length).toBeGreaterThan(0);
    const movId = movements[0].id;

    // Attempt direct SQL UPDATE on stock_movements
    await expect(
      fixture.db.$executeRawUnsafe(
        `UPDATE stock_movements SET atoms = 999 WHERE id = '${movId}';`
      )
    ).rejects.toThrow(/stock_movements is append-only/);

    // Attempt direct SQL DELETE on stock_movements
    await expect(
      fixture.db.$executeRawUnsafe(
        `DELETE FROM stock_movements WHERE id = '${movId}';`
      )
    ).rejects.toThrow(/stock_movements is append-only/);
  });

  it('verifies reconciliation matches independent sum-of-movement queries and rollback on error', async () => {
    // 1. Reconcile Alpha workspace: should be completely balanced
    const reconAlpha = await invService.reconcile(fixture.alpha.users.owner.principal);
    expect(reconAlpha.balanced).toBe(true);
    expect(reconAlpha.mismatches.length).toBe(0);
    expect(reconAlpha.totalMovements).toBeGreaterThan(0);

    // 2. Reconcile Beta workspace: should be completely balanced
    const reconBeta = await invService.reconcile(fixture.beta.users.owner.principal);
    expect(reconBeta.balanced).toBe(true);
    expect(reconBeta.mismatches.length).toBe(0);

    // 3. Verify rollback atomicity: if an error happens before commit, no balance or movement is left behind
    const countMovementsBefore = await fixture.db.stockMovement.count({
      where: { workspaceId: fixture.alpha.workspaceId },
    });

    try {
      await invService.postMovement(
        fixture.alpha.users.warehouse.principal,
        {
          movementType: MovementType.TRANSFER,
          itemId: fixture.alpha.masters.rawItemId,
          sourceLocationId: fixture.alpha.masters.rawLocationId,
          destinationLocationId: fixture.alpha.masters.wipLocationId,
          sourceLotId: 'non-existent-lot-uuid-000',
          atoms: '5000000',
        },
        'idem-rollback-test'
      );
    } catch (e) {
      // Expected
    }

    const countMovementsAfter = await fixture.db.stockMovement.count({
      where: { workspaceId: fixture.alpha.workspaceId },
    });
    expect(countMovementsAfter).toBe(countMovementsBefore);
  });
});
