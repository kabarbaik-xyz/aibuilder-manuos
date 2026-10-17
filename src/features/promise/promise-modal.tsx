'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Select } from '@/components/ui/select';
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
  requestedDate: string;
  feasibleDate: string | null;
  isFeasibleOnRequestedDate: boolean | null;
  scheduleState: string | null;
  deltaDays: number | null;
  bottleneckReason: string;
  missingInputs: string[];
  assumptions: string[];
  evidence: null | {
    facilityTimezone: string | null;
    workflowVersionId: string;
    engineeringRevisionId: string;
    taskVersions: Array<{ taskId: string; version: number }>;
  };
}

type ActiveInstance = NonNullable<OrderDto['instances']>[number];

export function PromiseModal() {
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [instances, setInstances] = useState<ActiveInstance[]>([]);
  const [instanceId, setInstanceId] = useState('');
  const [requestedDate, setRequestedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [result, setResult] = useState<PromiseEvaluation | null>(null);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingInstance, setLoadingInstance] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void ordersApi.listOrders()
      .then((rows) => { if (active) setOrders(rows.filter((row) => ['RELEASED', 'IN_PRODUCTION', 'PARTIALLY_DELIVERED'].includes(row.status))); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load released orders.'); })
      .finally(() => { if (active) setLoadingOrders(false); });
    return () => { active = false; };
  }, []);

  async function selectOrder(orderId: string) {
    setSelectedOrderId(orderId);
    setInstances([]);
    setInstanceId('');
    setResult(null);
    setError(null);
    if (!orderId) return;
    setLoadingInstance(true);
    try {
      const order = await ordersApi.getOrder(orderId);
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

  async function evaluate() {
    if (!selectedOrderId || !instanceId || submitting) return;
    setSubmitting(true);
    setResult(null);
    setError(null);
    try {
      const response = await apiRequest<{ data: PromiseEvaluation }>('/api/intelligence/promise', {
        method: 'POST',
        body: JSON.stringify({ orderId: selectedOrderId, instanceId, requestedDate }),
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
        <Select id="promise-job" value={instanceId} disabled={!selectedOrderId || loadingInstance || submitting || instances.length <= 1} onChange={(event) => { setInstanceId(event.target.value); setResult(null); }}>
          <option value="">{loadingInstance ? 'Loading jobs…' : 'Select a job'}</option>
          {instances.map((instance) => <option key={instance.id} value={instance.id}>Job {instance.id.slice(0, 8)}</option>)}
        </Select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-ink" htmlFor="promise-request-date">Requested delivery</label>
        <DatePicker id="promise-request-date" value={requestedDate} onChange={(value) => { setRequestedDate(value); setResult(null); }} />
      </div>
      <Button variant="primary" disabled={!selectedOrderId || !instanceId || loadingInstance || submitting} onClick={() => void evaluate()}>{submitting ? 'Evaluating…' : 'Check requested date'}</Button>
    </div>}
    {error && <p role="alert" className="small text-danger">{error}</p>}
    {result && <div className="rounded-lg border border-line bg-surface-muted p-3">
      <div className="flex flex-wrap items-center gap-2"><Badge variant={result.state === 'EVALUATED' ? result.isFeasibleOnRequestedDate ? 'success' : 'warning' : 'danger'}>{result.state === 'EVALUATED' ? result.isFeasibleOnRequestedDate ? 'Feasible by requested date' : 'Finishes after requested date' : 'Insufficient schedule evidence'}</Badge><span className="small muted">Schedule: {result.scheduleState ?? 'unavailable'}</span></div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-md border border-line bg-surface p-3"><p className="small muted">Requested delivery</p><p className="mt-1 text-sm font-semibold text-ink">{result.requestedDate}</p></div>
        <div className="rounded-md border border-line bg-surface p-3"><p className="small muted">Projected completion</p><p className="mt-1 text-sm font-semibold text-ink">{result.feasibleDate ?? 'Unavailable'}</p></div>
      </div>
      <p className="small mt-2 font-medium text-ink">{getPromiseDateDeltaLabel(result.deltaDays)} · {result.evidence?.facilityTimezone ?? 'facility timezone unavailable'}</p>
      <p className="small muted mt-1">{result.bottleneckReason}</p>
      {result.missingInputs.map((item) => <p key={item} className="small text-danger mt-1">{item}</p>)}
      {result.evidence && <p className="small muted mt-2">Workflow {result.evidence.workflowVersionId.slice(0, 8)} · engineering {result.evidence.engineeringRevisionId.slice(0, 8)} · {result.evidence.taskVersions.length} task versions</p>}
      <p className="small muted mt-2">Evaluation {new Date(result.evaluatedAt).toLocaleString()} · reference {result.evaluationId.slice(0, 8)} · input {result.inputHash.slice(0, 8)}</p>
      <p className="small muted mt-2">One schedule estimate only. Alternative recovery strategies are not modeled, and this evaluation does not change the customer commitment.</p>
      <details className="mt-2"><summary className="small cursor-pointer">Assumptions</summary><ul className="mt-1 list-disc space-y-1 pl-5">{result.assumptions.map((item) => <li key={item} className="small muted">{item}</li>)}</ul></details>
    </div>}
  </div>;
}
