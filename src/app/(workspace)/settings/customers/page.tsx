'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCustomers } from '@/features/masters/hooks';
import { Customer } from '@/features/masters/api';
import { DataTable, Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/resource-state';
import { CreateCustomerDrawer } from '@/features/masters/components/resource-forms';

export default function CustomersPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { data, isLoading, error, refetch } = useCustomers({ search: search || undefined });

  const customers = data?.data || [];

  const columns: Column<Customer>[] = [
    {
      key: 'code',
      header: 'Code',
      render: (c) => <span className="font-mono font-semibold text-blue-400">{c.code}</span>,
    },
    {
      key: 'name',
      header: 'Customer Name',
      render: (c) => <span className="font-medium text-neutral-100">{c.name}</span>,
    },
    {
      key: 'currency',
      header: 'Currency',
      render: (c) => <span className="font-mono text-neutral-400">{c.currency}</span>,
    },
    {
      key: 'creditTermsDays',
      header: 'Terms',
      render: (c) => <span className="text-neutral-300">{c.creditTermsDays} days</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (c) => (
        <Badge variant={c.status === 'ACTIVE' ? 'success' : c.status === 'SUSPENDED' ? 'warning' : 'default'}>
          {c.status}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-100">Customers</h1>
          <p className="text-sm text-neutral-400">Manage commercial accounts, credit policies and portal links</p>
        </div>
        <Button variant="primary" icon="plus" onClick={() => setIsCreateOpen(true)}>
          New Customer
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
        <ErrorState message={(error as any)?.message || 'Failed to load customers'} onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={customers}
          isLoading={isLoading}
          emptyTitle="No customers registered"
          emptyDescription="Create your first customer to enable order intake and commercial contracts."
          onRowClick={(c) => router.push(`/settings/customers/${c.id}`)}
        />
      )}

      <CreateCustomerDrawer isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
    </div>
  );
}
