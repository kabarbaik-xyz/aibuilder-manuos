'use client';

import Link from 'next/link';
import { jobLabel } from '@/features/orders/job-label';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/resource-state';
import { Select } from '@/components/ui/select';
import { apiRequest } from '@/lib/api/client';
import { ordersApi, type OrderDto } from '@/features/orders/api';
import { proposeRecovery } from '@/features/recovery/api';
import type { RecoveryProposalDTO, ScheduleRecoveryReviewResult } from '@/server/modules/intelligence/recovery-contracts';

type RecoveryItem = { id: string; orderId: string; orderNumber: string; orderStatus: string; status: string; createdAt: string; approverName: string | null; approverJobTitle: string | null; isCurrentApprover: boolean; proposal: RecoveryProposalDTO | null };
type RecoveryPage = { items: RecoveryItem[]; page: number; pageSize: number; total: number; pageCount: number };
type ActiveInstance = NonNullable<OrderDto['instances']>[number];

export function RecoveryInbox() {
  const [status, setStatus] = useState('');
  const [data, setData] = useState<RecoveryPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [instances, setInstances] = useState<ActiveInstance[]>([]);
  const [instanceId, setInstanceId] = useState('');
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [proposalResult, setProposalResult] = useState<ScheduleRecoveryReviewResult | null>(null);
  const [proposalError, setProposalError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const query = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (status) query.set('status', status);
    try {
      const result = await apiRequest<{ data: RecoveryPage }>(`/api/intelligence/recovery?${query}`);
      setData(result.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load saved proposals.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [page, status]);

  useEffect(() => {
    let active = true;
    void ordersApi.listOrders()
      .then((rows) => { if (active) setOrders(rows.filter((row) => ['RELEASED', 'IN_PRODUCTION', 'PARTIALLY_DELIVERED'].includes(row.status))); })
      .catch((cause: unknown) => { if (active) setProposalError(cause instanceof Error ? cause.message : 'Unable to load released orders.'); })
      .finally(() => { if (active) setLoadingOrders(false); });
    return () => { active = false; };
  }, []);

  async function selectOrder(orderId: string) {
    setSelectedOrderId(orderId);
    setInstances([]);
    setInstanceId('');
    setProposalResult(null);
    setProposalError(null);
    if (!orderId) return;
    setLoadingJobs(true);
    try {
      const order = await ordersApi.getOrder(orderId);
      setOrders(rows => rows.map(row => row.id === order.id ? order : row));
      const activeInstances = (order.instances ?? []).filter((instance) => instance.status === 'ACTIVE');
      setInstances(activeInstances);
      if (activeInstances.length === 1) setInstanceId(activeInstances[0].id);
      if (!activeInstances.length) setProposalError('This order has no active released job.');
      if (activeInstances.length > 1) setProposalError('Select the exact active job to review.');
    } catch (cause) {
      setProposalError(cause instanceof Error ? cause.message : 'Could not load active jobs.');
    } finally {
      setLoadingJobs(false);
    }
  }

  async function generateReview() {
    if (!selectedOrderId || !instanceId || proposing) return;
    setProposing(true);
    setProposalError(null);
    setProposalResult(null);
    try {
      const result = await proposeRecovery({ orderId: selectedOrderId, instanceId });
      setProposalResult(result);
      if (result.state === 'SAVED') await load();
    } catch (cause) {
      setProposalError(cause instanceof Error ? cause.message : 'Could not create a recovery schedule review.');
    } finally {
      setProposing(false);
    }
  }

  return <div className="page-stack">
    <section className="rounded-xl border border-line bg-surface p-4">
      <h2 className="font-semibold">Create schedule review</h2>
      <p className="small muted mt-1">Saves a qualified finite-capacity schedule and any complete alternate-machine schedules for supervisor review. Estimates use configured machine rates; no shipment allocation, booking, or customer commitment is inferred.</p>
      {loadingOrders ? <LoadingState message="Loading released orders…" /> : <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div><label className="mb-1 block text-xs font-medium text-ink" htmlFor="recovery-order">Order</label><Select id="recovery-order" value={selectedOrderId} disabled={proposing} onChange={(event) => void selectOrder(event.target.value)}><option value="">Select an order</option>{orders.map((order) => <option key={order.id} value={order.id}>{order.orderNumber} · {order.customer?.name ?? 'Customer'}</option>)}</Select></div>
        <div><label className="mb-1 block text-xs font-medium text-ink" htmlFor="recovery-job">Active job</label><Select id="recovery-job" value={instanceId} disabled={!selectedOrderId || loadingJobs || proposing || instances.length <= 1} onChange={(event) => { setInstanceId(event.target.value); setProposalResult(null); }}><option value="">{loadingJobs ? 'Loading jobs…' : 'Select a job'}</option>{instances.map((instance, index) => <option key={instance.id} value={instance.id}>{jobLabel(orders.find(order => order.id === selectedOrderId), instance, index)}</option>)}</Select></div>
        <Button variant="primary" disabled={!selectedOrderId || !instanceId || proposing || loadingJobs} onClick={() => void generateReview()}>{proposing ? 'Evaluating…' : 'Generate review'}</Button>
      </div>}
      {proposalError && <p role="alert" className="small text-danger mt-2">{proposalError}</p>}
      {proposalResult?.state === 'NOT_CONNECTED' && <div className="mt-3 rounded-lg border border-line bg-surface-muted p-3"><p className="small font-medium">No complete schedule; nothing was saved.</p><p className="small muted mt-1">Schedule state: {proposalResult.scheduleState}</p>{proposalResult.missingInputs.map((reason) => <p key={reason} className="small text-danger mt-1">{reason}</p>)}</div>}
      {proposalResult?.state === 'SAVED' && <p className="small text-success mt-3">Review saved: <Link className="text-primary hover:underline" href={`/ai/recovery/${proposalResult.id}`}>open schedule evidence</Link>. Applying it revalidates and commits the exact reviewed assignments as one transaction.</p>}
    </section>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="small muted">Open a saved schedule review to inspect its evidence and apply the reviewed assignments. Historical simulations cannot be applied.</p>
      <div className="w-full sm:w-56"><label className="sr-only" htmlFor="recovery-status">Filter proposals by status</label><Select id="recovery-status" value={status} onChange={event => { setPage(1); setStatus(event.target.value); }}><option value="">All statuses</option><option value="PROPOSED">Proposed</option><option value="REJECTED">Rejected</option><option value="APPROVED">Approved</option><option value="SUPERSEDED">Superseded</option></Select></div>
    </div>
    {loading ? <LoadingState message="Loading saved recovery proposals…" /> : error ? <ErrorState title="Unable to load recovery proposals" message={error} onRetry={() => void load()} /> : !data?.items.length ? <EmptyState title="No saved proposals" description="Recovery proposals created from an order will appear here for review." kind="no-results" /> : <div className="grid gap-3">
      {data.items.map(item => <article key={item.id} className="rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="font-semibold"><Link className="text-primary hover:underline" href={`/ai/recovery/${item.id}`}>Proposal for {item.orderNumber}</Link></h2><p className="small muted mt-1">Order status: {item.orderStatus} · Created {new Date(item.createdAt).toLocaleString()}</p></div>
          <Badge variant={item.status === 'PROPOSED' ? 'warning' : 'default'}>{item.status}</Badge>
        </div>
        {item.proposal ? <p className="small muted mt-3">{item.proposal.mode === 'SCHEDULE_REVIEW' ? `Schedule review · projected job completion ${item.proposal.scheduleReview?.projectedEndAt ?? 'unavailable'}` : `${item.proposal.options.length} historical simulated options · delayed-date estimate ${item.proposal.projectedDelayedDate ?? 'unavailable'}`}</p> : <p className="small text-warning mt-3">Saved proposal details need review before they can be displayed.</p>}
        <p className="small muted mt-2">Supervisor: {item.approverName ? `${item.approverName}${item.approverJobTitle ? ` · ${item.approverJobTitle}` : ''}` : 'Not assigned'}{item.isCurrentApprover ? ' · yours to review' : ''}</p>
      </article>)}
    </div>}
    {data && data.pageCount > 1 && <div className="flex items-center justify-between"><span className="small muted">Page {data.page} of {data.pageCount} · {data.total} proposals</span><div className="flex gap-2"><Button disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}>Previous</Button><Button disabled={page >= data.pageCount || loading} onClick={() => setPage(value => value + 1)}>Next</Button></div></div>}
  </div>;
}
