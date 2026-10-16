import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchSchedule, assignTask, evaluateAssignment } from './api';
import { ScheduleTasksRequest, AssignTaskInput, EvaluateAssignmentInput } from '@/server/modules/planning/contracts';

export function useSchedule(params?: ScheduleTasksRequest) {
  return useQuery({
    queryKey: ['planning', 'schedule', params],
    queryFn: () => fetchSchedule(params),
  });
}

export function useAssignTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AssignTaskInput) => assignTask(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planning'] });
      queryClient.invalidateQueries({ queryKey: ['execution'] });
    },
  });
}

export function useEvaluateAssignment() {
  return useMutation({
    mutationFn: (input: EvaluateAssignmentInput) => evaluateAssignment(input),
  });
}

import {
  fetchTaskReadiness,
  cancelAssignment,
  rescheduleAssignment,
  fetchPublishedSchedules,
  publishSchedule,
} from "./api";

export function useTaskReadiness(taskId: string | null) {
  return useQuery({
    queryKey: ["planning", "task", taskId, "readiness"],
    queryFn: () => fetchTaskReadiness(taskId!),
    enabled: Boolean(taskId),
  });
}

export function useCancelAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ assignmentId, reason }: { assignmentId: string; reason?: string }) =>
      cancelAssignment(assignmentId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planning"] });
      queryClient.invalidateQueries({ queryKey: ["execution"] });
    },
  });
}

export function useRescheduleAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ assignmentId, input }: { assignmentId: string; input: { startAt: string; endAt: string; notes?: string } }) =>
      rescheduleAssignment(assignmentId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planning"] });
      queryClient.invalidateQueries({ queryKey: ["execution"] });
    },
  });
}

export function usePublishedSchedules() {
  return useQuery({
    queryKey: ["planning", "published-schedules"],
    queryFn: () => fetchPublishedSchedules(),
  });
}

export function usePublishSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { title: string; periodStart: string; periodEnd: string }) =>
      publishSchedule(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planning", "published-schedules"] });
      queryClient.invalidateQueries({ queryKey: ["planning"] });
    },
  });
}


import { requestOvertime, approveOvertime } from "./api";

export function useRequestOvertime() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      technicianId: string;
      facilityId?: string;
      startAt: string;
      endAt: string;
      reason: string;
      notes?: string;
    }) => requestOvertime(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planning"] });
      queryClient.invalidateQueries({ queryKey: ["technicians"] });
    },
  });
}

export function useApproveOvertime() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (intervalId: string) => approveOvertime(intervalId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planning"] });
      queryClient.invalidateQueries({ queryKey: ["technicians"] });
    },
  });
}
