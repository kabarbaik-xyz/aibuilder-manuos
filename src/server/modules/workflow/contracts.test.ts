import { describe, expect, it } from 'vitest';
import { lifecycleBranchConditionSchema } from './contracts';

describe('lifecycle branch condition contract', () => {
  it('accepts QC outcome routes and keeps legacy form routes readable', () => {
    expect(lifecycleBranchConditionSchema.parse({
      kind: 'QC_OUTCOME', sourceStageKey: 'QC', operator: 'EQUALS', value: 'PASSED_AFTER_REWORK',
    })).toMatchObject({ kind: 'QC_OUTCOME', value: 'PASSED_AFTER_REWORK' });
    expect(lifecycleBranchConditionSchema.parse({
      sourceStageKey: 'SALES', formVersionId: 'form-v1', fieldKey: 'order_path', operator: 'EQUALS', value: 'standard',
    })).toMatchObject({ kind: 'FORM_ANSWER', fieldKey: 'order_path' });
  });

  it('rejects arbitrary QC outcome strings', () => {
    expect(lifecycleBranchConditionSchema.safeParse({
      kind: 'QC_OUTCOME', sourceStageKey: 'QC', operator: 'EQUALS', value: 'MAYBE',
    }).success).toBe(false);
  });
});
