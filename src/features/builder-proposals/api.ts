import { BuilderProposalDto, CreateProposalInput, ApplyProposalInput } from '@/server/modules/builder-proposals/contracts';

export async function createAiBuilderProposal(input: CreateProposalInput): Promise<BuilderProposalDto> {
  const res = await fetch('/api/ai/builder-proposals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to generate AI proposal');
  }
  const json = await res.json();
  return json.data;
}

export async function getAiBuilderProposal(id: string): Promise<BuilderProposalDto> {
  const res = await fetch(`/api/ai/builder-proposals/${id}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to retrieve AI proposal');
  }
  const json = await res.json();
  return json.data;
}

export async function applyAiBuilderProposal(
  id: string,
  input: ApplyProposalInput
): Promise<{ status: string; appliedDraftReference: string }> {
  const res = await fetch(`/api/ai/builder-proposals/${id}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to apply AI proposal');
  }
  const json = await res.json();
  return json.data;
}
