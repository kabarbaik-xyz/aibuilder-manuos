'use client';

import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SupplyOrderDTO } from '@/server/modules/supply/contracts';
import { useApproveSupplyOrder, useChangeSupplyEta, useSupplyReceipts } from '../hooks';
import { SupplyReceiptModal } from './supply-receipt-modal';
import { MaterialDemandAllocationModal } from './material-demand-allocation-modal';
import { useCreateInspection } from '@/features/quality/hooks';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FormErrorSummary } from '@/components/ui/form-errors';
import { formatQuantity } from '@/domain/quantity';

interface SupplyOrderDetailProps {
  order: SupplyOrderDTO;
}

export function SupplyOrderDetail({ order }: SupplyOrderDetailProps) {
  const router = useRouter();
  const approveOrder = useApproveSupplyOrder();
  const createInspection = useCreateInspection();
  const changeEta = useChangeSupplyEta();
  const { data: receipts } = useSupplyReceipts({ supplyOrderId: order.id });

  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isMaterialAllocationOpen, setIsMaterialAllocationOpen] = useState(false);
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

  const handleStartIncomingQc = async (receiptLineId: string) => {
    setErrorMsg(null);
    try {
      const result = await createInspection.mutateAsync({ sourceType: 'GOODS_RECEIPT', supplyReceiptLineId: receiptLineId });
      router.push(`/quality/inspections/${result.data.id}`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to start incoming-material QC');
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
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-line pb-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{order.orderNumber}</h1>
              <Badge variant={getStatusBadgeVariant(order.status) as any}>
                {order.status}
              </Badge>
            </div>
            <p className="text-sm text-muted mt-1">
              Supplier: <strong className="text-ink">{order.supplierName}</strong> ({order.supplierCode})
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
              <>
                <Button variant="default" onClick={() => setIsMaterialAllocationOpen(true)}>Allocate to demand</Button>
                <Button variant="primary" onClick={() => setIsReceiptModalOpen(true)}>Receive Shipment</Button>
              </>
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
          <div className="p-3 bg-surface-muted rounded text-xs border border-line">
            <span className="font-semibold text-muted block mb-0.5">Order Notes / Audit:</span>
            <span>{order.notes}</span>
          </div>
        )}
      </div>

      {/* Change ETA Modal */}
      {isChangeEtaOpen && (
        <Dialog isOpen onClose={() => setIsChangeEtaOpen(false)} title="Update expected delivery" size="md" pending={changeEta.isPending}>
          
            
            <form onSubmit={handleChangeEta} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted uppercase mb-1">New Expected Date
                <DatePicker value={newEta} onChange={setNewEta} required /></label>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted uppercase mb-1">Reason for Adjustment
                <Input
                  type="text"
                  placeholder="e.g. Supplier freight logistics delay"
                  value={etaReason}
                  onChange={(e) => setEtaReason(e.target.value)}
                  className="w-full rounded border border-line bg-surface px-3 py-2 text-sm"
                /></label>
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
          
        </Dialog>
      )}

      {/* Line Items Card */}
      <div className="card space-y-4">
        <h3 className="text-lg font-semibold border-b border-line pb-2">Ordered Materials & Open Balance</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted bg-surface-muted border-b border-line">
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
            <tbody className="divide-y divide-line">
              {order.lines.map((line) => {
                const openUnits = formatQuantity(line.openAtoms);
                const isFulfilled = line.openAtoms === 0n;

                return (
                  <React.Fragment key={line.id}>
                    <tr className={isFulfilled ? 'opacity-70 bg-surface-muted' : ''}>
                      <td className="px-4 py-3 font-mono font-medium">{line.itemCode}</td>
                      <td className="px-4 py-3">{line.itemName}</td>
                      <td className="px-4 py-3 text-xs"><span className="px-2 py-0.5 rounded bg-surface-muted">{line.tracking}</span></td>
                      <td className="px-4 py-3 text-right font-mono">{formatQuantity(line.orderedAtoms)}</td>
                      <td className="px-4 py-3 text-right font-mono text-success">{formatQuantity(line.receivedAtoms)}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold"><span className={isFulfilled ? 'text-muted' : 'text-primary'}>{openUnits}</span></td>
                      <td className="px-4 py-3 text-xs text-muted">{line.unitPriceCents ? `Rp ${(line.unitPriceCents).toLocaleString()}` : '-'}</td>
                    </tr>
                    {line.materialAllocations.length > 0 && (
                      <tr>
                        <td colSpan={7} className="bg-surface-muted px-4 py-3">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Demand allocation · expected supply only</p>
                          <div className="flex flex-wrap gap-2">
                            {line.materialAllocations.map((allocation) => (
                              <span key={allocation.id} className="rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink">
                                {allocation.orderNumber} · {formatQuantity(allocation.allocatedAtoms)}
                              </span>
                            ))}
                          </div>
                          <p className="mt-2 text-xs text-muted">A PO allocation is not stock readiness. Actual receipt and an active stock reservation are required before scheduling.</p>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Receipts History */}
      <div className="card space-y-4">
        <h3 className="text-lg font-semibold border-b border-line pb-2">Posted Inbound Receipts</h3>
        {!receipts || receipts.length === 0 ? (
          <p className="text-sm text-muted py-4 text-center">
            No receipts posted yet. Approve the purchase order and receive materials when shipments arrive.
          </p>
        ) : (
          <div className="space-y-4">
            {receipts.map((rec) => (
              <div key={rec.id} className="p-4 rounded border border-line bg-surface-muted space-y-3">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center text-xs text-muted border-b border-line pb-2">
                  <div className="flex items-center gap-2">
                    <strong className="text-sm text-ink font-mono">{rec.receiptNumber}</strong>
                    <span>· Received by {rec.receivedByName}</span>
                  </div>
                  <span>{new Date(rec.receivedDate).toLocaleString()}</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="text-muted border-b border-line">
                      <tr>
                        <th className="py-1">Material</th>
                        <th className="py-1">Location</th>
                        <th className="py-1">Lot Number</th>
                        <th className="py-1 text-right">Received</th>
                        <th className="py-1 text-right">Quality status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/50">
                      {rec.lines.map((rl) => (
                        <tr key={rl.id}>
                          <td className="py-1.5 font-medium">{rl.itemCode} - {rl.itemName}</td>
                          <td className="py-1.5 font-mono text-muted">{rl.locationCode}</td>
                          <td className="py-1.5 font-mono text-primary">{rl.lotNumber || '-'}</td>
                          <td className="py-1.5 text-right font-mono font-bold text-success">
                            +{formatQuantity(rl.receivedAtoms)}
                          </td>
                          <td className="py-1.5 text-right">
                            {rl.locationKind === 'QUARANTINE' && rl.inspectionId ? (
                              <Button size="small" onClick={() => router.push(`/quality/inspections/${rl.inspectionId}`)}>
                                {rl.inspectionStatus === 'FINALIZED' ? 'View QC' : 'Continue QC'}
                              </Button>
                            ) : rl.locationKind === 'QUARANTINE' ? (
                              <Button size="small" onClick={() => void handleStartIncomingQc(rl.id)} disabled={createInspection.isPending}>
                                {createInspection.isPending ? 'Starting…' : 'Start QC'}
                              </Button>
                            ) : (
                              <span className="text-xs text-muted">{rl.locationKind === 'RAW' ? 'Ready location' : 'Not quarantined'}</span>
                            )}
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
      <MaterialDemandAllocationModal
        supplyOrderId={order.id}
        isOpen={isMaterialAllocationOpen}
        onClose={() => setIsMaterialAllocationOpen(false)}
      />
    </div>
  );
}
