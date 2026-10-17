import type { Calendar } from './api';
export interface ShiftInterval { start: string; end: string }
const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
function intervals(value: unknown): ShiftInterval[] | null {
  if (!Array.isArray(value)) return null;
  if (!value.every(item => item && typeof item.start === 'string' && typeof item.end === 'string' && time.test(item.start) && time.test(item.end) && item.end > item.start)) return null;
  return value.map(item => ({ start: item.start, end: item.end }));
}
export function weeklyIntervals(json: string, dayOfWeek: number): ShiftInterval[] | null {
  try {
    const parsed = JSON.parse(json);
    const days = Array.isArray(parsed) ? parsed : parsed?.days;
    if (!Array.isArray(days) || days.some(day => !Number.isInteger(day?.dayOfWeek) || day.dayOfWeek < 0 || day.dayOfWeek > 6)) return null;
    const matching = days.filter(day => day.dayOfWeek === dayOfWeek);
    const groups = matching.map(day => intervals(day.intervals ?? [{ start: day.start, end: day.end }]));
    return groups.some(group => group === null) ? null : groups.flat() as ShiftInterval[];
  } catch { return null; }
}
export function civilDateKey(day: Date) {
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
}
export function operatingDay(calendar: Calendar, day: Date) {
  const exception = calendar.exceptions?.find(item => item.date.slice(0, 10) === civilDateKey(day));
  if (exception) {
    try { return { intervals: intervals(JSON.parse(exception.workingIntervalsJson)), exception: true, reason: exception.reason }; }
    catch { return { intervals: null, exception: true, reason: exception.reason }; }
  }
  return { intervals: weeklyIntervals(calendar.weeklyJson, day.getDay()), exception: false, reason: null };
}
export function calendarToday(timezone: string) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date());
  const number = (type: string) => Number(parts.find(part => part.type === type)?.value);
  return new Date(number('year'), number('month') - 1, number('day'));
}
