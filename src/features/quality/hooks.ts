import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchInspections,
  fetchInspectionById,
  createInspection,
  finalizeInspection,
  authorizeRework,
  recordReinspection,
  CreateInspectionInput,
  FinalizeInspectionInput,
  AuthorizeReworkInput,
  RecordReinspectionInput,
} from './api';

export function useInspections(filters?: { status?: string; sourceType?: string }) {
  return useQuery({
    queryKey: ['quality', 'inspections', filters],
    queryFn: () => fetchInspections(filters),
    refetchInterval: 5000,
  });
}

export function useInspection(id: string) {
  return useQuery({
    queryKey: ['quality', 'inspection', id],
    queryFn: () => fetchInspectionById(id),
    enabled: Boolean(id),
  });
}

export function useCreateInspection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInspectionInput) => createInspection(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quality'] });
    },
  });
}

export function useFinalizeInspection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: FinalizeInspectionInput) => finalizeInspection(input),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['quality'] });
      queryClient.invalidateQueries({ queryKey: ['quality', 'inspection', vars.inspectionId] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['execution'] });
    },
  });
}

export function useAuthorizeRework() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AuthorizeReworkInput) => authorizeRework(input),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['quality'] });
      queryClient.invalidateQueries({ queryKey: ['quality', 'inspection', vars.inspectionId] });
    },
  });
}

export function useRecordReinspection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RecordReinspectionInput) => recordReinspection(input),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['quality'] });
      queryClient.invalidateQueries({ queryKey: ['quality', 'inspection', vars.originalInspectionId] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}
