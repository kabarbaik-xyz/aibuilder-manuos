import type { ScheduledTaskResult } from '@/engines/schedule';

export type ScheduledTaskRow = ScheduledTaskResult & {
  nodeKey?: string;
  nodeName?: string;
  orderNumber?: string;
  itemName?: string;
  customerName?: string;
};

export function taskInterval(task: Pick<ScheduledTaskRow, 'startAt' | 'endAt'>) {
  const start = Date.parse(task.startAt);
  const end = Date.parse(task.endAt);
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? { start, end } : null;
}

export function timelineRange(tasks: ReadonlyArray<ScheduledTaskRow>) {
  const intervals = tasks.map(taskInterval).filter((value): value is { start: number; end: number } => value !== null);
  if (!intervals.length) return null;
  const first = Math.min(...intervals.map((value) => value.start));
  const last = Math.max(...intervals.map((value) => value.end));
  const hour = 60 * 60 * 1000;
  const span = last - first;
  const hourly = span <= 12 * hour;
  const startDate = new Date(first);
  const endDate = new Date(last);
  if (hourly) {
    startDate.setMinutes(0, 0, 0);
    endDate.setMinutes(0, 0, 0);
    endDate.setHours(endDate.getHours() + 2);
  } else {
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);
    endDate.setDate(endDate.getDate() + 1);
  }
  const start = startDate.getTime();
  const end = endDate.getTime();
  const dayStep = Math.max(1, Math.ceil((end - start) / (24 * hour) / 12));
  const ticks: number[] = [];
  for (const date = new Date(start); date.getTime() < end;) {
    ticks.push(date.getTime());
    if (hourly) date.setHours(date.getHours() + Math.max(1, Math.ceil((end - start) / hour / 12)));
    else date.setDate(date.getDate() + dayStep);
  }
  return { start, end, ticks, hourly };
}

export function tasksOnDay(tasks: ReadonlyArray<ScheduledTaskRow>, day: Date) {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
  return tasks.filter((task) => {
    const interval = taskInterval(task);
    return interval !== null && interval.start < end && interval.end > start;
  }).sort((left, right) => Date.parse(left.startAt) - Date.parse(right.startAt));
}

export function monthDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => new Date(first.getFullYear(), first.getMonth(), 1 - mondayOffset + index));
}

export function sameDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}
