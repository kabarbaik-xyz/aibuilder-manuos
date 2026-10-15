'use client';

import React, { useState } from 'react';
import { useOrderTypes } from '@/features/masters/hooks';
import { OrderType } from '@/features/masters/api';
import { DataTable, Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/resource-state';
import { CreateOrderTypeDrawer } from '@/features/masters/components/resource-forms';

export default function OrderTypesPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { data, isLoading, error, refetch } = useOrderTypes();

  const orderTypes = data?.data || [];

  const columns: Column<OrderType>[] = [
    {
      key: 'code',
      header: 'Type Code',
      render: (o) => <span className="font-mono font-semibold text-blue-400">{o.code}</span>,
    },
    {
      key: 'name',
      header: 'Order Type Name',
      render: (o) => <span className="font-medium text-neutral-100">{o.name}</span>,
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-100">Order Types</h1>
          <p className="text-sm text-neutral-400">Classify order categories, manufacturing lifecycles and default routing templates</p>
        </div>
        <Button variant="primary" icon="plus" onClick={() => setIsCreateOpen(true)}>
          New Order Type
        </Button>
      </div>

      {error ? (
        <ErrorState message={(error as any)?.message || 'Failed to load order types'} onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={orderTypes}
          isLoading={isLoading}
          emptyTitle="No order types defined"
          emptyDescription="Define order types (e.g. Prototype, Production MTO, Repair) to drive routing rules and engineering review."
        />
      )}

      <CreateOrderTypeDrawer isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
    </div>
  );
}
