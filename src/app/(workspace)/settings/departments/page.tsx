'use client';
import { usePaginatedList } from '@/lib/api/use-paginated-list';

import { PermissionGate } from '@/components/ui/permission-gate';
import { PageHeader } from '@/components/ui/page-header';
import React, { useState } from 'react';

import { Department } from '@/features/masters/api';
import { DataTable, Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/resource-state';
import { CreateDepartmentModal } from '@/features/masters/components/resource-forms';

export default function DepartmentsPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { data, isLoading, error, refetch, pagination } = usePaginatedList<Department>('departments', {});

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
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Departments" description="Manage manufacturing work centers, functional areas and resource groups" actions={<><PermissionGate permission="resource.manage"><Button variant="primary" icon="plus" onClick={() => setIsCreateOpen(true)}>
          New Department
        </Button></PermissionGate></>} />

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
    </div>
  );
}
