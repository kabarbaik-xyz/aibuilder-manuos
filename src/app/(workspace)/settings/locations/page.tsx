'use client';
import { useListSearch, usePaginatedList } from '@/lib/api/use-paginated-list';
import { ListSearch } from '@/components/ui/list-search';

import { PermissionGate } from '@/components/ui/permission-gate';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import React, { useState } from 'react';

import { Location } from '@/features/masters/api';
import { DataTable, Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/resource-state';
import { CreateLocationModal } from '@/features/masters/components/resource-forms';
import { ArchiveMasterDialog, MasterRowActions } from '@/features/masters/components/master-row-actions';
import { CatalogNameEditDialog } from '@/features/masters/components/catalog-name-edit-dialog';

export default function LocationsPage() {
  const [typeFilter, setTypeFilter] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [locationToArchive, setLocationToArchive] = useState<Location | null>(null);
  const { search, setSearch, query } = useListSearch();
  const { data, isLoading, error, refetch, pagination } = usePaginatedList<Location>('locations', {
    type: typeFilter || undefined,
    search: query || undefined,
  });

  const locations = data?.data || [];

  const columns: Column<Location>[] = [
    {
      key: 'code',
      header: 'Location Code',
      render: (l) => <span className="font-mono font-semibold text-primary">{l.code}</span>,
    },
    {
      key: 'name',
      header: 'Location Name',
      render: (l) => <span className="font-medium text-ink">{l.name}</span>,
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
        <span className="text-xs text-muted">
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
    {
      key: 'actions',
      header: 'Actions',
      render: (location) => (
        <PermissionGate permission="location.manage">
          <MasterRowActions onEdit={() => setSelectedLocation(location)} onArchive={() => setLocationToArchive(location)} />
        </PermissionGate>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Warehouse Locations" description="Configure physical zones, raw racks, WIP staging areas and quarantine bins" actions={<><PermissionGate permission="location.manage"><Button variant="primary" icon="plus" onClick={() => setIsCreateOpen(true)}>
          New Location
        </Button></PermissionGate></>} />

      <div className="flex items-center gap-3">
        <ListSearch value={search} onChange={setSearch} placeholder="Search location code or name…" label="Search locations" />
        <Select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:border-primary/20 focus:outline-none"
        >
          <option value="">All Zone Types</option>
          <option value="RAW">Raw Material Zone</option>
          <option value="WIP">Work in Progress (WIP)</option>
          <option value="QUARANTINE">Quarantine Zone</option>
          <option value="FINISHED_GOODS">Finished Goods (FG)</option>
          <option value="SCRAP">Scrap Bin</option>
        </Select>
      </div>

      {error ? (
        <ErrorState message={(error as any)?.message || 'Failed to load locations'} onRetry={() => refetch()} />
      ) : (
        <DataTable
          pagination={pagination}
          columns={columns}
          data={locations}
          isLoading={isLoading}
          emptyTitle="No warehouse locations defined"
          emptyDescription="Create physical locations to receive goods, store materials, and manage shop floor WIP."
        />
      )}

      <CreateLocationModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
      <CatalogNameEditDialog resource="locations" record={selectedLocation} onClose={() => setSelectedLocation(null)} />
      <ArchiveMasterDialog
        isOpen={!!locationToArchive}
        onClose={() => setLocationToArchive(null)}
        endpoint={`/api/locations/${locationToArchive?.id}`}
        recordName={locationToArchive?.name || 'location'}
        onArchived={refetch}
      />
    </div>
  );
}
