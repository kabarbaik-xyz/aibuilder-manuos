export interface CalendarConfig {
  shiftHoursPerDay: number;
  workDays: number[]; // 0: Sunday, 1: Monday, ... 6: Saturday. Default: [1,2,3,4,5,6] (Mon-Sat)
}

export const DEFAULT_CALENDAR: CalendarConfig = {
  shiftHoursPerDay: 8,
  workDays: [1, 2, 3, 4, 5, 6], // Mon - Sat (6 working days)
};

/**
 * Checks if a given Date is a working day
 */
export function isWorkDay(date: Date, config: CalendarConfig = DEFAULT_CALENDAR): boolean {
  return config.workDays.includes(date.getUTCDay());
}

/**
 * Adds working days to an ISO date string
 */
export function addWorkDays(
  startDateIso: string,
  daysToAdd: number,
  config: CalendarConfig = DEFAULT_CALENDAR
): string {
  const current = new Date(startDateIso);
  let added = 0;

  while (added < daysToAdd) {
    current.setUTCDate(current.getUTCDate() + 1);
    if (isWorkDay(current, config)) {
      added++;
    }
  }

  return current.toISOString().slice(0, 10);
}

/**
 * Adds hours to an ISO date string considering working hours per day
 */
export function addWorkingHours(
  startDateIso: string,
  hoursToAdd: number,
  config: CalendarConfig = DEFAULT_CALENDAR
): string {
  const fullDays = Math.floor(hoursToAdd / config.shiftHoursPerDay);
  const remainingHours = hoursToAdd % config.shiftHoursPerDay;
  const daysWithFraction = remainingHours > 0 ? fullDays + 1 : fullDays;
  return addWorkDays(startDateIso, daysWithFraction, config);
}

/**
 * Formats an ISO date string to a human-readable English date (e.g. 'Nov 25')
 */
export function formatDateEn(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Calculates calendar day difference (dateB - dateA)
 */
export function daysBetween(dateA: string, dateB: string): number {
  const dA = new Date(dateA).getTime();
  const dB = new Date(dateB).getTime();
  return Math.round((dB - dA) / (1000 * 60 * 60 * 24));
}
