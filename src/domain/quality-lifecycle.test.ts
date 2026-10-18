import { describe, expect, it } from 'vitest';
import { isQualityLifecycleComplete } from './quality-lifecycle';

describe('quality lifecycle completion', () => {
  it('waits until every output is inspected and every rework unit is reinspected', () => {
    expect(isQualityLifecycleComplete([
      [{ status: 'FINALIZED', reworkAtoms: 2n, reinspectedAtoms: 1n, openReworkAttempts: 0 }],
      [{ status: 'FINALIZED', reworkAtoms: 0n, reinspectedAtoms: 0n, openReworkAttempts: 0 }],
    ])).toBe(false);

    expect(isQualityLifecycleComplete([
      [{ status: 'FINALIZED', reworkAtoms: 2n, reinspectedAtoms: 2n, openReworkAttempts: 0 }],
      [{ status: 'FINALIZED', reworkAtoms: 0n, reinspectedAtoms: 0n, openReworkAttempts: 0 }],
    ])).toBe(true);
  });

  it('fails closed for missing or draft inspections and active rework attempts', () => {
    expect(isQualityLifecycleComplete([[]])).toBe(false);
    expect(isQualityLifecycleComplete([[{ status: 'DRAFT', reworkAtoms: 0n, reinspectedAtoms: 0n, openReworkAttempts: 0 }]])).toBe(false);
    expect(isQualityLifecycleComplete([[{ status: 'FINALIZED', reworkAtoms: 2n, reinspectedAtoms: 2n, openReworkAttempts: 1 }]])).toBe(false);
  });
});
