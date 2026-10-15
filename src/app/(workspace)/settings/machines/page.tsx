'use client';
import { usePaginatedList } from '@/lib/api/use-paginated-list';

import { PermissionGate } from '@/components/ui/permission-gate';
import { PageHeader } from '@/components/ui/page-header';
import React, { useState } from 'react';

import { Machine } from '@/features/masters/api';
import { DataTable, Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/resource-state';
import { CreateMachineModal } from '@/features/masters/components/resource-forms';

export default function MachinesPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { data, isLoading, error, refetch, pagination } = usePaginatedList<Machine>('machines', {});

  const machines = data?.data || [];

  const columns: Column<Machine>[] = [
    {
      key: 'code',
      header: 'Machine Code',
      render: (m) => <span className="font-mono font-semibold text-primary">{m.code}</span>,
    },
    {
      key: 'name',
      header: 'Machine Name',
      render: (m) => <span className="font-medium text-ink">{m.name}</span>,
    },
    {
      key: 'machineClass',
      header: 'Class',
      render: (m) => <span className="font-mono text-xs text-ink">{m.machineClass}</span>,
    },
    {
      key: 'hourlyRate',
      header: 'Hourly Cost',
      render: (m) => <span className="text-ink">{m.hourlyRateCents != null ? `$${(m.hourlyRateCents / 100).toFixed(2)}/hr` : '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (m) => (
        <Badge variant={m.status === 'ACTIVE' ? 'success' : m.status === 'MAINTENANCE' ? 'warning' : 'danger'}>
          {m.status}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Machines & Equipment" description="Manage manufacturing equipment, machine rates, calendar links and capacity" actions={<><PermissionGate permission="resource.manage"><Button variant="primary" icon="plus" onClick={() => setIsCreateOpen(true)}>
          New Machine
        </Button></PermissionGate></>} />

      {error ? (
        <ErrorState message={(error as any)?.message || 'Failed to load machines'} onRetry={() => refetch()} />
      ) : (
        <DataTable
          pagination={pagination}
          columns={columns}
          data={machines}
          isLoading={isLoading}
          emptyTitle="No machines registered"
          emptyDescription="Register shop floor machinery (mills, lathes, presses) to enable production dispatch and scheduling."
        />
      )}

      <CreateMachineModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
    </div>
  );
}
