import { apiRequest } from '@/lib/api/client';
import { ScheduleOutput } from '@/engines/schedule';
import {
  ScheduleTasksRequest,
  AssignTaskInput,
  EvaluateAssignmentInput,
  AssignmentEvaluationResult,
} from '@/server/modules/planning/contracts';

export async function fetchSchedule(params?: ScheduleTasksRequest): Promise<ScheduleOutput> {
  const res = await apiRequest<{ data: ScheduleOutput }>('/api/planning/schedule', {
    method: 'POST',
    body: JSON.stringify(params || {}),
  });
  return res.data;
}

export async function assignTask(input: AssignTaskInput) {
  return apiRequest('/api/planning/assignments', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function evaluateAssignment(input: EvaluateAssignmentInput): Promise<AssignmentEvaluationResult> {
  const res = await apiRequest<{ data: AssignmentEvaluationResult }>('/api/planning/evaluate', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return res.data;
}

import { TaskDispatchReadinessDTO } from "@/server/modules/planning/contracts";

export async function fetchTaskReadiness(taskId: string): Promise<TaskDispatchReadinessDTO> {
  const res = await apiRequest<{ data: TaskDispatchReadinessDTO }>("/api/planning/tasks/" + taskId + "/readiness");
  return res.data;
}

export async function cancelAssignment(assignmentId: string, reason?: string) {
  return apiRequest("/api/planning/assignments/" + assignmentId + "/cancel", {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function rescheduleAssignment(assignmentId: string, input: { startAt: string; endAt: string; notes?: string }) {
  return apiRequest("/api/planning/assignments/" + assignmentId + "/reschedule", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
