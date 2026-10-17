import { z } from 'zod';

export const EvaluatePromiseSchema = z.object({
  orderId: z.string().uuid(),
  instanceId: z.string().uuid(),
  requestedQuantity: z.string().trim().min(1).max(40),
  requestedDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
}).strict();

export type EvaluatePromiseInput = z.infer<typeof EvaluatePromiseSchema>;

export interface PromiseEvaluationDTO {
  state: 'EVALUATED' | 'NOT_CONNECTED';
  evaluationId: string;
  inputHash: string;
  evaluatedAt: string;
  orderId: string;
  instanceId: string;
  requestedQuantity: string;
  requestedQuantityAtoms: string;
  quantityUom: string | null;
  requestedDate: string;
  feasibleDate: string | null;
  projectedEndAt: string | null;
  isFeasibleOnRequestedDate: boolean | null;
  deltaDays: number | null;
  scheduleState: 'COMPLETE' | 'PARTIAL' | 'NO_FEASIBLE_TASKS' | 'NO_OPEN_TASKS' | null;
  bottleneckReason: string;
  missingInputs: string[];
  assumptions: string[];
  componentReadiness: Array<{
    itemId: string;
    itemCode: string;
    itemName: string;
    quantityUom: string;
    requiredAtoms: string;
    issuedAtoms: string;
    reservedAtoms: string;
    availableRawAtoms: string;
    state: 'ISSUED' | 'RESERVED' | 'UNALLOCATED';
    confirmedSupply: Array<{ supplyOrderId: string; supplyOrderNumber: string; supplierName: string; expectedDate: string; remainingAtoms: string }>;
  }>;
  evidence: {
    facilityId: string | null;
    facilityTimezone: string | null;
    workflowVersionId: string;
    engineeringRevisionId: string;
    taskVersions: Array<{ taskId: string; version: number }>;
  } | null;
}
