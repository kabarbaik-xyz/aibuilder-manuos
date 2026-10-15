import { apiRequest } from '@/lib/api/client';
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
