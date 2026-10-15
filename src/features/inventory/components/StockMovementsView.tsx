'use client';

import { ErrorState } from '@/components/ui/resource-state';
import { PageHeader } from '@/components/ui/page-header';
import { Dialog } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import React, { useState } from 'react';
import Link from 'next/link';
import { useStockMovements, useReverseMovement } from '../hooks';
import { formatQuantity } from '@/domain/quantity';
import { Button } from '@/components/ui/button';

export function StockMovementsView() {
  const [movementTypeFilter, setMovementTypeFilter] = useState('');
  const [itemFilter, setItemFilter] = useState('');
  const [selectedMovementId, setSelectedMovementId] = useState<string | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [reversalError, setReversalError] = useState<string | null>(null);

  const { data: movements, isLoading, refetch, error: queryError } = useStockMovements({
    movementType: movementTypeFilter || undefined,
  });

  const reverseMutation = useReverseMovement();

  const filteredMovements = (movements || []).filter((m) => {
    const code = (m.itemCode || '').toLowerCase();
    const name = (m.itemName || '').toLowerCase();
    const query = itemFilter.toLowerCase();
    if (itemFilter && !code.includes(query) && !name.includes(query)) {
      return false;
    }
    return true;
  });

  const handleReverse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMovementId) return;
    setReversalError(null);

    try {
      await reverseMutation.mutateAsync({
        input: {
          movementId: selectedMovementId,
          reason: reversalReason,
        },
      });
      setSelectedMovementId(null);
      setReversalReason('');
      refetch();
    } catch (err: any) {
      setReversalError(err.message || 'Failed to reverse movement');
    }
  };

  if (queryError) return <div className="page-stack"><PageHeader title="Stock movements"/><ErrorState message={queryError.message} onRetry={()=>refetch()}/></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Stock Card Ledger" description="Append-only audit trail of every stock entry, transfer, issue, count adjustment, and reversal." actions={<><div className="flex flex-wrap items-center gap-2">
          <Link href="/inventory" className="btn  ">View Current Balances</Link>
          <Button variant="default" size="small" onClick={() => refetch()}>Refresh Ledger</Button>
        </div></>} />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          type="text"
          placeholder="Filter by item code or name..."
          className="input flex-1"
          value={itemFilter}
          onChange={(e) => setItemFilter(e.target.value)}
        />
        <Select
          className="input sm:w-60"
          value={movementTypeFilter}
          onChange={(e) => setMovementTypeFilter(e.target.value)}
        >
          <option value="">All Movement Types</option>
          <option value="OPENING_BALANCE">Opening Balance</option>
          <option value="PURCHASE_RECEIPT">Purchase Receipt</option>
          <option value="TRANSFER">Transfer</option>
          <option value="ISSUE_TO_WIP">Issue to WIP</option>
          <option value="RETURN_FROM_WIP">Return from WIP</option>
          <option value="PRODUCTION_CONSUME">Production Consume</option>
          <option value="PRODUCTION_OUTPUT">Production Output</option>
          <option value="ADJUSTMENT">Adjustment</option>
          <option value="SHIPMENT">Shipment</option>
        </Select>
      </div>

      {/* Ledger Table */}
      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <p className="p-8 text-center text-sm text-muted">Loading movements ledger...</p>
        ) : filteredMovements.length === 0 ? (
          <div className="p-12 text-center text-muted text-sm space-y-2">
            <p>No stock movements recorded yet.</p>
            <p className="text-xs">Post opening balances or receive orders to view ledger history.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-muted border-b border-line text-xs text-muted uppercase font-semibold">
                <tr>
                  <th className="p-3">Occurred At</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Item</th>
                  <th className="p-3">Source Location</th>
                  <th className="p-3">Destination Location</th>
                  <th className="p-3">Lot #</th>
                  <th className="p-3 text-right">Quantity</th>
                  <th className="p-3">Reference</th>
                  <th className="p-3">Actor</th>
                  <th className="p-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredMovements.map((m) => (
                  <tr key={m.id} className="hover:bg-surface-muted transition">
                    <td className="p-3 font-mono text-xs text-muted whitespace-nowrap">
                      {new Date(m.occurredAt).toLocaleString()}
                    </td>
                    <td className="p-3">
                      <span className={`text-xs px-2 py-0.5 rounded font-mono font-medium ${
                        m.movementType === 'OPENING_BALANCE' ? 'bg-primary-soft text-primary' :
                        m.movementType === 'PURCHASE_RECEIPT' ? 'bg-success-soft text-success' :
                        m.movementType === 'ISSUE_TO_WIP' ? 'bg-warning-soft text-warning' :
                        m.movementType === 'RETURN_FROM_WIP' ? 'bg-primary-soft text-primary' :
                        m.movementType === 'ADJUSTMENT' ? 'bg-primary-soft text-primary' :
                        'bg-surface-muted text-muted'
                      }`}>
                        {m.movementType}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="font-medium text-ink">{m.itemCode}</div>
                      <div className="text-xs text-muted">{m.itemName}</div>
                    </td>
                    <td className="p-3">
                      {m.sourceLocationCode ? (
                        <span>{m.sourceLocationCode}</span>
                      ) : (
                        <span className="text-muted italic">—</span>
                      )}
                    </td>
                    <td className="p-3">
                      {m.destinationLocationCode ? (
                        <span>{m.destinationLocationCode}</span>
                      ) : (
                        <span className="text-muted italic">—</span>
                      )}
                    </td>
                    <td className="p-3 font-mono text-xs">
                      {m.destinationLotNumber || m.sourceLotNumber || (
                        <span className="text-muted italic">—</span>
                      )}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-ink">
                      {formatQuantity(m.atoms)}
                    </td>
                    <td className="p-3 text-xs">
                      {m.referenceType ? (
                        <span className="font-mono text-muted">
                          {m.referenceType}
                          {m.referenceId && ` #${m.referenceId.slice(0, 8)}`}
                        </span>
                      ) : (
                        <span className="text-muted italic">—</span>
                      )}
                    </td>
                    <td className="p-3 text-xs text-muted">
                      {m.actorName || 'System'}
                    </td>
                    <td className="p-3 text-center">
                      {m.referenceType !== 'REVERSAL' && (
                        <Button
                          variant="ghost"
                          size="small"
                          onClick={() => {
                            setSelectedMovementId(m.id);
                            setReversalError(null);
                            setReversalReason('');
                          }}
                        >
                          Reverse
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reversal Confirmation Modal */}
      {selectedMovementId && (
        <Dialog isOpen onClose={() => setSelectedMovementId(null)} title="Reverse stock movement" size="md" pending={reverseMutation.isPending}>
          
            
            <p className="text-sm text-muted">
              Reversing movement <span className="font-mono text-ink">{selectedMovementId.slice(0, 8)}</span> will post a compensating double-entry adjustment and retain the original record in the ledger.
            </p>

            {reversalError && (
              <div className="p-3 rounded bg-danger-soft border border-danger/20 text-danger text-xs">
                {reversalError}
              </div>
            )}

            <form onSubmit={handleReverse} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-muted mb-1">
                  Reason for Reversal *
                
                <Input
                  type="text"
                  required
                  placeholder="e.g. Inbound record had wrong lot entered"
                  className="input w-full"
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                /></label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="default"
                  size="small"
                  onClick={() => setSelectedMovementId(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="small"
                  disabled={reverseMutation.isPending || reversalReason.trim().length < 3}
                >
                  {reverseMutation.isPending ? 'Posting Reversal...' : 'Confirm Reversal'}
                </Button>
              </div>
            </form>
          
        </Dialog>
      )}
    </div>
  );
}
