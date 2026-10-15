'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useShipment, useDispatchShipment, useConfirmDelivery } from '../hooks';
import { Button } from '@/components/ui/button';
import { ButtonLink } from '@/components/ui/button-link';
import { PageHeader } from '@/components/ui/page-header';
import { Panel } from '@/components/ui/panel';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { formatQuantity } from '@/domain/quantity';

export interface ShipmentDetailViewProps {
  shipmentId: string;
}

export function ShipmentDetailView({ shipmentId }: ShipmentDetailViewProps) {
  const { data: shipment, isLoading, error, refetch } = useShipment(shipmentId);

  const dispatchMutation = useDispatchShipment();
  const confirmMutation = useConfirmDelivery();

  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [carrierName, setCarrierName] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [dispatchNotes, setDispatchNotes] = useState('');

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [receivedBy, setReceivedBy] = useState('');
  const [proofOfDelivery, setProofOfDelivery] = useState('');
  const [confirmNotes, setConfirmNotes] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  if (isLoading) {
    return <div className="p-12 text-center text-xs text-muted">Loading shipment details...</div>;
  }

  if (error || !shipment) {
    return (
      <div className="p-8 text-center bg-danger-soft border border-line rounded-xl my-6">
        <p className="text-danger font-medium mb-2">Shipment not found</p>
        <Link href="/delivery/shipments" className="text-xs text-primary underline">
          Back to Shipments
        </Link>
      </div>
    );
  }

  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    try {
      await dispatchMutation.mutateAsync({
        shipmentId: shipment.id,
        carrierName: carrierName.trim() || undefined,
        trackingNumber: trackingNumber.trim() || undefined,
        notes: dispatchNotes.trim() || undefined,
      });
      setShowDispatchModal(false);
      refetch();
    } catch (err: any) {
      setActionError(err.message || 'Failed to dispatch shipment');
    }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    try {
      await confirmMutation.mutateAsync({
        shipmentId: shipment.id,
        receivedBy: receivedBy.trim() || undefined,
        proofOfDelivery: proofOfDelivery.trim() || undefined,
        notes: confirmNotes.trim() || undefined,
      });
      setShowConfirmModal(false);
      refetch();
    } catch (err: any) {
      setActionError(err.message || 'Failed to confirm delivery');
    }
  };

  const totalAllocatedAtoms = shipment.lines.reduce((acc, l) => acc + l.allocatedAtoms, 0n);

  return (
    <div className="page-stack">
      <PageHeader
        title={`Shipment ${shipment.shipmentNumber}`}
        description={`Order #${shipment.order?.orderNumber} · Customer: ${shipment.customer?.name}`}
        actions={
          <div className="flex items-center gap-2">
            <ButtonLink href="/delivery/shipments">
              Back to Shipments
            </ButtonLink>

            {shipment.status === 'ALLOCATED' && (
              <Button
                variant="primary"
                onClick={() => {
                  setCarrierName(shipment.carrierName || '');
                  setTrackingNumber(shipment.trackingNumber || '');
                  setShowDispatchModal(true);
                }}
              >
                Dispatch Stock
              </Button>
            )}

            {shipment.status === 'DISPATCHED' && (
              <Button
                variant="primary"
                onClick={() => setShowConfirmModal(true)}
              >
                Confirm Customer Delivery
              </Button>
            )}
          </div>
        }
      />

      {actionError && (
        <div className="p-3 bg-danger-soft border border-line rounded text-xs text-danger">
          <strong>Action Blocked:</strong> {actionError}
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Panel>
          <div className="text-xs text-muted uppercase font-medium">Shipment Status</div>
          <div className="mt-2">
            {shipment.status === 'ALLOCATED' ? (
              <Badge variant="warning">ALLOCATED (RESERVED)</Badge>
            ) : shipment.status === 'DISPATCHED' ? (
              <Badge variant="blue">DISPATCHED (IN TRANSIT)</Badge>
            ) : shipment.status === 'DELIVERED' ? (
              <Badge variant="success">DELIVERED</Badge>
            ) : (
              <Badge variant="default">{shipment.status}</Badge>
            )}
          </div>
        </Panel>

        <Panel>
          <div className="text-xs text-muted uppercase font-medium">Quantity Shipped</div>
          <div className="text-2xl font-mono font-bold text-ink mt-1">
            {formatQuantity(totalAllocatedAtoms)} units
          </div>
          <div className="text-[11px] text-muted">
            Order Total: {shipment.order ? formatQuantity(shipment.order.orderedAtoms) : '—'} units
          </div>
        </Panel>

        <Panel>
          <div className="text-xs text-muted uppercase font-medium">Carrier & Waybill</div>
          <div className="text-sm font-semibold text-ink mt-2">
            {shipment.carrierName || 'Direct Delivery'}
          </div>
          <div className="text-[11px] font-mono text-muted">
            {shipment.trackingNumber || 'No tracking number'}
          </div>
        </Panel>

        <Panel>
          <div className="text-xs text-muted uppercase font-medium">Destination</div>
          <div className="text-xs font-medium text-ink mt-2">
            {shipment.destinationAddress || 'Customer Facility'}
          </div>
        </Panel>
      </div>

      {/* Shipment Lines Table */}
      <Panel>
        <h3 className="text-sm font-semibold text-ink mb-3">Allocated Line Items</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-line text-muted font-semibold uppercase tracking-wider">
                <th className="py-2.5 px-3">Item</th>
                <th className="py-2.5 px-3">Lot / Batch</th>
                <th className="py-2.5 px-3">Source Location</th>
                <th className="py-2.5 px-3">Allocated Qty</th>
                <th className="py-2.5 px-3">Dispatched Qty</th>
                <th className="py-2.5 px-3">Delivered Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-ink">
              {shipment.lines.map((line) => (
                <tr key={line.id}>
                  <td className="py-2.5 px-3">
                    <div className="font-semibold">{line.item?.name || 'Item'}</div>
                    <div className="text-[11px] text-muted font-mono">{line.item?.code}</div>
                  </td>
                  <td className="py-2.5 px-3 font-mono">
                    {line.lot?.lotNumber || 'NO-LOT'}
                  </td>
                  <td className="py-2.5 px-3">
                    {line.sourceLocation?.name || 'Finished Goods'}
                  </td>
                  <td className="py-2.5 px-3 font-mono font-semibold">
                    {formatQuantity(line.allocatedAtoms)}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-primary">
                    {formatQuantity(line.dispatchedAtoms)}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-success">
                    {formatQuantity(line.deliveredAtoms)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Delivery Evidence if delivered */}
      {shipment.status === 'DELIVERED' && (
        <Panel>
          <h3 className="text-sm font-semibold text-ink mb-2">Proof of Delivery (POD)</h3>
          <div className="p-4 bg-success-soft/20 border border-line rounded-xl text-xs space-y-1">
            <div>
              <strong>Received By:</strong> {shipment.receivedBy || 'Authorized Customer Representative'}
            </div>
            <div>
              <strong>Delivery Timestamp:</strong> {shipment.deliveredAt ? new Date(shipment.deliveredAt).toLocaleString() : '—'}
            </div>
            {shipment.proofOfDelivery && (
              <div>
                <strong>Evidence / Reference:</strong> {shipment.proofOfDelivery}
              </div>
            )}
          </div>
        </Panel>
      )}

      {/* Dispatch Modal */}
      {showDispatchModal && (
        <Dialog
          isOpen
          onClose={() => setShowDispatchModal(false)}
          title="Dispatch Physical Stock"
          size="md"
          pending={dispatchMutation.isPending}
        >
          <form onSubmit={handleDispatch} className="space-y-4">
            <p className="text-xs text-muted">
              Dispatching will post inventory movements (decrementing Finished Goods warehouse stock) and release the hard reservation.
            </p>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">Carrier Name</label>
              <input
                type="text"
                value={carrierName}
                onChange={(e) => setCarrierName(e.target.value)}
                placeholder="e.g. DHL Express, Internal Transport"
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">Tracking Number</label>
              <input
                type="text"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="e.g. TRK-9902148"
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">Dispatch Notes</label>
              <textarea
                rows={2}
                value={dispatchNotes}
                onChange={(e) => setDispatchNotes(e.target.value)}
                placeholder="Driver name, bill of lading, vehicle license..."
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
              />
            </div>

            <div className="dialog-actions">
              <Button
                onClick={() => setShowDispatchModal(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={dispatchMutation.isPending}
              >
                {dispatchMutation.isPending ? 'Posting Movements...' : 'Confirm Dispatch'}
              </Button>
            </div>
          </form>
        </Dialog>
      )}

      {/* Confirm Delivery Modal */}
      {showConfirmModal && (
        <Dialog
          isOpen
          onClose={() => setShowConfirmModal(false)}
          title="Confirm Delivery Receipt"
          size="md"
          pending={confirmMutation.isPending}
        >
          <form onSubmit={handleConfirm} className="space-y-4">
            <p className="text-xs text-muted">
              Record receipt verification from the customer to close this shipment tranche.
            </p>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">Received By (Name / Title)</label>
              <input
                type="text"
                required
                value={receivedBy}
                onChange={(e) => setReceivedBy(e.target.value)}
                placeholder="Customer receiver name"
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">Proof of Delivery / Signed DO #</label>
              <input
                type="text"
                value={proofOfDelivery}
                onChange={(e) => setProofOfDelivery(e.target.value)}
                placeholder="e.g. POD-2026-1049, Signed physical delivery note"
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">Receiving Remarks</label>
              <textarea
                rows={2}
                value={confirmNotes}
                onChange={(e) => setConfirmNotes(e.target.value)}
                placeholder="Notes on packaging condition, inspection acceptance..."
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
              />
            </div>

            <div className="dialog-actions">
              <Button
                onClick={() => setShowConfirmModal(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={confirmMutation.isPending}
              >
                {confirmMutation.isPending ? 'Confirming...' : 'Record Delivery'}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
