'use client';

import React, { useState } from 'react';
import { useMachines } from '@/features/masters/hooks';
import { Machine } from '@/features/masters/api';
import { DataTable, Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/resource-state';
import { CreateMachineDrawer } from '@/features/masters/components/resource-forms';

export default function MachinesPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { data, isLoading, error, refetch } = useMachines();

  const machines = data?.data || [];

  const columns: Column<Machine>[] = [
    {
      key: 'code',
      header: 'Machine Code',
      render: (m) => <span className="font-mono font-semibold text-blue-400">{m.code}</span>,
    },
    {
      key: 'name',
      header: 'Machine Name',
      render: (m) => <span className="font-medium text-neutral-100">{m.name}</span>,
    },
    {
      key: 'machineClass',
      header: 'Class',
      render: (m) => <span className="font-mono text-xs text-neutral-300">{m.machineClass}</span>,
    },
    {
      key: 'hourlyRate',
      header: 'Hourly Cost',
      render: (m) => <span className="text-neutral-300">${(m.hourlyRateCents / 100).toFixed(2)}/hr</span>,
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-100">Machines & Equipment</h1>
          <p className="text-sm text-neutral-400">Manage manufacturing equipment, machine rates, calendar links and capacity</p>
        </div>
        <Button variant="primary" icon="plus" onClick={() => setIsCreateOpen(true)}>
          New Machine
        </Button>
      </div>

      {error ? (
        <ErrorState message={(error as any)?.message || 'Failed to load machines'} onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={machines}
          isLoading={isLoading}
          emptyTitle="No machines registered"
          emptyDescription="Register shop floor machinery (mills, lathes, presses) to enable production dispatch and scheduling."
        />
      )}

      <CreateMachineDrawer isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
    </div>
  );
}
