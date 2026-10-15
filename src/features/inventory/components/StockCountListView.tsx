'use client';
import { usePaginatedList } from '@/lib/api/use-paginated-list';
import { Pagination } from '@/components/ui/pagination';
import type { StockCountDTO } from '@/server/modules/inventory/contracts';

import { ErrorState } from '@/components/ui/resource-state';
import { PageHeader } from '@/components/ui/page-header';
import React from 'react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';

export function StockCountListView() {
  const { data: pageData, isLoading, refetch, error: queryError, pagination } = usePaginatedList<StockCountDTO>('stock-counts');
  const counts = pageData?.data || [];

  if (queryError) return <div className="page-stack"><PageHeader title="Stock counts"/><ErrorState message={queryError.message} onRetry={()=>refetch()}/></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Physical Inventory Counts" description="Cycle counts, versioned book snapshots, and discrepancy reconciliations." actions={<><div className="flex items-center gap-2">
          <Link href="/inventory/counts/new" className="btn primary ">Record New Count</Link>
          <Button variant="default" size="small" onClick={() => refetch()}>Refresh</Button>
        </div></>} />

      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <p className="p-8 text-center text-sm text-muted">Loading physical count queue...</p>
        ) : !counts || counts.length === 0 ? (
          <div className="p-12 text-center text-muted text-sm space-y-2">
            <p>No physical counts recorded yet.</p>
            <p className="text-xs">Start a cycle count to verify on-hand stock and reconcile discrepancies.</p>
          </div>
        ) : (
          <div className="divide-y divide-line">
            {counts.map((c) => (
              <div key={c.id} className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:bg-surface-muted transition">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <Link href={`/inventory/counts/${c.id}`} className="font-mono font-bold text-base text-ink hover:text-primary">
                      {c.countNumber}
                    </Link>
                    <span className={`text-xs px-2 py-0.5 rounded font-mono font-semibold ${
                      c.status === 'APPROVED' ? 'bg-success-soft text-success border border-success/20' :
                      c.status === 'SUBMITTED' ? 'bg-warning-soft text-warning border border-warning/20' :
                      'bg-surface-muted text-muted'
                    }`}>
                      {c.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted">
                    Location: {c.locationCode ? `${c.locationCode} (${c.locationName})` : 'All Locations'} · Reason: {c.reason || 'Cycle Count'}
                  </p>
                  <p className="text-xs text-muted">
                    Counted by: <span className="text-ink">{c.countedByName}</span> · Lines: {c.lines.length}
                    {c.approvedByName && (
                      <span> · Approved by: <span className="text-ink">{c.approvedByName}</span></span>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-muted">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </span>
                  <Link href={`/inventory/counts/${c.id}`} className="btn  ">
                      View Details
                    </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Pagination {...pagination} />
    </div>
  );
}
