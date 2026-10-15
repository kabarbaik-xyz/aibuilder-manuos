'use client';

import { ErrorState } from '@/components/ui/resource-state';
import { PageHeader } from '@/components/ui/page-header';
import React, { useState } from 'react';
import Link from 'next/link';
import { useStockCount, useApproveStockCount } from '../hooks';
import { formatQuantity } from '@/domain/quantity';
import { Button } from '@/components/ui/button';

export function StockCountDetailView({ countId }: { countId: string }) {
  const { data: count, isLoading, refetch, error: queryError } = useStockCount(countId);
  const approveMutation = useApproveStockCount();

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleApprove = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await approveMutation.mutateAsync({ id: countId });
      setSuccessMsg('Physical count approved. Discrepancy adjustments have been posted to the inventory ledger.');
      refetch();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to approve stock count');
    }
  };

  if (isLoading) {
    return <p className="p-8 text-center text-sm text-muted">Loading count details...</p>;
  }

  if (!count) {
    if (queryError) return <div className="page-stack"><PageHeader title="Stock count"/><ErrorState message={queryError.message} onRetry={()=>refetch()}/></div>;

  return (
      <div className="card p-8 text-center space-y-4">
        <p className="text-muted">Stock count not found.</p>
        <Link href="/inventory/counts" className="btn  ">Back to Counts Queue</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold font-mono tracking-tight">{count.countNumber}</h1>
            <span className={`text-xs px-2.5 py-1 rounded font-mono font-semibold ${
              count.status === 'APPROVED' ? 'bg-success-soft text-success border border-success/20' :
              count.status === 'SUBMITTED' ? 'bg-warning-soft text-warning border border-warning/20' :
              'bg-surface-muted text-muted'
            }`}>
              {count.status}
            </span>
          </div>
          <p className="text-sm text-muted mt-1">
            Created on {new Date(count.createdAt).toLocaleString()} by <span className="text-ink">{count.countedByName}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/inventory/counts" className="btn  ">Back to Counts</Link>
          {count.status === 'SUBMITTED' && (
            <Button
              variant="primary"
              size="small"
              onClick={handleApprove}
              disabled={approveMutation.isPending}
            >
              {approveMutation.isPending ? 'Posting Adjustments...' : 'Approve & Post Adjustments'}
            </Button>
          )}
        </div>
      </div>

      {successMsg && (
        <div className="p-4 rounded-lg bg-success-soft border border-success/20 text-success text-sm">
          {successMsg}
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-lg bg-danger-soft border border-danger/20 text-danger text-sm">
          <p className="font-semibold">Approval Blocked:</p>
          <p className="mt-1">{errorMsg}</p>
        </div>
      )}

      {/* Meta Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="card p-4">
          <p className="text-xs text-muted uppercase font-semibold">Location</p>
          <p className="text-sm font-medium text-ink mt-1">
            {count.locationCode ? `${count.locationCode} (${count.locationName})` : 'All Locations'}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted uppercase font-semibold">Reason</p>
          <p className="text-sm font-medium text-ink mt-1">{count.reason || 'Cycle Count'}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted uppercase font-semibold">Approver</p>
          <p className="text-sm font-medium text-ink mt-1">{count.approvedByName || 'Pending Owner Review'}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted uppercase font-semibold">Approved At</p>
          <p className="text-sm font-medium text-ink mt-1">
            {count.approvedAt ? new Date(count.approvedAt).toLocaleString() : '—'}
          </p>
        </div>
      </div>

      {/* Count Lines Table */}
      <div className="card p-0 overflow-hidden">
        <div className="p-4 border-b border-line">
          <h2 className="text-base font-semibold">Counted Items & Book Snapshots</h2>
          <p className="text-xs text-muted">Comparison of captured book snapshot against physically counted quantities.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-muted border-b border-line text-xs text-muted uppercase font-semibold">
              <tr>
                <th className="p-3">Item</th>
                <th className="p-3">Location</th>
                <th className="p-3">Lot #</th>
                <th className="p-3 text-right">Book Snapshot</th>
                <th className="p-3 text-right">Counted Quantity</th>
                <th className="p-3 text-right">Discrepancy</th>
                <th className="p-3">Adjustment Movement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {count.lines.map((l) => (
                <tr key={l.id} className="hover:bg-surface-muted transition">
                  <td className="p-3">
                    <div className="font-medium text-ink">{l.itemCode}</div>
                    <div className="text-xs text-muted">{l.itemName}</div>
                  </td>
                  <td className="p-3 font-mono text-xs">{l.locationCode}</td>
                  <td className="p-3 font-mono text-xs">
                    {l.lotNumber || <span className="text-muted italic">—</span>}
                  </td>
                  <td className="p-3 text-right font-mono text-muted">
                    {formatQuantity(l.snapshotAtoms)}
                  </td>
                  <td className="p-3 text-right font-mono font-bold text-ink">
                    {formatQuantity(l.countedAtoms)}
                  </td>
                  <td className={`p-3 text-right font-mono font-bold ${
                    l.discrepancyAtoms > 0n ? 'text-success' :
                    l.discrepancyAtoms < 0n ? 'text-danger' :
                    'text-muted'
                  }`}>
                    {l.discrepancyAtoms > 0n ? `+${`${l.discrepancyAtoms < 0n ? '−' : ''}${formatQuantity(l.discrepancyAtoms < 0n ? -l.discrepancyAtoms : l.discrepancyAtoms)}`}` : `${l.discrepancyAtoms < 0n ? '−' : ''}${formatQuantity(l.discrepancyAtoms < 0n ? -l.discrepancyAtoms : l.discrepancyAtoms)}`}
                  </td>
                  <td className="p-3 text-xs font-mono">
                    {l.movementId ? (
                      <span className="text-primary">
                        MOV-{l.movementId.slice(0, 8)}
                      </span>
                    ) : (
                      <span className="text-muted italic">None (Balanced or Pending)</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
