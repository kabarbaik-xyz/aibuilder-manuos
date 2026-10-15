"use client";

import React, { useState } from 'react';
import { Panel } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/icons';
import { useApplyBuilderProposal } from '../hooks';
import { BuilderProposalDto } from '@/server/modules/builder-proposals/contracts';

interface ProposalReviewProps {
  proposal: BuilderProposalDto;
  onApplied: (appliedDraftRef: string) => void;
  onDiscard: () => void;
  expectedTargetRevision: number;
}

export function ProposalReview({
  proposal,
  onApplied,
  onDiscard,
  expectedTargetRevision,
}: ProposalReviewProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  const applyMutation = useApplyBuilderProposal();

  const handleApply = async () => {
    if (!acknowledged) return;
    try {
      const res = await applyMutation.mutateAsync({
        id: proposal.id,
        input: {
          expectedTargetRevision,
          reviewedCandidateHash: proposal.candidateHash,
          humanAcknowledgment: true,
          idempotencyKey: `apply-${proposal.id}-${Date.now()}`,
        },
      });
      onApplied(res.appliedDraftReference);
    } catch (err) {
      console.error(err);
    }
  };

  const hasErrors = proposal.validationFindings.length > 0;

  return (
    <Panel className="p-4 space-y-4 border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line pb-3">
        <div className="flex items-center gap-2">
          <Badge variant="blue" className="text-xs font-bold uppercase">
            AI Proposal Candidate
          </Badge>
          <span className="text-xs font-mono text-muted">
            {proposal.candidateHash.slice(0, 10)}…
          </span>
        </div>
        <Button variant="soft" size="small" onClick={onDiscard}>
          Discard
        </Button>
      </div>

      {/* Assumptions & Notes */}
      {proposal.assumptions.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">
            Synthesis Assumptions:
          </span>
          <ul className="list-inside list-disc text-xs text-ink space-y-0.5">
            {proposal.assumptions.map((asm, idx) => (
              <li key={idx}>{asm}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Validation Findings */}
      {hasErrors && (
        <div className="rounded-md border border-danger/20 bg-danger-soft p-3 text-xs text-danger space-y-1">
          <span className="font-semibold">Validation Blocking Findings:</span>
          <ul className="list-inside list-disc">
            {proposal.validationFindings.map((f, idx) => (
              <li key={idx}>
                {f.field ? `[${f.field}] ` : ''}
                {f.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Candidate Raw JSON Snippet */}
      <div className="space-y-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          Generated Candidate Preview:
        </span>
        <pre className="max-h-40 overflow-y-auto rounded-md border border-line bg-surface-muted p-2 font-mono text-xs text-ink">
          {JSON.stringify(JSON.parse(proposal.candidateJson), null, 2)}
        </pre>
      </div>

      {/* Human Review Checkbox & Apply Action */}
      <div className="pt-2 border-t border-line space-y-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="h-4 w-4 rounded border-line text-primary focus:ring-primary"
            disabled={hasErrors || applyMutation.isPending}
          />
          <span className="text-xs text-ink">
            I have reviewed the synthesized candidate draft, verified its safety and correctness, and
            authorize applying it to the draft revision.
          </span>
        </label>

        {applyMutation.isError && (
          <div className="rounded-md border border-danger/20 bg-danger-soft p-2 text-xs text-danger">
            {applyMutation.error?.message || 'Failed to apply candidate.'}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button
            variant="primary"
            size="small"
            onClick={handleApply}
            disabled={!acknowledged || hasErrors || applyMutation.isPending}
          >
            {applyMutation.isPending ? 'Applying Draft…' : 'Apply Reviewed Candidate to Draft'}
          </Button>
        </div>
      </div>
    </Panel>
  );
}
