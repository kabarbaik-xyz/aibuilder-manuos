'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { ErrorState, LoadingState } from '@/components/ui/resource-state';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '@/lib/api/client';
import { useWorkspaceNavigation } from '@/components/workspace-navigation-context';
import type { RecoveryProposalDTO } from '@/server/modules/intelligence/recovery-contracts';

type RecoveryItem = { id: string; orderId: string; orderNumber: string; orderStatus: string; status: string; orderVersion: number; createdAt: string; resolvedAt: string | null; resolutionNote: string | null; approverName: string | null; approverJobTitle: string | null; isCurrentApprover: boolean; proposal: RecoveryProposalDTO | null };

export function RecoveryProposalDetail({ id }: { id: string }) {
  const { principal } = useWorkspaceNavigation();
  const [data, setData] = useState<RecoveryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [dateRequestSubmitted, setDateRequestSubmitted] = useState(false);
  const [applied, setApplied] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await apiRequest<{ data: RecoveryItem }>(`/api/intelligence/recovery/${id}`);
      setData(result.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load this proposal.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [id]);

  async function reject() {
    if (!note.trim() || pending) return;
    setPending(true);
    setError(null);
    try {
      await apiRequest(`/api/intelligence/recovery/${id}/reject`, { method: 'POST', body: JSON.stringify({ note: note.trim() }) });
      setRejectOpen(false);
      setNote('');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not reject this proposal.');
    } finally {
      setPending(false);
    }
  }

  async function requestDateReview() {
    if (!data || pending) return;
    setPending(true);
    setError(null);
    try {
      await apiRequest(`/api/intelligence/recovery/${id}/request-date`, {
        method: 'POST',
        headers: { 'Idempotency-Key': `recovery-date-${id}` },
      });
      setDateRequestSubmitted(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not submit the projected date for review.');
    } finally {
      setPending(false);
    }
  }

  async function applySchedule() {
    if (!data || pending) return;
    setPending(true);
    setError(null);
    try {
      await apiRequest(`/api/intelligence/recovery/${id}/apply`, {
        method: 'POST',
        headers: { 'Idempotency-Key': `recovery-apply-${id}` },
      });
      setApplied(true);
      setApplyOpen(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The reviewed schedule could not be applied.');
    } finally {
      setPending(false);
    }
  }

  if (loading) return <LoadingState message="Loading proposal evidence…" />;
  if (error && !data) return <ErrorState title="Unable to load recovery proposal" message={error} onRetry={() => void load()} />;
  if (!data) return null;
  const canReject = data.status === 'PROPOSED' && data.isCurrentApprover;
  const canResolve = Boolean(principal?.permissions.some(permission => ['planning.write', 'order.release'].includes(permission)) && principal?.permissions.some(permission => ['planning.read', 'task.assign'].includes(permission)));
  const canApply = Boolean(data.isCurrentApprover && principal?.permissions.some(permission => ['planning.write', 'task.assign'].includes(permission)));

  return <div className="page-stack">
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Proposal for {data.orderNumber}</h2><p className="small muted mt-1">Created {new Date(data.createdAt).toLocaleString()} · order version {data.orderVersion}</p></div><Badge variant={data.status === 'PROPOSED' ? 'warning' : 'default'}>{data.status}</Badge></div>
      <p className="small mt-3">Source order: <Link className="text-primary hover:underline" href={`/orders/${data.orderId}`}>{data.orderNumber}</Link> · current status {data.orderStatus}</p>
      <p className="small muted mt-2">Recovery approval: {data.approverName ? `${data.approverName}${data.approverJobTitle ? ` · ${data.approverJobTitle}` : ''}` : 'No active supervisor was recorded'}{data.isCurrentApprover ? ' · assigned to you' : ''}</p>
      {data.proposal?.mode === 'SCHEDULE_REVIEW' && data.proposal.scheduleReview ? <div className="mt-4 grid gap-3 sm:grid-cols-2"><p>Projected job completion: <strong>{new Date(data.proposal.scheduleReview.projectedEndAt).toLocaleString()}</strong></p><p>Facility timezone: <strong>{data.proposal.scheduleReview.facilityTimezone ?? 'Not recorded'}</strong></p><p>Workflow version: <strong>{data.proposal.scheduleReview.workflowVersionId}</strong></p><p>Engineering revision: <strong>{data.proposal.scheduleReview.engineeringRevisionId}</strong></p><p>Assessed tasks: <strong>{data.proposal.scheduleReview.tasks.length}</strong></p><p>Evaluated: <strong>{new Date(data.proposal.scheduleReview.evaluatedAt).toLocaleString()}</strong></p><p>Current schedule machine cost: <strong>{data.proposal.scheduleReview.machineCostEstimate?.status === 'COMPLETE' && data.proposal.scheduleReview.machineCostEstimate.totalMinorUnits !== null ? `${data.proposal.scheduleReview.machineCostEstimate.currency} ${data.proposal.scheduleReview.machineCostEstimate.totalMinorUnits.toLocaleString()}` : data.proposal.scheduleReview.machineCostEstimate?.status === 'PARTIAL' ? 'Partial; one or more machine rates are unknown' : 'Unavailable'}</strong></p></div> : data.proposal ? <div className="mt-4 grid gap-3 sm:grid-cols-2"><p>Ordered quantity: <strong>{data.proposal.totalQty ?? 'Not recorded'}</strong></p><p>Final-QC-passed quantity: <strong>{data.proposal.readyQcPassedQty ?? 'Not recorded'}</strong></p><p>Original commitment: <strong>{data.proposal.originalPromisedDate ?? 'Not recorded'}</strong></p><p>Simulated delayed date: <strong>{data.proposal.projectedDelayedDate ?? 'Not recorded'}</strong></p></div> : <p className="small text-warning mt-4">This saved proposal has no readable simulation details.</p>}
    </section>
    {data.proposal?.mode === 'SCHEDULE_REVIEW' && data.proposal.scheduleReview && <section className="page-stack"><h2 className="font-semibold">Finite-capacity schedule snapshot</h2><p className="small muted">Applying the schedule rechecks current versions, material readiness, qualifications, dependencies, and published availability in one transaction.</p><div className="space-y-2">{data.proposal.scheduleReview.tasks.map(task => <article key={task.taskId} className="rounded-lg border border-line bg-surface p-3"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{task.nodeKey} · v{task.version}</strong><span className="small muted">Task {task.taskId.slice(0, 8)}</span></div><p className="small muted mt-1">{task.startAt ? new Date(task.startAt).toLocaleString() : 'No start'} – {task.endAt ? new Date(task.endAt).toLocaleString() : 'No finish'}</p><p className="small muted mt-1">Technician {task.technicianName ?? '—'} · Machine {task.machineName ?? '—'}</p>{task.predecessorTaskIds.length > 0 && <p className="small muted mt-1">After {task.predecessorTaskIds.map(value => value.slice(0, 8)).join(', ')}</p>}</article>)}</div><div className="rounded-lg border border-line bg-surface-muted p-3"><h3 className="small font-semibold">Assumptions</h3><ul className="mt-1 list-disc space-y-1 pl-5">{data.proposal.scheduleReview.assumptions.map(item => <li key={item} className="small muted">{item}</li>)}</ul></div></section>}
    {data.proposal && data.proposal.mode !== 'SCHEDULE_REVIEW' && <section className="page-stack"><h2 className="font-semibold">Historical simulation options</h2><p className="small muted">Simulation only. Dates and allocations are not a published schedule, shipment reservation, or committed promise.</p>{data.proposal.options.map(option => <article key={option.id} className="rounded-xl border border-line bg-surface p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{option.title}</h3><Badge variant={option.feasible ? 'warning' : 'default'}>{option.feasible ? 'Model candidate · review required' : 'Not feasible in model'}</Badge></div><p className="small muted mt-2">{option.description}</p>{option.infeasibleReason && <p className="small text-danger mt-2">{option.infeasibleReason}</p>}{option.allocation && <p className="small mt-2">Simulated allocation: {option.allocation.tranche1Qty} units on {option.allocation.tranche1Date}; {option.allocation.tranche2Qty} units on {option.allocation.tranche2Date}.</p>}<p className="small muted mt-2">Cost impact is not available as measured evidence.</p></article>)}</section>}
    {['REJECTED', 'APPROVED'].includes(data.status) && <p className="small muted">{data.status === 'APPROVED' ? 'Applied' : 'Rejected'} {data.resolvedAt ? `on ${new Date(data.resolvedAt).toLocaleString()}` : ''}{data.resolutionNote ? ` · ${data.resolutionNote}` : ''}</p>}
    {error && <p role="alert" className="small text-danger">{error}</p>}
    {data.status === 'PROPOSED' && data.proposal?.mode === 'SCHEDULE_REVIEW' && <p className="small muted">Applying this reviewed schedule assigns the listed tasks and confirms resource bookings. It does not change the customer delivery commitment or reserve shipment quantities.</p>}
    <div className="flex flex-wrap justify-end gap-2">
      {data.status === 'PROPOSED' && canResolve && data.proposal?.mode === 'SCHEDULE_REVIEW' && data.proposal.scheduleReview && <Button variant="soft" disabled={pending || dateRequestSubmitted} onClick={() => void requestDateReview()}>{dateRequestSubmitted ? 'Date request submitted for review' : pending ? 'Rechecking schedule…' : 'Request projected date review'}</Button>}
      {data.status === 'PROPOSED' && canApply && data.proposal?.mode === 'SCHEDULE_REVIEW' && data.proposal.scheduleReview && <Button disabled={pending} onClick={() => setApplyOpen(true)}>{applied ? 'Schedule applied' : 'Approve and apply schedule'}</Button>}
      {canReject && canResolve && <Button className="text-danger" onClick={() => setRejectOpen(true)}>Reject proposal</Button>}
    </div>
    <Dialog isOpen={rejectOpen} onClose={() => setRejectOpen(false)} title="Reject recovery proposal" subtitle="This records a review decision. It does not change the order schedule or shipment." size="sm" pending={pending} dirty={Boolean(note)} footer={<><Button disabled={pending} onClick={() => setRejectOpen(false)}>Cancel</Button><Button className="text-danger" disabled={pending || !note.trim()} onClick={() => void reject()}>{pending ? 'Rejecting…' : 'Reject proposal'}</Button></>}>
      <label className="mb-2 block text-sm font-medium" htmlFor="recovery-rejection-note">Reason for rejection</label><Textarea id="recovery-rejection-note" value={note} maxLength={1000} onChange={event => setNote(event.target.value)} placeholder="Record why this proposal was rejected…" />
    </Dialog>
    <Dialog isOpen={applyOpen} onClose={() => setApplyOpen(false)} title="Apply reviewed schedule" subtitle="ManuOS will revalidate and assign every task in this saved proposal as one transaction." size="sm" pending={pending} footer={<><Button disabled={pending} onClick={() => setApplyOpen(false)}>Cancel</Button><Button disabled={pending} onClick={() => void applySchedule()}>{pending ? 'Revalidating and applying…' : 'Confirm and apply'}</Button></>}>
      <p className="small muted">This applies {data.proposal?.scheduleReview?.tasks.length ?? 0} reviewed task assignments and creates confirmed technician or machine bookings. If any task is stale, unqualified, unavailable, dependency-blocked, or missing issued/reserved material, the entire application is cancelled.</p>
    </Dialog>
  </div>;
}
