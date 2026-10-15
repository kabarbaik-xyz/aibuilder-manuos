'use client';
import { useListSearch, usePaginatedList } from '@/lib/api/use-paginated-list';
import { ListSearch } from '@/components/ui/list-search';

import { PermissionGate } from '@/components/ui/permission-gate';
import { PageHeader } from '@/components/ui/page-header';
import React, { useState } from 'react';

import { OrderType } from '@/features/masters/api';
import { DataTable, Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/resource-state';
import { CreateOrderTypeModal } from '@/features/masters/components/resource-forms';

export default function OrderTypesPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { search, setSearch, query } = useListSearch();
  const { data, isLoading, error, refetch, pagination } = usePaginatedList<OrderType>('order-types', { search: query || undefined });

  const orderTypes = data?.data || [];

  const columns: Column<OrderType>[] = [
    {
      key: 'code',
      header: 'Type Code',
      render: (o) => <span className="font-mono font-semibold text-primary">{o.code}</span>,
    },
    {
      key: 'name',
      header: 'Order Type Name',
      render: (o) => <span className="font-medium text-ink">{o.name}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (o) => (
        <Badge variant={o.status === 'ACTIVE' ? 'success' : 'default'}>
          {o.status}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Order Types" description="Classify order categories, manufacturing lifecycles and default routing templates" actions={<><PermissionGate permission="workflow.author"><Button variant="primary" icon="plus" onClick={() => setIsCreateOpen(true)}>
          New Order Type
        </Button></PermissionGate></>} />

      <ListSearch value={search} onChange={setSearch} placeholder="Search order type code or name…" label="Search order types" />

      {error ? (
        <ErrorState message={(error as any)?.message || 'Failed to load order types'} onRetry={() => refetch()} />
      ) : (
        <DataTable
          pagination={pagination}
          columns={columns}
          data={orderTypes}
          isLoading={isLoading}
          emptyTitle="No order types defined"
          emptyDescription="Define order types (e.g. Prototype, Production MTO, Repair) to drive routing rules and engineering review."
        />
      )}

      <CreateOrderTypeModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
    </div>
  );
}
