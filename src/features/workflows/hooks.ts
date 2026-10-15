import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/api/query-keys';
import { workflowsApi } from './api';

export function useWorkflowTemplates() {
  return useQuery({
    queryKey: queryKeys.workflows(),
    queryFn: workflowsApi.listTemplates,
  });
}

export function useWorkflowTemplate(id: string) {
  return useQuery({
    queryKey: queryKeys.workflow(id),
    queryFn: () => workflowsApi.getTemplate(id),
    enabled: !!id,
  });
}

export function useWorkflowVersion(templateId: string, versionId: string) {
  return useQuery({
    queryKey: queryKeys.workflowVersion(templateId, versionId),
    queryFn: () => workflowsApi.getVersion(templateId, versionId),
    enabled: !!templateId && !!versionId,
  });
}

export function useCreateWorkflowTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: workflowsApi.createTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows() });
    },
  });
}

export function useSaveWorkflowVersionDraft(templateId: string, versionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof workflowsApi.saveVersionDraft>[2]) =>
      workflowsApi.saveVersionDraft(templateId, versionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflowVersion(templateId, versionId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workflow(templateId) });
    },
  });
}

export function useWorkflowVersionAction(templateId: string, versionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (action: 'submit_review' | 'publish' | 'retire' | 'fork') => {
      if (action === 'submit_review') return workflowsApi.submitReview(templateId, versionId);
      if (action === 'publish') return workflowsApi.publishVersion(templateId, versionId);
      if (action === 'retire') return workflowsApi.retireVersion(templateId, versionId);
      return workflowsApi.forkVersion(templateId, versionId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflowVersion(templateId, versionId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workflow(templateId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows() });
    },
  });
}
