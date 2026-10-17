import { z } from 'zod';

export const ProposeRecoverySchema = z.object({
  orderId: z.string().uuid(),
  disruptionType: z.string().default('MATERIAL_DELAY'),
  materialArrivesDate: z.string().optional(),
  delayDays: z.number().int().min(1).default(3),
});

export type ProposeRecoveryInput = z.infer<typeof ProposeRecoverySchema>;

export const ScheduleRecoveryReviewSchema = z.object({
  orderId: z.string().uuid(),
  instanceId: z.string().uuid(),
}).strict();

export type ScheduleRecoveryReviewInput = z.infer<typeof ScheduleRecoveryReviewSchema>;

export const ApproveRecoverySchema = z.object({
  orderId: z.string().uuid(),
  proposalId: z.string().uuid(),
  optionId: z.string().min(1),
  tranche1Qty: z.number().int().min(1),
  tranche1Date: z.string(),
  tranche2Qty: z.number().int().min(0).optional(),
  tranche2Date: z.string().optional(),
  notes: z.string().max(500).optional(),
});

export type ApproveRecoveryInput = z.infer<typeof ApproveRecoverySchema>;

export interface RecoveryOptionDTO {
  id: string;
  type: string;
  title: string;
  description: string;
  feasible: boolean;
  infeasibleReason?: string;
  isRecommended: boolean;
  timeRecoveredDays: number;
  costImpactPct: number;
  capacityImpact: string;
  allocation?: {
    tranche1Qty: number;
    tranche1Date: string;
    tranche2Qty: number;
    tranche2Date: string;
  };
}

export interface RecoveryProposalDTO {
  id: string;
  orderId: string;
  orderNumber: string;
  mode?: 'LEGACY_SIMULATION' | 'SCHEDULE_REVIEW';
  state?: 'SAVED';
  totalQty?: number;
  readyQcPassedQty?: number;
  originalPromisedDate?: string | null;
  projectedDelayedDate?: string;
  options: RecoveryOptionDTO[];
  createdAt: string;
  scheduleReview?: {
    instanceId: string;
    workflowVersionId: string;
    engineeringRevisionId: string;
    facilityId: string | null;
    facilityTimezone: string | null;
    horizonStart: string;
    horizonEnd: string;
    evaluatedAt: string;
    projectedEndAt: string | null;
    machineCostEstimate?: { status: 'COMPLETE' | 'PARTIAL' | 'NOT_AVAILABLE'; currency: string; totalMinorUnits: number | null; pricedTaskCount: number; unpricedTaskCount: number };
    overtimeAlternatives?: Array<{
      id: string;
      state: 'COMPLETE';
      technicianId: string;
      technicianName: string;
      approverMembershipId: string;
      approverName: string;
      startAt: string;
      endAt: string;
      projectedEndAt: string;
      tasks: Array<{
        taskId: string;
        version: number;
        nodeKey: string;
        status: 'SCHEDULED';
        startAt: string;
        endAt: string;
        technicianId?: string | null;
        technicianName: string | null;
        machineId?: string | null;
        machineName: string | null;
        predecessorTaskIds: string[];
      }>;
    }>;
    alternatives?: Array<{
      id: string;
      state: 'COMPLETE';
      taskId: string;
      nodeKey: string;
      machineId: string;
      machineName: string;
      projectedEndAt: string;
      machineCostEstimate: { status: 'COMPLETE' | 'PARTIAL' | 'NOT_AVAILABLE'; currency: string; totalMinorUnits: number | null; pricedTaskCount: number; unpricedTaskCount: number };
      tasks: Array<{
        taskId: string;
        version: number;
        nodeKey: string;
        status: 'SCHEDULED';
        startAt: string;
        endAt: string;
        technicianId?: string | null;
        technicianName: string | null;
        machineId?: string | null;
        machineName: string | null;
        predecessorTaskIds: string[];
      }>;
    }>;
    taskVersions: Array<{ taskId: string; version: number }>;
    tasks: Array<{
      taskId: string;
      version: number;
      nodeKey: string;
      startAt: string | null;
      endAt: string | null;
      technicianId?: string | null;
      technicianName: string | null;
      machineId?: string | null;
      machineName: string | null;
      predecessorTaskIds: string[];
    }>;
    assumptions: string[];
  };
}

export type ScheduleRecoveryReviewResult =
  | { state: 'NOT_CONNECTED'; scheduleState: string; missingInputs: string[] }
  | RecoveryProposalDTO;
