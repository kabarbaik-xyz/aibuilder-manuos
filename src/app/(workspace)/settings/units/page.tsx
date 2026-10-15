'use client';

import React, { useState } from 'react';
import { useUoms } from '@/features/masters/hooks';
import { UnitOfMeasure } from '@/features/masters/api';
import { DataTable, Column } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/resource-state';
import { CreateUomDrawer } from '@/features/masters/components/resource-forms';

export default function UnitsPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { data, isLoading, error, refetch } = useUoms();

  const uoms = data?.data || [];

  const columns: Column<UnitOfMeasure>[] = [
    {
      key: 'code',
      header: 'UOM Code',
      render: (u) => <span className="font-mono font-semibold text-blue-400">{u.code}</span>,
    },
    {
      key: 'name',
      header: 'Unit Name',
      render: (u) => <span className="font-medium text-neutral-100">{u.name}</span>,
    },
    {
      key: 'dimension',
      header: 'Physical Dimension',
      render: (u) => <span className="font-mono text-xs text-neutral-400">{u.dimension}</span>,
    },
    {
      key: 'precision',
      header: 'Decimal Precision',
      render: (u) => <span className="text-neutral-300">{u.precision} decimal places</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-100">Units of Measure</h1>
          <p className="text-sm text-neutral-400">Manage standard measurement units, dimensions and fixed decimal precisions</p>
        </div>
        <Button variant="primary" icon="plus" onClick={() => setIsCreateOpen(true)}>
          New Unit
        </Button>
      </div>

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

      <CreateUomDrawer isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
    </div>
  );
}
