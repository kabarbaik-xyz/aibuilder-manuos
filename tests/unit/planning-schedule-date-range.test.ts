import { describe, expect, it } from 'vitest';
import { toPublishedScheduleRange } from '@/features/planning/schedule-date-range';

describe('toPublishedScheduleRange', () => {
  it('includes the full selected end date in the UTC publish window', () => {
    expect(toPublishedScheduleRange('2026-11-15', '2026-11-22')).toEqual({
      periodStart: '2026-11-15T00:00:00.000Z',
      periodEnd: '2026-11-22T23:59:59.999Z',
    });
  });

  it('rejects an invalid or reversed calendar range', () => {
    expect(() => toPublishedScheduleRange('2026-11-23', '2026-11-22')).toThrow(/end date/i);
    expect(() => toPublishedScheduleRange('2026-02-30', '2026-03-01')).toThrow(/valid date/i);
  });
});
