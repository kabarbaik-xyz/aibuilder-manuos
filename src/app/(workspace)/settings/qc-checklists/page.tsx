'use client';

import React, { useState } from 'react';
import { useQcChecklists } from '@/features/masters/hooks';
import { QcChecklist } from '@/features/masters/api';
import { DataTable, Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/resource-state';
import { CreateQcChecklistDrawer } from '@/features/masters/components/resource-forms';

export default function QcChecklistsPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { data, isLoading, error, refetch } = useQcChecklists();

  const checklists = data?.data || [];

  const columns: Column<QcChecklist>[] = [
    {
      key: 'code',
      header: 'Checklist Code',
      render: (q) => <span className="font-mono font-semibold text-blue-400">{q.code}</span>,
    },
    {
      key: 'name',
      header: 'Checklist Name',
      render: (q) => <span className="font-medium text-neutral-100">{q.name}</span>,
    },
    {
      key: 'revision',
      header: 'Revision',
      render: (q) => <span className="font-mono text-neutral-300">Rev {q.revision}</span>,
    },
    {
      key: 'checksCount',
      header: 'Checks',
      render: (q) => <span className="text-neutral-300">{q.checks?.length || 0} checks</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (q) => (
        <Badge variant={q.status === 'PUBLISHED' ? 'success' : q.status === 'DRAFT' ? 'warning' : 'default'}>
          {q.status}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-100">Quality Checklists</h1>
          <p className="text-sm text-neutral-400">Configure standardized quality inspections, measurement tolerances and test points</p>
        </div>
        <Button variant="primary" icon="plus" onClick={() => setIsCreateOpen(true)}>
          New Checklist
        </Button>
      </div>

      {error ? (
        <ErrorState message={(error as any)?.message || 'Failed to load checklists'} onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={checklists}
          isLoading={isLoading}
          emptyTitle="No QC checklists defined"
          emptyDescription="Create quality control inspection checklists with specific tolerance ranges and measurement criteria."
        />
      )}

      <CreateQcChecklistDrawer isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
    </div>
  );
}
