import { z } from 'zod';
import { TaskMaterialReadinessDTO } from '../inventory/contracts';

export const StartTaskSchema = z.object({
  taskId: z.string().min(1),
  technicianId: z.string().optional(),
  overrideReason: z.string().max(500).optional(),
  notes: z.string().max(500).optional(),
});

export type StartTaskInput = z.infer<typeof StartTaskSchema>;

export const PauseTaskSchema = z.object({
  taskId: z.string().min(1),
  reason: z.string().min(1).max(200).default('BREAK'),
  notes: z.string().max(500).optional(),
});

export type PauseTaskInput = z.infer<typeof PauseTaskSchema>;

export const ResumeTaskSchema = z.object({
  taskId: z.string().min(1),
  notes: z.string().max(500).optional(),
});

export type ResumeTaskInput = z.infer<typeof ResumeTaskSchema>;

export interface WorkSessionDTO {
  id: string;
  workspaceId: string;
  taskId: string;
  technicianId: string;
  technicianName?: string;
  sessionType: 'RUNNING' | 'PAUSED';
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  notes: string | null;
}

export interface TaskExecutionDetailDTO {
  id: string;
  workspaceId: string;
  instanceId: string;
  jobsheetId: string | null;
  nodeKey: string;
  nodeName: string;
  status: string;
  attemptNumber: number;
  plannedDurationMinutes: number;
  actualDurationMinutes: number;
  currentElapsedMinutes: number;
  startedAt: string | null;
  completedAt: string | null;
  assignedTechnician: {
    id: string;
    code: string;
    name: string;
  } | null;
  assignedMachine: {
    id: string;
    code: string;
    name: string;
  } | null;
  order: {
    id: string;
    orderNumber: string;
    customerId: string;
    customerName: string;
    itemId: string;
    itemCode: string;
    itemName: string;
    targetAtoms: string;
  };
  instructionRevision: number;
  predecessors: Array<{
    taskId: string;
    nodeKey: string;
    status: string;
    isCompleted: boolean;
  }>;
  materialReadiness: TaskMaterialReadinessDTO;
  activeSession: WorkSessionDTO | null;
  sessions: WorkSessionDTO[];
}

export interface MyTaskSummaryDTO {
  id: string;
  nodeKey: string;
  nodeName: string;
  status: string;
  orderNumber: string;
  customerName: string;
  itemName: string;
  plannedDurationMinutes: number;
  actualDurationMinutes: number;
  currentElapsedMinutes: number;
  activeSessionType: 'RUNNING' | 'PAUSED' | null;
  canStart: boolean;
  blockReason?: string;
}
