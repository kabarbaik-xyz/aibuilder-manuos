export interface OvertimeSegment {
  date: string;
  week: string;
  minutes: number;
}

export function localDateKey(value: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value);
  const fields = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}

function localWeekKey(date: string): string {
  const localNoon = new Date(`${date}T12:00:00.000Z`);
  const weekday = localNoon.getUTCDay();
  localNoon.setUTCDate(localNoon.getUTCDate() - ((weekday + 6) % 7));
  return localNoon.toISOString().slice(0, 10);
}

export function splitOvertimeByLocalDay(start: Date, end: Date, timezone: string): OvertimeSegment[] {
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) return [];
  const segments: OvertimeSegment[] = [];
  let cursor = start.getTime();
  const endMs = end.getTime();
  while (cursor < endMs) {
    const day = localDateKey(new Date(cursor), timezone);
    let low = cursor;
    let high = Math.min(endMs, cursor + 36 * 60 * 60 * 1000);
    while (high < endMs && localDateKey(new Date(high), timezone) === day) high = Math.min(endMs, high + 12 * 60 * 60 * 1000);
    if (localDateKey(new Date(high), timezone) === day) high = endMs;
    else {
      while (high - low > 1) {
        const middle = low + Math.floor((high - low) / 2);
        if (localDateKey(new Date(middle), timezone) === day) low = middle;
        else high = middle;
      }
    }
    const segmentEnd = Math.min(high, endMs);
    segments.push({ date: day, week: localWeekKey(day), minutes: (segmentEnd - cursor) / 60_000 });
    if (segmentEnd <= cursor) break;
    cursor = segmentEnd;
  }
  return segments;
}

export function accumulateOvertimeMinutes(intervals: Array<{ startAt: Date; endAt: Date }>, timezone: string) {
  const byDay = new Map<string, number>();
  const byWeek = new Map<string, number>();
  for (const interval of intervals) {
    for (const segment of splitOvertimeByLocalDay(interval.startAt, interval.endAt, timezone)) {
      byDay.set(segment.date, (byDay.get(segment.date) ?? 0) + segment.minutes);
      byWeek.set(segment.week, (byWeek.get(segment.week) ?? 0) + segment.minutes);
    }
  }
  return { byDay, byWeek };
}
