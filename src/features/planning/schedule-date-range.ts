export function toPublishedScheduleRange(startDate: string, endDate: string) {
  const isCalendarDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  };

  if (!isCalendarDate(startDate) || !isCalendarDate(endDate)) {
    throw new RangeError('Enter a valid date range');
  }
  if (startDate > endDate) {
    throw new RangeError('The end date must be on or after the start date');
  }

  return {
    periodStart: `${startDate}T00:00:00.000Z`,
    periodEnd: `${endDate}T23:59:59.999Z`,
  };
}
