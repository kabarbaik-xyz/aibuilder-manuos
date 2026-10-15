'use client';

import React from 'react';
import Link from 'next/link';
import { useStockCounts } from '../hooks';
import { Button } from '@/components/ui/button';

export function StockCountListView() {
  const { data: counts, isLoading, refetch } = useStockCounts();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Physical Inventory Counts</h1>
          <p className="text-sm text-muted">
            Cycle counts, versioned book snapshots, and discrepancy reconciliations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/inventory/counts/new">
            <Button variant="primary" size="small">Record New Count</Button>
          </Link>
          <Button variant="default" size="small" onClick={() => refetch()}>Refresh</Button>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <p className="p-8 text-center text-sm text-muted">Loading physical count queue...</p>
        ) : !counts || counts.length === 0 ? (
          <div className="p-12 text-center text-muted text-sm space-y-2">
            <p>No physical counts recorded yet.</p>
            <p className="text-xs">Start a cycle count to verify on-hand stock and reconcile discrepancies.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {counts.map((c) => (
              <div key={c.id} className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:bg-muted/5 transition">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <Link href={`/inventory/counts/${c.id}`} className="font-mono font-bold text-base text-white hover:text-sky-400">
                      {c.countNumber}
                    </Link>
                    <span className={`text-xs px-2 py-0.5 rounded font-mono font-semibold ${
                      c.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                      c.status === 'SUBMITTED' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                      'bg-muted/20 text-muted'
                    }`}>
                      {c.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted">
                    Location: {c.locationCode ? `${c.locationCode} (${c.locationName})` : 'All Locations'} · Reason: {c.reason || 'Cycle Count'}
                  </p>
                  <p className="text-xs text-muted">
                    Counted by: <span className="text-white">{c.countedByName}</span> · Lines: {c.lines.length}
                    {c.approvedByName && (
                      <span> · Approved by: <span className="text-white">{c.approvedByName}</span></span>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-muted">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </span>
                  <Link href={`/inventory/counts/${c.id}`}>
                    <Button variant="default" size="small">
                      View Details
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
