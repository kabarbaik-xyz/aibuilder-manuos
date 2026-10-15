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
