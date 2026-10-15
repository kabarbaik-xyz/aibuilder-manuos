'use client';

import React, { useState } from 'react';
import { useFormInstance, useSaveFormDraft, useFinalizeFormSubmission, useCreateFormCorrection } from '../hooks';
import { FormRenderer } from './form-renderer';
import { Answers, FormIssue } from '@/domain/forms/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Panel } from '@/components/ui/panel';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';

export interface SubmissionPanelProps {
  instanceId: string;
  readOnly?: boolean;
}

export function SubmissionPanel({ instanceId, readOnly = false }: SubmissionPanelProps) {
  const { data: instanceRes, isLoading, error } = useFormInstance(instanceId);

  const saveDraftMutation = useSaveFormDraft(instanceId);
  const finalizeMutation = useFinalizeFormSubmission(instanceId);
  const correctionMutation = useCreateFormCorrection(instanceId);

  const [localAnswers, setLocalAnswers] = useState<Answers | null>(null);
  const [issues, setIssues] = useState<FormIssue[]>([]);
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [correctionReason, setCorrectionReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  if (isLoading) {
    return <div className="p-4 text-center text-sm text-muted">Loading form evidence…</div>;
  }

  if (error || !instanceRes?.data) {
    return (
      <div className="p-4 text-sm text-danger bg-danger-soft rounded-md">
        Failed to load form instance evidence.
      </div>
    );
  }

  const { instance, definition, latestSubmission } = instanceRes.data;
  const currentAnswers: Answers = localAnswers ?? (latestSubmission?.answers || {});
  const isFinalized = latestSubmission?.status === 'FINAL';

  const handleSaveDraft = async () => {
    setActionError(null);
    try {
      await saveDraftMutation.mutateAsync({
        expectedVersion: instance.version,
        answers: currentAnswers,
      });
      setIssues([]);
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  const handleFinalize = async () => {
    setActionError(null);
    try {
      await finalizeMutation.mutateAsync({
        expectedVersion: instance.version,
        answers: currentAnswers,
      });
      setIssues([]);
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  const handleCorrection = async () => {
    setActionError(null);
    if (!correctionReason.trim()) {
      setActionError('Correction reason is mandatory.');
      return;
    }
    try {
      await correctionMutation.mutateAsync({
        expectedVersion: instance.version,
        reason: correctionReason.trim(),
        answers: currentAnswers,
      });
      setIsCorrecting(false);
      setCorrectionReason('');
      setIssues([]);
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  return (
    <Panel>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div>
            <h3 className="text-sm font-bold text-ink">Supplemental Form Evidence</h3>
            <span className="text-xs text-muted">
              Subject: {instance.subjectType} · Version: v{definition.schemaVersion}
            </span>
          </div>

          <Badge
            variant={
              isFinalized
                ? 'success'
                : instance.status === 'DRAFT'
                ? 'blue'
                : 'default'
            }
          >
            {isFinalized ? 'Submitted & Final' : instance.status === 'DRAFT' ? 'Draft Saved' : 'Pending Evidence'}
          </Badge>
        </div>

        {actionError && (
          <div className="rounded-md border border-danger/20 bg-danger-soft p-3 text-sm text-danger">
            {actionError}
          </div>
        )}

        {isFinalized && !isCorrecting ? (
          <div className="space-y-4">
            <div className="rounded-md bg-surface-muted p-3 text-xs text-muted flex items-center justify-between">
              <span>
                Finalized at {new Date(latestSubmission.finalizedAt).toLocaleString()} by operator {latestSubmission.actorId}
              </span>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => setIsCorrecting(true)}
                  className="text-primary hover:underline font-medium"
                >
                  Propose Correction
                </button>
              )}
            </div>

            <FormRenderer
              definition={definition}
              value={currentAnswers}
              readOnly={true}
            />
          </div>
        ) : (
          <div className="space-y-4">
            {isCorrecting && (
              <div className="p-3 bg-warning-soft rounded-md border border-warning/20 space-y-2">
                <span className="text-xs font-bold text-warning uppercase block">
                  Authorizing Formal Evidence Correction
                </span>
                <FormField id="corr-reason" label="Correction Reason" required>
                  <Input
                    id="corr-reason"
                    value={correctionReason}
                    onChange={(e) => setCorrectionReason(e.target.value)}
                    placeholder="Specify why finalized evidence is being amended…"
                  />
                </FormField>
              </div>
            )}

            <FormRenderer
              definition={definition}
              value={currentAnswers}
              onChange={setLocalAnswers}
              issues={issues}
              readOnly={readOnly}
            />

            {!readOnly && (
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-line">
                {isCorrecting ? (
                  <>
                    <Button variant="default" onClick={() => setIsCorrecting(false)}>
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      onClick={handleCorrection}
                      disabled={correctionMutation.isPending}
                    >
                      {correctionMutation.isPending ? 'Submitting…' : 'Submit Correction'}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="default"
                      onClick={handleSaveDraft}
                      disabled={saveDraftMutation.isPending}
                    >
                      {saveDraftMutation.isPending ? 'Saving…' : 'Save draft'}
                    </Button>
                    <Button
                      variant="primary"
                      onClick={handleFinalize}
                      disabled={finalizeMutation.isPending}
                    >
                      {finalizeMutation.isPending ? 'Submitting…' : 'Finalize evidence'}
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}
