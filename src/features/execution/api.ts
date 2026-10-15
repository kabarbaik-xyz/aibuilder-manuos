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
    body: JSON.stringify({ reason: input.reason, notes: input.notes }),
  });
}

export async function resumeTask(input: ResumeTaskInput) {
  return apiRequest(`/api/execution/tasks/${input.taskId}/resume`, {
    method: 'POST',
    body: JSON.stringify({ notes: input.notes }),
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
