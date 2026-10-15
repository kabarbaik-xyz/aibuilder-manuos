import { describe, it, expect } from 'vitest';
import { calculateCPM, CPMTaskInput } from './cpm';

describe('CPM Engine', () => {
  it('calculates early/late dates, slack, and critical path for a linear chain', () => {
    const tasks: CPMTaskInput[] = [
      { id: 'T1', durationHours: 4, dependsOn: [] },
      { id: 'T2', durationHours: 6, dependsOn: ['T1'] },
      { id: 'T3', durationHours: 8, dependsOn: ['T2'] },
    ];

    const result = calculateCPM(tasks, '2026-11-24');
    expect(result.projectDurationHours).toBe(18);
    expect(result.criticalPath).toEqual(['T1', 'T2', 'T3']);
    expect(result.tasks['T1'].totalSlack).toBe(0);
    expect(result.tasks['T2'].totalSlack).toBe(0);
    expect(result.tasks['T3'].totalSlack).toBe(0);
  });

  it('correctly identifies slack on parallel non-critical branches', () => {
    const tasks: CPMTaskInput[] = [
      { id: 'T1', durationHours: 4, dependsOn: [] },
      { id: 'T2_parallel', durationHours: 2, dependsOn: [] }, // Parallel shorter branch
      { id: 'T3_join', durationHours: 5, dependsOn: ['T1', 'T2_parallel'] },
    ];

    const result = calculateCPM(tasks, '2026-11-24');
    expect(result.projectDurationHours).toBe(9); // 4 + 5 = 9
    expect(result.criticalPath).toContain('T1');
    expect(result.criticalPath).toContain('T3_join');
    expect(result.tasks['T2_parallel'].totalSlack).toBe(2); // 4 - 2 = 2
    expect(result.tasks['T2_parallel'].isCritical).toBe(false);
  });

  it('respects remaining work for partially completed operations and earliest start offsets', () => {
    const tasks: CPMTaskInput[] = [
      { id: 'T1_partially_done', durationHours: 10, remainingDurationHours: 2, dependsOn: [] },
      { id: 'T2_delayed_material', durationHours: 4, dependsOn: [], earliestStartHours: 8 },
      { id: 'T3_final', durationHours: 6, dependsOn: ['T1_partially_done', 'T2_delayed_material'] },
    ];

    const result = calculateCPM(tasks, '2026-11-24');
    // T1 finish is 0 + 2 = 2h
    // T2 finish is 8 + 4 = 12h
    // T3 early start is max(2, 12) = 12h, finish = 12 + 6 = 18h
    expect(result.projectDurationHours).toBe(18);
    expect(result.tasks['T1_partially_done'].earlyFinish).toBe(2);
    expect(result.tasks['T2_delayed_material'].earlyStart).toBe(8);
    expect(result.tasks['T2_delayed_material'].earlyFinish).toBe(12);
    expect(result.tasks['T3_final'].earlyStart).toBe(12);
    expect(result.criticalPath).toEqual(['T2_delayed_material', 'T3_final']);
  });
});
