'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSuppliers } from '@/features/masters/hooks';
import { Supplier } from '@/features/masters/api';
import { DataTable, Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/resource-state';
import { CreateSupplierDrawer } from '@/features/masters/components/resource-forms';

export default function SuppliersPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { data, isLoading, error, refetch } = useSuppliers({ search: search || undefined });

  const suppliers = data?.data || [];

  const columns: Column<Supplier>[] = [
    {
      key: 'code',
      header: 'Code',
      render: (s) => <span className="font-mono font-semibold text-blue-400">{s.code}</span>,
    },
    {
      key: 'name',
      header: 'Supplier Name',
      render: (s) => <span className="font-medium text-neutral-100">{s.name}</span>,
    },
    {
      key: 'currency',
      header: 'Currency',
      render: (s) => <span className="font-mono text-neutral-400">{s.currency}</span>,
    },
    {
      key: 'leadTimeDays',
      header: 'Lead Time',
      render: (s) => <span className="text-neutral-300">{s.leadTimeDays} days</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (s) => (
        <Badge variant={s.status === 'ACTIVE' ? 'success' : s.status === 'SUSPENDED' ? 'warning' : 'default'}>
          {s.status}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-100">Suppliers</h1>
          <p className="text-sm text-neutral-400">Manage material vendors, service suppliers and procurement parameters</p>
        </div>
        <Button variant="primary" icon="plus" onClick={() => setIsCreateOpen(true)}>
          New Supplier
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <input
            type="text"
            placeholder="Search code or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-neutral-800 bg-neutral-900/80 px-3 py-1.5 text-sm text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      {error ? (
        <ErrorState message={(error as any)?.message || 'Failed to load suppliers'} onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={suppliers}
          isLoading={isLoading}
          emptyTitle="No suppliers registered"
          emptyDescription="Register your supply chain vendors to enable purchase orders and raw material tracking."
          onRowClick={(s) => router.push(`/settings/suppliers/${s.id}`)}
        />
      )}

      <CreateSupplierDrawer isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
    </div>
  );
}
