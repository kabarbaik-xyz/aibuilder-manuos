'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useItems } from '@/features/masters/hooks';
import { Item } from '@/features/masters/api';
import { DataTable, Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/resource-state';
import { CreateItemDrawer } from '@/features/masters/components/resource-forms';

export default function ItemsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { data, isLoading, error, refetch } = useItems({
    search: search || undefined,
    type: typeFilter || undefined,
  });

  const items = data?.data || [];

  const columns: Column<Item>[] = [
    {
      key: 'code',
      header: 'Part / Item Code',
      render: (i) => <span className="font-mono font-semibold text-blue-400">{i.code}</span>,
    },
    {
      key: 'name',
      header: 'Item Name',
      render: (i) => <span className="font-medium text-neutral-100">{i.name}</span>,
    },
    {
      key: 'type',
      header: 'Type',
      render: (i) => (
        <Badge variant={i.type === 'RAW_MATERIAL' ? 'blue' : i.type === 'FINISHED_GOOD' ? 'success' : 'default'}>
          {i.type.replace('_', ' ')}
        </Badge>
      ),
    },
    {
      key: 'baseUom',
      header: 'Base UOM',
      render: (i) => <span className="font-mono text-neutral-300">{i.baseUom?.code || '—'}</span>,
    },
    {
      key: 'tracking',
      header: 'Tracking',
      render: (i) => (
        <span className="text-xs text-neutral-400">
          {i.isLotTracked ? 'Lot' : ''}
          {i.isLotTracked && i.isSerialTracked ? ' + ' : ''}
          {i.isSerialTracked ? 'Serial' : ''}
          {!i.isLotTracked && !i.isSerialTracked ? 'Standard' : ''}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (i) => (
        <Badge variant={i.status === 'ACTIVE' ? 'success' : 'default'}>
          {i.status}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-100">Item Master</h1>
          <p className="text-sm text-neutral-400">Manage parts catalog, raw materials, assemblies and unit definitions</p>
        </div>
        <Button variant="primary" icon="plus" onClick={() => setIsCreateOpen(true)}>
          New Item
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <input
            type="text"
            placeholder="Search code or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-neutral-800 bg-neutral-900/80 px-3 py-1.5 text-sm text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-md border border-neutral-800 bg-neutral-900/80 px-3 py-1.5 text-sm text-neutral-200 focus:border-blue-500 focus:outline-none"
        >
          <option value="">All Item Types</option>
          <option value="RAW_MATERIAL">Raw Material</option>
          <option value="COMPONENT">Component</option>
          <option value="SUBASSEMBLY">Subassembly</option>
          <option value="FINISHED_GOOD">Finished Good</option>
          <option value="CONSUMABLE">Consumable</option>
        </select>
      </div>

      {error ? (
        <ErrorState message={(error as any)?.message || 'Failed to load items'} onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={items}
          isLoading={isLoading}
          emptyTitle="No items in catalog"
          emptyDescription="Create raw materials or finished assemblies to begin inventory tracking."
          onRowClick={(i) => router.push(`/inventory/items/${i.id}`)}
        />
      )}

      <CreateItemDrawer isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
    </div>
  );
}
