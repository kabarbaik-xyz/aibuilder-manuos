'use client';

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

  const { data: movements, isLoading, refetch } = useStockMovements({
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Stock Card Ledger</h1>
          <p className="text-sm text-muted">
            Append-only audit trail of every stock entry, transfer, issue, count adjustment, and reversal.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/inventory">
            <Button variant="default" size="small">View Current Balances</Button>
          </Link>
          <Button variant="default" size="small" onClick={() => refetch()}>Refresh Ledger</Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Filter by item code or name..."
          className="input flex-1"
          value={itemFilter}
          onChange={(e) => setItemFilter(e.target.value)}
        />
        <select
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
        </select>
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
              <thead className="bg-muted/10 border-b border-border text-xs text-muted uppercase font-semibold">
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
              <tbody className="divide-y divide-border">
                {filteredMovements.map((m) => (
                  <tr key={m.id} className="hover:bg-muted/5 transition">
                    <td className="p-3 font-mono text-xs text-muted whitespace-nowrap">
                      {new Date(m.occurredAt).toLocaleString()}
                    </td>
                    <td className="p-3">
                      <span className={`text-xs px-2 py-0.5 rounded font-mono font-medium ${
                        m.movementType === 'OPENING_BALANCE' ? 'bg-indigo-500/10 text-indigo-400' :
                        m.movementType === 'PURCHASE_RECEIPT' ? 'bg-emerald-500/10 text-emerald-400' :
                        m.movementType === 'ISSUE_TO_WIP' ? 'bg-amber-500/10 text-amber-400' :
                        m.movementType === 'RETURN_FROM_WIP' ? 'bg-sky-500/10 text-sky-400' :
                        m.movementType === 'ADJUSTMENT' ? 'bg-purple-500/10 text-purple-400' :
                        'bg-muted/20 text-muted'
                      }`}>
                        {m.movementType}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="font-medium text-white">{m.itemCode}</div>
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
                    <td className="p-3 text-right font-mono font-bold text-white">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="card max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold">Reverse Stock Movement</h3>
            <p className="text-sm text-muted">
              Reversing movement <span className="font-mono text-white">{selectedMovementId.slice(0, 8)}</span> will post a compensating double-entry adjustment and retain the original record in the ledger.
            </p>

            {reversalError && (
              <div className="p-3 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                {reversalError}
              </div>
            )}

            <form onSubmit={handleReverse} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-muted mb-1">
                  Reason for Reversal *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Inbound record had wrong lot entered"
                  className="input w-full"
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                />
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
          </div>
        </div>
      )}
    </div>
  );
}
