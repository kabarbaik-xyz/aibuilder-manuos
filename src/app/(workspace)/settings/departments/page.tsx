'use client';
import { useListSearch, usePaginatedList } from '@/lib/api/use-paginated-list';
import { ListSearch } from '@/components/ui/list-search';

import { PermissionGate } from '@/components/ui/permission-gate';
import { PageHeader } from '@/components/ui/page-header';
import React, { useState } from 'react';

import { Department } from '@/features/masters/api';
import { DataTable, Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/resource-state';
import { CreateDepartmentModal } from '@/features/masters/components/resource-forms';
import { ArchiveMasterDialog, MasterRowActions } from '@/features/masters/components/master-row-actions';
import { CatalogNameEditDialog } from '@/features/masters/components/catalog-name-edit-dialog';

export default function DepartmentsPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null);
  const [departmentToArchive, setDepartmentToArchive] = useState<Department | null>(null);
  const { search, setSearch, query } = useListSearch();
  const { data, isLoading, error, refetch, pagination } = usePaginatedList<Department>('departments', { search: query || undefined });

  const departments = data?.data || [];

  const columns: Column<Department>[] = [
    {
      key: 'code',
      header: 'Department Code',
      render: (d) => <span className="font-mono font-semibold text-primary">{d.code}</span>,
    },
    {
      key: 'name',
      header: 'Department Name',
      render: (d) => <span className="font-medium text-ink">{d.name}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (d) => (
        <Badge variant={d.status === 'ACTIVE' ? 'success' : 'default'}>
          {d.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (department) => (
        <PermissionGate permission="resource.manage">
          <MasterRowActions onEdit={() => setSelectedDepartment(department)} onArchive={() => setDepartmentToArchive(department)} />
        </PermissionGate>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Departments" description="Manage manufacturing work centers, functional areas and resource groups" actions={<><PermissionGate permission="resource.manage"><Button variant="primary" icon="plus" onClick={() => setIsCreateOpen(true)}>
          New Department
        </Button></PermissionGate></>} />

      <ListSearch value={search} onChange={setSearch} placeholder="Search department code or name…" label="Search departments" />

      {error ? (
        <ErrorState message={(error as any)?.message || 'Failed to load departments'} onRetry={() => refetch()} />
      ) : (
        <DataTable
          pagination={pagination}
          columns={columns}
          data={departments}
          isLoading={isLoading}
          emptyTitle="No departments defined"
          emptyDescription="Create manufacturing departments (e.g. CNC, Assembly, Quality) to group machines and staff."
        />
      )}

      <CreateDepartmentModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
      <CatalogNameEditDialog resource="departments" record={selectedDepartment} onClose={() => setSelectedDepartment(null)} />
      <ArchiveMasterDialog
        isOpen={!!departmentToArchive}
        onClose={() => setDepartmentToArchive(null)}
        endpoint={`/api/resources/catalog/departments/${departmentToArchive?.id}`}
        recordName={departmentToArchive?.name || 'department'}
        onArchived={refetch}
      />
    </div>
  );
}
