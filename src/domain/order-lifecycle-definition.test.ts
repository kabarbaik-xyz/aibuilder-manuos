import { describe, expect, it } from 'vitest';
import { validateLifecycleDefinition, type OrderLifecycleDefinition } from './order-lifecycle-definition';

const validDefinition: OrderLifecycleDefinition = {
  schemaVersion: 1,
  name: 'Standard order journey',
  stages: [
    {
      key: 'sales', name: 'Confirm order', action: 'ORDER_CONFIRM', departmentId: 'sales',
      assignment: { kind: 'DEPARTMENT_QUEUE', departmentId: 'sales', eligibleRoleCodes: ['SALES'] },
      schedule: { kind: 'DEADLINE', dueAfterMinutes: 480 }, predecessors: [], forms: [],
    },
    {
      key: 'production', name: 'Plan production', action: 'PLAN_PRODUCTION', departmentId: 'ppic',
      assignment: { kind: 'DEPARTMENT_QUEUE', departmentId: 'ppic', eligibleRoleCodes: ['PPIC'] },
      schedule: { kind: 'RESOURCE_CAPACITY', routingSource: 'APPROVED_ENGINEERING' }, predecessors: ['sales'], forms: [],
    },
  ],
};

describe('order lifecycle definition validation', () => {
  it('accepts supported administrative and resource-capacity stages', () => {
    expect(validateLifecycleDefinition(validDefinition)).toEqual({ isValid: true, errors: [] });
  });

  it('rejects unknown actions, duplicate keys, dead ends and cycles', () => {
    const invalid = {
      ...validDefinition,
      stages: [
        { ...validDefinition.stages[0], key: 'same', action: 'RUN_SQL' },
        { ...validDefinition.stages[1], key: 'same', predecessors: ['same'] },
      ],
    } as unknown as OrderLifecycleDefinition;
    const result = validateLifecycleDefinition(invalid);
    expect(result.isValid).toBe(false);
    expect(result.errors.map((error) => error.code)).toEqual(expect.arrayContaining([
      'UNKNOWN_ACTION', 'DUPLICATE_STAGE_KEY', 'CYCLE_DETECTED',
    ]));
  });

  it('rejects resource scheduling for administrative actions and missing predecessor references', () => {
    const invalid: OrderLifecycleDefinition = {
      ...validDefinition,
      stages: [
        { ...validDefinition.stages[0], schedule: { kind: 'RESOURCE_CAPACITY', routingSource: 'APPROVED_ENGINEERING' } },
        { ...validDefinition.stages[1], predecessors: ['no-such-stage'] },
      ],
    };
    const result = validateLifecycleDefinition(invalid);
    expect(result.isValid).toBe(false);
    expect(result.errors.map((error) => error.code)).toEqual(expect.arrayContaining([
      'UNSUPPORTED_SCHEDULE_POLICY', 'UNKNOWN_PREDECESSOR',
    ]));
  });

  it('requires a branch condition to reference a predecessor and one of its pinned forms', () => {
    const definition: OrderLifecycleDefinition = {
      ...validDefinition,
      stages: [
        { ...validDefinition.stages[0], forms: [{ formVersionId: 'form-v1', contentHash: 'hash-v1', required: true, completionPoint: 'BEFORE_ACTION' }] },
        {
          ...validDefinition.stages[1],
          activationCondition: {
            kind: 'FORM_ANSWER', sourceStageKey: 'sales', formVersionId: 'unpinned-form', fieldKey: 'order_type', operator: 'EQUALS', value: 'custom',
          },
        },
      ],
    };

    expect(validateLifecycleDefinition(definition)).toMatchObject({
      isValid: false,
      errors: expect.arrayContaining([
        expect.objectContaining({ code: 'UNPINNED_BRANCH_FORM', stageKey: 'production' }),
      ]),
    });
    expect(validateLifecycleDefinition({
      ...definition,
      stages: [definition.stages[0], {
        ...definition.stages[1],
        activationCondition: { ...(definition.stages[1].activationCondition as import('./order-lifecycle-definition').FormAnswerBranchCondition), formVersionId: 'form-v1' },
      }],
    }).isValid).toBe(true);
    expect(validateLifecycleDefinition({
      ...definition,
      stages: [
        { ...definition.stages[0], forms: [{ ...definition.stages[0].forms[0], required: false }] },
        { ...definition.stages[1], activationCondition: { ...(definition.stages[1].activationCondition as import('./order-lifecycle-definition').FormAnswerBranchCondition), formVersionId: 'form-v1' } },
      ],
    }).errors.map(error => error.code)).toContain('OPTIONAL_BRANCH_FORM');
  });

  it('allows QC outcome routing only from a direct QC stage', () => {
    const qc = { ...validDefinition.stages[0], key: 'qc', action: 'FINALIZE_QC' as const };
    const routed = { ...validDefinition.stages[1], predecessors: ['qc'], activationCondition: { kind: 'QC_OUTCOME' as const, sourceStageKey: 'qc', operator: 'EQUALS' as const, value: 'PASSED_AFTER_REWORK' as const } };
    expect(validateLifecycleDefinition({ ...validDefinition, stages: [qc, routed] })).toMatchObject({ isValid: true, errors: [] });
    expect(validateLifecycleDefinition({ ...validDefinition, stages: [{ ...qc, action: 'ORDER_CONFIRM' }, routed] }).errors)
      .toContainEqual(expect.objectContaining({ code: 'INVALID_QC_OUTCOME_SOURCE', stageKey: routed.key }));
  });
});
