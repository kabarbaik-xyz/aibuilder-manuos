"use client";

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createAiBuilderProposal, getAiBuilderProposal, applyAiBuilderProposal } from './api';
import { CreateProposalInput, ApplyProposalInput } from '@/server/modules/builder-proposals/contracts';

export function useCreateBuilderProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProposalInput) => createAiBuilderProposal(input),
    onSuccess: (data) => {
      queryClient.setQueryData(['builder-proposal', data.id], data);
    },
  });
}

export function useBuilderProposal(id: string | null) {
  return useQuery({
    queryKey: ['builder-proposal', id],
    queryFn: () => (id ? getAiBuilderProposal(id) : null),
    enabled: Boolean(id),
  });
}

export function useApplyBuilderProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ApplyProposalInput }) =>
      applyAiBuilderProposal(id, input),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['builder-proposal', vars.id] });
      queryClient.invalidateQueries({ queryKey: ['workflow-version'] });
      queryClient.invalidateQueries({ queryKey: ['form-version'] });
    },
  });
}
