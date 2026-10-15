'use client';

import { useId, useState } from 'react';
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

export function OrderForm() {
  const router = useRouter();
  const prefix = useId();
  const createOrder = useCreateOrderDraft();
  const customersQuery = useCustomers();
  const typesQuery = useOrderTypes();
  const itemsQuery = useItems();
  const { principal } = useWorkspaceNavigation();
  const customers = customersQuery.data?.data || [];
  const orderTypes = typesQuery.data?.data || [];
  const items = itemsQuery.data?.data || [];
  const [customerId, setCustomerId] = useState('');
  const [orderTypeId, setOrderTypeId] = useState('');
  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [requestedDate, setRequestedDate] = useState('');
  const [promisedDate, setPromisedDate] = useState('');
  const [rfqText, setRfqText] = useState('');
  const [rfqSourceType, setRfqSourceType] = useState<'MANUAL' | 'EMAIL' | 'UPLOAD'>('MANUAL');
  const [error, setError] = useState<Error | null>(null);
  const pending = createOrder.isPending;
  const queries = [customersQuery, typesQuery, itemsQuery];
  const ready = queries.every(query => !query.isPending && !query.error) && customers.length > 0 && orderTypes.length > 0 && items.length > 0;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending || !ready) return;
    setError(null);
    if (!requestedDate) { setError(new Error('Choose the requested delivery date.')); return; }
    createOrder.mutate({ customerId, orderTypeId, itemId, orderedQuantity: Number(quantity), requestedDate: new Date(requestedDate).toISOString(), promisedDate: promisedDate ? new Date(promisedDate).toISOString() : null, rfqText, rfqSourceType }, {
      onSuccess: response => router.push(`/orders/${response.data.id}`),
      onError: err => setError(err),
    });
  }

  return <div className="page-stack order-intake">
    <PageHeader title="New order" description="Capture the customer request. Engineering and production release follow after review." actions={<Link className="btn" href="/orders">Back to orders</Link>} />
    {queries.some(query => query.isPending) ? <LoadingState message="Loading customers, order types and items…" /> : queries.some(query => query.error) ? <ErrorState title="Unable to load order references" onRetry={() => queries.forEach(query => query.refetch())} /> : !ready && <div className="form-section page-stack"><h2>Set up order references first</h2><p className="muted">An order needs a customer, an order type and an item before it can be saved.</p><div className="page-header-actions">{!customers.length && principal?.permissions.includes('customer.manage') && <Link className="btn" href="/settings/customers">Add customer</Link>}{!orderTypes.length && principal?.permissions.includes('workflow.author') && <Link className="btn" href="/settings/order-types">Set up order types</Link>}{!items.length && principal?.permissions.includes('item.manage') && <Link className="btn" href="/inventory/items">Add item</Link>}</div></div>}
    <form onSubmit={handleSubmit} className="page-stack" aria-busy={pending}>
      <FormErrorSummary error={error} />
      <section className="form-section page-stack"><div><h2>Order details</h2><p className="field-help">Fields marked * are required.</p></div><div className="form-grid">
        <FormField id={`${prefix}-customer`} label="Customer" required><Select value={customerId} onChange={e => setCustomerId(e.target.value)} disabled={!ready || pending}><option value="">Select customer…</option>{customers.map(c => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</Select></FormField>
        <FormField id={`${prefix}-type`} label="Order type" required><Select value={orderTypeId} onChange={e => setOrderTypeId(e.target.value)} disabled={!ready || pending}><option value="">Select order type…</option>{orderTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></FormField>
        <FormField id={`${prefix}-item`} label="Target item" required><Select value={itemId} onChange={e => setItemId(e.target.value)} disabled={!ready || pending}><option value="">Select item…</option>{items.map(i => <option key={i.id} value={i.id}>{i.code} · {i.name}</option>)}</Select></FormField>
        <FormField id={`${prefix}-quantity`} label="Ordered quantity" required><Input type="number" min="0.000001" step="any" value={quantity} onChange={e => setQuantity(e.target.value)} disabled={pending} placeholder="Enter quantity" /></FormField>
      </div></section>
      <section className="form-section page-stack"><div><h2>Delivery dates</h2><p className="field-help">Keep the customer's request separate from an agreed delivery commitment.</p></div><div className="form-grid">
        <FormField id={`${prefix}-requested`} label="Requested delivery date" required><DatePicker value={requestedDate} onChange={setRequestedDate} required disabled={pending} /></FormField>
        <FormField id={`${prefix}-promised`} label="Committed delivery date" help="Optional. Set only when a delivery date has been agreed."><DatePicker value={promisedDate} onChange={setPromisedDate} clearable disabled={pending} /></FormField>
      </div></section>
      <section className="form-section page-stack"><h2>Customer request</h2><FormField id={`${prefix}-source`} label="Request source"><Select value={rfqSourceType} onChange={e => setRfqSourceType(e.target.value as typeof rfqSourceType)} disabled={pending}><option value="MANUAL">Manual entry</option><option value="EMAIL">Email</option></Select></FormField><FormField id={`${prefix}-notes`} label="RFQ context and notes" help="Include specifications, drawing references and questions that engineering needs to review."><Textarea value={rfqText} onChange={e => setRfqText(e.target.value)} disabled={pending} placeholder="Describe the customer request…" /></FormField></section>
      <div className="form-page-actions"><Link href="/orders" className="btn">Cancel</Link><Button type="submit" variant="primary" disabled={!ready || pending}>{pending ? 'Creating draft…' : 'Create order draft'}</Button></div>
    </form>
  </div>;
}
