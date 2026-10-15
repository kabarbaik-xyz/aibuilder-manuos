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
});
