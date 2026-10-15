import { describe, it, expect } from 'vitest';
import { analyzeRippleEffect } from './ripple';
import { INITIAL_TASKS, INITIAL_ORDERS, INITIAL_MATERIALS } from '../data/seed';

describe('Ripple Engine', () => {
  it('correctly calculates blast radius for terminal block delay (+2 days)', () => {
    const result = analyzeRippleEffect(
      'TB-24',
      2,
      '2026-11-27',
      INITIAL_TASKS,
      INITIAL_ORDERS,
      INITIAL_MATERIALS
    );

    // Golden check: affects >=2 orders
    expect(result.affectedOrderIds.length).toBeGreaterThanOrEqual(2);
    expect(result.affectedOrderIds).toContain('1042');
    expect(result.affectedOrderIds).toContain('1045');

    // Golden check: exactly {T12, T13, T14} blocked in hero order #1042
    expect(result.blockedTaskIds).toContain('T12');
    expect(result.blockedTaskIds).toContain('T13');
    expect(result.blockedTaskIds).toContain('T14');
    expect(result.blockedTaskIds.length).toBe(3);

    // Golden check: remaining active tasks are still runnable
    expect(result.runnableTaskIds).toContain('T3');
    expect(result.runnableTaskIds).toContain('T9');
    expect(result.runnableTaskIds).toContain('T10');
    expect(result.runnableTaskIds).toContain('T11');

    // Golden check: Order #1042 expected date moves to Nov 28 (+3 days)
    expect(result.orderEtaDeltas['1042'].newExpectedDate).toBe('2026-11-28');
    expect(result.orderEtaDeltas['1042'].deltaDays).toBe(3);
  });
});
