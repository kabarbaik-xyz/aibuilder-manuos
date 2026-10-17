'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Panel } from '@/components/ui/panel';
import { Select } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { LoadingState } from '@/components/ui/resource-state';
import { apiRequest } from '@/lib/api/client';
import { ordersApi, type OrderDto } from '@/features/orders/api';

interface ProposalTask {
  taskId: string;
  version: number;
  nodeKey: string;
  predecessorTaskIds: string[];
  status: 'SCHEDULED' | 'UNSCHEDULED';
  startAt: string | null;
  endAt: string | null;
  technicianId: string | null;
  machineId: string | null;
  technicianName: string | null;
  machineName: string | null;
  reasons: string[];
}

interface ProposalResult {
  state: 'COMPLETE' | 'PARTIAL' | 'NO_FEASIBLE_TASKS' | 'NO_OPEN_TASKS';
  tasks: ProposalTask[];
  projectedEndAt: string | null;
  makespanMinutes: number;
  assumptions: string[];
  scope: { orderId: string; orderNumber: string; instanceId: string; facilityId: string | null; horizonStart: string; horizonEnd: string };
  evaluatedAt: string;
}

interface PromiseResult {
  state: 'EVALUATED' | 'NOT_CONNECTED';
  orderId: string;
  instanceId: string;
  requestedDate: string;
  feasibleDate: string | null;
  projectedEndAt: string | null;
  isFeasibleOnRequestedDate: boolean | null;
  deltaDays: number | null;
  scheduleState: string | null;
  bottleneckReason: string;
  missingInputs: string[];
  assumptions: string[];
  evidence: null | {
    facilityId: string | null;
    facilityTimezone: string | null;
    workflowVersionId: string;
    engineeringRevisionId: string;
    taskVersions: Array<{ taskId: string; version: number }>;
  };
}

type ActiveInstance = NonNullable<OrderDto['instances']>[number];

export function ScheduleProposalWorkbench() {
  const [open, setOpen] = useState(false);
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [instances, setInstances] = useState<ActiveInstance[]>([]);
  const [instanceId, setInstanceId] = useState('');
  const [horizonDays, setHorizonDays] = useState('14');
  const [proposal, setProposal] = useState<ProposalResult | null>(null);
  const [requestedDate, setRequestedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [promiseResult, setPromiseResult] = useState<PromiseResult | null>(null);
  const [promiseLoading, setPromiseLoading] = useState(false);
  const [promiseError, setPromiseError] = useState<string | null>(null);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [loadingInstances, setLoadingInstances] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedOrder = useMemo(() => orders.find((order) => order.id === selectedOrderId), [orders, selectedOrderId]);

  useEffect(() => {
    if (!open || orders.length) return;
    let active = true;
    setLoadingOrders(true);
    void ordersApi.listOrders()
      .then((rows) => { if (active) setOrders(rows.filter((row) => ['RELEASED', 'IN_PRODUCTION', 'PARTIALLY_DELIVERED'].includes(row.status))); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load released orders.'); })
      .finally(() => { if (active) setLoadingOrders(false); });
    return () => { active = false; };
  }, [open, orders.length]);

  async function selectOrder(orderId: string) {
    setSelectedOrderId(orderId);
    setInstances([]);
    setInstanceId('');
    setProposal(null);
    setPromiseResult(null);
    setPromiseError(null);
    setError(null);
    if (!orderId) return;
    setLoadingInstances(true);
    try {
      const order = await ordersApi.getOrder(orderId);
      const activeInstances = (order.instances ?? []).filter((instance) => instance.status === 'ACTIVE');
      setInstances(activeInstances);
      if (activeInstances.length === 1) setInstanceId(activeInstances[0].id);
      if (activeInstances.length === 0) setError('This order has no active released job to schedule.');
      if (activeInstances.length > 1) setError('Select the job to evaluate; each active job is assessed independently.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load the order jobs.');
    } finally {
      setLoadingInstances(false);
    }
  }

  async function generate() {
    if (!selectedOrderId || !instanceId || submitting) return;
    setSubmitting(true);
    setProposal(null);
    setError(null);
    try {
      const result = await apiRequest<{ data: ProposalResult }>('/api/planning/schedule-proposals', {
        method: 'POST',
        body: JSON.stringify({ orderId: selectedOrderId, instanceId, startHorizon: new Date().toISOString(), horizonDays: Number(horizonDays) }),
      });
      setProposal(result.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not generate a schedule proposal.');
    } finally {
      setSubmitting(false);
    }
  }

  async function evaluatePromise() {
    if (!selectedOrderId || !instanceId || promiseLoading) return;
    setPromiseLoading(true);
    setPromiseResult(null);
    setPromiseError(null);
    try {
      const result = await apiRequest<{ data: PromiseResult }>('/api/intelligence/promise', {
        method: 'POST',
        body: JSON.stringify({ orderId: selectedOrderId, instanceId, requestedDate }),
      });
      setPromiseResult(result.data);
    } catch (reason) {
      setPromiseError(reason instanceof Error ? reason.message : 'Could not evaluate the requested delivery date.');
    } finally {
      setPromiseLoading(false);
    }
  }

  return <>
    <Button variant="soft" onClick={() => { setError(null); setOpen(true); }}>Generate schedule proposal</Button>
    <Dialog isOpen={open} onClose={() => { if (!submitting) setOpen(false); }} title="Finite-capacity schedule proposal" subtitle="Dry-run using the selected job's released routing, BOM, facility, published roster and current bookings." size="lg" pending={submitting}>
      <div className="space-y-4">
        <p className="small muted">The facility comes from the order. This preview never writes bookings; publishing remains a separate, revalidated action.</p>
        {loadingOrders ? <LoadingState message="Loading released orders…" /> : orders.length === 0 ? <p className="small muted">No released orders are available for a schedule proposal.</p> : <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink" htmlFor="schedule-proposal-order">Order</label>
            <Select id="schedule-proposal-order" value={selectedOrderId} disabled={submitting} onChange={(event) => void selectOrder(event.target.value)}>
              <option value="">Select an order</option>
              {orders.map((order) => <option key={order.id} value={order.id}>{order.orderNumber} · {order.customer?.name ?? 'Customer'}</option>)}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink" htmlFor="schedule-proposal-instance">Active job</label>
            <Select id="schedule-proposal-instance" value={instanceId} disabled={!selectedOrderId || loadingInstances || submitting || instances.length <= 1} onChange={(event) => { setInstanceId(event.target.value); setProposal(null); }}>
              <option value="">{loadingInstances ? 'Loading jobs…' : 'Select a job'}</option>
              {instances.map((instance) => <option key={instance.id} value={instance.id}>Job {instance.id.slice(0, 8)}</option>)}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink" htmlFor="schedule-proposal-horizon">Planning horizon</label>
            <Select id="schedule-proposal-horizon" value={horizonDays} disabled={submitting} onChange={(event) => setHorizonDays(event.target.value)}>
              <option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option>
            </Select>
          </div>
          <div className="flex items-end justify-end">
            <Button variant="primary" disabled={!selectedOrder || !instanceId || loadingInstances || submitting} onClick={() => void generate()}>
              {submitting ? 'Evaluating…' : 'Evaluate schedule'}
            </Button>
          </div>
        </div>}

        {selectedOrder && instanceId && <Panel className="space-y-3 p-3">
          <div><p className="font-semibold">Check requested delivery date</p><p className="small muted">Uses the same schedule engine for this released job. It does not change the customer commitment.</p></div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-52"><label className="mb-1 block text-xs font-medium text-ink" htmlFor="promise-requested-date">Requested delivery</label><DatePicker id="promise-requested-date" value={requestedDate} onChange={(value) => { setRequestedDate(value); setPromiseResult(null); }} /></div>
            <Button variant="soft" disabled={promiseLoading || loadingInstances || submitting} onClick={() => void evaluatePromise()}>{promiseLoading ? 'Checking…' : 'Evaluate date'}</Button>
          </div>
          {promiseError && <p className="small text-danger" role="alert">{promiseError}</p>}
          {promiseResult && <div className="rounded-lg border border-line bg-surface-muted p-3">
            <div className="flex flex-wrap items-center gap-2"><Badge variant={promiseResult.state === 'EVALUATED' ? promiseResult.isFeasibleOnRequestedDate ? 'success' : 'warning' : 'danger'}>{promiseResult.state === 'EVALUATED' ? promiseResult.isFeasibleOnRequestedDate ? 'Feasible by requested date' : 'Finishes after requested date' : 'Insufficient schedule evidence'}</Badge><span className="small muted">Schedule: {promiseResult.scheduleState ?? 'unavailable'}</span></div>
            {promiseResult.feasibleDate && <p className="mt-2 text-sm text-ink">Projected completion: <strong>{promiseResult.feasibleDate}</strong> · facility timezone {promiseResult.evidence?.facilityTimezone ?? 'unavailable'}</p>}
            <p className="small muted mt-1">{promiseResult.bottleneckReason}</p>
            {promiseResult.missingInputs.map((reason) => <p key={reason} className="small text-danger mt-1">{reason}</p>)}
            {promiseResult.evidence && <p className="small muted mt-2">Workflow {promiseResult.evidence.workflowVersionId.slice(0, 8)} · engineering {promiseResult.evidence.engineeringRevisionId.slice(0, 8)} · {promiseResult.evidence.taskVersions.length} task versions assessed.</p>}
            <details className="mt-2"><summary className="small cursor-pointer">Assumptions</summary><ul className="mt-1 list-disc space-y-1 pl-5">{promiseResult.assumptions.map((assumption) => <li key={assumption} className="small muted">{assumption}</li>)}</ul></details>
          </div>}
        </Panel>}

        {error && <p role="alert" className="small text-danger">{error}</p>}
        {proposal && <div className="space-y-3">
          <Panel className="flex flex-wrap items-start justify-between gap-3 p-3">
            <div><p className="font-semibold">{proposal.scope.orderNumber} · Job {proposal.scope.instanceId.slice(0, 8)}</p><p className="small muted">Facility {proposal.scope.facilityId ?? 'not assigned'} · {proposal.scope.horizonStart.slice(0, 10)} to {proposal.scope.horizonEnd.slice(0, 10)}</p></div>
            <Badge variant={proposal.state === 'COMPLETE' ? 'success' : proposal.state === 'PARTIAL' || proposal.state === 'NO_OPEN_TASKS' ? 'warning' : 'danger'}>{proposal.state.replaceAll('_', ' ')}</Badge>
            <p className="small muted w-full">{proposal.tasks.filter((task) => task.status === 'SCHEDULED').length} of {proposal.tasks.length} tasks scheduled · finish {proposal.projectedEndAt ? new Date(proposal.projectedEndAt).toLocaleString() : 'not available'}</p>
          </Panel>
          {!proposal.tasks.length ? <p className="small muted">No open tasks are available for this job.</p> : <div className="max-h-[40vh] space-y-2 overflow-auto">
            {proposal.tasks.map((task) => <article key={task.taskId} className="rounded-lg border border-line bg-surface p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{task.nodeKey} · v{task.version}</strong><Badge variant={task.status === 'SCHEDULED' ? 'success' : 'warning'}>{task.status}</Badge></div>
              <p className="small muted mt-1">{task.startAt ? new Date(task.startAt).toLocaleString() : 'No time'} – {task.endAt ? new Date(task.endAt).toLocaleString() : 'No time'}</p>
              {task.predecessorTaskIds.length > 0 && <p className="small muted mt-1">After: {task.predecessorTaskIds.map((id) => id.slice(0, 8)).join(', ')}</p>}
              {(task.technicianId || task.machineId) && <p className="small muted mt-1">Technician {task.technicianName ?? '—'} · Machine {task.machineName ?? '—'}</p>}
              {task.reasons.map((reason) => <p key={reason} className="small text-danger mt-1">{reason}</p>)}
            </article>)}
          </div>}
          <div className="rounded-lg border border-line bg-surface-muted p-3"><p className="small font-semibold">Assumptions</p><ul className="mt-1 list-disc space-y-1 pl-5">{proposal.assumptions.map((assumption) => <li key={assumption} className="small muted">{assumption}</li>)}</ul></div>
        </div>}
        <div className="flex justify-end border-t border-line pt-3"><Button onClick={() => setOpen(false)} disabled={submitting}>Close</Button></div>
      </div>
    </Dialog>
  </>;
}
