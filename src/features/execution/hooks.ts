import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchMyTasks,
  fetchTaskExecutionDetail,
  startTask,
  pauseTask,
  resumeTask,
  correctTaskWorkInterval,
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

export function useCorrectTaskWorkInterval(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { sessionId: string; correctedDurationMinutes: number; reasonCode: string; reason: string }) =>
      correctTaskWorkInterval(taskId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['execution', 'task', taskId] }),
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

import {
  fetchTaskIssues,
  createTaskIssue,
  resolveTaskIssue,
  reopenTaskIssue,
  scanBarcode,
  fetchTechnicianProfile,
  fetchIssueReasons,
} from "./api";

export function useTaskIssues(taskId: string) {
  return useQuery({
    queryKey: ["execution", "task", taskId, "issues"],
    queryFn: () => fetchTaskIssues(taskId),
    enabled: Boolean(taskId),
    refetchInterval: 5000,
  });
}

export function useCreateTaskIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, input }: { taskId: string; input: Parameters<typeof createTaskIssue>[1] }) =>
      createTaskIssue(taskId, input),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["execution", "task", vars.taskId, "issues"] });
      queryClient.invalidateQueries({ queryKey: ["execution", "task", vars.taskId] });
      queryClient.invalidateQueries({ queryKey: ["execution"] });
    },
  });
}

export function useResolveTaskIssue(taskId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ issueId, notes }: { issueId: string; notes?: string }) =>
      resolveTaskIssue(issueId, notes),
    onSuccess: () => {
      if (taskId) {
        queryClient.invalidateQueries({ queryKey: ["execution", "task", taskId, "issues"] });
        queryClient.invalidateQueries({ queryKey: ["execution", "task", taskId] });
      }
      queryClient.invalidateQueries({ queryKey: ["execution"] });
    },
  });
}

export function useReopenTaskIssue(taskId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ issueId, notes }: { issueId: string; notes?: string }) =>
      reopenTaskIssue(issueId, notes),
    onSuccess: () => {
      if (taskId) {
        queryClient.invalidateQueries({ queryKey: ["execution", "task", taskId, "issues"] });
        queryClient.invalidateQueries({ queryKey: ["execution", "task", taskId] });
      }
      queryClient.invalidateQueries({ queryKey: ["execution"] });
    },
  });
}

export function useScanBarcode() {
  return useMutation({
    mutationFn: (code: string) => scanBarcode(code),
  });
}

export function useTechnicianProfile() {
  return useQuery({
    queryKey: ["execution", "profile"],
    queryFn: () => fetchTechnicianProfile(),
  });
}

export function useIssueReasons(category?: string) {
  return useQuery({
    queryKey: ["issue-reasons", category || "all"],
    queryFn: () => fetchIssueReasons(category),
  });
}
