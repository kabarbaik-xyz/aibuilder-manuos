import { describe, expect, it } from 'vitest';
import { getSchedulePredecessorLabels, getSchedulePromiseImpact } from './schedule-proposal-presentation';

describe('schedule proposal presentation', () => {
  it('shows predecessor operation names instead of internal task IDs', () => {
    const tasks = [
      { taskId: 'task-1', nodeKey: 'CUT' },
      { taskId: 'task-2', nodeKey: 'MILL' },
    ];
    expect(getSchedulePredecessorLabels(['task-1', 'completed-task'], tasks)).toEqual(['CUT', 'Completed prior operation']);
  });

  it('compares projected finish with the contractual promised date without changing it', () => {
    expect(getSchedulePromiseImpact('2026-10-22T09:00:00.000Z', '2026-10-20T00:00:00.000Z')).toEqual({
      projectedDate: '22 Oct 2026',
      promisedDate: '20 Oct 2026',
      deltaDays: 2,
    });
    expect(getSchedulePromiseImpact(null, null)).toBeNull();
  });
});
