import { z } from 'zod';

export const EvaluatePromiseSchema = z.object({
  orderId: z.string().uuid(),
  instanceId: z.string().uuid(),
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
  requestedDate: string;
  feasibleDate: string | null;
  projectedEndAt: string | null;
  isFeasibleOnRequestedDate: boolean | null;
  deltaDays: number | null;
  scheduleState: 'COMPLETE' | 'PARTIAL' | 'NO_FEASIBLE_TASKS' | 'NO_OPEN_TASKS' | null;
  bottleneckReason: string;
  missingInputs: string[];
  assumptions: string[];
  evidence: {
    facilityId: string | null;
    facilityTimezone: string | null;
    workflowVersionId: string;
    engineeringRevisionId: string;
    taskVersions: Array<{ taskId: string; version: number }>;
  } | null;
}
