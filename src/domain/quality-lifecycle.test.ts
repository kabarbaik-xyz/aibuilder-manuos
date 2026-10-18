import { describe, expect, it } from 'vitest';
import { deriveQualityLifecycleOutcome, isQualityLifecycleComplete } from './quality-lifecycle';

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

describe('quality lifecycle routing outcome', () => {
  it('classifies pass, completed rework, partial disposition and rejection from finalized inspections', () => {
    const base = { status: 'FINALIZED', reworkAtoms: 0n, scrappedAtoms: 0n, reinspections: [] as Array<{ status: string; passedAtoms: bigint; scrappedAtoms: bigint }> };
    expect(deriveQualityLifecycleOutcome([{ ...base, passedAtoms: 5n }])).toBe('PASSED');
    expect(deriveQualityLifecycleOutcome([{ ...base, passedAtoms: 3n, reworkAtoms: 2n, reinspections: [{ status: 'FINALIZED', passedAtoms: 2n, scrappedAtoms: 0n }] }])).toBe('PASSED_AFTER_REWORK');
    expect(deriveQualityLifecycleOutcome([{ ...base, passedAtoms: 3n, scrappedAtoms: 2n }])).toBe('PARTIAL');
    expect(deriveQualityLifecycleOutcome([{ ...base, passedAtoms: 0n, scrappedAtoms: 5n }])).toBe('REJECTED');
  });

  it('does not publish an outcome while any rework disposition remains open', () => {
    expect(deriveQualityLifecycleOutcome([{ status: 'FINALIZED', passedAtoms: 3n, reworkAtoms: 2n, scrappedAtoms: 0n, reinspections: [] }])).toBeNull();
    expect(deriveQualityLifecycleOutcome([{ status: 'DRAFT', passedAtoms: 0n, reworkAtoms: 0n, scrappedAtoms: 0n, reinspections: [] }])).toBeNull();
  });
});
