"use client";

import React, { useState } from 'react';
import { Panel } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Icon } from '@/components/icons';
import { useCreateBuilderProposal } from '../hooks';
import { BuilderTarget, BuilderProposalDto } from '@/server/modules/builder-proposals/contracts';

interface GenerationPanelProps {
  target: BuilderTarget;
  targetDraftId?: string;
  baseRevision?: number;
  onGenerated: (proposal: BuilderProposalDto) => void;
  disabled?: boolean;
}

export function GenerationPanel({
  target,
  targetDraftId,
  baseRevision,
  onGenerated,
  disabled,
}: GenerationPanelProps) {
  const [prompt, setPrompt] = useState('');
  const createMutation = useCreateBuilderProposal();

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    try {
      const proposal = await createMutation.mutateAsync({
        target,
        prompt: prompt.trim(),
        targetDraftId,
        baseRevision,
      });
      onGenerated(proposal);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <Panel className="p-4 space-y-3 border-line bg-surface">
      <div className="flex items-center gap-2">
        <Icon name="spark" className="h-4 w-4 text-primary" />
        <span className="font-semibold text-xs uppercase tracking-wider text-ink">
          AI {target === 'WORKFLOW' ? 'Workflow DAG' : 'Form Schema'} Assistant
        </span>
      </div>

      <p className="text-xs text-muted">
        Describe your manufacturing requirements, routing constraints, or inspection parameters. AI will
        generate a deterministic, bounded draft candidate for human review.
      </p>

      <form onSubmit={handleGenerate} className="space-y-3">
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            target === 'WORKFLOW'
              ? 'e.g. Design a 3-step CNC process for aluminum bracket: rough cut, precision milling with 45min planned duration, and final dimensional QC inspection.'
              : 'e.g. Create a paint inspection form with finish type (painted/raw), conditional paint code visible only when painted, and dry film thickness.'
          }
          rows={3}
          disabled={disabled || createMutation.isPending}
          className="text-xs"
        />

        {createMutation.isError && (
          <div className="rounded-md border border-danger/20 bg-danger-soft p-2 text-xs text-danger">
            {createMutation.error?.message || 'Failed to generate proposal.'}
          </div>
        )}

        <div className="flex justify-end">
          <Button
            type="submit"
            variant="primary"
            size="small"
            disabled={disabled || !prompt.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? 'Generating Candidate…' : 'Generate with AI'}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
