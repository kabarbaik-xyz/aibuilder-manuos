export interface ScheduleCalendar {
  id: string;
  shiftStartHour: number; // e.g. 8 (08:00)
  shiftHours: number; // e.g. 8 (08:00 - 16:00)
  workDays: number[]; // 0: Sun, 1: Mon, ... 6: Sat. (e.g. [1, 2, 3, 4, 5] for Mon-Fri)
  timezone?: string; // default Asia/Jakarta
}

export const DEFAULT_SCHEDULE_CALENDAR: ScheduleCalendar = {
  id: 'DEFAULT',
  shiftStartHour: 8,
  shiftHours: 8,
  workDays: [1, 2, 3, 4, 5], // Monday through Friday
  timezone: 'Asia/Jakarta',
};

export interface TaskScheduleInput {
  id: string;
  version?: number;
  name?: string;
  plannedDurationMinutes: number;
  predecessorTaskIds?: string[];
  requiredMachineClassId?: string | null;
  requiredSkillCode?: string | null;
  requiredCertName?: string | null;
  materialAvailableAt?: Date | string | null;
  assignedTechnicianId?: string | null;
  assignedMachineId?: string | null;
}

export interface ResourceTechnician {
  id: string;
  name: string;
  skills: Array<{ skillCode: string; level?: number }>;
  certifications: Array<{ name: string; validUntil: string | Date }>;
  calendarId?: string;
  isActive: boolean;
}

export interface ResourceMachine {
  id: string;
  code: string;
  name: string;
  machineClassId: string;
  calendarId?: string;
  isActive: boolean;
}

export interface ResourceBookingInput {
  resourceType: 'TECHNICIAN' | 'MACHINE';
  resourceId: string;
  startAt: Date | string;
  endAt: Date | string;
  taskId?: string;
}

export interface ScheduleTasksInput {
  tasks: TaskScheduleInput[];
  startHorizon: Date | string;
  calendar?: ScheduleCalendar;
  technicians?: ResourceTechnician[];
  machines?: ResourceMachine[];
  existingBookings?: ResourceBookingInput[];
}

export interface ScheduledTaskResult {
  taskId: string;
  version: number;
  startAt: string;
  endAt: string;
  assignedTechnicianId: string | null;
  assignedMachineId: string | null;
  slackMinutes: number;
  isCriticalPath: boolean;
  materialWaitMinutes: number;
  earlyStart: string;
  earlyFinish: string;
  lateStart: string;
  lateFinish: string;
}

export interface ScheduleOutput {
  scheduledTasks: ScheduledTaskResult[];
  makespanMinutes: number;
  projectedEndAt: string;
  criticalPath: string[];
}

/**
 * Calculates working time advancement taking shifts and working days into account.
 * Starts from a given date and adds durationMinutes of actual working time.
 */
export function addWorkingMinutes(
  startDate: Date,
  durationMinutes: number,
  calendar: ScheduleCalendar = DEFAULT_SCHEDULE_CALENDAR
): { start: Date; end: Date } {
  let current = new Date(startDate.getTime());

  // Normalize current to next valid working window if needed
  normalizeToWorkingHours(current, calendar);

  const start = new Date(current.getTime());
  let remainingMinutes = durationMinutes;

  while (remainingMinutes > 0) {
    normalizeToWorkingHours(current, calendar);

    // End of current day's shift
    const shiftEnd = new Date(current.getTime());
    shiftEnd.setUTCHours(calendar.shiftStartHour + calendar.shiftHours, 0, 0, 0);

    const availableMinutesInShift = Math.max(
      0,
      Math.floor((shiftEnd.getTime() - current.getTime()) / (60 * 1000))
    );

    if (remainingMinutes <= availableMinutesInShift) {
      current = new Date(current.getTime() + remainingMinutes * 60 * 1000);
      remainingMinutes = 0;
    } else {
      remainingMinutes -= availableMinutesInShift;
      // Advance to next day's shift start
      current.setUTCDate(current.getUTCDate() + 1);
      current.setUTCHours(calendar.shiftStartHour, 0, 0, 0);
    }
  }

  return { start, end: current };
}

/**
 * Moves date forward until it is within a working day and shift hours.
 */
export function normalizeToWorkingHours(
  date: Date,
  calendar: ScheduleCalendar = DEFAULT_SCHEDULE_CALENDAR
): void {
  while (true) {
    const dayOfWeek = date.getUTCDay();
    const isWorkDay = calendar.workDays.includes(dayOfWeek);

    if (!isWorkDay) {
      date.setUTCDate(date.getUTCDate() + 1);
      date.setUTCHours(calendar.shiftStartHour, 0, 0, 0);
      continue;
    }

    const hour = date.getUTCHours();
    const minute = date.getUTCMinutes();
    const currentMinutesFromMidnight = hour * 60 + minute;
    const shiftStartMinutes = calendar.shiftStartHour * 60;
    const shiftEndMinutes = (calendar.shiftStartHour + calendar.shiftHours) * 60;

    if (currentMinutesFromMidnight < shiftStartMinutes) {
      date.setUTCHours(calendar.shiftStartHour, 0, 0, 0);
      break;
    } else if (currentMinutesFromMidnight >= shiftEndMinutes) {
      // Past shift end: advance to next day shift start
      date.setUTCDate(date.getUTCDate() + 1);
      date.setUTCHours(calendar.shiftStartHour, 0, 0, 0);
      continue;
    } else {
      // Currently within working hours
      break;
    }
  }
}

/**
 * Pure scheduling engine supporting precedence, material arrivals, calendar shifts,
 * and critical path method (CPM) forward/backward passes.
 */
export function scheduleTasks(input: ScheduleTasksInput): ScheduleOutput {
  const calendar = input.calendar || DEFAULT_SCHEDULE_CALENDAR;
  const horizonDate = new Date(input.startHorizon);
  normalizeToWorkingHours(horizonDate, calendar);

  const taskMap = new Map<string, TaskScheduleInput>();
  const successorMap = new Map<string, string[]>();
  const predecessorMap = new Map<string, string[]>();

  for (const t of input.tasks) {
    taskMap.set(t.id, t);
    successorMap.set(t.id, []);
    predecessorMap.set(t.id, t.predecessorTaskIds || []);
  }

  for (const t of input.tasks) {
    for (const predId of t.predecessorTaskIds || []) {
      const succs = successorMap.get(predId) || [];
      succs.push(t.id);
      successorMap.set(predId, succs);
    }
  }

  // 1. Topological order via Kahn's algorithm
  const inDegree = new Map<string, number>();
  for (const t of input.tasks) {
    inDegree.set(t.id, (t.predecessorTaskIds || []).length);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }

  const topoOrder: string[] = [];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    topoOrder.push(curr);
    for (const succ of successorMap.get(curr) || []) {
      const newDeg = (inDegree.get(succ) || 1) - 1;
      inDegree.set(succ, newDeg);
      if (newDeg === 0) queue.push(succ);
    }
  }

  if (topoOrder.length !== input.tasks.length) {
    throw new Error('Cycle detected in task dependencies');
  }

  // 2. Forward Pass (Early Start & Early Finish)
  const earlyStartMap = new Map<string, Date>();
  const earlyFinishMap = new Map<string, Date>();
  const materialWaitMap = new Map<string, number>();

  for (const taskId of topoOrder) {
    const task = taskMap.get(taskId)!;
    let earliestPossible = new Date(horizonDate.getTime());

    // Respect predecessors
    for (const predId of predecessorMap.get(taskId) || []) {
      const predFinish = earlyFinishMap.get(predId);
      if (predFinish && predFinish.getTime() > earliestPossible.getTime()) {
        earliestPossible = new Date(predFinish.getTime());
      }
    }

    // Respect material availability date
    if (task.materialAvailableAt) {
      const matDate = new Date(task.materialAvailableAt);
      if (matDate.getTime() > earliestPossible.getTime()) {
        const waitMinutes = Math.floor((matDate.getTime() - earliestPossible.getTime()) / (60 * 1000));
        materialWaitMap.set(taskId, waitMinutes);
        earliestPossible = new Date(matDate.getTime());
      }
    }

    normalizeToWorkingHours(earliestPossible, calendar);
    const { start, end } = addWorkingMinutes(earliestPossible, task.plannedDurationMinutes, calendar);
    earlyStartMap.set(taskId, start);
    earlyFinishMap.set(taskId, end);
  }

  // Find max end time across all tasks (makespan)
  let maxEndTime = horizonDate.getTime();
  for (const [, end] of earlyFinishMap.entries()) {
    if (end.getTime() > maxEndTime) {
      maxEndTime = end.getTime();
    }
  }
  const projectedEndDate = new Date(maxEndTime);

  // 3. Backward Pass (Late Start & Late Finish) for CPM slack calculation
  const lateFinishMap = new Map<string, Date>();
  const lateStartMap = new Map<string, Date>();

  for (let i = topoOrder.length - 1; i >= 0; i--) {
    const taskId = topoOrder[i];
    const task = taskMap.get(taskId)!;
    const successors = successorMap.get(taskId) || [];

    let latestFinish: Date;
    if (successors.length === 0) {
      latestFinish = new Date(projectedEndDate.getTime());
    } else {
      let minSuccStart = Infinity;
      for (const succId of successors) {
        const succStart = lateStartMap.get(succId) || earlyStartMap.get(succId)!;
        if (succStart.getTime() < minSuccStart) {
          minSuccStart = succStart.getTime();
        }
      }
      latestFinish = new Date(minSuccStart);
    }

    // Subtract duration
    // Approximate backwards working time using forward calculation or date delta
    const durMs = task.plannedDurationMinutes * 60 * 1000;
    const lateStart = new Date(latestFinish.getTime() - durMs);

    lateFinishMap.set(taskId, latestFinish);
    lateStartMap.set(taskId, lateStart);
  }

  // 4. Assemble scheduled tasks & critical path
  const scheduledTasks: ScheduledTaskResult[] = [];
  const criticalPath: string[] = [];

  for (const taskId of topoOrder) {
    const task = taskMap.get(taskId)!;
    const eStart = earlyStartMap.get(taskId)!;
    const eEnd = earlyFinishMap.get(taskId)!;
    const lStart = lateStartMap.get(taskId)!;
    const lEnd = lateFinishMap.get(taskId)!;

    const slackMs = Math.max(0, lStart.getTime() - eStart.getTime());
    const slackMinutes = Math.floor(slackMs / (60 * 1000));
    const isCriticalPath = slackMinutes === 0;

    if (isCriticalPath) {
      criticalPath.push(taskId);
    }

    scheduledTasks.push({
      taskId,
      version: task.version ?? 1,
      startAt: eStart.toISOString(),
      endAt: eEnd.toISOString(),
      assignedTechnicianId: task.assignedTechnicianId || null,
      assignedMachineId: task.assignedMachineId || null,
      slackMinutes,
      isCriticalPath,
      materialWaitMinutes: materialWaitMap.get(taskId) || 0,
      earlyStart: eStart.toISOString(),
      earlyFinish: eEnd.toISOString(),
      lateStart: lStart.toISOString(),
      lateFinish: lEnd.toISOString(),
    });
  }

  const totalMakespanMinutes = Math.max(
    0,
    Math.floor((projectedEndDate.getTime() - horizonDate.getTime()) / (60 * 1000))
  );

  return {
    scheduledTasks,
    makespanMinutes: totalMakespanMinutes,
    projectedEndAt: projectedEndDate.toISOString(),
    criticalPath,
  };
}
