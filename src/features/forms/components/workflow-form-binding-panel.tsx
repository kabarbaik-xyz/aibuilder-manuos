'use client';

import { useMemo, useState } from 'react';
import { useWorkflowTemplates, useWorkflowVersion } from '@/features/workflows/hooks';
import { apiRequest } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';

export function WorkflowFormBindingPanel({ formVersionId }: { formVersionId: string }) {
  const workflows = useWorkflowTemplates();
  const [workflowVersionId, setWorkflowVersionId] = useState('');
  const [nodeKey, setNodeKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const versions = useMemo(() => (workflows.data ?? []).flatMap((template) =>
    (template.versions ?? []).filter((version) => version.status === 'DRAFT')
      .map((version) => ({ ...version, workflowName: template.name }))), [workflows.data]);
  const selected = versions.find((version) => version.id === workflowVersionId);
  const versionQuery = useWorkflowVersion(selected?.templateId ?? '', workflowVersionId);
  const nodes = versionQuery.data?.nodes ?? [];

  async function bind() {
    if (!workflowVersionId || !nodeKey || busy) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await apiRequest('/api/forms/bindings', {
        method: 'POST',
        body: JSON.stringify({ formVersionId, context: 'WORKFLOW_NODE', workflowVersionId, workflowNodeKey: nodeKey, required: true }),
      });
      setMessage('Form bound to workflow stage. This version will be used for tasks created from that workflow.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to bind form to workflow.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="form-section page-stack" aria-labelledby="workflow-form-binding-title">
      <div><h2 id="workflow-form-binding-title">Use in workflow</h2><p className="field-help">Select a published workflow and the receiving stage. New tasks at that stage will carry this form version.</p></div>
      {workflows.error ? <p className="text-sm text-danger">Workflow could not be loaded. Check Workflow Studio access.</p> : <div className="form-grid">
        <FormField id="form-binding-workflow" label="Workflow draft" help="Binding becomes permanent when the workflow version is published." required><Select value={workflowVersionId} onChange={(event) => { setWorkflowVersionId(event.target.value); setNodeKey(''); setMessage(null); setError(null); }} disabled={workflows.isPending || busy}><option value="">Select workflow draft…</option>{versions.map((version) => <option key={version.id} value={version.id}>{version.workflowName} · draft v{version.versionNumber}</option>)}</Select></FormField>
        <FormField id="form-binding-node" label="Workflow stage" required><Select value={nodeKey} onChange={(event) => setNodeKey(event.target.value)} disabled={!workflowVersionId || versionQuery.isPending || busy}><option value="">Select stage…</option>{nodes.map((node: any) => <option key={node.key} value={node.key}>{node.name} · {node.key}</option>)}</Select></FormField>
      </div>}
      {!workflows.isPending && !workflows.error && versions.length === 0 && <p className="field-help">No workflow drafts yet. Create a draft or fork a published version in Workflow Studio, then return to bind this form.</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {message && <p role="status" className="text-sm text-success">{message}</p>}
      <div><Button variant="primary" onClick={bind} disabled={!workflowVersionId || !nodeKey || busy || versionQuery.isPending}>{busy ? 'Saving…' : 'Bind form to draft stage'}</Button></div>
    </section>
  );
}
