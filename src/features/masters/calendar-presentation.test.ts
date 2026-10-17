import { describe, expect, it } from 'vitest';
import type { Calendar } from './api';
import { operatingDay, weeklyIntervals, civilDateKey } from './calendar-presentation';
const shift = { start: '07:00', end: '15:00' };
const base = { weeklyJson: JSON.stringify([{ dayOfWeek: 1, ...shift }]), exceptions: [] } as unknown as Calendar;
describe('working calendar presentation', () => {
  it('reads direct weekly entries and the calendar form days/intervals shape', () => {
    expect(weeklyIntervals(base.weeklyJson, 1)).toEqual([shift]);
    expect(weeklyIntervals(JSON.stringify({ days: [{ dayOfWeek: 1, intervals: [shift, { start: '16:00', end: '18:00' }] }] }), 1)).toHaveLength(2);
    expect(weeklyIntervals(base.weeklyJson, 0)).toEqual([]);
  });
  it('lets a shutdown exception override a regular working Monday', () => {
    const calendar = { ...base, exceptions: [{ id: 'holiday', date: '2026-10-19', workingIntervalsJson: '[]', reason: 'Shutdown' }] };
    expect(operatingDay(calendar, new Date(2026, 9, 19))).toEqual({ intervals: [], exception: true, reason: 'Shutdown' });
  });
  it('shows extra working intervals on a normally non-working Sunday', () => {
    const calendar = { ...base, exceptions: [{ id: 'extra', date: '2026-10-18', workingIntervalsJson: JSON.stringify([shift]), reason: 'Extra shift' }] };
    expect(operatingDay(calendar, new Date(2026, 9, 18)).intervals).toEqual([shift]);
  });
  it('retains unavailable state for malformed shifts and exceptions', () => {
    expect(weeklyIntervals('{broken', 1)).toBeNull();
    expect(weeklyIntervals(JSON.stringify([{ dayOfWeek: 1, start: '17:00', end: '08:00' }]), 1)).toBeNull();
    const calendar = { ...base, exceptions: [{ id: 'bad', date: '2026-10-19', workingIntervalsJson: 'bad', reason: null }] };
    expect(operatingDay(calendar, new Date(2026, 9, 19)).intervals).toBeNull();
  });
  it('formats civil dates without converting calendar days to UTC', () => {
    expect(civilDateKey(new Date(2026, 0, 2))).toBe('2026-01-02');
  });
});
