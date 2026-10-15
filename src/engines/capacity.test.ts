import { describe, it, expect } from 'vitest';
import { checkPromiseFeasibility } from './capacity';
import { seedMachines } from '../data/seed';

describe('Capacity & Promise Feasibility Engine', () => {
  it('correctly calculates feasible date and detects delay when requested date is too tight', () => {
    const result = checkPromiseFeasibility(
      {
        partFamily: 'PUMP-HOUSING',
        quantity: 200,
        requestedDate: '2026-11-25', // 1 day from 2026-11-24
      },
      seedMachines
    );

    expect(result.isFeasibleOnRequestedDate).toBe(false);
    expect(result.deltaDays).toBeGreaterThan(0);
    expect(result.bottleneckMachineClass).toBeDefined();
    expect(result.alternatives.length).toBeGreaterThan(0);
  });

  it('reports feasible when requested date has sufficient lead time buffer', () => {
    const result = checkPromiseFeasibility(
      {
        partFamily: 'BRACKET',
        quantity: 50,
        requestedDate: '2026-12-10',
      },
      seedMachines
    );

    expect(result.isFeasibleOnRequestedDate).toBe(true);
    expect(result.deltaDays).toBeLessThanOrEqual(0);
  });
});
