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
  currentDefinition?: unknown;
}

export function ProposalReview({
  proposal,
  onApplied,
  onDiscard,
  expectedTargetRevision,
  currentDefinition,
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
  let candidate: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(proposal.candidateJson);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) candidate = parsed as Record<string, unknown>;
  } catch {
    candidate = null;
  }
  const current = currentDefinition && typeof currentDefinition === 'object' ? currentDefinition as Record<string, unknown> : {};
  const nodeProperty = proposal.target === 'LIFECYCLE' ? 'stages' : 'nodes';
  const candidateRows = proposal.target === 'FORM'
    ? (Array.isArray(candidate?.fields) ? candidate.fields : []).filter((value): value is Record<string, unknown> => Boolean(value && typeof value === 'object'))
    : (Array.isArray(candidate?.[nodeProperty]) ? candidate[nodeProperty] : []).filter((value): value is Record<string, unknown> => Boolean(value && typeof value === 'object'));
  const currentRows = proposal.target === 'FORM'
    ? (Array.isArray(current.fields) ? current.fields : []).filter((value): value is Record<string, unknown> => Boolean(value && typeof value === 'object'))
    : (Array.isArray(current[nodeProperty]) ? current[nodeProperty] : []).filter((value): value is Record<string, unknown> => Boolean(value && typeof value === 'object'));
  const rowKey = (row: Record<string, unknown>) => String(row.key ?? '');
  const removedRows = currentRows.filter(row => !candidateRows.some(candidateRow => rowKey(candidateRow) === rowKey(row)));
  const edges = Array.isArray(candidate?.edges) ? candidate.edges.filter((edge): edge is Record<string, unknown> => Boolean(edge && typeof edge === 'object')) : [];

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

      <section className="space-y-3" aria-labelledby="proposal-readable-title">
        <div><h3 id="proposal-readable-title" className="text-sm font-semibold text-ink">{proposal.target === 'FORM' ? 'Proposed form fields' : 'Proposed workflow steps'}</h3><p className="small muted">Compare the generated draft with this editor revision before applying.</p></div>
        {!candidate ? <p role="alert" className="small text-danger">The generated draft could not be read. Applying is disabled.</p> : candidateRows.length === 0 ? <p className="small muted">No {proposal.target === 'FORM' ? 'fields' : 'steps'} were proposed.</p> : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {candidateRows.map((row, index) => {
              const key = rowKey(row);
              const previous = currentRows.find(value => rowKey(value) === key);
              const change = !previous ? 'Added' : JSON.stringify(previous) === JSON.stringify(row) ? 'Unchanged' : 'Changed';
              const details = proposal.target === 'LIFECYCLE'
                ? `${String(row.action ?? '').replaceAll('_', ' ')} · ${proposal.referenceLabels?.[String(row.departmentId)] ?? 'Department unavailable'} · ${row.assignment && typeof row.assignment === 'object' && (row.assignment as Record<string, unknown>).kind === 'MEMBER' ? proposal.referenceLabels?.[String((row.assignment as Record<string, unknown>).membershipId)] ?? 'Assigned person' : 'Department queue'} · ${Array.isArray(row.forms) ? row.forms.length : 0} form(s)${Array.isArray(row.predecessors) && row.predecessors.length ? ` · Starts after: ${row.predecessors.map(key => String(candidateRows.find(stage => rowKey(stage) === key)?.name ?? key)).join(', ')}` : ' · First stage'}`
                : proposal.target === 'FORM'
                ? `${String(row.kind ?? 'field')} · ${row.required ? 'Required' : 'Optional'}${Array.isArray(row.options) ? ` · Options: ${row.options.map(option => typeof option === 'object' && option ? String((option as Record<string, unknown>).label ?? (option as Record<string, unknown>).value ?? '') : '').filter(Boolean).join(', ')}` : ''}${row.visibleWhen && typeof row.visibleWhen === 'object' ? ` · Conditional visibility: ${String((row.visibleWhen as Record<string, unknown>).fieldKey ?? 'rule')}` : ''}`
                : `${String(row.type ?? 'step')} · ${typeof row.plannedDurationMinutes === 'number' ? `${row.plannedDurationMinutes} planned minutes` : 'duration unavailable'}${row.requirements && typeof row.requirements === 'object' ? ` · Requirements: ${Object.entries(row.requirements as Record<string, unknown>).map(([name, value]) => `${name} ${Array.isArray(value) ? value.map(entry => typeof entry === 'object' && entry ? String((entry as Record<string, unknown>).skillId ?? (entry as Record<string, unknown>).id ?? '') : String(entry)).filter(Boolean).join(', ') : String(value)}`).join('; ')}` : ''}`;
              return <li key={`${key}:${index}`} className="flex flex-wrap items-start justify-between gap-2 p-3"><div><strong className="text-sm text-ink">{String(row.label ?? row.name ?? key ?? `Entry ${index + 1}`)}</strong><span className="ml-2 font-mono text-xs text-muted">{key}</span><p className="small muted mt-1">{details}</p></div><Badge variant={change === 'Added' ? 'blue' : change === 'Changed' ? 'warning' : 'default'}>{change}</Badge></li>;
            })}
          </ul>
        )}
        {removedRows.length > 0 && <div className="rounded-lg border border-warning/30 bg-warning-soft p-3"><h4 className="small font-semibold text-ink">Removed from this revision</h4><ul className="small mt-1 list-disc pl-5">{removedRows.map(row => <li key={rowKey(row)}>{String(row.label ?? row.name ?? rowKey(row))} <span className="muted">({rowKey(row)})</span></li>)}</ul></div>}
        {proposal.target === 'WORKFLOW' && edges.length > 0 && <div><h4 className="small font-semibold text-ink">Proposed dependencies</h4><ul className="small mt-1 space-y-1">{edges.map((edge, index) => <li key={index}>{String(edge.fromNodeKey ?? '?')} → {String(edge.toNodeKey ?? '?')} · {String(edge.joinPolicy ?? 'AND')}</li>)}</ul></div>}
        {proposal.questions.length > 0 && <div className="rounded-lg border border-warning/30 bg-warning-soft p-3"><h4 className="small font-semibold text-ink">Questions to resolve</h4><ul className="small mt-1 list-disc pl-5">{proposal.questions.map((question, index) => <li key={index}>{question}</li>)}</ul></div>}
      </section>
      <details className="rounded-lg border border-line">
        <summary className="cursor-pointer p-3 text-xs font-medium text-muted">Show raw candidate JSON</summary>
        {candidate && <pre className="max-h-40 overflow-y-auto border-t border-line bg-surface-muted p-3 font-mono text-xs text-ink">{JSON.stringify(candidate, null, 2)}</pre>}
      </details>

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
            disabled={!acknowledged || hasErrors || applyMutation.isPending || !candidate}
          >
            {applyMutation.isPending ? 'Applying Draft…' : 'Apply Reviewed Candidate to Draft'}
          </Button>
        </div>
      </div>
    </Panel>
  );
}
