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

export interface CapacityInterval {
  startAt: Date | string;
  endAt: Date | string;
}

export interface FiniteCapacityTaskInput {
  id: string;
  version?: number;
  plannedDurationMinutes: number;
  predecessorTaskIds: string[];
  preconditionReasons?: string[];
  requiresTechnician: boolean;
  requiresMachine: boolean;
  eligibleTechnicianIds?: string[];
  compatibleMachineIds?: string[];
  materialReady: boolean;
}

export interface FiniteCapacityScheduleInput {
  startHorizon: Date | string;
  tasks: FiniteCapacityTaskInput[];
  technicianAvailability: Record<string, CapacityInterval[]>;
  machineAvailability: Record<string, CapacityInterval[]>;
}

export interface FiniteCapacityTaskResult {
  taskId: string;
  version: number;
  predecessorTaskIds: string[];
  status: 'SCHEDULED' | 'UNSCHEDULED';
  startAt: string | null;
  endAt: string | null;
  technicianId: string | null;
  machineId: string | null;
  reasons: string[];
}

export interface FiniteCapacityScheduleOutput {
  tasks: FiniteCapacityTaskResult[];
  makespanMinutes: number;
  projectedEndAt: string | null;
  assumptions: string[];
}

interface CapacityReservation {
  start: number;
  end: number;
}

function parseIntervals(intervals: CapacityInterval[]): CapacityReservation[] {
  return intervals
    .map((interval) => ({ start: new Date(interval.startAt).getTime(), end: new Date(interval.endAt).getTime() }))
    .filter((interval) => Number.isFinite(interval.start) && Number.isFinite(interval.end) && interval.start < interval.end)
    .sort((a, b) => a.start - b.start);
}

function findAvailableSlot(
  intervals: CapacityReservation[],
  reservations: CapacityReservation[],
  earliest: number,
  durationMs: number,
): CapacityReservation | null {
  for (const interval of intervals) {
    let candidateStart = Math.max(interval.start, earliest);
    while (candidateStart + durationMs <= interval.end) {
      const overlap = reservations
        .filter((reservation) => reservation.start < candidateStart + durationMs && reservation.end > candidateStart)
        .sort((a, b) => a.end - b.end)[0];
      if (!overlap) return { start: candidateStart, end: candidateStart + durationMs };
      candidateStart = overlap.end;
    }
  }
  return null;
}

/**
 * Greedy dry-run scheduler over authoritative, already-filtered published availability.
 * It never invents a resource, splits work across a break, or mutates bookings.
 */
export function scheduleFiniteCapacity(input: FiniteCapacityScheduleInput): FiniteCapacityScheduleOutput {
  const horizon = new Date(input.startHorizon).getTime();
  if (!Number.isFinite(horizon)) throw new Error('Schedule horizon must be a valid date');
  if (input.tasks.length > 100) throw new Error('Finite-capacity preview is limited to 100 tasks');

  const tasksById = new Map<string, FiniteCapacityTaskInput>();
  for (const task of input.tasks) {
    if (tasksById.has(task.id)) throw new Error(`Duplicate task '${task.id}' in schedule proposal`);
    tasksById.set(task.id, task);
    for (const predecessorId of task.predecessorTaskIds) {
      if (!tasksById.has(predecessorId) && !input.tasks.some((candidate) => candidate.id === predecessorId)) {
        throw new Error(`Predecessor task '${predecessorId}' is outside the schedule proposal`);
      }
    }
  }

  const indegree = new Map(input.tasks.map((task) => [task.id, task.predecessorTaskIds.length]));
  const successors = new Map(input.tasks.map((task) => [task.id, [] as string[]]));
  for (const task of input.tasks) {
    for (const predecessorId of task.predecessorTaskIds) successors.get(predecessorId)!.push(task.id);
  }
  const queue = input.tasks.filter((task) => indegree.get(task.id) === 0).map((task) => task.id);
  const topologicalOrder: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    topologicalOrder.push(id);
    for (const successorId of successors.get(id)!) {
      indegree.set(successorId, indegree.get(successorId)! - 1);
      if (indegree.get(successorId) === 0) queue.push(successorId);
    }
  }
  if (topologicalOrder.length !== input.tasks.length) throw new Error('Cycle detected in task dependencies');

  const technicianIntervals = Object.fromEntries(Object.entries(input.technicianAvailability).map(([id, intervals]) => [id, parseIntervals(intervals)]));
  const machineIntervals = Object.fromEntries(Object.entries(input.machineAvailability).map(([id, intervals]) => [id, parseIntervals(intervals)]));
  const technicianReservations = new Map<string, CapacityReservation[]>();
  const machineReservations = new Map<string, CapacityReservation[]>();
  const resultById = new Map<string, FiniteCapacityTaskResult>();

  for (const taskId of topologicalOrder) {
    const task = tasksById.get(taskId)!;
    const reasons: string[] = [...(task.preconditionReasons ?? [])];
    if (!Number.isSafeInteger(task.plannedDurationMinutes) || task.plannedDurationMinutes <= 0) reasons.push('A positive measured or approved task duration is required');
    if (!task.materialReady) reasons.push('Required materials are not reserved or issued');
    if (!task.requiresTechnician && !task.requiresMachine) reasons.push('No verified resource requirement is available for this operation');
    if (task.predecessorTaskIds.some((id) => resultById.get(id)?.status !== 'SCHEDULED')) reasons.push('A predecessor task could not be scheduled');
    if (reasons.length) {
      resultById.set(task.id, { taskId: task.id, version: task.version ?? 1, predecessorTaskIds: task.predecessorTaskIds, status: 'UNSCHEDULED', startAt: null, endAt: null, technicianId: null, machineId: null, reasons });
      continue;
    }

    const earliest = Math.max(horizon, ...task.predecessorTaskIds.map((id) => Date.parse(resultById.get(id)!.endAt!)));
    const technicianIds = task.requiresTechnician ? [...new Set(task.eligibleTechnicianIds ?? [])] : [null];
    const machineIds = task.requiresMachine ? [...new Set(task.compatibleMachineIds ?? [])] : [null];
    if (!technicianIds.length) reasons.push('No active technician meets every required skill and certification');
    if (!machineIds.length) reasons.push('No active machine matches the required machine class');

    const durationMs = task.plannedDurationMinutes * 60_000;
    let best: { slot: CapacityReservation; technicianId: string | null; machineId: string | null } | null = null;
    if (!reasons.length) {
      for (const technicianId of technicianIds) {
        for (const machineId of machineIds) {
          let slot: CapacityReservation | null;
          if (technicianId && machineId) {
            const techIntervals = technicianIntervals[technicianId] ?? [];
            const machineSlots = machineIntervals[machineId] ?? [];
            slot = null;
            for (const techInterval of techIntervals) {
              for (const machineInterval of machineSlots) {
                const common = { start: Math.max(techInterval.start, machineInterval.start), end: Math.min(techInterval.end, machineInterval.end) };
                if (common.start >= common.end) continue;
                const candidate = findAvailableSlot([common], [
                  ...(technicianReservations.get(technicianId) ?? []),
                  ...(machineReservations.get(machineId) ?? []),
                ], earliest, durationMs);
                if (candidate && (!slot || candidate.start < slot.start)) slot = candidate;
              }
            }
          } else if (technicianId) {
            slot = findAvailableSlot(technicianIntervals[technicianId] ?? [], technicianReservations.get(technicianId) ?? [], earliest, durationMs);
          } else if (machineId) {
            slot = findAvailableSlot(machineIntervals[machineId] ?? [], machineReservations.get(machineId) ?? [], earliest, durationMs);
          } else {
            slot = null;
          }
          if (slot && (!best || slot.start < best.slot.start)) best = { slot, technicianId, machineId };
        }
      }
    }

    if (!best) {
      if (!reasons.length) reasons.push('No contiguous qualified resource window fits the task duration');
      resultById.set(task.id, { taskId: task.id, version: task.version ?? 1, predecessorTaskIds: task.predecessorTaskIds, status: 'UNSCHEDULED', startAt: null, endAt: null, technicianId: null, machineId: null, reasons });
      continue;
    }

    if (best.technicianId) technicianReservations.set(best.technicianId, [...(technicianReservations.get(best.technicianId) ?? []), best.slot]);
    if (best.machineId) machineReservations.set(best.machineId, [...(machineReservations.get(best.machineId) ?? []), best.slot]);
    resultById.set(task.id, {
      taskId: task.id,
      version: task.version ?? 1,
      predecessorTaskIds: task.predecessorTaskIds,
      status: 'SCHEDULED',
      startAt: new Date(best.slot.start).toISOString(),
      endAt: new Date(best.slot.end).toISOString(),
      technicianId: best.technicianId,
      machineId: best.machineId,
      reasons: [],
    });
  }

  const results = input.tasks.map((task) => resultById.get(task.id)!);
  const endTimes = results.filter((task) => task.status === 'SCHEDULED').map((task) => Date.parse(task.endAt!));
  const projectedEnd = endTimes.length ? Math.max(...endTimes) : null;
  return {
    tasks: results,
    makespanMinutes: projectedEnd === null ? 0 : Math.floor((projectedEnd - horizon) / 60_000),
    projectedEndAt: projectedEnd === null ? null : new Date(projectedEnd).toISOString(),
    assumptions: [
      'Each task must fit inside one continuous published availability interval; work is not split across breaks or shifts.',
      'Machine availability is treated as exclusive even when configured capacity is greater than one.',
      'Preview reserves no resources and does not change the published schedule.',
      'Only PENDING and READY tasks are candidates; assigned or in-progress work must be explicitly rescheduled through the existing command.',
    ],
  };
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
