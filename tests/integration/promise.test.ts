import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { PromiseService } from '@/server/modules/intelligence/promise';
import { InventoryService } from '@/server/modules/inventory/service';
import { parseQuantity } from '@/domain/quantity';

describe('I02: Promise Feasibility Engine (Capacity & Material Readiness)', () => {
  let fixture: FactoryFixture;
  let promiseService: PromiseService;
  let inventoryService: InventoryService;

  let fgItemId: string;
  let rawItemId: string;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    promiseService = new PromiseService(fixture.db);
    inventoryService = new InventoryService(fixture.db);

    const { alpha } = fixture;
    fgItemId = alpha.masters.fgItemId;
    rawItemId = alpha.masters.rawItemId;
  });

  afterAll(async () => {
    await fixture.close();
  });

  it('evaluates feasibility with material shortage and rejects overtime as infeasible', async () => {
    const { alpha } = fixture;

    // Zero stock initially
    const result = await promiseService.evaluatePromise(alpha.users.planner.principal, {
      itemId: fgItemId,
      quantity: 50,
      requestedDate: '2026-11-25',
    });

    expect(result).toBeDefined();
    expect(result.evaluationId).toBeDefined();
    expect(result.inputHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.materialReadiness.isFullyAvailable).toBe(false);

    // Overtime option must explicitly be marked infeasible due to missing physical material
    const overtimeOption = result.alternatives.find((a) => a.type === 'OVERTIME');
    expect(overtimeOption).toBeDefined();
    expect(overtimeOption!.isFeasible).toBe(false);
    expect(overtimeOption!.infeasibleReason).toContain('Missing raw materials');

    // Partial delivery option remains feasible
    const partialOption = result.alternatives.find((a) => a.type === 'PARTIAL_DELIVERY');
    expect(partialOption).toBeDefined();
    expect(partialOption!.isFeasible).toBe(true);

    // Assert NO database mutation occurred (evaluation is strictly pure / side-effect free)
    const reservationsCount = await fixture.db.stockReservation.count({
      where: { workspaceId: alpha.workspaceId },
    });
    expect(reservationsCount).toBe(0);
  });

  it('evaluates feasibility when material is available and marks overtime feasible', async () => {
    const { alpha } = fixture;

    // Post opening balance of 100 units raw material
    await inventoryService.postOpeningBalance(
      alpha.users.owner.principal,
      {
        itemId: rawItemId,
        locationId: alpha.masters.rawLocationId,
        lotNumber: 'LOT-RAW-PROMISE-01',
        atoms: parseQuantity('100'),
        notes: 'Opening raw stock for promise evaluation',
      },
      'key-open-promise-raw'
    );

    const result = await promiseService.evaluatePromise(alpha.users.planner.principal, {
      itemId: fgItemId,
      quantity: 20,
      requestedDate: '2026-12-10',
    });

    expect(result.materialReadiness.isFullyAvailable).toBe(true);
    expect(result.confidence).toBe('HIGH');

    // With material available, overtime option becomes feasible
    const overtimeOption = result.alternatives.find((a) => a.type === 'OVERTIME');
    expect(overtimeOption).toBeDefined();
    expect(overtimeOption!.isFeasible).toBe(true);
  });
});
