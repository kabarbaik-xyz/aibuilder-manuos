'use client';
import { usePaginatedList } from '@/lib/api/use-paginated-list';

import { PermissionGate } from '@/components/ui/permission-gate';
import { PageHeader } from '@/components/ui/page-header';
import { Input } from '@/components/ui/input';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Supplier } from '@/features/masters/api';
import { DataTable, Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/resource-state';
import { CreateSupplierModal } from '@/features/masters/components/resource-forms';

export default function SuppliersPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { data, isLoading, error, refetch, pagination } = usePaginatedList<Supplier>('suppliers', { search: search || undefined });

  const suppliers = data?.data || [];

  const columns: Column<Supplier>[] = [
    {
      key: 'code',
      header: 'Code',
      render: (s) => <span className="font-mono font-semibold text-primary">{s.code}</span>,
    },
    {
      key: 'name',
      header: 'Supplier Name',
      render: (s) => <span className="font-medium text-ink">{s.name}</span>,
    },
    {
      key: 'currency',
      header: 'Currency',
      render: (s) => <span className="font-mono text-muted">{s.currency}</span>,
    },
    {
      key: 'leadTimeDays',
      header: 'Lead Time',
      render: (s) => <span className="text-ink">{s.leadTimeDays} days</span>,
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
      <PageHeader title="Suppliers" description="Manage material vendors, service suppliers and procurement parameters" actions={<><PermissionGate permission="supplier.manage"><Button variant="primary" icon="plus" onClick={() => setIsCreateOpen(true)}>
          New Supplier
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
        <ErrorState message={(error as any)?.message || 'Failed to load suppliers'} onRetry={() => refetch()} />
      ) : (
        <DataTable
          pagination={pagination}
          columns={columns}
          data={suppliers}
          isLoading={isLoading}
          emptyTitle="No suppliers registered"
          emptyDescription="Register your supply chain vendors to enable purchase orders and raw material tracking."
          getRowHref={(s) => `/settings/suppliers/${s.id}`}
        />
      )}

      <CreateSupplierModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
    </div>
  );
}
