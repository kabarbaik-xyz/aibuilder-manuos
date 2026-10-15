'use client';
import { usePaginatedList } from '@/lib/api/use-paginated-list';

import { PermissionGate } from '@/components/ui/permission-gate';
import { PageHeader } from '@/components/ui/page-header';
import { Input } from '@/components/ui/input';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Customer } from '@/features/masters/api';
import { DataTable, Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/resource-state';
import { CreateCustomerModal } from '@/features/masters/components/resource-forms';

export default function CustomersPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { data, isLoading, error, refetch, pagination } = usePaginatedList<Customer>('customers', { search: search || undefined });

  const customers = data?.data || [];

  const columns: Column<Customer>[] = [
    {
      key: 'code',
      header: 'Code',
      render: (c) => <span className="font-mono font-semibold text-primary">{c.code}</span>,
    },
    {
      key: 'name',
      header: 'Customer Name',
      render: (c) => <span className="font-medium text-ink">{c.name}</span>,
    },
    {
      key: 'email',
      header: 'Email',
      render: (c) => <span className="font-mono text-muted">{c.email || '—'}</span>,
    },
    {
      key: 'phone',
      header: 'Phone',
      render: (c) => <span className="text-ink">{c.phone || '—'}</span>,
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
      <PageHeader title="Customers" description="Manage customer identities and contact details" actions={<><PermissionGate permission="customer.manage"><Button variant="primary" icon="plus" onClick={() => setIsCreateOpen(true)}>
          New Customer
        </Button></PermissionGate></>} />

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Input
            type="text"
            placeholder="Search code or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-muted focus:border-primary/20 focus:outline-none"
          />
        </div>
      </div>

      {error ? (
        <ErrorState message={(error as any)?.message || 'Failed to load customers'} onRetry={() => refetch()} />
      ) : (
        <DataTable
          pagination={pagination}
          columns={columns}
          data={customers}
          isLoading={isLoading}
          emptyTitle="No customers registered"
          emptyDescription="Create your first customer to enable order intake and commercial contracts."
          getRowHref={(c) => `/settings/customers/${c.id}`}
        />
      )}

      <CreateCustomerModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
    </div>
  );
}
