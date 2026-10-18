import { describe, expect, it } from 'vitest';
import { evaluateStageTransition, type LifecycleStageSnapshot } from './order-lifecycle-runtime';

describe('order lifecycle stage transitions', () => {
  it('activates a serial successor only after its predecessor completes', () => {
    const stages: LifecycleStageSnapshot[] = [
      { key: 'sales', state: 'ACTIVE', predecessors: [] },
      { key: 'engineering', state: 'PENDING', predecessors: ['sales'] },
      { key: 'production', state: 'PENDING', predecessors: ['engineering'] },
    ];
    expect(evaluateStageTransition(stages, { stageKey: 'sales', outcome: 'COMPLETE' })).toMatchObject({
      allowed: true,
      changes: [
        { stageKey: 'sales', state: 'COMPLETED' },
        { stageKey: 'engineering', state: 'READY' },
      ],
    });
  });

  it('waits for every parallel predecessor before activating an AND join', () => {
    const stages: LifecycleStageSnapshot[] = [
      { key: 'engineering', state: 'COMPLETED', predecessors: [] },
      { key: 'material-review', state: 'ACTIVE', predecessors: ['engineering'] },
      { key: 'drawing-review', state: 'ACTIVE', predecessors: ['engineering'] },
      { key: 'release', state: 'PENDING', predecessors: ['material-review', 'drawing-review'] },
    ];
    expect(evaluateStageTransition(stages, { stageKey: 'material-review', outcome: 'COMPLETE' }).changes)
      .toEqual([{ stageKey: 'material-review', state: 'COMPLETED' }]);
    const afterFirst = stages.map((stage) => stage.key === 'material-review'
      ? { ...stage, state: 'COMPLETED' as const }
      : stage);
    expect(evaluateStageTransition(afterFirst, { stageKey: 'drawing-review', outcome: 'COMPLETE' }).changes)
      .toContainEqual({ stageKey: 'release', state: 'READY' });
  });

  it('rejects missing or non-active stages without proposing mutations', () => {
    const stages: LifecycleStageSnapshot[] = [
      { key: 'sales', state: 'BLOCKED', predecessors: [] },
    ];
    expect(evaluateStageTransition(stages, { stageKey: 'sales', outcome: 'COMPLETE' })).toMatchObject({ allowed: false, changes: [] });
    expect(evaluateStageTransition(stages, { stageKey: 'missing', outcome: 'COMPLETE' })).toMatchObject({ allowed: false, changes: [] });
  });

  it('activates only the matching branch and skips a non-matching branch', () => {
    const stages: LifecycleStageSnapshot[] = [
      { key: 'sales', state: 'ACTIVE', predecessors: [] },
      { key: 'engineering', state: 'PENDING', predecessors: ['sales'] },
      {
        key: 'standard', state: 'PENDING', predecessors: ['sales'],
        activationCondition: { sourceStageKey: 'sales', formVersionId: 'sales-form-v1', fieldKey: 'order_type', operator: 'EQUALS', value: 'standard' },
      },
      {
        key: 'custom', state: 'PENDING', predecessors: ['sales'],
        activationCondition: { sourceStageKey: 'sales', formVersionId: 'sales-form-v1', fieldKey: 'order_type', operator: 'EQUALS', value: 'custom' },
      },
    ];

    expect(evaluateStageTransition(stages, { stageKey: 'sales', outcome: 'COMPLETE', conditionFacts: { sales: { order_type: 'standard' } } })).toMatchObject({
      allowed: true,
      changes: [
        { stageKey: 'sales', state: 'COMPLETED' },
        { stageKey: 'engineering', state: 'READY' },
        { stageKey: 'standard', state: 'READY' },
        { stageKey: 'custom', state: 'SKIPPED' },
      ],
    });
  });

  it('fails closed when a branch condition fact is missing', () => {
    const stages: LifecycleStageSnapshot[] = [
      { key: 'sales', state: 'ACTIVE', predecessors: [] },
      {
        key: 'custom', state: 'PENDING', predecessors: ['sales'],
        activationCondition: { sourceStageKey: 'sales', formVersionId: 'sales-form-v1', fieldKey: 'order_type', operator: 'EQUALS', value: 'custom' },
      },
    ];

    expect(evaluateStageTransition(stages, { stageKey: 'sales', outcome: 'COMPLETE' })).toMatchObject({
      allowed: false,
      changes: [],
      reason: 'MISSING_CONDITION_FACT:custom.order_type',
    });
  });
});
