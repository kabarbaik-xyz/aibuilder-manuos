'use client';

import React, { useState, useEffect } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ordersApi, OrderDto } from '@/features/orders/api';
import { fetchStockBalances } from '@/features/inventory/api';
import { StockBalanceDTO } from '@/server/modules/inventory/contracts';
import { useAllocateShipment } from '../hooks';
import { formatQuantity, parseQuantity } from '@/domain/quantity';

export interface ShipmentCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  preselectedOrderId?: string;
}

export function ShipmentCreateModal({
  isOpen,
  onClose,
  onSuccess,
  preselectedOrderId,
}: ShipmentCreateModalProps) {
  const allocateMutation = useAllocateShipment();

  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string>(preselectedOrderId || '');
  const [selectedOrder, setSelectedOrder] = useState<OrderDto | null>(null);

  const [fgBalances, setFgBalances] = useState<StockBalanceDTO[]>([]);
  const [selectedBalanceId, setSelectedBalanceId] = useState<string>('');
  const [allocateQty, setAllocateQty] = useState('');
  const [carrierName, setCarrierName] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    ordersApi.listOrders().then((data) => {
      const activeOrders = data.filter(
        (o) => o.status !== 'CANCELLED' && o.status !== 'DELIVERED'
      );
      setOrders(activeOrders);
      if (preselectedOrderId) {
        const found = activeOrders.find((o) => o.id === preselectedOrderId);
        if (found) {
          setSelectedOrderId(found.id);
          setSelectedOrder(found);
        }
      } else if (activeOrders.length > 0 && !selectedOrderId) {
        setSelectedOrderId(activeOrders[0].id);
        setSelectedOrder(activeOrders[0]);
      }
    });
  }, [preselectedOrderId]);

  useEffect(() => {
    if (!selectedOrderId) {
      setSelectedOrder(null);
      setFgBalances([]);
      return;
    }

    const order = orders.find((o) => o.id === selectedOrderId);
    if (order) {
      setSelectedOrder(order);
      setDestinationAddress(order.customer ? 'Customer Address' : '');

      // Fetch FG balances for order item
      fetchStockBalances({ itemId: order.itemId, isPositiveOnly: true }).then((balances) => {
        const eligibleFg = balances.filter(
          (b) => b.locationKind === 'FG' && b.availableAtoms > 0n
        );
        setFgBalances(eligibleFg);
        if (eligibleFg.length > 0) {
          setSelectedBalanceId(eligibleFg[0].id);
          const avail = eligibleFg[0].availableAtoms;
          setAllocateQty(formatQuantity(avail));
        } else {
          setSelectedBalanceId('');
          setAllocateQty('0');
        }
      });
    }
  }, [selectedOrderId, orders]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!selectedOrder) {
      setErrorMsg('Please select an order');
      return;
    }

    const chosenBalance = fgBalances.find((b) => b.id === selectedBalanceId);
    if (!chosenBalance) {
      setErrorMsg('Please select an eligible Finished Goods inventory bucket with available stock');
      return;
    }

    try {
      const atoms = parseQuantity(allocateQty, 0);

      await allocateMutation.mutateAsync({
        orderId: selectedOrder.id,
        lines: [
          {
            itemId: chosenBalance.itemId,
            lotId: chosenBalance.lotId || undefined,
            sourceLocationId: chosenBalance.locationId,
            allocatedAtoms: atoms,
          },
        ],
        carrierName: carrierName.trim() || undefined,
        trackingNumber: trackingNumber.trim() || undefined,
        destinationAddress: destinationAddress.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      onClose();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to allocate shipment');
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Create Shipment Allocation"
      subtitle="Allocate released Finished Goods (FG) stock to an active customer order."
      size="md"
      pending={allocateMutation.isPending}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && (
          <div className="p-3 bg-danger-soft border border-line rounded text-xs text-danger">
            <strong>Allocation Blocked:</strong> {errorMsg}
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-ink mb-1">
            Target Order
          </label>
          <Select
            value={selectedOrderId}
            onChange={(e) => setSelectedOrderId(e.target.value)}
            className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
          >
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.orderNumber} — {o.item?.name} ({o.customer?.name})
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label className="block text-xs font-medium text-ink mb-1">
            Eligible Finished Goods Stock
          </label>
          {fgBalances.length === 0 ? (
            <div className="p-3 bg-surface-muted border border-line rounded text-xs text-muted">
              No released Finished Goods available for this order item. Ensure QC inspections have passed outputs into FG.
            </div>
          ) : (
            <Select
              value={selectedBalanceId}
              onChange={(e) => setSelectedBalanceId(e.target.value)}
              className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
            >
              {fgBalances.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.locationName} · Lot: {b.lotNumber || 'NO-LOT'} · Avail: {formatQuantity(b.availableAtoms)} units
                </option>
              ))}
            </Select>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-ink mb-1">
            Quantity to Allocate (units)
          </label>
          <input
            type="number"
            step="any"
            min="0.000001"
            required
            value={allocateQty}
            onChange={(e) => setAllocateQty(e.target.value)}
            className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
            placeholder="e.g. 10"
          />
          <span className="text-[11px] text-muted block mt-1">
            Hard-reserves this stock in Finished Goods so it cannot be double-allocated.
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-ink mb-1">
              Carrier Name (Optional)
            </label>
            <input
              type="text"
              value={carrierName}
              onChange={(e) => setCarrierName(e.target.value)}
              placeholder="e.g. DHL, FedEx, Local Fleet"
              className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink mb-1">
              Tracking / Waybill (Optional)
            </label>
            <input
              type="text"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder="e.g. TRK-883921"
              className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-ink mb-1">
            Shipping Notes
          </label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Delivery instructions, packing details..."
            rows={2}
            className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
          />
        </div>

        <div className="dialog-actions">
          <Button
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={fgBalances.length === 0 || allocateMutation.isPending}
          >
            {allocateMutation.isPending ? 'Allocating...' : 'Allocate Shipment'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
