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
  embedded?: boolean;
}

export function GenerationPanel({
  target,
  targetDraftId,
  baseRevision,
  onGenerated,
  disabled,
  embedded = false,
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

  if (embedded && target === 'FORM') {
    const examples = [
      { label: 'Inspection checklist', prompt: 'Create an inspection checklist with a required pass/fail result, measured dimension in mm, and defect notes required when the result is fail.' },
      { label: 'Order intake', prompt: 'Create an order intake form with customer reference, requested delivery date, material specification, and production notes.' },
      { label: 'Material receipt', prompt: 'Create a material receipt form with supplier reference, lot number, received quantity, and a visual inspection result.' },
    ];
    return <div className="form-ai-layout">
      <div className="form-ai-guidance">
        <h3>Start with a description.</h3>
        <p>Tell ManuOS what you need to capture. Include field types, required answers and any visibility rules.</p>
        <div className="form-ai-review-note"><Icon name="shield" /><span>You review the draft before any changes are applied.</span></div>
      </div>
      <form className="form-ai-form" onSubmit={handleGenerate}>
        <label htmlFor="form-ai-requirements">What should this form capture?</label>
        <div className="form-ai-prompt">
          <Textarea id="form-ai-requirements" value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="e.g. A paint inspection with finish type, paint code when painted, and dry film thickness in microns…" rows={3} disabled={disabled || createMutation.isPending} />
          <div className="form-ai-prompt-footer"><span>{createMutation.isPending ? 'Preparing your draft…' : 'Fields, types & rules'}</span><Button type="submit" variant="primary" size="small" icon="spark" disabled={disabled || !prompt.trim() || createMutation.isPending}>{createMutation.isPending ? 'Generating…' : 'Generate draft'}</Button></div>
        </div>
        {createMutation.isError && <p role="alert" className="form-ai-error">{createMutation.error?.message || 'Could not generate a draft. Please try again.'}</p>}
        <div className="form-ai-examples"><span>Try an example</span>{examples.map(example => <Button key={example.label} size="small" variant="ghost" disabled={disabled || createMutation.isPending} onClick={() => setPrompt(example.prompt)}>{example.label}</Button>)}</div>
      </form>
    </div>;
  }

  const Container = embedded ? 'div' : Panel;
  return (
    <Container className={embedded ? 'form-builder-generation' : 'p-4 space-y-3 border-line bg-surface'}>
      {!embedded && <div className="flex items-center gap-2">
        <Icon name="spark" className="h-4 w-4 text-primary" />
        <span className="font-semibold text-xs uppercase tracking-wider text-ink">
          Draft {target === 'FORM' ? 'form' : target === 'LIFECYCLE' ? 'order lifecycle' : 'routing'} with AI
        </span>
      </div>}

      <p className="text-xs text-muted">
        {target === 'LIFECYCLE' ? 'Describe the stages, departments, handoffs and evidence you need. AI uses the current draft and available workspace records. Review its proposal before applying.' : 'Describe your manufacturing requirements, routing constraints, or inspection parameters. Review the generated draft before applying it.'}
      </p>

      <form onSubmit={handleGenerate} className="space-y-3">
        <Textarea
          aria-label={target === 'FORM' ? 'Form requirements' : 'Workflow requirements'}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            target === 'LIFECYCLE'
              ? 'e.g. Sales confirms the request, Engineering approves, PPIC schedules production, technicians execute, QC inspects, then Warehouse delivers. Attach compatible published forms to each stage.'
              : target === 'WORKFLOW'
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
            {createMutation.isPending ? 'Generating…' : embedded ? 'Generate draft' : 'Generate with AI'}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <span className="small muted">Try an example:</span>
          {target === 'LIFECYCLE' ? <Button type="button" size="small" variant="soft" disabled={disabled || createMutation.isPending} onClick={() => setPrompt('Create an order-to-delivery lifecycle: Sales confirms requirements, Engineering approves the BOM and routing, PPIC plans capacity, Production executes, QC performs final inspection, then Warehouse confirms delivery. Use existing eligible department queues and compatible published forms.')} >Order to delivery</Button> : target === 'WORKFLOW' ? (
            <Button type="button" size="small" variant="soft" disabled={disabled || createMutation.isPending} onClick={() => setPrompt('Create a 3-step aluminum bracket route: rough cut, CNC milling requiring the verified machining skill and matching machine class, then dimensional inspection. Include realistic planned durations and predecessor dependencies.')}>CNC bracket route</Button>
          ) : (
            <Button type="button" size="small" variant="soft" disabled={disabled || createMutation.isPending} onClick={() => setPrompt('Create a paint inspection form with finish type, paint code required only when the finish is painted, and dry film thickness in microns.')}>Paint inspection form</Button>
          )}
        </div>
      </form>
    </Container>
  );
}
