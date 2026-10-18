type TaskLabel = { taskId: string; nodeKey: string };

export function getSchedulePredecessorLabels(predecessorTaskIds: string[], tasks: TaskLabel[]): string[] {
  const labels = new Map(tasks.map(task => [task.taskId, task.nodeKey]));
  return predecessorTaskIds.map(taskId => labels.get(taskId) ?? 'Completed prior operation');
}

export function getSchedulePromiseImpact(projectedEndAt: string | null, promisedDate: string | null) {
  if (!projectedEndAt || !promisedDate) return null;
  const projected = new Date(projectedEndAt);
  const promised = new Date(promisedDate);
  if (!Number.isFinite(projected.getTime()) || !Number.isFinite(promised.getTime())) return null;
  const dateKey = (date: Date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const deltaDays = Math.round((dateKey(projected) - dateKey(promised)) / 86_400_000);
  const format = (date: Date) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
  return { projectedDate: format(projected), promisedDate: format(promised), deltaDays };
}
