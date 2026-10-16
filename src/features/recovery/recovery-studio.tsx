'use client';

import React, { useEffect, useState } from 'react';
import { ordersApi, type OrderDto } from '@/features/orders/api';
import { proposeRecovery } from './api';
import type { RecoveryProposalDTO } from '@/server/modules/intelligence/recovery-contracts';
import { useGraphStore } from '../../store/graph-store';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { Panel } from '../../components/ui/panel';

export function RecoveryStudio() {
  const closeModal = useGraphStore((state) => state.closeModal);
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [orderId, setOrderId] = useState('');
  const [disruptionType, setDisruptionType] = useState('MATERIAL_DELAY');
  const [delayDays, setDelayDays] = useState('3');
  const [proposal, setProposal] = useState<RecoveryProposalDTO | null>(null);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void ordersApi.listOrders().then((rows) => {
      if (!active) return;
      const eligible = rows.filter((row) => !['DRAFT', 'REVIEW', 'CANCELLED', 'DELIVERED'].includes(row.status));
      setOrders(eligible);
      setOrderId((current) => current || eligible[0]?.id || '');
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Could not load orders.');
    }).finally(() => {
      if (active) setLoadingOrders(false);
    });
    return () => { active = false; };
  }, []);

  async function handlePropose(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setProposal(null);
    const parsedDelay = Number(delayDays);
    if (!orderId || !Number.isSafeInteger(parsedDelay) || parsedDelay < 1) {
      setError('Choose an order and enter a whole-number delay of at least one day.');
      return;
    }
    setSubmitting(true);
    try {
      setProposal(await proposeRecovery({ orderId, disruptionType, delayDays: parsedDelay }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not generate a recovery proposal.');
    } finally {
      setSubmitting(false);
    }
  }

  const selectedOrder = orders.find((order) => order.id === orderId);

  return (
    <div className="space-y-4">
      <Panel className="p-4 space-y-3">
        <p className="text-xs text-muted">
          Generate a persisted, order-scoped proposal from current QC evidence. Proposal estimates are not a published schedule or a committed customer promise.
        </p>
        <form onSubmit={handlePropose} className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-ink" htmlFor="recovery-order">Order</label>
            <Select id="recovery-order" required value={orderId} disabled={loadingOrders || submitting} onChange={(event) => { setOrderId(event.target.value); setProposal(null); }}>
              <option value="">Select a released order</option>
              {orders.map((order) => <option key={order.id} value={order.id}>{order.orderNumber} · {order.customer?.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink" htmlFor="recovery-disruption">Disruption</label>
            <Select id="recovery-disruption" value={disruptionType} disabled={submitting} onChange={(event) => { setDisruptionType(event.target.value); setProposal(null); }}>
              <option value="MATERIAL_DELAY">Material delay</option>
              <option value="MACHINE_FAILURE">Machine failure</option>
              <option value="UNPLANNED_ABSENCE">Unplanned absence</option>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink" htmlFor="recovery-delay">Expected delay (workdays)</label>
            <Input id="recovery-delay" type="number" min="1" step="1" value={delayDays} disabled={submitting} onChange={(event) => { setDelayDays(event.target.value); setProposal(null); }} />
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" variant="primary" disabled={loadingOrders || submitting || !orderId}>
              {submitting ? 'Generating…' : 'Generate proposal'}
            </Button>
          </div>
        </form>
      </Panel>

      {error && <Panel className="border border-danger/30 p-3 text-xs text-danger" role="alert">{error}</Panel>}
      {!loadingOrders && orders.length === 0 && !error && (
        <Panel className="p-4 text-xs text-muted">No released orders are available to evaluate.</Panel>
      )}

      {proposal && (
        <Panel className="p-4 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-ink">Proposal for {proposal.orderNumber}</h3>
              <p className="text-xs text-muted">Created {new Date(proposal.createdAt).toLocaleString()} · delayed date {proposal.projectedDelayedDate}</p>
            </div>
            <Badge variant="warning">Review only</Badge>
          </div>
          <div className="grid gap-2 text-xs text-muted sm:grid-cols-2">
            <p>Ordered quantity: <strong className="text-ink">{proposal.totalQty}</strong></p>
            <p>Final QC passed: <strong className="text-ink">{proposal.readyQcPassedQty}</strong></p>
            {selectedOrder?.lines?.length ? <p className="sm:col-span-2">This proposal evaluates the order as a whole; line-specific planning remains unavailable.</p> : null}
          </div>
          <div className="space-y-2">
            {proposal.options.map((option) => (
              <article key={option.id} className="rounded-lg border border-line bg-surface p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-xs font-semibold text-ink">{option.title}</h4>
                  <Badge variant={option.feasible ? 'success' : 'warning'}>{option.feasible ? 'Feasible in model' : 'Not feasible'}</Badge>
                </div>
                <p className="text-xs text-muted">{option.description}</p>
                {option.infeasibleReason && <p className="text-xs text-danger">{option.infeasibleReason}</p>}
                {option.allocation && <p className="text-xs text-muted">Tranches: {option.allocation.tranche1Qty} on {option.allocation.tranche1Date}; {option.allocation.tranche2Qty} on {option.allocation.tranche2Date}</p>}
                <p className="text-xs text-muted">Cost impact ({option.costImpactPct}%): illustrative model value, not measured job cost.</p>
              </article>
            ))}
          </div>
          <div className="rounded-lg border border-line bg-surface-muted p-3 text-xs text-muted">
            Applying a recovery plan is unavailable. This service can create and validate proposals, but it does not yet reserve shipment tranches or publish a revised production schedule.
          </div>
          <div className="flex justify-end">
            <Button onClick={closeModal}>Close</Button>
          </div>
        </Panel>
      )}
    </div>
  );
}
