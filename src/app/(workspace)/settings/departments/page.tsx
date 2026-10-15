'use client';

import React, { useState } from 'react';
import { useDepartments } from '@/features/masters/hooks';
import { Department } from '@/features/masters/api';
import { DataTable, Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/resource-state';
import { CreateDepartmentDrawer } from '@/features/masters/components/resource-forms';

export default function DepartmentsPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { data, isLoading, error, refetch } = useDepartments();

  const departments = data?.data || [];

  const columns: Column<Department>[] = [
    {
      key: 'code',
      header: 'Department Code',
      render: (d) => <span className="font-mono font-semibold text-blue-400">{d.code}</span>,
    },
    {
      key: 'name',
      header: 'Department Name',
      render: (d) => <span className="font-medium text-neutral-100">{d.name}</span>,
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-100">Departments</h1>
          <p className="text-sm text-neutral-400">Manage manufacturing work centers, functional areas and resource groups</p>
        </div>
        <Button variant="primary" icon="plus" onClick={() => setIsCreateOpen(true)}>
          New Department
        </Button>
      </div>

      {error ? (
        <ErrorState message={(error as any)?.message || 'Failed to load departments'} onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={departments}
          isLoading={isLoading}
          emptyTitle="No departments defined"
          emptyDescription="Create manufacturing departments (e.g. CNC, Assembly, Quality) to group machines and staff."
        />
      )}

      <CreateDepartmentDrawer isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
    </div>
  );
}
