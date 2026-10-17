import { describe, expect, it } from 'vitest';
import { monthDays, tasksOnDay, taskInterval, timelineRange, type ScheduledTaskRow } from './schedule-presentation';
const task = (start: Date, end: Date, id = 'task'): ScheduledTaskRow => ({ taskId: id, version: 1, startAt: start.toISOString(), endAt: end.toISOString(), earlyStart: start.toISOString(), earlyFinish: end.toISOString(), lateStart: start.toISOString(), lateFinish: end.toISOString(), assignedTechnicianId: null, assignedMachineId: null, slackMinutes: 0, isCriticalPath: true, materialWaitMinutes: 0 });

describe('planning visual schedule intervals', () => {
  it('does not show a task on the day it ends exactly at midnight', () => {
    const item = task(new Date(2026, 9, 18, 23), new Date(2026, 9, 19, 0));
    expect(tasksOnDay([item], new Date(2026, 9, 18))).toEqual([item]);
    expect(tasksOnDay([item], new Date(2026, 9, 19))).toEqual([]);
  });
  it('includes a multi-day task on each overlapping local calendar date', () => {
    const item = task(new Date(2026, 9, 18, 23), new Date(2026, 9, 20, 2));
    expect(tasksOnDay([item], new Date(2026, 9, 19))).toHaveLength(1);
    expect(tasksOnDay([item], new Date(2026, 9, 20))).toHaveLength(1);
    expect(tasksOnDay([item], new Date(2026, 9, 21))).toHaveLength(0);
  });
  it('rejects invalid and reversed intervals instead of drawing misleading bars', () => {
    expect(taskInterval({ startAt: 'invalid', endAt: 'invalid' })).toBeNull();
    const item = task(new Date(2026, 9, 19, 9), new Date(2026, 9, 19, 8));
    expect(timelineRange([item])).toBeNull();
    expect(tasksOnDay([item], new Date(2026, 9, 19))).toEqual([]);
  });
  it('pads the timeline around real intervals and bounds axis density', () => {
    const item = task(new Date(2026, 9, 19, 15, 20), new Date(2026, 9, 19, 17));
    const range = timelineRange([item])!;
    expect(range.start).toBeLessThanOrEqual(Date.parse(item.startAt));
    expect(range.end).toBeGreaterThan(Date.parse(item.endAt));
    expect(range.hourly).toBe(true);
    expect(range.ticks.length).toBeLessThanOrEqual(13);
    expect(timelineRange([])).toBeNull();
  });
  it('builds a Monday-first month grid across year boundaries', () => {
    const days = monthDays(new Date(2027, 0, 1));
    expect(days).toHaveLength(42);
    expect(days[0].getDay()).toBe(1);
    expect(days[0].getFullYear()).toBe(2026);
    expect(days.filter((day) => day.getMonth() === 0)).toHaveLength(31);
  });
});
