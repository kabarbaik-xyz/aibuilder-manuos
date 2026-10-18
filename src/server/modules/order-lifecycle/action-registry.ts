import type { LifecycleAction } from '@/domain/order-lifecycle-definition';
import type { FormPurpose } from '@/domain/forms/types';

export interface LifecycleActionDescriptor {
  requiredPermission: string;
  formPurposes: readonly FormPurpose[];
  usesResourceCapacity: boolean;
}

/** The single server-side contract for lifecycle authorization, evidence and capacity. */
export const lifecycleActionRegistry = {
  ORDER_CONFIRM: { requiredPermission: 'order.create', formPurposes: ['ORDER_SPEC'], usesResourceCapacity: false },
  ENGINEERING_APPROVE: { requiredPermission: 'engineering.approve', formPurposes: ['ORDER_SPEC'], usesResourceCapacity: false },
  PLAN_PRODUCTION: { requiredPermission: 'planning.write', formPurposes: ['TASK_EVIDENCE'], usesResourceCapacity: true },
  EXECUTE_PRODUCTION: { requiredPermission: 'task.execute_assigned', formPurposes: ['TASK_EVIDENCE'], usesResourceCapacity: true },
  FINALIZE_QC: { requiredPermission: 'quality.inspect', formPurposes: ['QC_EVIDENCE'], usesResourceCapacity: false },
  CONFIRM_DELIVERY: { requiredPermission: 'delivery.dispatch', formPurposes: ['ORDER_SPEC'], usesResourceCapacity: false },
  REVIEW_EVIDENCE: { requiredPermission: 'order.read', formPurposes: ['ORDER_SPEC'], usesResourceCapacity: false },
} as const satisfies Record<LifecycleAction, LifecycleActionDescriptor>;

export function getLifecycleActionDescriptor(action: LifecycleAction): LifecycleActionDescriptor {
  return lifecycleActionRegistry[action];
}
