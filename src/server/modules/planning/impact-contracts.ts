import { z } from 'zod';
import { CPMResult } from '@/engines/cpm';

export const DisruptionType = {
  MATERIAL_DELAY: 'MATERIAL_DELAY',
  MACHINE_DOWNTIME: 'MACHINE_DOWNTIME',
  TASK_OVERRUN: 'TASK_OVERRUN',
} as const;
export type DisruptionType = (typeof DisruptionType)[keyof typeof DisruptionType];

export const AnalyzeImpactSchema = z.object({
  disruptionType: z.enum(['MATERIAL_DELAY', 'MACHINE_DOWNTIME', 'TASK_OVERRUN']),
  entityId: z.string().min(1), // itemId, machineId, or taskId
  delayDays: z.number().int().min(1).default(1),
  delayHours: z.number().min(0).optional(),
  newEtaDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  reason: z.string().max(500).optional(),
});

export type AnalyzeImpactInput = z.infer<typeof AnalyzeImpactSchema>;

export interface TaskImpactDTO {
  taskId: string;
  taskName: string;
  orderId: string;
  orderNumber: string;
  status: string;
  isDirectlyBlocked: boolean;
  isDownstreamBlocked: boolean;
  isRunnable: boolean;
  plannedDurationMinutes: number;
  remainingMinutes: number;
  originalScheduledEndAt: string | null;
  newProjectedEndAt: string | null;
  slackHours: number;
  isCritical: boolean;
}

export interface OrderImpactDTO {
  orderId: string;
  orderNumber: string;
  customerName: string;
  originalPromisedDate: string | null;
  newProjectedDate: string;
  deltaDays: number;
  severity: 'ON_TRACK' | 'WATCH' | 'AT_RISK';
  affectedTasksCount: number;
}

export interface ImpactAnalysisResult {
  evaluationId: string;
  inputHash: string;
  evaluatedAt: string;
  disruptionType: DisruptionType;
  entityId: string;
  entityName: string;
  delayDays: number;
  affectedOrders: OrderImpactDTO[];
  affectedTasks: TaskImpactDTO[];
  criticalPathTaskIds: string[];
  blockedTaskIds: string[];
  runnableTaskIds: string[];
  summary: string;
}
