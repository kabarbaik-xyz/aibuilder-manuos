'use client';
import { useListSearch, usePaginatedList } from '@/lib/api/use-paginated-list';
import { ListSearch } from '@/components/ui/list-search';

import { PermissionGate } from '@/components/ui/permission-gate';
import { PageHeader } from '@/components/ui/page-header';
import React, { useState } from 'react';

import { QcChecklist } from '@/features/masters/api';
import { DataTable, Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/resource-state';
import { CreateQcChecklistModal } from '@/features/masters/components/resource-forms';

export default function QcChecklistsPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { search, setSearch, query } = useListSearch();
  const { data, isLoading, error, refetch, pagination } = usePaginatedList<QcChecklist>('qc-checklists', { search: query || undefined });

  const checklists = data?.data || [];

  const columns: Column<QcChecklist>[] = [
    {
      key: 'code',
      header: 'Checklist Code',
      render: (q) => <span className="font-mono font-semibold text-primary">{q.code}</span>,
    },
    {
      key: 'name',
      header: 'Checklist Name',
      render: (q) => <span className="font-medium text-ink">{q.name}</span>,
    },
    {
      key: 'revision',
      header: 'Revision',
      render: (q) => <span className="font-mono text-ink">Rev {q.revision}</span>,
    },
    {
      key: 'checksCount',
      header: 'Checks',
      render: (q) => <span className="text-ink">{q.checks?.length || 0} checks</span>,
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
      <PageHeader title="Quality Checklists" description="Configure standardized quality inspections, measurement tolerances and test points" actions={<><PermissionGate permission="quality.configure"><Button variant="primary" icon="plus" onClick={() => setIsCreateOpen(true)}>
          New Checklist
        </Button></PermissionGate></>} />

      <ListSearch value={search} onChange={setSearch} placeholder="Search checklist code or name…" label="Search quality checklists" />

      {error ? (
        <ErrorState message={(error as any)?.message || 'Failed to load checklists'} onRetry={() => refetch()} />
      ) : (
        <DataTable
          pagination={pagination}
          columns={columns}
          data={checklists}
          isLoading={isLoading}
          emptyTitle="No QC checklists defined"
          emptyDescription="Create quality control inspection checklists with specific tolerance ranges and measurement criteria."
        />
      )}

      <CreateQcChecklistModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
    </div>
  );
}
