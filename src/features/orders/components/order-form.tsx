'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCreateOrderDraft } from '../hooks';
import { useCustomers, useOrderTypes, useItems } from '@/features/masters/hooks';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FormErrorSummary } from '@/components/ui/form-errors';
import { ErrorState, LoadingState } from '@/components/ui/resource-state';
import { useWorkspaceNavigation } from '@/components/workspace-navigation-context';
import { apiRequest } from '@/lib/api/client';
import { useWorkflowTemplates } from '@/features/workflows/hooks';
import { isOrderLifecycleEnabled } from '@/domain/order-lifecycle-rollout';

export function OrderForm() {
  const router = useRouter();
  const [rfqDraftId, setRfqDraftId] = useState<string | null>(null);
  const prefix = useId();
  const createOrder = useCreateOrderDraft();
  const [customerId, setCustomerId] = useState('');
  const [orderTypeId, setOrderTypeId] = useState('');
  const [workflowVersionId, setWorkflowVersionId] = useState('');
  const [lifecycleWorkflowVersionId, setLifecycleWorkflowVersionId] = useState('');
  const customersQuery = useCustomers();
  const typesQuery = useOrderTypes();
  const itemsQuery = useItems();
  const workflowsQuery = useWorkflowTemplates();
  const lifecycleRolloutEnabled = isOrderLifecycleEnabled();
  const { principal } = useWorkspaceNavigation();
  const customers = customersQuery.data?.data || [];
  const orderTypes = typesQuery.data?.data || [];
  const items = itemsQuery.data?.data || [];
  const compatibleWorkflows = (workflowsQuery.data ?? [])
    .filter(workflow => workflow.orderTypeId === orderTypeId && workflow.kind === 'PRODUCTION_ROUTING')
    .flatMap(workflow => (workflow.versions ?? [])
      .filter(version => version.status === 'PUBLISHED')
      .map(version => ({ ...version, workflowName: workflow.name })))
    .sort((a, b) => b.versionNumber - a.versionNumber);
  const compatibleLifecycles = (workflowsQuery.data ?? [])
    .filter(workflow => workflow.orderTypeId === orderTypeId && workflow.kind === 'ORDER_LIFECYCLE')
    .flatMap(workflow => (workflow.versions ?? [])
      .filter(version => version.status === 'PUBLISHED')
      .map(version => ({ ...version, workflowName: workflow.name })))
    .sort((a, b) => b.versionNumber - a.versionNumber);
  const selectedLifecycle = compatibleLifecycles.find(version => version.id === lifecycleWorkflowVersionId);
  let lifecyclePreview: { stageName: string; action: string; assignment: string } | null = null;
  if (selectedLifecycle) {
    try {
      const definition = JSON.parse(selectedLifecycle.definitionJson) as { stages?: Array<{ name: string; action: string; predecessors: string[]; assignment: { kind: string } }> };
      const firstStage = definition.stages?.find(stage => stage.predecessors.length === 0);
      if (firstStage) lifecyclePreview = {
        stageName: firstStage.name,
        action: firstStage.action.replaceAll('_', ' ').toLowerCase(),
        assignment: firstStage.assignment.kind === 'MEMBER' ? 'a specifically assigned team member' : 'the eligible department queue',
      };
    } catch {
      lifecyclePreview = null;
    }
  }
  const lineSequence = useRef(1);
  const [lines, setLines] = useState([{ key: 1, itemId: '', quantity: '' }]);
  const [requestedDate, setRequestedDate] = useState('');
  const [promisedDate, setPromisedDate] = useState('');
  const [rfqText, setRfqText] = useState('');
  const [rfqSourceType, setRfqSourceType] = useState<'MANUAL' | 'EMAIL' | 'UPLOAD'>('MANUAL');
  const [error, setError] = useState<Error | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);
  const pending = createOrder.isPending;
  const queries = [customersQuery, typesQuery, itemsQuery];
  const ready = queries.every(query => !query.isPending && !query.error) && customers.length > 0 && orderTypes.length > 0 && items.length > 0;

  useEffect(() => {
    const sourceId = new URLSearchParams(window.location.search).get('rfqDraftId');
    if (!sourceId) return;
    setRfqDraftId(sourceId);
    let active = true;
    setSourceLoading(true);
    apiRequest<{ data: { rawText: string; orderId: string | null; reviewState: string; extraction: { qty: number }; matchedMasters: { customerId: string | null; itemId: string | null } } }>(`/api/engineering/intake/extractions/${sourceId}`)
      .then(({ data }) => {
        if (!active) return;
        if (data.orderId) throw new Error('This RFQ review has already been attached to an order.');
        if (data.reviewState !== 'REVIEWED') throw new Error('This RFQ must be reviewed before it can be attached to an order.');
        if (data.matchedMasters.customerId) setCustomerId(data.matchedMasters.customerId);
        if (data.matchedMasters.itemId) setLines([{ key: 1, itemId: data.matchedMasters.itemId, quantity: String(data.extraction.qty) }]);
        else setLines([{ key: 1, itemId: '', quantity: String(data.extraction.qty) }]);
        setRfqText(data.rawText);
      })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason : new Error('Unable to load reviewed RFQ source.')); })
      .finally(() => { if (active) setSourceLoading(false); });
    return () => { active = false; };
  }, []);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending || !ready) return;
    setError(null);
    if (!requestedDate) { setError(new Error('Choose the requested delivery date.')); return; }
    if (lines.some(line => !line.itemId || !line.quantity || !Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0)) {
      setError(new Error('Set an item and a positive quantity for every order line.'));
      return;
    }
    createOrder.mutate({ customerId, orderTypeId, ...(workflowVersionId ? { workflowVersionId } : {}), ...(lifecycleWorkflowVersionId ? { lifecycleWorkflowVersionId } : {}), itemId: lines[0].itemId, lines: lines.map(line => ({ itemId: line.itemId, orderedQuantity: line.quantity })), requestedDate: new Date(requestedDate).toISOString(), promisedDate: promisedDate ? new Date(promisedDate).toISOString() : null, rfqText: rfqDraftId ? '' : rfqText, rfqSourceType, ...(rfqDraftId ? { rfqDraftId } : {}) }, {
      onSuccess: response => router.push(`/orders/${response.data.id}`),
      onError: err => setError(err),
    });
  }

  function addLine() {
    const key = ++lineSequence.current;
    setLines(current => [...current, { key, itemId: '', quantity: '' }]);
  }

  return <div className="page-stack order-intake">
    <PageHeader title="New order" description="Capture the customer request. Engineering and production release follow after review." actions={<><Link className="btn soft" href="/orders/intake">Import RFQ</Link><Link className="btn" href="/orders">Back to orders</Link></>} />
    {queries.some(query => query.isPending) ? <LoadingState message="Loading customers, order types and items…" /> : queries.some(query => query.error) ? <ErrorState title="Unable to load order references" onRetry={() => queries.forEach(query => query.refetch())} /> : !ready && <div className="form-section page-stack"><h2>Set up order references first</h2><p className="muted">An order needs a customer, an order type and an item before it can be saved.</p><div className="page-header-actions">{!customers.length && principal?.permissions.includes('customer.manage') && <Link className="btn" href="/settings/customers">Add customer</Link>}{!orderTypes.length && principal?.permissions.includes('workflow.author') && <Link className="btn" href="/settings/order-types">Set up order types</Link>}{!items.length && principal?.permissions.includes('item.manage') && <Link className="btn" href="/inventory/items">Add item</Link>}</div></div>}
    {rfqDraftId && <div className="rounded-lg border border-line bg-surface p-3 small" role="status">Reviewed RFQ source {rfqDraftId} will be attached to this order draft. Confirm the customer, item, quantity and dates before saving.</div>}
    {sourceLoading && <LoadingState message="Loading reviewed RFQ and matched masters…" />}
    <form onSubmit={handleSubmit} className="page-stack" aria-busy={pending || sourceLoading}>
      <FormErrorSummary error={error} />
      <section className="form-section page-stack"><div><h2>Order details</h2><p className="field-help">Fields marked * are required.</p></div><div className="form-grid">
        <FormField id={`${prefix}-customer`} label="Customer" required><Select value={customerId} onChange={e => setCustomerId(e.target.value)} disabled={!ready || pending}><option value="">Select customer…</option>{customers.map(c => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</Select></FormField>
        <FormField id={`${prefix}-type`} label="Order type" required><Select value={orderTypeId} onChange={e => { setOrderTypeId(e.target.value); setWorkflowVersionId(''); setLifecycleWorkflowVersionId(''); }} disabled={!ready || pending}><option value="">Select order type…</option>{orderTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></FormField>
      </div></section>
      {orderTypeId && <section className="form-section page-stack"><div><h2>Order workflow</h2><p className="field-help">Lifecycle defines cross-department owners and handoffs. Production routing defines Engineering operations and the work Planning schedules.</p></div>{lifecycleRolloutEnabled && <><FormField id={`${prefix}-lifecycle`} label="Order lifecycle"><Select value={lifecycleWorkflowVersionId} onChange={event => setLifecycleWorkflowVersionId(event.target.value)} disabled={pending || workflowsQuery.isPending}><option value="">Legacy order flow · without lifecycle stages</option>{compatibleLifecycles.map(version => <option key={version.id} value={version.id}>{version.workflowName} · v{version.versionNumber}</option>)}</Select></FormField>{selectedLifecycle && <div className="rounded-lg border border-line bg-surface-muted p-3 text-sm"><strong>{selectedLifecycle.workflowName} · version {selectedLifecycle.versionNumber}</strong>{lifecyclePreview ? <p className="mt-1 text-muted">Starts with <span className="font-medium text-ink">{lifecyclePreview.stageName}</span> · {lifecyclePreview.action} · assigned to {lifecyclePreview.assignment}. Later stages define their own owners, required forms, and deadline or production-capacity policy.</p> : <p className="mt-1 text-warning">The first stage preview is unavailable. Review this published workflow before creating an order.</p>}</div>}</>}<FormField id={`${prefix}-workflow`} label="Production routing"><Select value={workflowVersionId} onChange={event => setWorkflowVersionId(event.target.value)} disabled={pending || workflowsQuery.isPending}><option value="">Order type default</option>{compatibleWorkflows.map(version => <option key={version.id} value={version.id}>{version.workflowName} · v{version.versionNumber}</option>)}</Select></FormField>{workflowsQuery.error && <p className="text-xs text-warning">Daftar workflow belum tersedia; lifecycle dan routing dapat dipilih setelah workflow dimuat.</p>}</section>}
      <section className="form-section page-stack"><div className="flex items-start justify-between gap-4"><div><h2>Order lines</h2><p className="field-help">Each item is tracked and released as its own manufacturing job.</p></div><Button icon="plus" onClick={addLine} disabled={!ready || pending}>Add item</Button></div>
        {lines.map((line, index) => <div className="form-grid order-line-row" key={line.key}>
          <FormField id={`${prefix}-line-${line.key}-item`} label={`Item ${index + 1}`} required><Select value={line.itemId} onChange={event => setLines(current => current.map(row => row.key === line.key ? { ...row, itemId: event.target.value } : row))} disabled={!ready || pending}><option value="">Select item…</option>{items.map(item => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</Select></FormField>
          <FormField id={`${prefix}-line-${line.key}-quantity`} label="Ordered quantity" required><Input type="number" min="0.000001" step="any" value={line.quantity} onChange={event => setLines(current => current.map(row => row.key === line.key ? { ...row, quantity: event.target.value } : row))} disabled={pending} placeholder="Enter quantity" /></FormField>
          {lines.length > 1 && <Button variant="icon" icon="close" aria-label={`Remove item ${index + 1}`} title="Remove line" disabled={pending} onClick={() => setLines(current => current.filter(row => row.key !== line.key))} />}
        </div>)}
      </section>
      <section className="form-section page-stack"><div><h2>Delivery dates</h2><p className="field-help">Keep the customer's request separate from an agreed delivery commitment.</p></div><div className="form-grid">
        <FormField id={`${prefix}-requested`} label="Requested delivery date" required><DatePicker value={requestedDate} onChange={setRequestedDate} required disabled={pending} /></FormField>
        <FormField id={`${prefix}-promised`} label="Committed delivery date" help="Optional. Set only when a delivery date has been agreed."><DatePicker value={promisedDate} onChange={setPromisedDate} clearable disabled={pending} /></FormField>
      </div></section>
      <section className="form-section page-stack"><h2>Customer request</h2><FormField id={`${prefix}-source`} label="Request source"><Select value={rfqSourceType} onChange={e => setRfqSourceType(e.target.value as typeof rfqSourceType)} disabled={pending}><option value="MANUAL">Manual entry</option><option value="EMAIL">Email</option></Select></FormField><FormField id={`${prefix}-notes`} label="RFQ context and notes" help="Include specifications, drawing references and questions that engineering needs to review."><Textarea value={rfqText} onChange={e => setRfqText(e.target.value)} disabled={pending} placeholder="Describe the customer request…" /></FormField></section>
      <div className="form-page-actions"><Link href="/orders" className="btn">Cancel</Link><Button type="submit" variant="primary" disabled={!ready || pending || sourceLoading}>{pending ? 'Creating draft…' : 'Create order draft'}</Button></div>
    </form>
  </div>;
}
