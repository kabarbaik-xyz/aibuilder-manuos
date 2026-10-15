import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchMyTasks,
  fetchTaskExecutionDetail,
  startTask,
  pauseTask,
  resumeTask,
} from './api';
import {
  StartTaskInput,
  PauseTaskInput,
  ResumeTaskInput,
} from '@/server/modules/execution/contracts';

export function useMyTasks() {
  return useQuery({
    queryKey: ['execution', 'my-tasks'],
    queryFn: () => fetchMyTasks(),
    refetchInterval: 5000, // Live poll every 5s for shift changes
  });
}

export function useTaskExecutionDetail(taskId: string) {
  return useQuery({
    queryKey: ['execution', 'task', taskId],
    queryFn: () => fetchTaskExecutionDetail(taskId),
    enabled: Boolean(taskId),
    refetchInterval: 3000, // Live poll active session
  });
}

export function useStartTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: StartTaskInput) => startTask(input),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['execution'] });
      queryClient.invalidateQueries({ queryKey: ['execution', 'task', vars.taskId] });
      queryClient.invalidateQueries({ queryKey: ['planning'] });
    },
  });
}

export function usePauseTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PauseTaskInput) => pauseTask(input),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['execution'] });
      queryClient.invalidateQueries({ queryKey: ['execution', 'task', vars.taskId] });
    },
  });
}

export function useResumeTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ResumeTaskInput) => resumeTask(input),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['execution'] });
      queryClient.invalidateQueries({ queryKey: ['execution', 'task', vars.taskId] });
    },
  });
}

export function useRecordTaskOutput() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: Parameters<typeof import('./api').recordTaskOutput>[0]) =>
      import('./api').then((m) => m.recordTaskOutput(params)),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['execution'] });
      queryClient.invalidateQueries({ queryKey: ['execution', 'task', vars.taskId] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['planning'] });
    },
  });
}
