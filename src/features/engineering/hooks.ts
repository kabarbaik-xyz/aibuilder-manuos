import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/api/query-keys';
import { engineeringApi } from './api';

export function useEngineeringRevision(orderId: string, revId: string) {
  return useQuery({
    queryKey: queryKeys.engineeringRevision(revId),
    queryFn: () => engineeringApi.getRevision(orderId, revId),
    enabled: !!orderId && !!revId,
  });
}

export function useSaveEngineeringDraft(orderId: string, revId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof engineeringApi.saveDraft>[2]) =>
      engineeringApi.saveDraft(orderId, revId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.engineeringRevision(revId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.order(orderId) });
    },
  });
}

export function useEngineeringAction(orderId: string, revId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (action: 'submit_review' | 'approve') => {
      if (action === 'submit_review') return engineeringApi.submitReview(orderId, revId);
      return engineeringApi.approveRevision(orderId, revId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.engineeringRevision(revId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.order(orderId) });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
