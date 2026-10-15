'use client';

import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useItems } from '@/features/masters/hooks';
import { Item } from '@/features/masters/api';
import { DataTable, Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/resource-state';
import { CreateItemModal } from '@/features/masters/components/resource-forms';

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
      render: (i) => <span className="font-mono font-semibold text-primary">{i.code}</span>,
    },
    {
      key: 'name',
      header: 'Item Name',
      render: (i) => <span className="font-medium text-ink">{i.name}</span>,
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
      render: (i) => <span className="font-mono text-ink">{i.baseUom?.code || '—'}</span>,
    },
    {
      key: 'tracking',
      header: 'Tracking',
      render: (i) => (
        <span className="text-xs text-muted">
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
      <PageHeader title="Item Master" description="Manage parts catalog, raw materials, assemblies and unit definitions" actions={<><Button variant="primary" icon="plus" onClick={() => setIsCreateOpen(true)}>
          New Item
        </Button></>} />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Input
            type="text"
            placeholder="Search code or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-muted focus:border-primary/20 focus:outline-none"
          />
        </div>
        <Select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:border-primary/20 focus:outline-none"
        >
          <option value="">All Item Types</option>
          <option value="RAW_MATERIAL">Raw Material</option>
          <option value="COMPONENT">Component</option>
          <option value="SUBASSEMBLY">Subassembly</option>
          <option value="FINISHED_GOOD">Finished Good</option>
          <option value="CONSUMABLE">Consumable</option>
        </Select>
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
          getRowHref={(i) => `/inventory/items/${i.id}`}
        />
      )}

      <CreateItemModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
    </div>
  );
}
