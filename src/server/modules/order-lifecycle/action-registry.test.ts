import { describe, expect, it } from 'vitest';
import { LIFECYCLE_ACTIONS } from '@/domain/order-lifecycle-definition';
import { lifecycleActionRegistry } from './action-registry';

describe('order lifecycle action registry', () => {
  it('defines an authorization permission and compatible evidence purposes for every action', () => {
    expect(Object.keys(lifecycleActionRegistry).sort()).toEqual([...LIFECYCLE_ACTIONS].sort());
    for (const action of LIFECYCLE_ACTIONS) {
      expect(lifecycleActionRegistry[action].requiredPermission).toBeTruthy();
      expect(lifecycleActionRegistry[action].formPurposes.length).toBeGreaterThan(0);
    }
  });

  it('limits machine-capacity stages to planning and production execution', () => {
    const capacityActions = Object.entries(lifecycleActionRegistry)
      .filter(([, descriptor]) => descriptor.usesResourceCapacity)
      .map(([action]) => action);

    expect(capacityActions.sort()).toEqual(['EXECUTE_PRODUCTION', 'PLAN_PRODUCTION']);
  });
});
