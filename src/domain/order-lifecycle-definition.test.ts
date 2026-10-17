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
});
