import { describe, expect, it } from 'vitest';
import { accumulateOvertimeMinutes, splitOvertimeByLocalDay } from './overtime-policy';

describe('overtime policy calendar buckets', () => {
  it('splits intervals at workspace-local midnight and uses Monday week keys', () => {
    const segments = splitOvertimeByLocalDay(new Date('2026-10-18T16:00:00Z'), new Date('2026-10-18T20:00:00Z'), 'Asia/Jakarta');
    expect(segments).toEqual([
      { date: '2026-10-18', week: '2026-10-12', minutes: 60 },
      { date: '2026-10-19', week: '2026-10-19', minutes: 180 },
    ]);
  });

  it('aggregates existing daily and weekly overtime without floating-point rounding', () => {
    const result = accumulateOvertimeMinutes([
      { startAt: new Date('2026-10-19T08:00:00Z'), endAt: new Date('2026-10-19T10:00:00Z') },
      { startAt: new Date('2026-10-20T08:00:00Z'), endAt: new Date('2026-10-20T09:30:00Z') },
    ], 'Asia/Jakarta');
    expect(result.byDay.get('2026-10-19')).toBe(120);
    expect(result.byWeek.get('2026-10-19')).toBe(210);
  });
});
