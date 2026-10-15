'use client';

import React, { useState } from 'react';
import { useLocations } from '@/features/masters/hooks';
import { Location } from '@/features/masters/api';
import { DataTable, Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/resource-state';
import { CreateLocationDrawer } from '@/features/masters/components/resource-forms';

export default function LocationsPage() {
  const [typeFilter, setTypeFilter] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { data, isLoading, error, refetch } = useLocations({
    type: typeFilter || undefined,
  });

  const locations = data?.data || [];

  const columns: Column<Location>[] = [
    {
      key: 'code',
      header: 'Location Code',
      render: (l) => <span className="font-mono font-semibold text-blue-400">{l.code}</span>,
    },
    {
      key: 'name',
      header: 'Location Name',
      render: (l) => <span className="font-medium text-neutral-100">{l.name}</span>,
    },
    {
      key: 'type',
      header: 'Zone Type',
      render: (l) => (
        <Badge variant={l.type === 'RAW' ? 'blue' : l.type === 'WIP' ? 'warning' : l.type === 'FINISHED_GOODS' ? 'success' : 'default'}>
          {l.type.replace('_', ' ')}
        </Badge>
      ),
    },
    {
      key: 'attributes',
      header: 'Properties',
      render: (l) => (
        <span className="text-xs text-neutral-400">
          {l.isPickable ? 'Pickable' : ''}
          {l.isPickable && l.isReceiving ? ' · ' : ''}
          {l.isReceiving ? 'Receiving' : ''}
          {!l.isPickable && !l.isReceiving ? 'Storage only' : ''}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (l) => (
        <Badge variant={l.status === 'ACTIVE' ? 'success' : 'default'}>
          {l.status}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-100">Warehouse Locations</h1>
          <p className="text-sm text-neutral-400">Configure physical zones, raw racks, WIP staging areas and quarantine bins</p>
        </div>
        <Button variant="primary" icon="plus" onClick={() => setIsCreateOpen(true)}>
          New Location
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-md border border-neutral-800 bg-neutral-900/80 px-3 py-1.5 text-sm text-neutral-200 focus:border-blue-500 focus:outline-none"
        >
          <option value="">All Zone Types</option>
          <option value="RAW">Raw Material Zone</option>
          <option value="WIP">Work in Progress (WIP)</option>
          <option value="QUARANTINE">Quarantine Zone</option>
          <option value="FINISHED_GOODS">Finished Goods (FG)</option>
          <option value="SCRAP">Scrap Bin</option>
        </select>
      </div>

      {error ? (
        <ErrorState message={(error as any)?.message || 'Failed to load locations'} onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={locations}
          isLoading={isLoading}
          emptyTitle="No warehouse locations defined"
          emptyDescription="Create physical locations to receive goods, store materials, and manage shop floor WIP."
        />
      )}

      <CreateLocationDrawer isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
    </div>
  );
}
