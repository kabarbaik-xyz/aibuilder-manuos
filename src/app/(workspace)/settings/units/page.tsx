'use client';

import { PermissionGate } from '@/components/ui/permission-gate';
import { PageHeader } from '@/components/ui/page-header';
import React, { useState } from 'react';
import { useUoms } from '@/features/masters/hooks';
import { UnitOfMeasure } from '@/features/masters/api';
import { DataTable, Column } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/resource-state';
import { CreateUomModal } from '@/features/masters/components/resource-forms';

export default function UnitsPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { data, isLoading, error, refetch } = useUoms();

  const uoms = data?.data || [];

  const columns: Column<UnitOfMeasure>[] = [
    {
      key: 'code',
      header: 'UOM Code',
      render: (u) => <span className="font-mono font-semibold text-primary">{u.code}</span>,
    },
    {
      key: 'name',
      header: 'Unit Name',
      render: (u) => <span className="font-medium text-ink">{u.name}</span>,
    },
    {
      key: 'dimension',
      header: 'Physical Dimension',
      render: (u) => <span className="font-mono text-xs text-muted">{u.dimension}</span>,
    },
    {
      key: 'precision',
      header: 'Decimal Precision',
      render: (u) => <span className="text-ink">{u.precision} decimal places</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Units of Measure" description="Manage standard measurement units, dimensions and fixed decimal precisions" actions={<><PermissionGate permission="item.manage"><Button variant="primary" icon="plus" onClick={() => setIsCreateOpen(true)}>
          New Unit
        </Button></PermissionGate></>} />

      {error ? (
        <ErrorState message={(error as any)?.message || 'Failed to load units of measure'} onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={uoms}
          isLoading={isLoading}
          emptyTitle="No measurement units defined"
          emptyDescription="Register base units like PCS, KG, M to quantify materials and operational tracking."
        />
      )}

      <CreateUomModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
    </div>
  );
}
