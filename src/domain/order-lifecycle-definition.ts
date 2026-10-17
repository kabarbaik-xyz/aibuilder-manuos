export const LIFECYCLE_ACTIONS = [
  'ORDER_CONFIRM',
  'ENGINEERING_APPROVE',
  'PLAN_PRODUCTION',
  'EXECUTE_PRODUCTION',
  'FINALIZE_QC',
  'CONFIRM_DELIVERY',
  'REVIEW_EVIDENCE',
] as const;

export type LifecycleAction = (typeof LIFECYCLE_ACTIONS)[number];

export type LifecycleAssignment =
  | { kind: 'MEMBER'; membershipId: string; departmentId?: string }
  | { kind: 'DEPARTMENT_QUEUE'; departmentId: string; eligibleRoleCodes: string[] };

export type LifecycleSchedulePolicy =
  | { kind: 'DEADLINE'; dueAfterMinutes: number }
  | { kind: 'RESOURCE_CAPACITY'; routingSource: 'APPROVED_ENGINEERING' };

export interface LifecycleFormPin {
  formVersionId: string;
  contentHash: string;
  required: boolean;
  completionPoint: 'BEFORE_ACTION' | 'BEFORE_STAGE_COMPLETION';
}

export interface LifecycleStageDefinition {
  key: string;
  name: string;
  action: LifecycleAction;
  departmentId: string;
  assignment: LifecycleAssignment;
  schedule: LifecycleSchedulePolicy;
  predecessors: string[];
  forms: LifecycleFormPin[];
}

export interface OrderLifecycleDefinition {
  schemaVersion: 1;
  name: string;
  stages: LifecycleStageDefinition[];
}

export interface LifecycleDefinitionError {
  code: string;
  stageKey?: string;
  message: string;
}

const RESOURCE_ACTIONS = new Set<LifecycleAction>(['PLAN_PRODUCTION', 'EXECUTE_PRODUCTION']);

/** Validates the closed action and graph contract before a lifecycle definition can be persisted. */
export function validateLifecycleDefinition(definition: OrderLifecycleDefinition): {
  isValid: boolean;
  errors: LifecycleDefinitionError[];
} {
  const errors: LifecycleDefinitionError[] = [];
  const stageByKey = new Map<string, LifecycleStageDefinition>();
  const actionSet = new Set<string>(LIFECYCLE_ACTIONS);
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  if (definition.schemaVersion !== 1) {
    errors.push({ code: 'UNSUPPORTED_SCHEMA_VERSION', message: 'Only lifecycle schema version 1 is supported.' });
  }
  if (!definition.name.trim()) errors.push({ code: 'MISSING_NAME', message: 'Lifecycle definition needs a name.' });
  if (definition.stages.length === 0) errors.push({ code: 'EMPTY_LIFECYCLE', message: 'Add at least one stage.' });

  for (const stage of definition.stages) {
    if (!stage.key.trim()) errors.push({ code: 'MISSING_STAGE_KEY', message: 'Every stage needs a stable key.' });
    if (stageByKey.has(stage.key)) errors.push({ code: 'DUPLICATE_STAGE_KEY', stageKey: stage.key, message: `Stage key '${stage.key}' is duplicated.` });
    stageByKey.set(stage.key, stage);
    incoming.set(stage.key, 0);
    outgoing.set(stage.key, []);
    if (!actionSet.has(stage.action)) errors.push({ code: 'UNKNOWN_ACTION', stageKey: stage.key, message: `Action '${stage.action}' has no registered lifecycle handler.` });
    if (!stage.name.trim() || !stage.departmentId.trim()) errors.push({ code: 'INCOMPLETE_STAGE', stageKey: stage.key, message: 'Stage name and department are required.' });
    if (stage.schedule.kind === 'DEADLINE' && stage.schedule.dueAfterMinutes <= 0) {
      errors.push({ code: 'INVALID_DEADLINE', stageKey: stage.key, message: 'Deadline duration must be greater than zero.' });
    }
    if (stage.schedule.kind === 'RESOURCE_CAPACITY' && !RESOURCE_ACTIONS.has(stage.action)) {
      errors.push({ code: 'UNSUPPORTED_SCHEDULE_POLICY', stageKey: stage.key, message: 'Only planning and production execution stages can consume resource capacity.' });
    }
    if (stage.assignment.kind === 'MEMBER' && !stage.assignment.membershipId.trim()) {
      errors.push({ code: 'MISSING_MEMBER', stageKey: stage.key, message: 'Member assignment requires a membership.' });
    }
    if (stage.assignment.kind === 'DEPARTMENT_QUEUE' && (!stage.assignment.departmentId.trim() || stage.assignment.eligibleRoleCodes.length === 0)) {
      errors.push({ code: 'INVALID_QUEUE', stageKey: stage.key, message: 'Department queues require a department and at least one eligible role.' });
    }
  }

  for (const stage of definition.stages) {
    for (const predecessor of stage.predecessors) {
      if (!stageByKey.has(predecessor)) {
        errors.push({ code: 'UNKNOWN_PREDECESSOR', stageKey: stage.key, message: `Stage '${stage.key}' refers to missing predecessor '${predecessor}'.` });
        continue;
      }
      incoming.set(stage.key, (incoming.get(stage.key) ?? 0) + 1);
      outgoing.get(predecessor)?.push(stage.key);
    }
  }

  const queue = [...incoming.entries()].filter(([, count]) => count === 0).map(([key]) => key);
  const visited: string[] = [];
  while (queue.length) {
    const key = queue.shift()!;
    visited.push(key);
    for (const next of outgoing.get(key) ?? []) {
      const count = (incoming.get(next) ?? 0) - 1;
      incoming.set(next, count);
      if (count === 0) queue.push(next);
    }
  }
  if (visited.length !== definition.stages.length) {
    errors.push({ code: 'CYCLE_DETECTED', message: 'Lifecycle dependencies must form an acyclic graph.' });
  }
  if (definition.stages.length > 1 && definition.stages.some((stage) => (outgoing.get(stage.key) ?? []).length === 0)) {
    const sinkCount = definition.stages.filter((stage) => (outgoing.get(stage.key) ?? []).length === 0).length;
    if (sinkCount !== 1) errors.push({ code: 'INVALID_TERMINAL_PATH', message: 'Lifecycle must converge to one terminal stage.' });
  }

  return { isValid: errors.length === 0, errors };
}
