import type { LifecycleAction } from '@/domain/order-lifecycle-definition';
import type { FormPurpose } from '@/domain/forms/types';

export interface LifecycleActionDescriptor {
  requiredPermission: string;
  formPurposes: readonly FormPurpose[];
  usesResourceCapacity: boolean;
  completionFact: string;
}

/** The single server-side contract for lifecycle authorization, evidence and capacity. */
export const lifecycleActionRegistry = {
  ORDER_CONFIRM: { requiredPermission: 'order.create', formPurposes: ['ORDER_SPEC'], usesResourceCapacity: false, completionFact: 'ORDER_CONFIRMED' },
  ENGINEERING_APPROVE: { requiredPermission: 'engineering.approve', formPurposes: ['ORDER_SPEC'], usesResourceCapacity: false, completionFact: 'ENGINEERING_APPROVED' },
  PLAN_PRODUCTION: { requiredPermission: 'planning.write', formPurposes: ['TASK_EVIDENCE'], usesResourceCapacity: true, completionFact: 'SCHEDULE_PROPOSAL_APPLIED' },
  EXECUTE_PRODUCTION: { requiredPermission: 'task.execute_assigned', formPurposes: ['TASK_EVIDENCE'], usesResourceCapacity: true, completionFact: 'ALL_PRODUCTION_TASKS_COMPLETED' },
  FINALIZE_QC: { requiredPermission: 'quality.inspect', formPurposes: ['QC_EVIDENCE'], usesResourceCapacity: false, completionFact: 'ALL_QC_INSPECTIONS_FINALIZED' },
  CONFIRM_DELIVERY: { requiredPermission: 'delivery.dispatch', formPurposes: ['ORDER_SPEC'], usesResourceCapacity: false, completionFact: 'ALL_SHIPMENT_QUANTITIES_DELIVERED' },
  REVIEW_EVIDENCE: { requiredPermission: 'order.read', formPurposes: ['ORDER_SPEC'], usesResourceCapacity: false, completionFact: 'EVIDENCE_REVIEWED' },
} as const satisfies Record<LifecycleAction, LifecycleActionDescriptor>;

export function getLifecycleActionDescriptor(action: LifecycleAction): LifecycleActionDescriptor {
  return lifecycleActionRegistry[action];
}
