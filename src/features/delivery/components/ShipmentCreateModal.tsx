'use client';

import React, { useState, useEffect } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ordersApi, OrderDto } from '@/features/orders/api';
import { fetchStockBalances } from '@/features/inventory/api';
import { fetchShipments } from '../api';
import { StockBalanceDTO } from '@/server/modules/inventory/contracts';
import { useAllocateShipment } from '../hooks';
import { formatQuantity, parseQuantity } from '@/domain/quantity';

interface ShipmentAllocationRow {
  orderLineId?: string;
  itemId: string;
  itemName: string;
  itemCode: string;
  orderedAtoms: bigint;
  alreadyAllocatedAtoms: bigint;
  balances: StockBalanceDTO[];
  selectedBalanceId: string;
  quantity: string;
}

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

  const [allocationRows, setAllocationRows] = useState<ShipmentAllocationRow[]>([]);
  const [loadingBalances, setLoadingBalances] = useState(false);
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
      setAllocationRows([]);
      return;
    }

    const order = orders.find((o) => o.id === selectedOrderId);
    if (order) {
      setSelectedOrder(order);
      setDestinationAddress(order.deliveryAddress || '');
      setLoadingBalances(true);
      let cancelled = false;
      const orderLines = order.lines?.length
        ? order.lines.map((line) => ({
            orderLineId: line.id,
            itemId: line.itemId,
            itemName: line.item?.name || line.itemId,
            itemCode: line.item?.code || line.itemId,
            orderedAtoms: BigInt(line.orderedAtoms),
          }))
        : [{
            orderLineId: undefined,
            itemId: order.itemId,
            itemName: order.item?.name || order.itemId,
            itemCode: order.item?.code || order.itemId,
            orderedAtoms: BigInt(order.orderedAtoms),
          }];

      void Promise.all([
        fetchShipments({ orderId: order.id }),
        Promise.all(orderLines.map(async (line) => {
          const balances = await fetchStockBalances({ itemId: line.itemId, isPositiveOnly: true });
          return { ...line, balances: balances.filter((balance) => balance.locationKind === 'FG' && balance.availableAtoms > 0n) };
        })),
      ]).then(([shipments, linesWithBalances]) => {
        if (cancelled) return;
        const allocatedByOrderLine = new Map<string, bigint>();
        const unmatchedLegacyByItem = new Map<string, bigint>();
        for (const shipment of shipments) {
          if (shipment.status === 'CANCELLED') continue;
          for (const shipmentLine of shipment.lines) {
            if (shipmentLine.orderLineId) {
              allocatedByOrderLine.set(
                shipmentLine.orderLineId,
                (allocatedByOrderLine.get(shipmentLine.orderLineId) || 0n) + shipmentLine.allocatedAtoms,
              );
            } else {
              unmatchedLegacyByItem.set(
                shipmentLine.itemId,
                (unmatchedLegacyByItem.get(shipmentLine.itemId) || 0n) + shipmentLine.allocatedAtoms,
              );
            }
          }
        }
        setAllocationRows(linesWithBalances.map((line) => {
          const matchingLines = linesWithBalances.filter((candidate) => candidate.itemId === line.itemId);
          const ambiguousLegacyAtoms = matchingLines.length === 1 ? (unmatchedLegacyByItem.get(line.itemId) || 0n) : 0n;
          return {
            ...line,
            alreadyAllocatedAtoms: (allocatedByOrderLine.get(line.orderLineId || '') || 0n) + ambiguousLegacyAtoms,
            selectedBalanceId: line.balances[0]?.id || '',
            quantity: '',
          };
        }));
        setLoadingBalances(false);
      }).catch((err) => {
        if (cancelled) return;
        setAllocationRows([]);
        setErrorMsg(err instanceof Error ? err.message : 'Could not load order-line inventory.');
        setLoadingBalances(false);
      });
      return () => { cancelled = true; };
    }
  }, [selectedOrderId, orders]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!selectedOrder) {
      setErrorMsg('Please select an order');
      return;
    }

    try {
      const submittedRows = allocationRows.filter((row) => row.quantity.trim());
      if (submittedRows.length === 0) {
        throw new Error('Enter an allocation quantity for at least one product line.');
      }
      const lines = submittedRows.map((row) => {
        const chosenBalance = row.balances.find((balance) => balance.id === row.selectedBalanceId);
        if (!chosenBalance) throw new Error(`Select eligible Finished Goods stock for ${row.itemCode}.`);
        const atoms = parseQuantity(row.quantity, 6);
        if (atoms <= 0n) throw new Error(`Enter a positive quantity for ${row.itemCode}.`);
        const remainingAtoms = row.orderedAtoms - row.alreadyAllocatedAtoms;
        if (atoms > remainingAtoms) throw new Error(`${row.itemCode} allocation exceeds the remaining order-line quantity.`);
        if (atoms > chosenBalance.availableAtoms) throw new Error(`${row.itemCode} allocation exceeds available Finished Goods stock.`);
        return {
          ...(row.orderLineId ? { orderLineId: row.orderLineId } : {}),
          itemId: chosenBalance.itemId,
          lotId: chosenBalance.lotId || undefined,
          sourceLocationId: chosenBalance.locationId,
          allocatedAtoms: atoms,
        };
      });

      await allocateMutation.mutateAsync({
        orderId: selectedOrder.id,
        lines,
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
                {o.orderNumber} — {o.lines?.length || 1} product line(s) ({o.customer?.name})
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-ink">Allocate by product line</h3>
            <p className="text-xs text-muted">Each quantity is capped against its own customer order line and eligible finished goods stock.</p>
          </div>
          {loadingBalances ? (
            <div className="p-4 bg-surface-muted border border-line rounded-lg text-xs text-muted" role="status">Loading line inventory…</div>
          ) : allocationRows.length === 0 ? (
            <div className="p-4 bg-surface-muted border border-line rounded-lg text-xs text-muted">Select an order with at least one customer product line.</div>
          ) : allocationRows.map((row, index) => {
            const remainingAtoms = row.orderedAtoms > row.alreadyAllocatedAtoms ? row.orderedAtoms - row.alreadyAllocatedAtoms : 0n;
            const updateRow = (patch: Partial<ShipmentAllocationRow>) => {
              setAllocationRows((current) => current.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, ...patch } : candidate));
            };
            return (
              <div key={row.orderLineId || row.itemId} className="rounded-lg border border-line bg-surface p-4 space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-ink">{row.itemCode} · {row.itemName}</p>
                    <p className="text-xs text-muted">Ordered {formatQuantity(row.orderedAtoms)} · already allocated {formatQuantity(row.alreadyAllocatedAtoms)} · remaining {formatQuantity(remainingAtoms)}</p>
                  </div>
                  {row.orderLineId && <span className="text-xs text-muted">Line {index + 1}</span>}
                </div>
                {row.balances.length === 0 ? (
                  <p className="rounded-md bg-surface-muted px-3 py-2 text-xs text-muted">No released finished goods stock is available for this product line.</p>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-ink mb-1" htmlFor={`shipment-stock-${index}`}>Finished goods bucket</label>
                      <Select
                        id={`shipment-stock-${index}`}
                        value={row.selectedBalanceId}
                        onChange={(e) => updateRow({ selectedBalanceId: e.target.value })}
                        className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
                      >
                        {row.balances.map((balance) => (
                          <option key={balance.id} value={balance.id}>
                            {balance.locationName} · Lot {balance.lotNumber || 'NO-LOT'} · available {formatQuantity(balance.availableAtoms)}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-ink mb-1" htmlFor={`shipment-quantity-${index}`}>Quantity to allocate (units)</label>
                      <Input
                        id={`shipment-quantity-${index}`}
                        type="number"
                        inputMode="decimal"
                        step="any"
                        min="0.000001"
                        max={formatQuantity(remainingAtoms)}
                        value={row.quantity}
                        onChange={(e) => updateRow({ quantity: e.target.value })}
                        placeholder="Enter a quantity"
                        disabled={remainingAtoms <= 0n}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
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
            type="button"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={loadingBalances || allocationRows.every((row) => row.balances.length === 0) || allocateMutation.isPending}
          >
            {allocateMutation.isPending ? 'Allocating...' : 'Allocate Shipment'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
