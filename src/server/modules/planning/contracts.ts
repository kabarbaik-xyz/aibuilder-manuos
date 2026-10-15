import { z } from 'zod';
import { ScheduleCalendar, ScheduledTaskResult, ScheduleOutput } from '@/engines/schedule';

export const ScheduleTasksRequestSchema = z.object({
  orderId: z.string().optional(),
  instanceId: z.string().optional(),
  taskIds: z.array(z.string()).optional(),
  startHorizon: z.string().datetime().or(z.date()).optional(),
  calendar: z
    .object({
      shiftStartHour: z.number().int().min(0).max(23),
      shiftHours: z.number().int().min(1).max(24),
      workDays: z.array(z.number().int().min(0).max(6)),
      timezone: z.string().optional(),
    })
    .optional(),
});

export type ScheduleTasksRequest = z.infer<typeof ScheduleTasksRequestSchema>;

export const EvaluateAssignmentSchema = z.object({
  taskId: z.string().min(1),
  technicianId: z.string().nullable().optional(),
  machineId: z.string().nullable().optional(),
  scheduledStartAt: z.string().datetime().or(z.date()).optional(),
  scheduledEndAt: z.string().datetime().or(z.date()).optional(),
});

export type EvaluateAssignmentInput = z.infer<typeof EvaluateAssignmentSchema>;

export interface AssignmentEvaluationResult {
  taskId: string;
  technicianId: string | null;
  machineId: string | null;
  isEligible: boolean;
  violations: string[];
  warnings: string[];
}

export const AssignTaskSchema = z.object({
  taskId: z.string().min(1),
  technicianId: z.string().nullable().optional(),
  machineId: z.string().nullable().optional(),
  startAt: z.string().datetime().or(z.date()).optional(),
  endAt: z.string().datetime().or(z.date()).optional(),
  notes: z.string().max(500).optional(),
});

export type AssignTaskInput = z.infer<typeof AssignTaskSchema>;

export interface ResourceBookingDTO {
  id: string;
  workspaceId: string;
  resourceType: 'TECHNICIAN' | 'MACHINE';
  resourceId: string;
  taskId: string;
  startAt: string;
  endAt: string;
  status: string;
  version: number;
}

export interface TaskPlanningDTO {
  id: string;
  workspaceId: string;
  instanceId: string;
  nodeKey: string;
  nodeName?: string;
  status: string;
  plannedDurationMinutes: number;
  actualDurationMinutes: number;
  assignedTechnicianId: string | null;
  assignedTechnicianName?: string | null;
  assignedMachineId: string | null;
  assignedMachineName?: string | null;
  startedAt: string | null;
  completedAt: string | null;
  predecessorTaskIds: string[];
  requirements: {
    machineClassId?: string;
    requiredSkills?: Array<{ skillId: string; minLevel: number }>;
    requiredCertIds?: string[];
  };
  bookings: ResourceBookingDTO[];
}
