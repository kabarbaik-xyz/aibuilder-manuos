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

  it('requires an explicitly selected released job before feasibility can be evaluated', async () => {
    const { alpha } = fixture;
    await expect(promiseService.evaluatePromise(alpha.users.planner.principal, {
      itemId: fgItemId,
      quantity: 50,
      requestedDate: '2026-11-25',
    })).rejects.toThrow();
  });

  it('rejects the legacy item-only request because it cannot identify routing or job scope', async () => {
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

    await expect(promiseService.evaluatePromise(alpha.users.planner.principal, {
      itemId: fgItemId,
      quantity: 20,
      requestedDate: '2026-12-10',
    })).rejects.toThrow();
  });

  it('rejects impossible calendar dates before loading schedule evidence', async () => {
    await expect(promiseService.evaluatePromise(fixture.alpha.users.planner.principal, {
      orderId: 'cd004730-82e0-4d0e-8f88-0f7ce40ec30c',
      instanceId: '2f20f305-2e1e-4cd8-a36d-f5d89d52ca72',
      requestedQuantity: '1',
      requestedDate: '2026-02-30',
    })).rejects.toThrow('valid calendar date');
  });
});
