'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSupplier, useUpdateSupplier } from '@/features/masters/hooks';
import { LoadingState, ErrorState } from '@/components/ui/resource-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormErrorSummary } from '@/components/ui/form-errors';
import { ApiError } from '@/lib/api/client';

export default function SupplierDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const { data, isLoading, error, refetch } = useSupplier(id);
  const updateSupplier = useUpdateSupplier(id);

  const supplier = data?.data;

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState('');
  const [leadTime, setLeadTime] = useState(7);
  const [currency, setCurrency] = useState('USD');
  const [updateError, setUpdateError] = useState<ApiError | null>(null);

  React.useEffect(() => {
    if (supplier) {
      setName(supplier.name);
      setLeadTime(supplier.leadTimeDays);
      setCurrency(supplier.currency);
    }
  }, [supplier]);

  if (isLoading) return <LoadingState />;
  if (error || !supplier) {
    return <ErrorState message={(error as any)?.message || 'Supplier not found'} onRetry={() => refetch()} />;
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdateError(null);
    try {
      await updateSupplier.mutateAsync({
        expectedVersion: supplier.version,
        name: name.trim(),
        leadTimeDays: Number(leadTime),
        currency: currency.trim().toUpperCase(),
      });
      setIsEditing(false);
    } catch (err: any) {
      setUpdateError(err);
    }
  };

  const handleArchive = async () => {
    if (!confirm('Are you sure you want to archive this supplier?')) return;
    try {
      await updateSupplier.mutateAsync({
        expectedVersion: supplier.version,
        status: 'ARCHIVED',
      });
    } catch (err: any) {
      alert(err.message || 'Failed to archive supplier');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="small" icon="arrow-left" onClick={() => router.push('/settings/suppliers')}>
          Back to Suppliers
        </Button>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-neutral-100">{supplier.name}</h1>
            <Badge variant={supplier.status === 'ACTIVE' ? 'success' : supplier.status === 'SUSPENDED' ? 'warning' : 'default'}>
              {supplier.status}
            </Badge>
          </div>
          <p className="font-mono text-sm text-neutral-400 mt-1">Code: {supplier.code} · Rev: v{supplier.version}</p>
        </div>
        <div className="flex gap-2">
          {!isEditing ? (
            <>
              <Button variant="default" onClick={() => setIsEditing(true)}>Edit Details</Button>
              {supplier.status !== 'ARCHIVED' && (
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
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Supplier Name</label>
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
              <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Lead Time (Days)</label>
              <input
                type="number"
                min={0}
                value={leadTime}
                onChange={(e) => setLeadTime(Number(e.target.value))}
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
            <Button type="submit" variant="primary" disabled={updateSupplier.isPending}>
              {updateSupplier.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-5 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">Procurement Settings</h2>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-neutral-400">Default Currency</span>
              <span className="font-mono text-neutral-200">{supplier.currency}</span>
              <span className="text-neutral-400">Expected Lead Time</span>
              <span className="text-neutral-200">{supplier.leadTimeDays} days</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
