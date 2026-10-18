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

export const QC_LIFECYCLE_OUTCOMES = ['PASSED', 'PASSED_AFTER_REWORK', 'PARTIAL', 'REJECTED'] as const;
export type QcLifecycleOutcome = (typeof QC_LIFECYCLE_OUTCOMES)[number];

export interface FormAnswerBranchCondition {
  kind: 'FORM_ANSWER';
  sourceStageKey: string;
  formVersionId: string;
  fieldKey: string;
  operator: 'EQUALS' | 'NOT_EQUALS' | 'IN';
  value: string | string[];
}

export interface QcOutcomeBranchCondition {
  kind: 'QC_OUTCOME';
  sourceStageKey: string;
  operator: 'EQUALS' | 'IN';
  value: QcLifecycleOutcome | QcLifecycleOutcome[];
}

export type LifecycleBranchCondition = FormAnswerBranchCondition | QcOutcomeBranchCondition;

export interface LifecycleStageDefinition {
  key: string;
  name: string;
  action: LifecycleAction;
  departmentId: string;
  assignment: LifecycleAssignment;
  schedule: LifecycleSchedulePolicy;
  predecessors: string[];
  activationCondition?: LifecycleBranchCondition;
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
  fieldKey?: string;
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
    if (!stage.key.trim()) errors.push({ code: 'MISSING_STAGE_KEY', stageKey: stage.key, fieldKey: 'key', message: 'Every stage needs a stable key.' });
    if (stageByKey.has(stage.key)) errors.push({ code: 'DUPLICATE_STAGE_KEY', stageKey: stage.key, fieldKey: 'key', message: `Stage key '${stage.key}' is duplicated.` });
    stageByKey.set(stage.key, stage);
    incoming.set(stage.key, 0);
    outgoing.set(stage.key, []);
    if (!actionSet.has(stage.action)) errors.push({ code: 'UNKNOWN_ACTION', stageKey: stage.key, fieldKey: 'action', message: `Action '${stage.action}' has no registered lifecycle handler.` });
    if (!stage.name.trim()) errors.push({ code: 'INCOMPLETE_STAGE', stageKey: stage.key, fieldKey: 'name', message: 'Stage name is required.' });
    if (!stage.departmentId.trim()) errors.push({ code: 'INCOMPLETE_STAGE', stageKey: stage.key, fieldKey: 'departmentId', message: 'Owning department is required.' });
    if (stage.schedule.kind === 'DEADLINE' && stage.schedule.dueAfterMinutes <= 0) {
      errors.push({ code: 'INVALID_DEADLINE', stageKey: stage.key, fieldKey: 'schedule.dueAfterMinutes', message: 'Deadline duration must be greater than zero.' });
    }
    if (stage.schedule.kind === 'RESOURCE_CAPACITY' && !RESOURCE_ACTIONS.has(stage.action)) {
      errors.push({ code: 'UNSUPPORTED_SCHEDULE_POLICY', stageKey: stage.key, fieldKey: 'schedule.kind', message: 'Only planning and production execution stages can consume resource capacity.' });
    }
    if (stage.assignment.kind === 'MEMBER' && !stage.assignment.membershipId.trim()) {
      errors.push({ code: 'MISSING_MEMBER', stageKey: stage.key, fieldKey: 'assignment.membershipId', message: 'Member assignment requires a membership.' });
    }
    if (stage.assignment.kind === 'DEPARTMENT_QUEUE' && (!stage.assignment.departmentId.trim() || stage.assignment.eligibleRoleCodes.length === 0)) {
      errors.push({ code: 'INVALID_QUEUE', stageKey: stage.key, fieldKey: 'assignment.eligibleRoleCodes', message: 'Department queues require a department and at least one eligible role.' });
    }
  }

  for (const stage of definition.stages) {
    if (stage.activationCondition) {
      const condition = stage.activationCondition;
      const source = stageByKey.get(condition.sourceStageKey);
      if (!source) {
        errors.push({ code: 'UNKNOWN_BRANCH_SOURCE', stageKey: stage.key, fieldKey: 'activationCondition.sourceStageKey', message: `Branch condition refers to missing source stage '${condition.sourceStageKey}'.` });
      } else if (!stage.predecessors.includes(source.key)) {
        errors.push({ code: 'BRANCH_SOURCE_NOT_PREDECESSOR', stageKey: stage.key, fieldKey: 'predecessors', message: `Branch source '${source.key}' must be a direct predecessor of '${stage.key}'.` });
      }
      if (condition.kind === 'QC_OUTCOME') {
        if (source && source.action !== 'FINALIZE_QC') {
          errors.push({ code: 'INVALID_QC_OUTCOME_SOURCE', stageKey: stage.key, fieldKey: 'activationCondition.sourceStageKey', message: `QC outcome branches must reference a FINALIZE_QC predecessor, not '${source.action}'.` });
        }
        const values = Array.isArray(condition.value) ? condition.value : [condition.value];
        if ((condition.operator === 'IN' && values.length === 0) || values.some((value) => !QC_LIFECYCLE_OUTCOMES.includes(value))) {
          errors.push({ code: 'INVALID_QC_OUTCOME', stageKey: stage.key, fieldKey: 'activationCondition.value', message: 'Choose one or more supported finalized QC outcomes.' });
        }
      } else {
        const sourcePin = source?.forms.find((form) => form.formVersionId === condition.formVersionId);
        if (source && !sourcePin) {
          errors.push({ code: 'UNPINNED_BRANCH_FORM', stageKey: stage.key, fieldKey: 'activationCondition.formVersionId', message: `Branch condition must use a form pinned to source stage '${source.key}'.` });
        } else if (sourcePin && !sourcePin.required) {
          errors.push({ code: 'OPTIONAL_BRANCH_FORM', stageKey: stage.key, fieldKey: 'activationCondition.formVersionId', message: `Branch condition form on '${source?.key}' must be required so routing facts are submitted.` });
        }
        if (!condition.fieldKey.trim()) {
          errors.push({ code: 'MISSING_BRANCH_FIELD', stageKey: stage.key, fieldKey: 'activationCondition.fieldKey', message: 'Branch condition needs a form field key.' });
        }
        if (condition.operator === 'IN' && (!Array.isArray(condition.value) || condition.value.length === 0)) {
          errors.push({ code: 'INVALID_BRANCH_VALUE', stageKey: stage.key, fieldKey: 'activationCondition.value', message: "The 'in' branch operator requires at least one value." });
        }
        if (condition.operator !== 'IN' && typeof condition.value !== 'string') {
          errors.push({ code: 'INVALID_BRANCH_VALUE', stageKey: stage.key, fieldKey: 'activationCondition.value', message: 'Equality branch operators require one text value.' });
        }
      }
    }
    for (const predecessor of stage.predecessors) {
      if (!stageByKey.has(predecessor)) {
        errors.push({ code: 'UNKNOWN_PREDECESSOR', stageKey: stage.key, fieldKey: 'predecessors', message: `Stage '${stage.key}' refers to missing predecessor '${predecessor}'.` });
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
