import { apiRequest as request } from '@/lib/api/client';
import { hydrateAtomFields, stringifyQuantities } from '@/lib/api/quantities';
async function apiRequest<T>(url: string, options?: RequestInit): Promise<T> {
  return hydrateAtomFields(await request<T>(url, options));
}

import {
  MyTaskSummaryDTO,
  TaskExecutionDetailDTO,
  StartTaskInput,
  PauseTaskInput,
  ResumeTaskInput,
} from '@/server/modules/execution/contracts';

export async function fetchMyTasks(): Promise<MyTaskSummaryDTO[]> {
  const res = await apiRequest<{ data: MyTaskSummaryDTO[] }>('/api/execution/my-tasks');
  return res.data;
}

export async function fetchTaskExecutionDetail(taskId: string): Promise<TaskExecutionDetailDTO> {
  const res = await apiRequest<{ data: TaskExecutionDetailDTO }>(`/api/execution/tasks/${taskId}`);
  return res.data;
}

export async function startTask(input: StartTaskInput) {
  return apiRequest(`/api/execution/tasks/${input.taskId}/start`, {
    method: 'POST',
    body: JSON.stringify({ notes: input.notes }),
  });
}

export async function pauseTask(input: PauseTaskInput) {
  return apiRequest(`/api/execution/tasks/${input.taskId}/pause`, {
    method: 'POST',
    body: JSON.stringify({ reasonId: input.reasonId, reason: input.reason, notes: input.notes }),
  });
}

export async function resumeTask(input: ResumeTaskInput) {
  return apiRequest(`/api/execution/tasks/${input.taskId}/resume`, {
    method: 'POST',
    body: JSON.stringify({ notes: input.notes }),
  });
}

export async function correctTaskWorkInterval(taskId: string, input: {
  sessionId: string;
  correctedDurationMinutes: number;
  reasonCode: string;
  reason: string;
}) {
  return apiRequest(`/api/execution/tasks/${taskId}/interval-corrections`, {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify(input),
  });
}

export interface RecordOutputParams {
  taskId: string;
  outputAtoms: bigint | string | number;
  destinationLocationId: string;
  lotNumber?: string;
  serialNumber?: string;
  isFinal?: boolean;
  notes?: string;
}

export async function recordTaskOutput(params: RecordOutputParams) {
  const { taskId, ...body } = params;
  return apiRequest(`/api/execution/tasks/${taskId}/output`, {
    method: 'POST',
    body: JSON.stringify(stringifyQuantities(body)),
  });
}

import { TaskIssueDTO, ScanResultDTO, TechnicianProfileDTO } from "@/server/modules/execution/contracts";

export async function fetchTaskIssues(taskId: string): Promise<TaskIssueDTO[]> {
  const res = await apiRequest<{ data: TaskIssueDTO[] }>("/api/execution/tasks/" + taskId + "/issues");
  return res.data;
}

export async function createTaskIssue(
  taskId: string,
  input: {
    title: string;
    description?: string;
    severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    issueReasonId?: string;
    evidence?: string[];
    evidenceDocumentIds?: string[];
    ownerUserId?: string;
    affectedMaterialId?: string;
    expectedResolutionAt?: string;
  }
) {
  return apiRequest("/api/execution/tasks/" + taskId + "/issues", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function resolveTaskIssue(issueId: string, notes?: string) {
  return apiRequest("/api/execution/issues/" + issueId + "/resolve", {
    method: "POST",
    body: JSON.stringify({ notes }),
  });
}

export async function reopenTaskIssue(issueId: string, notes?: string) {
  return apiRequest("/api/execution/issues/" + issueId + "/reopen", {
    method: "POST",
    body: JSON.stringify({ notes }),
  });
}

export async function scanBarcode(code: string): Promise<ScanResultDTO> {
  const res = await apiRequest<{ data: ScanResultDTO }>("/api/execution/scan", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  return res.data;
}

export interface IssueReasonDTO {
  id: string;
  category: string;
  code: string;
  label: string;
  isActive: boolean;
}

export async function fetchIssueReasons(category?: string): Promise<IssueReasonDTO[]> {
  const query = category ? `?category=${encodeURIComponent(category)}` : "";
  const res = await apiRequest<{ data: IssueReasonDTO[] }>("/api/issue-reasons" + query);
  return res.data;
}

export async function fetchTechnicianProfile(): Promise<TechnicianProfileDTO> {
  const res = await apiRequest<{ data: TechnicianProfileDTO }>("/api/execution/profile");
  return res.data;
}
