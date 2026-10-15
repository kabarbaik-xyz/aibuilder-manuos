import { FormDefinition, Answers } from '@/domain/forms/types';
import {
  FormTemplateDTO,
  FormVersionDTO,
  CreateFormTemplateInput,
  UpdateFormVersionDraftInput,
} from '@/server/modules/forms/contracts';

export async function fetchFormTemplates(): Promise<{ data: FormTemplateDTO[] }> {
  const res = await fetch('/api/forms');
  if (!res.ok) throw new Error('Failed to fetch form templates');
  return res.json();
}

export async function createFormTemplate(
  input: CreateFormTemplateInput
): Promise<{ data: { templateId: string; versionId: string } }> {
  const res = await fetch('/api/forms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to create form template');
  }
  return res.json();
}

export async function fetchFormTemplate(
  id: string
): Promise<{ data: FormTemplateDTO & { versions: FormVersionDTO[] } }> {
  const res = await fetch(`/api/forms/${id}`);
  if (!res.ok) throw new Error('Failed to fetch form template');
  return res.json();
}

export async function updateDraftVersion(
  templateId: string,
  versionId: string,
  input: UpdateFormVersionDraftInput
): Promise<{ data: { versionId: string; version: number } }> {
  const res = await fetch(`/api/forms/${templateId}/versions/${versionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to update form version draft');
  }
  return res.json();
}

export async function performVersionAction(
  templateId: string,
  versionId: string,
  action: 'submit_review' | 'publish' | 'retire',
  expectedVersion: number
): Promise<{ data: any }> {
  const res = await fetch(`/api/forms/${templateId}/versions/${versionId}/actions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, expectedVersion }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to perform action '${action}'`);
  }
  return res.json();
}

export async function forkFormVersion(
  templateId: string,
  fromVersionId: string
): Promise<{ data: { versionId: string; versionNumber: number } }> {
  const res = await fetch(`/api/forms/${templateId}/versions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fromVersionId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to fork form version');
  }
  return res.json();
}

export async function fetchFormInstance(instanceId: string): Promise<{
  data: {
    instance: any;
    definition: FormDefinition;
    latestSubmission: any;
  };
}> {
  const res = await fetch(`/api/form-instances/${instanceId}`);
  if (!res.ok) throw new Error('Failed to fetch form instance');
  return res.json();
}

export async function saveFormDraft(
  instanceId: string,
  expectedVersion: number,
  answers: Answers
): Promise<{ data: { instanceId: string; submissionId: string; version: number } }> {
  const res = await fetch(`/api/form-instances/${instanceId}/draft`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedVersion, answers }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to save form draft');
  }
  return res.json();
}

export async function finalizeFormSubmission(
  instanceId: string,
  expectedVersion: number,
  answers: Answers
): Promise<{ data: { instanceId: string; submissionId: string; version: number } }> {
  const res = await fetch(`/api/form-instances/${instanceId}/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedVersion, answers }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to finalize form submission');
  }
  return res.json();
}

export async function createFormCorrection(
  instanceId: string,
  expectedVersion: number,
  reason: string,
  answers: Answers
): Promise<{ data: { instanceId: string; submissionId: string; version: number } }> {
  const res = await fetch(`/api/form-instances/${instanceId}/corrections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedVersion, reason, answers }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to create form correction');
  }
  return res.json();
}
