'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchFormTemplates,
  createFormTemplate,
  fetchFormTemplate,
  updateDraftVersion,
  performVersionAction,
  forkFormVersion,
  fetchFormInstance,
  fetchFormInstancesForSubject,
  saveFormDraft,
  finalizeFormSubmission,
  createFormCorrection,
} from './api';
import { Answers } from '@/domain/forms/types';
import { UpdateFormVersionDraftInput } from '@/server/modules/forms/contracts';

export function useFormTemplates() {
  return useQuery({
    queryKey: ['forms', 'templates'],
    queryFn: fetchFormTemplates,
  });
}

export function useFormTemplate(id: string) {
  return useQuery({
    queryKey: ['forms', 'templates', id],
    queryFn: () => fetchFormTemplate(id),
    enabled: Boolean(id),
  });
}

export function useCreateFormTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createFormTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forms', 'templates'] });
    },
  });
}

export function useUpdateDraftVersion(templateId: string, versionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateFormVersionDraftInput) =>
      updateDraftVersion(templateId, versionId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forms', 'templates', templateId] });
    },
  });
}

export function useFormVersionAction(templateId: string, versionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      action,
      expectedVersion,
    }: {
      action: 'submit_review' | 'publish' | 'retire';
      expectedVersion: number;
    }) => performVersionAction(templateId, versionId, action, expectedVersion),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forms', 'templates', templateId] });
    },
  });
}

export function useForkFormVersion(templateId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fromVersionId: string) => forkFormVersion(templateId, fromVersionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forms', 'templates', templateId] });
    },
  });
}

export function useFormInstance(instanceId: string) {
  return useQuery({
    queryKey: ['forms', 'instances', instanceId],
    queryFn: () => fetchFormInstance(instanceId),
    enabled: Boolean(instanceId),
  });
}

export function useFormInstancesForSubject(subjectType: 'ORDER' | 'TASK' | 'INSPECTION', subjectId: string) {
  return useQuery({
    queryKey: ['forms', 'subjects', subjectType, subjectId],
    queryFn: () => fetchFormInstancesForSubject(subjectType, subjectId),
    enabled: Boolean(subjectId),
  });
}

export function useSaveFormDraft(instanceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      expectedVersion,
      answers,
    }: {
      expectedVersion: number;
      answers: Answers;
    }) => saveFormDraft(instanceId, expectedVersion, answers),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forms', 'instances', instanceId] });
    },
  });
}

export function useFinalizeFormSubmission(instanceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      expectedVersion,
      answers,
    }: {
      expectedVersion: number;
      answers: Answers;
    }) => finalizeFormSubmission(instanceId, expectedVersion, answers),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forms', 'instances', instanceId] });
    },
  });
}

export function useCreateFormCorrection(instanceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      expectedVersion,
      reason,
      answers,
    }: {
      expectedVersion: number;
      reason: string;
      answers: Answers;
    }) => createFormCorrection(instanceId, expectedVersion, reason, answers),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forms', 'instances', instanceId] });
    },
  });
}
