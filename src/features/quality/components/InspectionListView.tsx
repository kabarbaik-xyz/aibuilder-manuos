'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useInspections } from '../hooks';
import { ButtonLink } from '@/components/ui/button-link';
import { Badge } from '@/components/ui/badge';
import { formatQuantity } from '@/domain/quantity';
import { PageHeader } from '@/components/ui/page-header';
import { Panel } from '@/components/ui/panel';
import { EmptyState } from '@/components/ui/empty-state';

export function InspectionListView() {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const { data: inspections, isLoading, error } = useInspections(
    statusFilter ? { status: statusFilter } : undefined
  );

  return (
    <div className="page-stack">
      <PageHeader
        title="Quality Control & Inspections"
        description="Verify manufactured outputs and receipts against engineering specifications and checklists."
      />

      {/* Filter Tabs */}
      <div className="tabs">
        <button
          type="button"
          onClick={() => setStatusFilter('')}
          className={`tab ${statusFilter === '' ? 'active' : ''}`}
        >
          All Inspections
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter('DRAFT')}
          className={`tab ${statusFilter === 'DRAFT' ? 'active' : ''}`}
        >
          Pending / Draft
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter('FINALIZED')}
          className={`tab ${statusFilter === 'FINALIZED' ? 'active' : ''}`}
        >
          Finalized & Released
        </button>
      </div>

      <Panel>
        {isLoading ? (
          <div className="p-8 text-center text-xs text-muted">
            Loading inspections ledger...
          </div>
        ) : error ? (
          <div className="p-8 text-center text-xs text-danger">
            Failed to load inspections: {error.message}
          </div>
        ) : !inspections || inspections.length === 0 ? (
          <EmptyState
            title="No inspections found"
            description="Inspections are created when shop floor operators submit production outputs or warehouse staff receive materials."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-line text-muted font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Inspection</th>
                  <th className="py-3 px-4">Source & Item</th>
                  <th className="py-3 px-4">Lot / Batch</th>
                  <th className="py-3 px-4">Inspected</th>
                  <th className="py-3 px-4">Passed</th>
                  <th className="py-3 px-4">Rework</th>
                  <th className="py-3 px-4">Scrap</th>
                  <th className="py-3 px-4">Disposition</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-ink">
                {inspections.map((insp) => (
                  <tr key={insp.id} className="hover:bg-surface-muted/50 transition">
                    <td className="py-3 px-4 font-mono font-medium">
                      <Link
                        href={`/quality/inspections/${insp.id}`}
                        className="text-primary hover:underline"
                      >
                        {insp.id.slice(0, 8)}…
                      </Link>
                      <div className="text-[11px] text-muted font-sans mt-0.5">
                        {new Date(insp.createdAt).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium">
                        {insp.productionOutput?.item?.name || 'Production Batch'}
                      </div>
                      <div className="text-[11px] text-muted">
                        {insp.productionOutput?.task?.instance?.order?.orderNumber
                          ? `Order ${insp.productionOutput.task.instance.order.orderNumber}`
                          : insp.sourceType}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px]">
                      {insp.productionOutput?.lot?.lotNumber || '—'}
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold">
                      {formatQuantity(insp.inspectedAtoms)}
                    </td>
                    <td className="py-3 px-4 font-mono text-success">
                      {formatQuantity(insp.passedAtoms)}
                    </td>
                    <td className="py-3 px-4 font-mono text-warning">
                      {formatQuantity(insp.reworkAtoms)}
                    </td>
                    <td className="py-3 px-4 font-mono text-danger">
                      {formatQuantity(insp.scrappedAtoms)}
                    </td>
                    <td className="py-3 px-4">
                      {insp.status === 'DRAFT' ? (
                        <Badge variant="warning">DRAFT / PENDING</Badge>
                      ) : insp.disposition === 'PASSED' ? (
                        <Badge variant="success">PASSED</Badge>
                      ) : insp.disposition === 'REWORK' ? (
                        <Badge variant="warning">REWORK HELD</Badge>
                      ) : insp.disposition === 'SCRAPPED' ? (
                        <Badge variant="danger">SCRAPPED</Badge>
                      ) : (
                        <Badge variant="blue">PARTIAL</Badge>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <ButtonLink
                        href={`/quality/inspections/${insp.id}`}
                        size="small"
                      >
                        {insp.status === 'DRAFT' ? 'Conduct QC' : 'View Disposition'}
                      </ButtonLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
