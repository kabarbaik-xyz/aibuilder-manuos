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
  for (const candidate of stages) {
    if (candidate.state !== 'PENDING' || !candidate.predecessors.includes(stage.key)) continue;
    const unknownPredecessor = candidate.predecessors.find((key) => !byKey.has(key));
    if (unknownPredecessor) {
      return { allowed: false, changes: [], reason: `UNKNOWN_PREDECESSOR:${unknownPredecessor}` };
    }
    const allPredecessorsComplete = candidate.predecessors.every((key) =>
      key === stage.key || byKey.get(key)?.state === 'COMPLETED' || byKey.get(key)?.state === 'SKIPPED'
    );
    if (allPredecessorsComplete) changes.push({ stageKey: candidate.key, state: 'READY' });
  }

  return { allowed: true, changes };
}
