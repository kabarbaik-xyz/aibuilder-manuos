'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCustomer, useUpdateCustomer } from '@/features/masters/hooks';
import { LoadingState, ErrorState } from '@/components/ui/resource-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormErrorSummary } from '@/components/ui/form-errors';
import { ApiError } from '@/lib/api/client';

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const { data, isLoading, error, refetch } = useCustomer(id);
  const updateCustomer = useUpdateCustomer(id);

  const customer = data?.data;

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState('');
  const [creditTerms, setCreditTerms] = useState(30);
  const [currency, setCurrency] = useState('USD');
  const [updateError, setUpdateError] = useState<ApiError | null>(null);

  // Initialize edit fields when data loads
  React.useEffect(() => {
    if (customer) {
      setName(customer.name);
      setCreditTerms(customer.creditTermsDays);
      setCurrency(customer.currency);
    }
  }, [customer]);

  if (isLoading) return <LoadingState />;
  if (error || !customer) {
    return <ErrorState message={(error as any)?.message || 'Customer not found'} onRetry={() => refetch()} />;
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdateError(null);
    try {
      await updateCustomer.mutateAsync({
        expectedVersion: customer.version,
        name: name.trim(),
        creditTermsDays: Number(creditTerms),
        currency: currency.trim().toUpperCase(),
      });
      setIsEditing(false);
    } catch (err: any) {
      setUpdateError(err);
    }
  };

  const handleArchive = async () => {
    if (!confirm('Are you sure you want to archive this customer?')) return;
    try {
      await updateCustomer.mutateAsync({
        expectedVersion: customer.version,
        status: 'ARCHIVED',
      });
    } catch (err: any) {
      alert(err.message || 'Failed to archive customer');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="small" icon="arrow-left" onClick={() => router.push('/settings/customers')}>
          Back to Customers
        </Button>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-neutral-100">{customer.name}</h1>
            <Badge variant={customer.status === 'ACTIVE' ? 'success' : customer.status === 'SUSPENDED' ? 'warning' : 'default'}>
              {customer.status}
            </Badge>
          </div>
          <p className="font-mono text-sm text-neutral-400 mt-1">Code: {customer.code} · Rev: v{customer.version}</p>
        </div>
        <div className="flex gap-2">
          {!isEditing ? (
            <>
              <Button variant="default" onClick={() => setIsEditing(true)}>Edit Details</Button>
              {customer.status !== 'ARCHIVED' && (
                <Button variant="ghost" onClick={handleArchive}>Archive</Button>
              )}
            </>
          ) : (
            <Button variant="ghost" onClick={() => setIsEditing(false)}>Cancel</Button>
          )}
        </div>
      </div>

      {isEditing ? (
        <form onSubmit={handleSave} className="max-w-xl space-y-4 rounded-lg border border-neutral-800 bg-neutral-900/60 p-5">
          <FormErrorSummary error={updateError} />
          <div>
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Company Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Credit Terms (Days)</label>
              <input
                type="number"
                min={0}
                value={creditTerms}
                onChange={(e) => setCreditTerms(Number(e.target.value))}
                className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Currency</label>
              <input
                type="text"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" variant="primary" disabled={updateCustomer.isPending}>
              {updateCustomer.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-5 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">Commercial Details</h2>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-neutral-400">Currency</span>
              <span className="font-mono text-neutral-200">{customer.currency}</span>
              <span className="text-neutral-400">Credit Terms</span>
              <span className="text-neutral-200">{customer.creditTermsDays} days</span>
              <span className="text-neutral-400">Tax ID / VAT</span>
              <span className="font-mono text-neutral-200">{customer.taxId || '—'}</span>
            </div>
          </div>

          <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-5 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">Registered Contacts</h2>
            {customer.contacts && customer.contacts.length > 0 ? (
              <div className="space-y-2">
                {customer.contacts.map((c) => (
                  <div key={c.id} className="text-sm border-b border-neutral-800/60 pb-2">
                    <div className="font-medium text-neutral-200">{c.name} {c.isPrimary && <span className="text-xs text-blue-400">(Primary)</span>}</div>
                    <div className="text-xs text-neutral-400">{c.email || 'No email'} · {c.phone || 'No phone'}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-neutral-500 italic">No secondary contacts registered</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
