'use client';

import React, { useState } from 'react';
import { SupplyOrderDTO } from '@/server/modules/supply/contracts';
import { useApproveSupplyOrder, useChangeSupplyEta, useSupplyReceipts } from '../hooks';
import { SupplyReceiptModal } from './supply-receipt-modal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FormErrorSummary } from '@/components/ui/form-errors';
import { formatQuantity } from '@/domain/quantity';

interface SupplyOrderDetailProps {
  order: SupplyOrderDTO;
}

export function SupplyOrderDetail({ order }: SupplyOrderDetailProps) {
  const approveOrder = useApproveSupplyOrder();
  const changeEta = useChangeSupplyEta();
  const { data: receipts } = useSupplyReceipts({ supplyOrderId: order.id });

  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isChangeEtaOpen, setIsChangeEtaOpen] = useState(false);
  const [newEta, setNewEta] = useState(order.expectedDate.slice(0, 10));
  const [etaReason, setEtaReason] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleApprove = async () => {
    setErrorMsg(null);
    try {
      await approveOrder.mutateAsync({ id: order.id });
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to approve supply order');
    }
  };

  const handleChangeEta = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      await changeEta.mutateAsync({
        id: order.id,
        input: {
          expectedDate: new Date(newEta).toISOString(),
          reason: etaReason.trim() || undefined,
        },
      });
      setIsChangeEtaOpen(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update ETA');
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return 'success';
      case 'PARTIALLY_RECEIVED':
        return 'warning';
      case 'RECEIVED':
        return 'success';
      case 'CANCELLED':
        return 'danger';
      default:
        return 'default';
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {errorMsg && <FormErrorSummary message={errorMsg} />}

      {/* Header Card */}
      <div className="card space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{order.orderNumber}</h1>
              <Badge variant={getStatusBadgeVariant(order.status) as any}>
                {order.status}
              </Badge>
            </div>
            <p className="text-sm text-muted mt-1">
              Supplier: <strong className="text-white">{order.supplierName}</strong> ({order.supplierCode})
            </p>
          </div>

          <div className="flex items-center gap-2">
            {order.status === 'DRAFT' && (
              <Button
                variant="primary"
                onClick={handleApprove}
                disabled={approveOrder.isPending}
              >
                {approveOrder.isPending ? 'Approving...' : 'Approve Purchase Order'}
              </Button>
            )}

            {(order.status === 'APPROVED' || order.status === 'PARTIALLY_RECEIVED') && (
              <Button
                variant="primary"
                onClick={() => setIsReceiptModalOpen(true)}
              >
                Receive Shipment
              </Button>
            )}

            {order.status !== 'CANCELLED' && order.status !== 'RECEIVED' && (
              <Button
                variant="default"
                onClick={() => setIsChangeEtaOpen(true)}
              >
                Change ETA
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-xs text-muted block uppercase">Expected Delivery</span>
            <span className="font-medium">{new Date(order.expectedDate).toLocaleDateString()}</span>
          </div>
          <div>
            <span className="text-xs text-muted block uppercase">Created At</span>
            <span className="font-medium">{new Date(order.createdAt).toLocaleDateString()}</span>
          </div>
          <div>
            <span className="text-xs text-muted block uppercase">Approved By</span>
            <span className="font-medium">{order.approvedById ? 'Verified' : 'Pending'}</span>
          </div>
          <div>
            <span className="text-xs text-muted block uppercase">Version</span>
            <span className="font-medium">v{order.version}</span>
          </div>
        </div>

        {order.notes && (
          <div className="p-3 bg-muted/20 rounded text-xs border border-border">
            <span className="font-semibold text-muted block mb-0.5">Order Notes / Audit:</span>
            <span>{order.notes}</span>
          </div>
        )}
      </div>

      {/* Change ETA Modal */}
      {isChangeEtaOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-surface border border-border rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-border pb-2">
              <h3 className="font-semibold text-lg">Update Expected Delivery</h3>
              <button type="button" onClick={() => setIsChangeEtaOpen(false)} className="text-muted hover:text-white">
                ✕
              </button>
            </div>
            <form onSubmit={handleChangeEta} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted uppercase mb-1">New Expected Date</label>
                <input
                  type="date"
                  value={newEta}
                  onChange={(e) => setNewEta(e.target.value)}
                  className="w-full rounded border border-border bg-surface px-3 py-2 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted uppercase mb-1">Reason for Adjustment</label>
                <input
                  type="text"
                  placeholder="e.g. Supplier freight logistics delay"
                  value={etaReason}
                  onChange={(e) => setEtaReason(e.target.value)}
                  className="w-full rounded border border-border bg-surface px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="default" onClick={() => setIsChangeEtaOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={changeEta.isPending}>
                  {changeEta.isPending ? 'Updating...' : 'Save New ETA'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Line Items Card */}
      <div className="card space-y-4">
        <h3 className="text-lg font-semibold border-b border-border pb-2">Ordered Materials & Open Balance</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted bg-muted/20 border-b border-border">
              <tr>
                <th className="px-4 py-2">Item Code</th>
                <th className="px-4 py-2">Material Name</th>
                <th className="px-4 py-2">Tracking</th>
                <th className="px-4 py-2 text-right">Ordered</th>
                <th className="px-4 py-2 text-right">Received</th>
                <th className="px-4 py-2 text-right font-bold">Open Qty</th>
                <th className="px-4 py-2">Rate (IDR)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {order.lines.map((line) => {
                const openUnits = formatQuantity(line.openAtoms);
                const isFulfilled = line.openAtoms === 0n;

                return (
                  <tr key={line.id} className={isFulfilled ? 'opacity-70 bg-muted/5' : ''}>
                    <td className="px-4 py-3 font-mono font-medium">{line.itemCode}</td>
                    <td className="px-4 py-3">{line.itemName}</td>
                    <td className="px-4 py-3 text-xs">
                      <span className="px-2 py-0.5 rounded bg-muted/30">{line.tracking}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {formatQuantity(line.orderedAtoms)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-400">
                      {formatQuantity(line.receivedAtoms)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold">
                      <span className={isFulfilled ? 'text-muted' : 'text-sky-400'}>
                        {openUnits}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {line.unitPriceCents ? `Rp ${(line.unitPriceCents).toLocaleString()}` : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Receipts History */}
      <div className="card space-y-4">
        <h3 className="text-lg font-semibold border-b border-border pb-2">Posted Inbound Receipts</h3>
        {!receipts || receipts.length === 0 ? (
          <p className="text-sm text-muted py-4 text-center">
            No receipts posted yet. Approve the purchase order and receive materials when shipments arrive.
          </p>
        ) : (
          <div className="space-y-4">
            {receipts.map((rec) => (
              <div key={rec.id} className="p-4 rounded border border-border bg-muted/10 space-y-3">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center text-xs text-muted border-b border-border pb-2">
                  <div className="flex items-center gap-2">
                    <strong className="text-sm text-white font-mono">{rec.receiptNumber}</strong>
                    <span>· Received by {rec.receivedByName}</span>
                  </div>
                  <span>{new Date(rec.receivedDate).toLocaleString()}</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="text-muted border-b border-border">
                      <tr>
                        <th className="py-1">Material</th>
                        <th className="py-1">Location</th>
                        <th className="py-1">Lot Number</th>
                        <th className="py-1 text-right">Received</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {rec.lines.map((rl) => (
                        <tr key={rl.id}>
                          <td className="py-1.5 font-medium">{rl.itemCode} - {rl.itemName}</td>
                          <td className="py-1.5 font-mono text-muted">{rl.locationCode}</td>
                          <td className="py-1.5 font-mono text-sky-400">{rl.lotNumber || '-'}</td>
                          <td className="py-1.5 text-right font-mono font-bold text-emerald-400">
                            +{formatQuantity(rl.receivedAtoms)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {rec.notes && <p className="text-xs text-muted italic">Notes: {rec.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Receipt Modal */}
      <SupplyReceiptModal
        order={order}
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
      />
    </div>
  );
}
