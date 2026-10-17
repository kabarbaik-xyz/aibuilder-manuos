'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { jobLabel } from '@/features/orders/job-label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { formatQuantity } from '@/domain/quantity';
import { LoadingState } from '@/components/ui/resource-state';
import { apiRequest } from '@/lib/api/client';
import { ordersApi, type OrderDto } from '@/features/orders/api';
import { getPromiseDateDeltaLabel } from './promise-presentation';

interface PromiseEvaluation {
  state: 'EVALUATED' | 'NOT_CONNECTED';
  evaluationId: string;
  inputHash: string;
  evaluatedAt: string;
  orderId: string;
  instanceId: string;
  requestedQuantity: string;
  requestedQuantityAtoms: string;
  quantityUom: string | null;
  requestedDate: string;
  feasibleDate: string | null;
  isFeasibleOnRequestedDate: boolean | null;
  scheduleState: string | null;
  deltaDays: number | null;
  bottleneckReason: string;
  missingInputs: string[];
  assumptions: string[];
  componentReadiness: Array<{
    itemId: string; itemCode: string; itemName: string; quantityUom: string;
    requiredAtoms: string; issuedAtoms: string; reservedAtoms: string; availableRawAtoms: string; state: 'ISSUED' | 'RESERVED' | 'UNALLOCATED';
    allocatedSupply: Array<{ supplyOrderLineId: string; supplyOrderId: string; supplyOrderNumber: string; supplierName: string; expectedDate: string; allocatedOutstandingAtoms: string; receivedAtoms: string; activelyReservedAtoms: string }>;
    confirmedSupply: Array<{ supplyOrderId: string; supplyOrderNumber: string; supplierName: string; expectedDate: string; remainingAtoms: string }>;
  }>;
  evidence: null | {
    facilityTimezone: string | null;
    workflowVersionId: string;
    engineeringRevisionId: string;
    taskVersions: Array<{ taskId: string; version: number }>;
  };
}

type ActiveInstance = NonNullable<OrderDto['instances']>[number];

export function PromiseModal({ initialOrderId }: { initialOrderId?: string } = {}) {
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [instances, setInstances] = useState<ActiveInstance[]>([]);
  const [instanceId, setInstanceId] = useState('');
  const [requestedQuantity, setRequestedQuantity] = useState('');
  const [requestedDate, setRequestedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [result, setResult] = useState<PromiseEvaluation | null>(null);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingInstance, setLoadingInstance] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [requestingChange, setRequestingChange] = useState(false);
  const [changeRequestId, setChangeRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void ordersApi.listOrders()
      .then((rows) => { if (active) setOrders(rows.filter((row) => ['RELEASED', 'IN_PRODUCTION', 'PARTIALLY_DELIVERED'].includes(row.status))); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load released orders.'); })
      .finally(() => { if (active) setLoadingOrders(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => { if (initialOrderId) void selectOrder(initialOrderId); }, [initialOrderId]);

  async function selectOrder(orderId: string) {
    setSelectedOrderId(orderId);
    setInstances([]);
    setInstanceId('');
    setRequestedQuantity('');
    setResult(null);
    setChangeRequestId(null);
    setError(null);
    if (!orderId) return;
    setLoadingInstance(true);
    try {
      const order = await ordersApi.getOrder(orderId);
      setOrders(rows => rows.map(row => row.id === order.id ? order : row));
      const activeInstances = (order.instances ?? []).filter((instance) => instance.status === 'ACTIVE');
      setInstances(activeInstances);
      if (activeInstances.length === 1) setInstanceId(activeInstances[0].id);
      if (!activeInstances.length) setError('This order has no active released job to evaluate.');
      if (activeInstances.length > 1) setError('Select the exact active job; each is evaluated independently.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load the order jobs.');
    } finally {
      setLoadingInstance(false);
    }
  }

  async function requestDateChange() {
    if (!result || result.state !== 'EVALUATED' || result.isFeasibleOnRequestedDate !== true || requestingChange) return;
    setRequestingChange(true);
    setError(null);
    try {
      const response = await ordersApi.createChangeRequest(result.orderId, {
        changeType: 'DATE',
        reason: `Requested after CoreAI finite-capacity estimate ${result.evaluationId}.`,
        requestedChanges: { requestedDate: result.requestedDate },
      });
      setChangeRequestId(response.data.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not submit the date change request.');
    } finally {
      setRequestingChange(false);
    }
  }

  async function evaluate() {
    if (!selectedOrderId || !instanceId || !requestedQuantity.trim() || submitting) return;
    setSubmitting(true);
    setResult(null);
    setError(null);
    try {
      const response = await apiRequest<{ data: PromiseEvaluation }>('/api/intelligence/promise', {
        method: 'POST',
        body: JSON.stringify({ orderId: selectedOrderId, instanceId, requestedQuantity: requestedQuantity.trim(), requestedDate }),
      });
      setResult(response.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not evaluate the requested delivery date.');
    } finally {
      setSubmitting(false);
    }
  }

  return <div className="space-y-4">
    <p className="small muted">Evaluates an existing released job against the same finite-capacity preview used in Planning. This does not commit a customer promise.</p>
    {loadingOrders ? <LoadingState message="Loading released orders…" /> : orders.length === 0 ? <p className="small muted">No released orders are available.</p> : <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-ink" htmlFor="promise-order">Order</label>
        <Select id="promise-order" value={selectedOrderId} disabled={submitting} onChange={(event) => void selectOrder(event.target.value)}>
          <option value="">Select an order</option>
          {orders.map((order) => <option key={order.id} value={order.id}>{order.orderNumber} · {order.customer?.name ?? 'Customer'}</option>)}
        </Select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-ink" htmlFor="promise-job">Active job</label>
        <Select id="promise-job" value={instanceId} disabled={!selectedOrderId || loadingInstance || submitting || instances.length <= 1} onChange={(event) => { setInstanceId(event.target.value); setRequestedQuantity(''); setResult(null); setChangeRequestId(null); }}>
          <option value="">{loadingInstance ? 'Loading jobs…' : 'Select a job'}</option>
          {instances.map((instance, index) => <option key={instance.id} value={instance.id}>{jobLabel(orders.find(order => order.id === selectedOrderId), instance, index)}</option>)}
        </Select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-ink" htmlFor="promise-quantity">Full job quantity</label>
        <Input id="promise-quantity" inputMode="decimal" value={requestedQuantity} disabled={!instanceId || submitting} onChange={(event) => { setRequestedQuantity(event.target.value); setResult(null); setChangeRequestId(null); }} placeholder="Enter the released job quantity" />
        <p className="small muted mt-1">Partial quantities are not scheduled; use the exact quantity of the selected released job.</p>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-ink" htmlFor="promise-request-date">Requested delivery</label>
        <DatePicker id="promise-request-date" value={requestedDate} onChange={(value) => { setRequestedDate(value); setResult(null); setChangeRequestId(null); }} />
      </div>
      <Button variant="primary" disabled={!selectedOrderId || !instanceId || !requestedQuantity.trim() || loadingInstance || submitting} onClick={() => void evaluate()}>{submitting ? 'Evaluating…' : 'Check requested date'}</Button>
    </div>}
    {error && <p role="alert" className="small text-danger">{error}</p>}
    {result && <div className="rounded-lg border border-line bg-surface-muted p-3">
      <div className="flex flex-wrap items-center gap-2"><Badge variant={result.state === 'EVALUATED' ? result.isFeasibleOnRequestedDate ? 'success' : 'warning' : 'danger'}>{result.state === 'EVALUATED' ? result.isFeasibleOnRequestedDate ? 'Feasible by requested date' : 'Finishes after requested date' : 'Insufficient schedule evidence'}</Badge><span className="small muted">Schedule: {result.scheduleState ?? 'unavailable'}</span></div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-md border border-line bg-surface p-3"><p className="small muted">Evaluated job quantity</p><p className="mt-1 text-sm font-semibold text-ink">{result.requestedQuantity} {result.quantityUom ?? ''}</p></div>
        <div className="rounded-md border border-line bg-surface p-3"><p className="small muted">Requested delivery</p><p className="mt-1 text-sm font-semibold text-ink">{result.requestedDate}</p></div>
        <div className="rounded-md border border-line bg-surface p-3"><p className="small muted">Projected completion</p><p className="mt-1 text-sm font-semibold text-ink">{result.feasibleDate ?? 'Unavailable'}</p></div>
      </div>
      <p className="small mt-2 font-medium text-ink">{getPromiseDateDeltaLabel(result.deltaDays)} · {result.evidence?.facilityTimezone ?? 'facility timezone unavailable'}</p>
      <p className="small muted mt-1">{result.bottleneckReason}</p>
      {result.missingInputs.map((item) => <p key={item} className="small text-danger mt-1">{item}</p>)}
      {result.evidence && <p className="small muted mt-2">Workflow {result.evidence.workflowVersionId.slice(0, 8)} · engineering {result.evidence.engineeringRevisionId.slice(0, 8)} · {result.evidence.taskVersions.length} task versions</p>}
      {result.componentReadiness.length > 0 && <section className="mt-3 space-y-2" aria-label="Component readiness evidence">
        <div><h3 className="small font-semibold text-ink">Component readiness</h3><p className="small muted">RAW availability and approved supply are workspace signals; neither is treated as allocated to this job.</p></div>
        {result.componentReadiness.map((component, index) => <article key={`${component.itemId}-${index}`} className="rounded-md border border-line bg-surface p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><strong className="small text-ink">{component.itemCode} · {component.itemName}</strong><Badge variant={component.state === 'UNALLOCATED' ? 'warning' : 'success'}>{component.state}</Badge></div>
          <p className="small muted mt-1">Required {formatQuantity(BigInt(component.requiredAtoms))} {component.quantityUom} · issued {formatQuantity(BigInt(component.issuedAtoms))} · reserved {formatQuantity(BigInt(component.reservedAtoms))}</p>
          <p className="small muted mt-1">Unreserved RAW stock snapshot: {formatQuantity(BigInt(component.availableRawAtoms))} {component.quantityUom} · not allocated to this job</p>
          {component.allocatedSupply.length > 0 && <div className="mt-2 space-y-1"><p className="small muted">Allocated inbound material (ETA is not production-ready until received and reserved):</p>{component.allocatedSupply.map(line => <p key={line.supplyOrderLineId} className="small muted"><Link className="text-primary hover:underline" href={`/supply-orders/${line.supplyOrderId}`}>{line.supplyOrderNumber}</Link> · {line.supplierName} · ETA {new Date(line.expectedDate).toLocaleDateString()} · outstanding {formatQuantity(BigInt(line.allocatedOutstandingAtoms))} {component.quantityUom} · received {formatQuantity(BigInt(line.receivedAtoms))} · reserved {formatQuantity(BigInt(line.activelyReservedAtoms))}</p>)}</div>}
          {component.confirmedSupply.length > 0 ? <div className="mt-2 space-y-1"><p className="small muted">Other approved PO quantities (unallocated to this job):</p>{component.confirmedSupply.map(line => <p key={line.supplyOrderId} className="small muted"><Link className="text-primary hover:underline" href={`/supply-orders/${line.supplyOrderId}`}>{line.supplyOrderNumber}</Link> · {line.supplierName} · ETA {new Date(line.expectedDate).toLocaleDateString()} · remaining {formatQuantity(BigInt(line.remainingAtoms))} {component.quantityUom}</p>)}</div> : component.allocatedSupply.length === 0 && <p className="small muted mt-1">No allocated inbound supply line recorded.</p>}
        </article>)}
      </section>}
      <p className="small muted mt-2">Evaluation {new Date(result.evaluatedAt).toLocaleString()} · reference {result.evaluationId.slice(0, 8)} · input {result.inputHash.slice(0, 8)}</p>
      <p className="small muted mt-2">One schedule estimate only. Alternative recovery strategies are not modeled, and this evaluation does not change the customer commitment.</p>
      {result.state === 'EVALUATED' && result.isFeasibleOnRequestedDate === true && <div className="mt-3 flex flex-wrap items-center gap-2">
      <Button variant="soft" disabled={requestingChange || Boolean(changeRequestId)} onClick={() => void requestDateChange()}>{changeRequestId ? 'Date change submitted for review' : requestingChange ? 'Submitting request…' : 'Request date change'}</Button>
        {changeRequestId && <span role="status" className="small muted">Submitted for authorized review; the order date has not changed.</span>}
      </div>}
      <details className="mt-2"><summary className="small cursor-pointer">Assumptions</summary><ul className="mt-1 list-disc space-y-1 pl-5">{result.assumptions.map((item) => <li key={item} className="small muted">{item}</li>)}</ul></details>
    </div>}
  </div>;
}
