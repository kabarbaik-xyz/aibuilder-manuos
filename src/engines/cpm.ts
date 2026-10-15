import { CalendarConfig, DEFAULT_CALENDAR, addWorkingHours } from './calendar';

export interface CPMTaskInput {
  id: string;
  durationHours: number;
  remainingDurationHours?: number;
  dependsOn: string[];
  earliestStartHours?: number;
}

export interface CPMTaskOutput {
  id: string;
  durationHours: number;
  remainingDurationHours: number;
  earlyStart: number;
  earlyFinish: number;
  lateStart: number;
  lateFinish: number;
  totalSlack: number;
  freeSlack: number;
  isCritical: boolean;
}

export interface CPMResult {
  tasks: Record<string, CPMTaskOutput>;
  projectDurationHours: number;
  criticalPath: string[];
  startDate: string;
  projectedFinishDate: string;
}

/**
 * Computes Critical Path Method (CPM) metrics over a DAG of tasks.
 */
export function calculateCPM(
  tasks: CPMTaskInput[],
  projectAnchorDate: string,
  calendarConfig: CalendarConfig = DEFAULT_CALENDAR
): CPMResult {
  const taskMap = new Map<string, CPMTaskInput>();
  const successors = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const t of tasks) {
    taskMap.set(t.id, t);
    successors.set(t.id, []);
    inDegree.set(t.id, t.dependsOn.length);
  }

  for (const t of tasks) {
    for (const depId of t.dependsOn) {
      if (successors.has(depId)) {
        successors.get(depId)!.push(t.id);
      }
    }
  }

  // 1. Topological Sort via Kahn's algorithm
  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }

  const topoOrder: string[] = [];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    topoOrder.push(curr);
    for (const succ of successors.get(curr) || []) {
      const newDeg = (inDegree.get(succ) || 1) - 1;
      inDegree.set(succ, newDeg);
      if (newDeg === 0) queue.push(succ);
    }
  }

  // Handle disconnected or unvisited tasks
  for (const t of tasks) {
    if (!topoOrder.includes(t.id)) {
      topoOrder.push(t.id);
    }
  }

  // 2. Forward Pass: Early Start (ES) and Early Finish (EF)
  const es = new Map<string, number>();
  const ef = new Map<string, number>();

  for (const id of topoOrder) {
    const t = taskMap.get(id);
    if (!t) continue;
    let maxPredEf = t.earliestStartHours ?? 0;
    for (const depId of t.dependsOn) {
      const predEf = ef.get(depId) || 0;
      if (predEf > maxPredEf) maxPredEf = predEf;
    }
    const effectiveDuration = t.remainingDurationHours !== undefined ? t.remainingDurationHours : t.durationHours;
    es.set(id, maxPredEf);
    ef.set(id, maxPredEf + effectiveDuration);
  }

  // Project Duration
  let projectDurationHours = 0;
  for (const finish of ef.values()) {
    if (finish > projectDurationHours) projectDurationHours = finish;
  }

  // 3. Backward Pass: Late Start (LS) and Late Finish (LF)
  const ls = new Map<string, number>();
  const lf = new Map<string, number>();

  const reversedOrder = [...topoOrder].reverse();
  for (const id of reversedOrder) {
    const t = taskMap.get(id);
    if (!t) continue;
    const succs = successors.get(id) || [];
    if (succs.length === 0) {
      lf.set(id, projectDurationHours);
    } else {
      let minSuccLs = Infinity;
      for (const succId of succs) {
        const sLs = ls.get(succId) ?? projectDurationHours;
        if (sLs < minSuccLs) minSuccLs = sLs;
      }
      lf.set(id, minSuccLs === Infinity ? projectDurationHours : minSuccLs);
    }
    const effectiveDuration = t.remainingDurationHours !== undefined ? t.remainingDurationHours : t.durationHours;
    const myLf = lf.get(id)!;
    ls.set(id, myLf - effectiveDuration);
  }

  // 4. Slack and Critical Path calculation
  const taskOutputs: Record<string, CPMTaskOutput> = {};
  const criticalPath: string[] = [];

  for (const id of topoOrder) {
    const earlyS = es.get(id) || 0;
    const earlyF = ef.get(id) || 0;
    const lateS = ls.get(id) ?? earlyS;
    const lateF = lf.get(id) ?? earlyF;
    const totalSlack = Math.max(0, lateS - earlyS);

    // Free slack = min(ES of successors) - EF
    const succs = successors.get(id) || [];
    let freeSlack = 0;
    if (succs.length === 0) {
      freeSlack = Math.max(0, projectDurationHours - earlyF);
    } else {
      let minSuccEs = Infinity;
      for (const succId of succs) {
        const sEs = es.get(succId) ?? earlyF;
        if (sEs < minSuccEs) minSuccEs = sEs;
      }
      freeSlack = Math.max(0, minSuccEs - earlyF);
    }

    const isCritical = totalSlack === 0;
    if (isCritical) {
      criticalPath.push(id);
    }

    const taskInput = taskMap.get(id)!;
    taskOutputs[id] = {
      id,
      durationHours: taskInput.durationHours,
      remainingDurationHours: taskInput.remainingDurationHours ?? taskInput.durationHours,
      earlyStart: earlyS,
      earlyFinish: earlyF,
      lateStart: lateS,
      lateFinish: lateF,
      totalSlack,
      freeSlack,
      isCritical,
    };
  }

  const projectedFinishDate = addWorkingHours(
    projectAnchorDate,
    projectDurationHours,
    calendarConfig
  );

  return {
    tasks: taskOutputs,
    projectDurationHours,
    criticalPath,
    startDate: projectAnchorDate,
    projectedFinishDate,
  };
}
