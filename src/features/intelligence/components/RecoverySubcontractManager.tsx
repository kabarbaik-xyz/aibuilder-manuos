'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { apiRequest } from '@/lib/api/client';
import { formatQuantity, parseQuantity } from '@/domain/quantity';
import { useWorkspaceNavigation } from '@/components/workspace-navigation-context';

type ChoiceData = {
  tasks: Array<{ id: string; nodeKey: string; targetAtoms: string; orderId: string; orderNumber: string }>;
  suppliers: Array<{ id: string; code: string; name: string }>;
  recoveryBatchAtoms: string;
};
type Batch = { id: string; batchNumber: number; quantityAtoms: string; returnedAtoms: string; status: string; vendorReference: string | null; sentAt: string | null; returnedAt: string | null };
type Plan = { id: string; orderId: string; orderNumber: string; taskId: string; nodeKey: string; supplierId: string; supplierName: string; plannedAtoms: string; batchLimitAtoms: string; status: string; approverMembershipId: string; batches: Batch[] };
type Policy = { revision: number; recoveryBatchAtoms: string };

export function RecoverySubcontractManager() {
  const { principal } = useWorkspaceNavigation();
  const [choices, setChoices] = useState<ChoiceData | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [batchSize, setBatchSize] = useState('');
  const [taskId, setTaskId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [quantityByBatch, setQuantityByBatch] = useState<Record<string, string>>({});
  const [vendorReferenceByBatch, setVendorReferenceByBatch] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canConfigure = Boolean(principal?.permissions.some(permission => ['resource.manage', 'workspace.admin', 'owner'].includes(permission)));

  async function load() {
    setError(null);
    try {
      const [choiceResponse, planResponse, policyResponse] = await Promise.all([
        apiRequest<{ data: ChoiceData }>('/api/intelligence/recovery/subcontracts/options'),
        apiRequest<{ data: Plan[] }>('/api/intelligence/recovery/subcontracts'),
        apiRequest<{ data: Policy }>('/api/intelligence/recovery/policy'),
      ]);
      setChoices(choiceResponse.data);
      setPlans(planResponse.data);
      setPolicy(policyResponse.data);
      setBatchSize(formatQuantity(BigInt(policyResponse.data.recoveryBatchAtoms)));
      if (!taskId && choiceResponse.data.tasks.length) setTaskId(choiceResponse.data.tasks[0].id);
      if (!supplierId && choiceResponse.data.suppliers.length) setSupplierId(choiceResponse.data.suppliers[0].id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load subcontract recovery.'); }
  }

  useEffect(() => { void load(); }, []);

  async function savePolicy() {
    if (!policy || pending) return;
    setPending(true);
    setError(null);
    try {
      const atoms = parseQuantity(batchSize, 6);
      const result = await apiRequest<{ data: Policy }>('/api/intelligence/recovery/policy', {
        method: 'PATCH', headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ expectedRevision: policy.revision, recoveryBatchAtoms: atoms.toString() }),
      });
      setPolicy(result.data);
      setBatchSize(formatQuantity(BigInt(result.data.recoveryBatchAtoms)));
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save recovery batch policy.'); }
    finally { setPending(false); }
  }

  async function createPlan() {
    if (!taskId || !supplierId || pending) return;
    setPending(true);
    setError(null);
    try {
      await apiRequest('/api/intelligence/recovery/subcontracts', {
        method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ taskId, supplierId }),
      });
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not submit subcontract approval.'); }
    finally { setPending(false); }
  }

  async function approve(planId: string) {
    if (pending) return;
    setPending(true); setError(null);
    try { await apiRequest(`/api/intelligence/recovery/subcontracts/${planId}/approve`, { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() } }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not approve subcontract.'); }
    finally { setPending(false); }
  }

  async function reject(planId: string) {
    if (pending) return;
    setPending(true); setError(null);
    try { await apiRequest(`/api/intelligence/recovery/subcontracts/${planId}/reject`, { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ note: 'Rejected by the assigned supervisor.' }) }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not reject subcontract.'); }
    finally { setPending(false); }
  }

  async function markInProgress(planId: string, batchId: string) {
    if (pending) return;
    setPending(true); setError(null);
    try { await apiRequest(`/api/intelligence/recovery/subcontracts/${planId}/batches/${batchId}/status`, { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ status: 'IN_PROGRESS', vendorReference: vendorReferenceByBatch[batchId] || undefined }) }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update vendor status.'); }
    finally { setPending(false); }
  }

  async function receive(planId: string, batch: Batch) {
    if (pending) return;
    setPending(true); setError(null);
    try {
      const atoms = parseQuantity(quantityByBatch[batch.id] ?? formatQuantity(BigInt(batch.quantityAtoms) - BigInt(batch.returnedAtoms)), 6);
      await apiRequest(`/api/intelligence/recovery/subcontracts/${planId}/batches/${batch.id}/return`, {
        method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ returnedAtoms: atoms.toString(), vendorReference: vendorReferenceByBatch[batch.id] || undefined }),
      });
      setQuantityByBatch(current => ({ ...current, [batch.id]: '' }));
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not record returned vendor quantity.'); }
    finally { setPending(false); }
  }

  return <section className="rounded-xl border border-line bg-surface p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Subcontract recovery</h2><p className="small muted mt-1">Track supervisor approval, vendor progress, quantity returned, and handoff back to internal work. Returns do not fabricate production output or QC evidence.</p></div><Button disabled={pending} onClick={() => void load()}>Refresh</Button></div>
    {canConfigure && policy && <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface-muted p-3"><div className="min-w-52 flex-1"><label className="mb-1 block text-xs font-medium" htmlFor="recovery-batch-size">Maximum quantity per vendor batch</label><Input id="recovery-batch-size" inputMode="decimal" value={batchSize} onChange={event => setBatchSize(event.target.value)} placeholder="0 = one batch per operation" /></div><Button disabled={pending || !batchSize.trim()} onClick={() => void savePolicy()}>{pending ? 'Saving…' : 'Save batch policy'}</Button><p className="small muted w-full">Quantity uses the workspace atom scale (1 unit = 1,000,000 atoms). Set 0 to keep each operation in one vendor batch.</p></div>}
    {choices && <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end"><div><label className="mb-1 block text-xs font-medium" htmlFor="subcontract-task">Ready operation</label><Select id="subcontract-task" value={taskId} onChange={event => setTaskId(event.target.value)}><option value="">Select a ready operation</option>{choices.tasks.map(task => <option key={task.id} value={task.id}>{task.orderNumber} · {task.nodeKey} · {formatQuantity(BigInt(task.targetAtoms))}</option>)}</Select></div><div><label className="mb-1 block text-xs font-medium" htmlFor="subcontract-supplier">Vendor</label><Select id="subcontract-supplier" value={supplierId} onChange={event => setSupplierId(event.target.value)}><option value="">Select an active vendor</option>{choices.suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name} · {supplier.code}</option>)}</Select></div><Button variant="primary" disabled={pending || !taskId || !supplierId} onClick={() => void createPlan()}>Request supervisor approval</Button></div>}
    {error && <p role="alert" className="small text-danger mt-3">{error}</p>}
    {!plans.length && <p className="small muted mt-4">No subcontract plans recorded.</p>}
    <div className="mt-4 space-y-3">{plans.map(plan => <article key={plan.id} className="rounded-lg border border-line p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-medium">{plan.orderNumber} · {plan.nodeKey}</h3><p className="small muted mt-1">{plan.supplierName} · {formatQuantity(BigInt(plan.plannedAtoms))} total · {plan.batches.length} batch(es)</p></div><Badge variant={plan.status === 'RETURNED' ? 'success' : plan.status === 'PROPOSED' ? 'warning' : 'default'}>{plan.status}</Badge></div>
      {plan.status === 'PROPOSED' && plan.approverMembershipId === principal?.membershipId && <div className="mt-3 flex gap-2"><Button disabled={pending} onClick={() => void approve(plan.id)}>Approve and send to vendor</Button><Button disabled={pending} onClick={() => void reject(plan.id)}>Reject plan</Button></div>}
      <div className="mt-3 space-y-2">{plan.batches.map(batch => <div key={batch.id} className="flex flex-wrap items-center gap-2 rounded-md bg-surface-muted p-2"><span className="small min-w-32">Batch {batch.batchNumber}: {formatQuantity(BigInt(batch.returnedAtoms))}/{formatQuantity(BigInt(batch.quantityAtoms))}</span><Badge variant={batch.status === 'RETURNED' ? 'success' : 'default'}>{batch.status}</Badge>{batch.vendorReference && <span className="small muted">Vendor ref {batch.vendorReference}</span>}{!['PLANNED', 'RETURNED'].includes(batch.status) && <Input className="w-40" aria-label={`Vendor reference for batch ${batch.batchNumber}`} placeholder="Vendor reference" value={vendorReferenceByBatch[batch.id] ?? ''} onChange={event => setVendorReferenceByBatch(current => ({ ...current, [batch.id]: event.target.value }))} />}{['SENT', 'PARTIALLY_RETURNED'].includes(batch.status) && <Button disabled={pending} onClick={() => void markInProgress(plan.id, batch.id)}>Mark in progress</Button>}{['IN_PROGRESS', 'PARTIALLY_RETURNED'].includes(batch.status) && <><Input className="w-32" inputMode="decimal" aria-label={`Quantity returned for batch ${batch.batchNumber}`} placeholder={formatQuantity(BigInt(batch.quantityAtoms) - BigInt(batch.returnedAtoms))} value={quantityByBatch[batch.id] ?? ''} onChange={event => setQuantityByBatch(current => ({ ...current, [batch.id]: event.target.value }))} /><Button disabled={pending} onClick={() => void receive(plan.id, batch)}>Record return</Button></>}</div>)}</div>
      {plan.status === 'RETURNED' && <p className="small text-success mt-2">All vendor quantities returned; operation is back in the internal READY queue for acceptance and production evidence.</p>}
    </article>)}</div>
  </section>;
}
