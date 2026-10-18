'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Panel } from '@/components/ui/panel';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { LoadingState } from '@/components/ui/resource-state';
import { apiRequest } from '@/lib/api/client';
import { ordersApi, type OrderDto } from '@/features/orders/api';
import { formatQuantity } from '@/domain/quantity';
import Link from 'next/link';
import { jobLabel } from '@/features/orders/job-label';
import { Icon } from '@/components/icons';
import { getPromiseDateDeltaLabel } from '@/features/promise/promise-presentation';
import { getSchedulePredecessorLabels, getSchedulePromiseImpact } from '@/features/planning/schedule-proposal-presentation';
import { useQueryClient } from '@tanstack/react-query';

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
  scope: { orderId: string; orderNumber: string; orderVersion: number; instanceId: string; workflowVersionId: string; engineeringRevisionId: string; facilityId: string | null; horizonStart: string; horizonEnd: string };
  evaluatedAt: string;
}

interface PromiseResult {
  state: 'EVALUATED' | 'NOT_CONNECTED';
  evaluationId: string;
  inputHash: string;
  evaluatedAt: string;
  orderId: string;
  instanceId: string;
  requestedQuantity: string;
  quantityUom: string | null;
  requestedDate: string;
  feasibleDate: string | null;
  projectedEndAt: string | null;
  isFeasibleOnRequestedDate: boolean | null;
  deltaDays: number | null;
  scheduleState: string | null;
  bottleneckReason: string;
  missingInputs: string[];
  assumptions: string[];
  componentReadiness: Array<{
    itemId: string;
    itemCode: string;
    itemName: string;
    quantityUom: string;
    requiredAtoms: string;
    issuedAtoms: string;
    reservedAtoms: string;
    availableRawAtoms: string;
    state: 'ISSUED' | 'RESERVED' | 'UNALLOCATED';
    confirmedSupply: Array<{ supplyOrderId: string; supplyOrderNumber: string; supplierName: string; expectedDate: string; remainingAtoms: string }>;
  }>;
  evidence: null | {
    facilityId: string | null;
    facilityTimezone: string | null;
    workflowVersionId: string;
    engineeringRevisionId: string;
    taskVersions: Array<{ taskId: string; version: number }>;
  };
}

type ActiveInstance = NonNullable<OrderDto['instances']>[number];

export function ScheduleProposalWorkbench({ initialOpen = false }: { initialOpen?: boolean } = {}) {
  const [open, setOpen] = useState(initialOpen);
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [instances, setInstances] = useState<ActiveInstance[]>([]);
  const [instanceId, setInstanceId] = useState('');
  const [horizonDays, setHorizonDays] = useState('14');
  const [proposal, setProposal] = useState<ProposalResult | null>(null);
  const [requestedDate, setRequestedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [requestedQuantity, setRequestedQuantity] = useState('');
  const [promiseResult, setPromiseResult] = useState<PromiseResult | null>(null);
  const [promiseLoading, setPromiseLoading] = useState(false);
  const [promiseError, setPromiseError] = useState<string | null>(null);
  const [requestingDateChange, setRequestingDateChange] = useState(false);
  const [dateChangeRequestId, setDateChangeRequestId] = useState<string | null>(null);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [loadingInstances, setLoadingInstances] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [applyingProposal, setApplyingProposal] = useState(false);
  const [confirmApply, setConfirmApply] = useState(false);
  const [applyResult, setApplyResult] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applyIdempotencyKey, setApplyIdempotencyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

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
    setRequestedQuantity('');
    setPromiseError(null);
    setDateChangeRequestId(null);
    setError(null);
    if (!orderId) return;
    setLoadingInstances(true);
    try {
      const order = await ordersApi.getOrder(orderId);
      setOrders(rows => rows.map(row => row.id === order.id ? order : row));
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
    setApplyResult(null);
    setApplyError(null);
    setConfirmApply(false);
    setApplyIdempotencyKey(null);
    setError(null);
    setDateChangeRequestId(null);
    try {
      const result = await apiRequest<{ data: ProposalResult }>('/api/planning/schedule-proposals', {
        method: 'POST',
        body: JSON.stringify({ orderId: selectedOrderId, instanceId, startHorizon: new Date(Date.now() + 5 * 60_000).toISOString(), horizonDays: Number(horizonDays) }),
      });
      setProposal(result.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not generate a schedule proposal.');
    } finally {
      setSubmitting(false);
    }
  }

  async function evaluatePromise() {
    if (!selectedOrderId || !instanceId || !requestedQuantity.trim() || promiseLoading) return;
    setPromiseLoading(true);
    setPromiseResult(null);
    setPromiseError(null);
    setDateChangeRequestId(null);
    try {
      const result = await apiRequest<{ data: PromiseResult }>('/api/intelligence/promise', {
        method: 'POST',
        body: JSON.stringify({ orderId: selectedOrderId, instanceId, requestedQuantity: requestedQuantity.trim(), requestedDate }),
      });
      setPromiseResult(result.data);
    } catch (reason) {
      setPromiseError(reason instanceof Error ? reason.message : 'Could not evaluate the requested delivery date.');
    } finally {
      setPromiseLoading(false);
    }
  }

  async function requestPromiseDateChange() {
    if (!promiseResult || promiseResult.state !== 'EVALUATED' || promiseResult.isFeasibleOnRequestedDate !== true || requestingDateChange) return;
    setRequestingDateChange(true);
    setPromiseError(null);
    try {
      const response = await ordersApi.createChangeRequest(promiseResult.orderId, {
        changeType: 'DATE',
        reason: `Requested after CoreAI finite-capacity estimate ${promiseResult.evaluationId}.`,
        requestedChanges: { requestedDate: promiseResult.requestedDate },
      });
      setDateChangeRequestId(response.data.id);
    } catch (reason) {
      setPromiseError(reason instanceof Error ? reason.message : 'Could not submit the date change request.');
    } finally {
      setRequestingDateChange(false);
    }
  }

  async function applyReviewedProposal() {
    if (!proposal || proposal.state !== 'COMPLETE' || applyingProposal) return;
    setApplyingProposal(true);
    setApplyError(null);
    const key = applyIdempotencyKey ?? crypto.randomUUID();
    setApplyIdempotencyKey(key);
    try {
      const result = await apiRequest<{ data: { state: 'APPLIED'; appliedTaskIds: string[] } }>('/api/planning/schedule-proposals/apply', {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        body: JSON.stringify({
          orderId: proposal.scope.orderId,
          instanceId: proposal.scope.instanceId,
          startHorizon: proposal.scope.horizonStart,
          horizonDays: Math.min(30, Math.max(1, Math.ceil((new Date(proposal.scope.horizonEnd).getTime() - new Date(proposal.scope.horizonStart).getTime()) / 86_400_000))),
          expected: {
            orderVersion: proposal.scope.orderVersion,
            workflowVersionId: proposal.scope.workflowVersionId,
            engineeringRevisionId: proposal.scope.engineeringRevisionId,
            tasks: proposal.tasks.map(({ taskId, version, status, startAt, endAt, technicianId, machineId }) => ({
              taskId, version, status, startAt, endAt, technicianId, machineId,
            })),
          },
        }),
      });
      setApplyResult(`Applied ${result.data.appliedTaskIds.length} task assignments and confirmed their resource bookings.`);
      setConfirmApply(false);
      await queryClient.invalidateQueries({ queryKey: ['planning'] });
    } catch (reason) {
      setApplyError(reason instanceof Error ? reason.message : 'Could not apply the reviewed schedule. Generate a fresh proposal if its evidence has changed.');
    } finally {
      setApplyingProposal(false);
    }
  }

  return <>
    <Button variant="soft" onClick={() => { setError(null); setOpen(true); }}>Generate schedule proposal</Button>
    <Dialog isOpen={open} onClose={() => { if (!submitting && !applyingProposal && !requestingDateChange) setOpen(false); }} title="Build a production schedule" subtitle="Choose a job, review proposed times and resources, then apply when ready." size="lg" className="schedule-proposal-dialog" pending={submitting || applyingProposal || promiseLoading || requestingDateChange}>
      <div className="space-y-4">
        <div className="schedule-proposal-notice"><Icon name="info" /><p>Preview first. Tasks and bookings change only after you review and apply the schedule.</p></div>
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
            <Select id="schedule-proposal-instance" value={instanceId} disabled={!selectedOrderId || loadingInstances || submitting || instances.length <= 1} onChange={(event) => { setInstanceId(event.target.value); setProposal(null); setPromiseResult(null); setRequestedQuantity(''); setDateChangeRequestId(null); }}>
              <option value="">{loadingInstances ? 'Loading jobs…' : 'Select a job'}</option>
              {instances.map((instance, index) => <option key={instance.id} value={instance.id}>{jobLabel(orders.find(order => order.id === selectedOrderId), instance, index)}</option>)}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink" htmlFor="schedule-proposal-horizon">Look ahead</label>
            <Select id="schedule-proposal-horizon" value={horizonDays} disabled={submitting} onChange={(event) => setHorizonDays(event.target.value)}>
              <option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option>
            </Select>
          </div>
          <div className="flex items-end justify-end">
            <Button variant="primary" disabled={!selectedOrder || !instanceId || loadingInstances || submitting} onClick={() => void generate()}>
              {submitting ? 'Building preview…' : 'Preview schedule'}
            </Button>
          </div>
        </div>}

        {selectedOrder && instanceId && <details className="schedule-delivery-check"><summary>Also check a delivery date <span>Optional</span></summary><div className="space-y-3 pt-4">
          <p className="small muted">Compare this job with a requested date. The customer commitment stays unchanged.</p>
          <div className="schedule-delivery-fields">
            <div className="min-w-52"><label className="mb-1 block text-xs font-medium text-ink" htmlFor="planning-promise-quantity">Full job quantity</label><Input id="planning-promise-quantity" inputMode="decimal" value={requestedQuantity} disabled={promiseLoading || submitting || requestingDateChange} onChange={(event) => { setRequestedQuantity(event.target.value); setPromiseResult(null); setDateChangeRequestId(null); }} placeholder="Enter the released job quantity" /><p className="small muted mt-1">Enter the full released job quantity. Partial quantities cannot be evaluated.</p></div>
            <div className="min-w-52"><label className="mb-1 block text-xs font-medium text-ink" htmlFor="promise-requested-date">Requested delivery</label><DatePicker id="promise-requested-date" value={requestedDate} onChange={(value) => { setRequestedDate(value); setPromiseResult(null); setDateChangeRequestId(null); }} /></div>
            <Button variant="soft" disabled={!requestedQuantity.trim() || promiseLoading || loadingInstances || submitting} onClick={() => void evaluatePromise()}>{promiseLoading ? 'Checking…' : 'Evaluate date'}</Button>
          </div>
          {promiseError && <p className="small text-danger" role="alert">{promiseError}</p>}
          {promiseResult && <div className="rounded-lg border border-line bg-surface-muted p-3">
            <div className="flex flex-wrap items-center gap-2"><Badge variant={promiseResult.state === 'EVALUATED' ? promiseResult.isFeasibleOnRequestedDate ? 'success' : 'warning' : 'danger'}>{promiseResult.state === 'EVALUATED' ? promiseResult.isFeasibleOnRequestedDate ? 'Feasible by requested date' : 'Finishes after requested date' : 'Insufficient schedule evidence'}</Badge><span className="small muted">Schedule: {promiseResult.scheduleState ?? 'unavailable'}</span></div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <div className="rounded-md border border-line bg-surface p-3"><p className="small muted">Evaluated job quantity</p><p className="mt-1 text-sm font-semibold text-ink">{promiseResult.requestedQuantity} {promiseResult.quantityUom ?? ''}</p></div>
              <div className="rounded-md border border-line bg-surface p-3"><p className="small muted">Requested date</p><p className="mt-1 text-sm font-semibold text-ink">{promiseResult.requestedDate}</p></div>
              <div className="rounded-md border border-line bg-surface p-3"><p className="small muted">Projected completion</p><p className="mt-1 text-sm font-semibold text-ink">{promiseResult.feasibleDate ?? 'Unavailable'}</p></div>
              <div className="rounded-md border border-line bg-surface p-3"><p className="small muted">Date comparison</p><p className="mt-1 text-sm font-semibold text-ink">{promiseResult.state === 'EVALUATED' ? getPromiseDateDeltaLabel(promiseResult.deltaDays) : 'Not evaluated'}</p></div>
            </div>
            <p className="small muted mt-2">Facility timezone: {promiseResult.evidence?.facilityTimezone ?? 'unavailable'} · This estimate does not change the customer commitment.</p>
            <p className="small muted mt-1">{promiseResult.bottleneckReason}</p>
            {promiseResult.missingInputs.map((reason) => <p key={reason} className="small text-danger mt-1">{reason}</p>)}
            {promiseResult.evidence && <p className="small muted mt-2">Workflow {promiseResult.evidence.workflowVersionId.slice(0, 8)} · engineering {promiseResult.evidence.engineeringRevisionId.slice(0, 8)} · {promiseResult.evidence.taskVersions.length} task versions assessed.</p>}
            <p className="small muted mt-2">Evaluated {new Date(promiseResult.evaluatedAt).toLocaleString()} · reference {promiseResult.evaluationId.slice(0, 8)} · input {promiseResult.inputHash.slice(0, 8)}</p>
            {promiseResult.componentReadiness.length > 0 && <section className="mt-3 space-y-2" aria-label="Promise component readiness evidence">
              <div><h3 className="small font-semibold text-ink">Component readiness</h3><p className="small muted">Current stock and inbound purchase orders are workspace evidence; they are not allocated to this job unless issued or reserved.</p></div>
              {promiseResult.componentReadiness.map((component, index) => <article key={`${component.itemId}-${index}`} className="rounded-md border border-line bg-surface p-3">
                <div className="flex flex-wrap items-center justify-between gap-2"><strong className="small text-ink">{component.itemCode} · {component.itemName}</strong><Badge variant={component.state === 'UNALLOCATED' ? 'warning' : 'success'}>{component.state}</Badge></div>
                <p className="small muted mt-1">Required {formatQuantity(BigInt(component.requiredAtoms))} {component.quantityUom} · issued {formatQuantity(BigInt(component.issuedAtoms))} · reserved {formatQuantity(BigInt(component.reservedAtoms))}</p>
                <p className="small muted mt-1">Unreserved RAW stock: {formatQuantity(BigInt(component.availableRawAtoms))} {component.quantityUom} · not allocated to this job</p>
                {component.confirmedSupply.length > 0 ? <div className="mt-2 space-y-1"><p className="small muted">Approved inbound quantities (not allocated):</p>{component.confirmedSupply.map((line) => <p key={line.supplyOrderId} className="small muted"><Link className="text-primary hover:underline" href={`/supply-orders/${line.supplyOrderId}`}>{line.supplyOrderNumber}</Link> · {line.supplierName} · ETA {new Date(line.expectedDate).toLocaleDateString()} · remaining {formatQuantity(BigInt(line.remainingAtoms))} {component.quantityUom}</p>)}</div> : <p className="small muted mt-1">No approved inbound supply line recorded.</p>}
              </article>)}
            </section>}
            {promiseResult.state === 'EVALUATED' && promiseResult.isFeasibleOnRequestedDate === true && <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button variant="soft" disabled={requestingDateChange || Boolean(dateChangeRequestId)} onClick={() => void requestPromiseDateChange()}>{dateChangeRequestId ? 'Date change submitted for review' : requestingDateChange ? 'Submitting request…' : 'Request date change'}</Button>
              {dateChangeRequestId && <span role="status" className="small muted">Submitted for authorized review; the order commitment has not changed.</span>}
            </div>}
            <details className="mt-2"><summary className="small cursor-pointer">Assumptions</summary><ul className="mt-1 list-disc space-y-1 pl-5">{promiseResult.assumptions.map((assumption) => <li key={assumption} className="small muted">{assumption}</li>)}</ul></details>
          </div>}
        </div></details>}

        {error && <p role="alert" className="small text-danger">{error}</p>}
        {proposal && <div className="space-y-3">
          {(() => {
            const impact = getSchedulePromiseImpact(proposal.projectedEndAt, selectedOrder?.promisedDate ?? null);
            return impact && <Panel className="grid gap-3 p-3 sm:grid-cols-3">
              <div><p className="small muted">Projected job completion</p><p className="mt-1 text-sm font-semibold text-ink">{impact.projectedDate}</p></div>
              <div><p className="small muted">Contractual promised date</p><p className="mt-1 text-sm font-semibold text-ink">{impact.promisedDate}</p></div>
              <div><p className="small muted">Schedule impact</p><p className="mt-1 text-sm font-semibold text-ink">{getPromiseDateDeltaLabel(impact.deltaDays)}</p></div>
              <p className="small muted sm:col-span-3">This is a schedule estimate. Applying it does not change the customer commitment.</p>
            </Panel>;
          })()}
          <Panel className="flex flex-wrap items-start justify-between gap-3 p-3">
            <div><p className="font-semibold">{proposal.scope.orderNumber} · {instances.find(instance => instance.id === proposal.scope.instanceId) ? jobLabel(selectedOrder, instances.find(instance => instance.id === proposal.scope.instanceId)!, instances.findIndex(instance => instance.id === proposal.scope.instanceId)) : 'Production job'}</p><p className="small muted">{selectedOrder?.facility?.name ?? 'Facility not specified'} · {new Date(proposal.scope.horizonStart).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} – {new Date(proposal.scope.horizonEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p></div>
            <Badge variant={proposal.state === 'COMPLETE' ? 'success' : proposal.state === 'PARTIAL' || proposal.state === 'NO_OPEN_TASKS' ? 'warning' : 'danger'}>{proposal.state.replaceAll('_', ' ')}</Badge>
            <p className="small muted w-full">{proposal.tasks.filter((task) => task.status === 'SCHEDULED').length} of {proposal.tasks.length} tasks scheduled · finish {proposal.projectedEndAt ? new Date(proposal.projectedEndAt).toLocaleString() : 'not available'}</p>
          </Panel>
          {!proposal.tasks.length ? <p className="small muted">No open tasks are available for this job.</p> : <div className="max-h-[40vh] space-y-2 overflow-auto">
            {proposal.tasks.map((task) => <article key={task.taskId} className="rounded-lg border border-line bg-surface p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{task.nodeKey} · v{task.version}</strong><Badge variant={task.status === 'SCHEDULED' ? 'success' : 'warning'}>{task.status}</Badge></div>
              <p className="small muted mt-1">{task.startAt ? new Date(task.startAt).toLocaleString() : 'No time'} – {task.endAt ? new Date(task.endAt).toLocaleString() : 'No time'}</p>
              {task.predecessorTaskIds.length > 0 && <p className="small muted mt-1">After: {getSchedulePredecessorLabels(task.predecessorTaskIds, proposal.tasks).join(', ')}</p>}
              {(task.technicianId || task.machineId) && <p className="small muted mt-1">Technician {task.technicianName ?? '—'} · Machine {task.machineName ?? '—'}</p>}
              {task.reasons.map((reason) => <p key={reason} className="small text-danger mt-1">{reason}</p>)}
            </article>)}
          </div>}
          <div className="rounded-lg border border-line bg-surface-muted p-3"><p className="small font-semibold">Assumptions</p><ul className="mt-1 list-disc space-y-1 pl-5">{proposal.assumptions.map((assumption) => <li key={assumption} className="small muted">{assumption}</li>)}</ul></div>
          {applyResult && <p role="status" className="small rounded-lg border border-success/30 bg-success-soft p-3 text-success">{applyResult} You can publish the resulting schedule snapshot separately.</p>}
          {applyError && <p role="alert" className="small rounded-lg border border-danger/30 bg-danger-soft p-3 text-danger">{applyError}</p>}
          {proposal.state === 'COMPLETE' && !applyResult && <div className="flex flex-wrap items-center justify-end gap-2">
            {!confirmApply ? <Button variant="primary" disabled={applyingProposal} onClick={() => { setConfirmApply(true); setApplyError(null); }}>Apply reviewed schedule</Button> : <Panel className="w-full space-y-3 p-3">
              <p className="small text-ink">This will assign {proposal.tasks.length} tasks and create confirmed technician/machine bookings. The command will revalidate the current proposal and roll back all changes if any evidence is stale.</p>
              <div className="flex justify-end gap-2"><Button disabled={applyingProposal} onClick={() => setConfirmApply(false)}>Keep as preview</Button><Button variant="primary" disabled={applyingProposal} onClick={() => void applyReviewedProposal()}>{applyingProposal ? 'Revalidating and applying…' : 'Confirm apply'}</Button></div>
            </Panel>}
          </div>}
        </div>}
        <div className="schedule-proposal-footer"><details><summary>Scheduling assumptions</summary><p className="small muted">Uses the order facility, released routing, material readiness, published shifts and current bookings. Starts five minutes from now. Apply rechecks current evidence.</p></details><Button onClick={() => setOpen(false)} disabled={submitting || applyingProposal || requestingDateChange}>Close</Button></div>
      </div>
    </Dialog>
  </>;
}
