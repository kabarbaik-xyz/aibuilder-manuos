import { describe, it, expect } from 'vitest';
import { generateRecoveryOptions } from './recovery';

describe('Recovery Simulation Engine', () => {
  it('correctly recommends split batch with exact quantity conservation (40 + 80 = 120)', () => {
    const options = generateRecoveryOptions({
      orderId: 'ORD-2026-088',
      totalQty: 120,
      readyQcPassedQty: 78,
      disruptionType: 'MATERIAL_DELAY',
      materialArrivesDate: '2026-11-27',
      originalPromisedDate: '2026-11-25',
      projectedDelayedDate: '2026-11-28',
    });

    const splitOption = options.find((o) => o.type === 'SPLIT_BATCH');
    expect(splitOption).toBeDefined();
    expect(splitOption?.isRecommended).toBe(true);
    expect(splitOption?.feasible).toBe(true);
    expect(splitOption?.allocation?.tranche1Qty).toBe(40);
    expect(splitOption?.allocation?.tranche2Qty).toBe(80);
    expect((splitOption?.allocation?.tranche1Qty ?? 0) + (splitOption?.allocation?.tranche2Qty ?? 0)).toBe(120);
  });

  it('correctly marks additional overtime shift as infeasible for material shortages', () => {
    const options = generateRecoveryOptions({
      orderId: 'ORD-2026-088',
      totalQty: 120,
      readyQcPassedQty: 78,
      disruptionType: 'MATERIAL_DELAY',
      materialArrivesDate: '2026-11-27',
      originalPromisedDate: '2026-11-25',
      projectedDelayedDate: '2026-11-28',
    });

    const shiftOption = options.find((o) => o.type === 'ADD_SHIFT');
    expect(shiftOption).toBeDefined();
    expect(shiftOption?.feasible).toBe(false);
    expect(shiftOption?.infeasibleReason).toContain('Physical material shortage');
  });

  it('does not promise a split tranche without enough final QC-passed units', () => {
    const options = generateRecoveryOptions({
      orderId: 'ORD-2026-089',
      totalQty: 120,
      readyQcPassedQty: 20,
      disruptionType: 'MACHINE_FAILURE',
      materialArrivesDate: '2026-11-27',
      originalPromisedDate: '2026-11-25',
      projectedDelayedDate: '2026-11-28',
    });

    const splitOption = options.find((option) => option.type === 'SPLIT_BATCH');
    expect(splitOption?.feasible).toBe(false);
    expect(splitOption?.infeasibleReason).toContain('Final QC-passed quantity');
  });
});
