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
  reasonId: z.string().min(1).optional(),
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

export const CreateTaskIssueSchema = z.object({
  taskId: z.string().min(1),
  issueReasonId: z.string().optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  ownerUserId: z.string().optional(),
  expectedResolutionAt: z.string().datetime().or(z.date()).optional(),
  evidence: z.array(z.string()).optional(),
});

export type CreateTaskIssueInput = z.infer<typeof CreateTaskIssueSchema>;

export const ResolveTaskIssueSchema = z.object({
  notes: z.string().max(1000).optional(),
});

export type ResolveTaskIssueInput = z.infer<typeof ResolveTaskIssueSchema>;

export const ReopenTaskIssueSchema = z.object({
  notes: z.string().max(1000).optional(),
});

export type ReopenTaskIssueInput = z.infer<typeof ReopenTaskIssueSchema>;

export interface TaskIssueDTO {
  id: string;
  workspaceId: string;
  taskId: string;
  issueReasonId: string | null;
  issueReasonCode?: string;
  issueReasonLabel?: string;
  title: string;
  description: string | null;
  status: 'OPEN' | 'RESOLVED' | 'REOPENED';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  ownerUserId: string | null;
  ownerUserName?: string;
  reporterUserId: string;
  reporterUserName?: string;
  expectedResolutionAt: string | null;
  resolvedAt: string | null;
  evidence: string[];
  history: Array<{ action: string; userId: string; timestamp: string; notes?: string }>;
  createdAt: string;
  updatedAt: string;
}

export const ScanCodeSchema = z.object({
  code: z.string().trim().min(1),
});

export type ScanCodeInput = z.infer<typeof ScanCodeSchema>;

export interface ScanResultDTO {
  type: 'TASK' | 'JOB' | 'ORDER';
  entityId: string;
  displayCode: string;
  title: string;
  status: string;
  taskId?: string;
}

export interface TechnicianSkillProfileDTO {
  id: string;
  skillId: string;
  skillCode: string;
  skillName: string;
  level: number;
  assessmentStatus: string;
  validFrom: string | null;
  expiresAt: string | null;
  evidence?: string | null;
}

export interface TechnicianCertificationProfileDTO {
  id: string;
  certificationId: string;
  code: string;
  name: string;
  status: string;
  validFromDate: string | null;
  expiresAtDate: string | null;
  validUntil: string;
  scope?: string | null;
}

export interface TechnicianProfileDTO {
  technicianId: string | null;
  userId: string;
  name: string;
  email: string;
  code: string | null;
  facilityId: string | null;
  facilityName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  calendarName: string | null;
  roles: string[];
  skills: TechnicianSkillProfileDTO[];
  certifications: TechnicianCertificationProfileDTO[];
}
