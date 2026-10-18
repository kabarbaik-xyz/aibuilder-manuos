import type { LifecycleBranchCondition } from './order-lifecycle-definition';

export type LifecycleStageState =
  | 'PENDING'
  | 'READY'
  | 'ACTIVE'
  | 'BLOCKED'
  | 'WAITING_APPROVAL'
  | 'COMPLETED'
  | 'SKIPPED'
  | 'CANCELLED';

export interface LifecycleStageSnapshot {
  key: string;
  state: LifecycleStageState;
  predecessors: string[];
  activationCondition?: LifecycleBranchCondition;
}

export interface StageTransitionChange {
  stageKey: string;
  state: LifecycleStageState;
}

export interface StageTransitionDecision {
  allowed: boolean;
  changes: StageTransitionChange[];
  reason?: string;
}

export interface StageTransitionAction {
  stageKey: string;
  outcome: 'COMPLETE';
  conditionFacts?: Record<string, Record<string, unknown>>;
  outcomeFacts?: Record<string, string>;
}

/** Pure, deterministic evaluator; persistence and compare-and-swap belong to the caller. */
export function evaluateStageTransition(
  stages: LifecycleStageSnapshot[],
  action: StageTransitionAction
): StageTransitionDecision {
  const byKey = new Map(stages.map((stage) => [stage.key, stage]));
  const stage = byKey.get(action.stageKey);
  if (!stage) return { allowed: false, changes: [], reason: 'STAGE_NOT_FOUND' };
  if (stage.state !== 'ACTIVE' && stage.state !== 'READY') {
    return { allowed: false, changes: [], reason: `STAGE_NOT_ACTIVE:${stage.state}` };
  }

  const changes: StageTransitionChange[] = [{ stageKey: stage.key, state: 'COMPLETED' }];
  const projectedStates = new Map(stages.map((candidate) => [candidate.key, candidate.state]));
  projectedStates.set(stage.key, 'COMPLETED');

  // Evaluate newly unblocked branches in topological waves. A missing fact aborts
  // the whole decision so callers never persist a partially activated workflow.
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const candidate of stages) {
      if (projectedStates.get(candidate.key) !== 'PENDING') continue;
      const unknownPredecessor = candidate.predecessors.find((key) => !byKey.has(key));
      if (unknownPredecessor) {
        return { allowed: false, changes: [], reason: `UNKNOWN_PREDECESSOR:${unknownPredecessor}` };
      }
      const allPredecessorsTerminal = candidate.predecessors.every((key) => {
        const state = projectedStates.get(key);
        return state === 'COMPLETED' || state === 'SKIPPED';
      });
      if (!allPredecessorsTerminal) continue;

      let nextState: LifecycleStageState = 'READY';
      if (candidate.activationCondition) {
        const condition = candidate.activationCondition;
        if (condition.kind === 'QC_OUTCOME') {
          const actual = action.outcomeFacts?.[condition.sourceStageKey];
          if (!actual) return { allowed: false, changes: [], reason: `MISSING_CONDITION_FACT:${candidate.key}.qcOutcome` };
          const values = Array.isArray(condition.value) ? condition.value : [condition.value];
          const matches = condition.operator === 'EQUALS' ? actual === condition.value : values.includes(actual as typeof values[number]);
          if (!matches) nextState = 'SKIPPED';
          projectedStates.set(candidate.key, nextState);
          changes.push({ stageKey: candidate.key, state: nextState });
          progressed = true;
          continue;
        }
        const facts = action.conditionFacts?.[condition.sourceStageKey];
        if (!facts || !Object.prototype.hasOwnProperty.call(facts, condition.fieldKey)) {
          return { allowed: false, changes: [], reason: `MISSING_CONDITION_FACT:${candidate.key}.${condition.fieldKey}` };
        }
        const actual = facts[condition.fieldKey];
        if (actual === undefined || actual === null) {
          return { allowed: false, changes: [], reason: `MISSING_CONDITION_FACT:${candidate.key}.${condition.fieldKey}` };
        }
        const matches = condition.operator === 'EQUALS'
          ? actual === condition.value
          : condition.operator === 'NOT_EQUALS'
            ? actual !== condition.value
            : Array.isArray(condition.value) && condition.value.includes(String(actual));
        if (!matches) nextState = 'SKIPPED';
      }
      projectedStates.set(candidate.key, nextState);
      changes.push({ stageKey: candidate.key, state: nextState });
      progressed = true;
    }
  }

  return { allowed: true, changes };
}
