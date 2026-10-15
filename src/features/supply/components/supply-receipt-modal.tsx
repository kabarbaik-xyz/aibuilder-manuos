'use client';

import React, { useState } from 'react';
import { SupplyOrderDTO } from '@/server/modules/supply/contracts';
import { useReceiveSupply } from '../hooks';
import { useLocations } from '@/features/masters/hooks';
import { Button } from '@/components/ui/button';
import { FormErrorSummary } from '@/components/ui/form-errors';
import { parseQuantity, formatQuantity } from '@/domain/quantity';

interface SupplyReceiptModalProps {
  order: SupplyOrderDTO;
  isOpen: boolean;
  onClose: () => void;
}

export function SupplyReceiptModal({ order, isOpen, onClose }: SupplyReceiptModalProps) {
  const receiveSupply = useReceiveSupply();
  const { data: locationsRes } = useLocations();
  const locations = (locationsRes?.data || []).filter(
    (l) => l.status === 'ACTIVE' && (l.type === 'RAW' || l.type === 'QUARANTINE')
  );

  const [locationId, setLocationId] = useState('');
  const [receiptNotes, setReceiptNotes] = useState('');
  const [lineReceipts, setLineReceipts] = useState<
    Record<
      string,
      {
        receivedQty: number;
        lotNumber: string;
        supplierLotNumber: string;
        expirationDate: string;
      }
    >
  >(() => {
    const init: Record<string, any> = {};
    for (const line of order.lines) {
      const openQtyNum = Number(line.openAtoms) / 1_000_000;
      init[line.id] = {
        receivedQty: openQtyNum > 0 ? openQtyNum : 0,
        lotNumber: `LOT-${Date.now().toString().slice(-6)}`,
        supplierLotNumber: '',
        expirationDate: '',
      };
    }
    return init;
  });

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const targetLocationId = locationId || locations[0]?.id;
    if (!targetLocationId) {
      setErrorMsg('Please select a receiving location (Raw Warehouse or Quarantine)');
      return;
    }

    const receiptLines: any[] = [];
    for (const line of order.lines) {
      const entry = lineReceipts[line.id];
      if (!entry || entry.receivedQty <= 0) continue;

      const receivedAtoms = parseQuantity(String(entry.receivedQty), 0);
      if (receivedAtoms > line.openAtoms) {
        setErrorMsg(
          `Cannot receive more than open quantity (${formatQuantity(line.openAtoms)}) for ${line.itemCode}`
        );
        return;
      }

      if (line.tracking === 'LOT' && !entry.lotNumber.trim()) {
        setErrorMsg(`Item ${line.itemCode} is LOT tracked; lot number is required`);
        return;
      }

      receiptLines.push({
        supplyOrderLineId: line.id,
        locationId: targetLocationId,
        receivedAtoms,
        lotNumber: line.tracking === 'LOT' ? entry.lotNumber.trim() : undefined,
        supplierLotNumber: entry.supplierLotNumber?.trim() || undefined,
        expirationDate: entry.expirationDate ? new Date(entry.expirationDate).toISOString() : undefined,
      });
    }

    if (receiptLines.length === 0) {
      setErrorMsg('Please enter a received quantity > 0 for at least one line');
      return;
    }

    try {
      await receiveSupply.mutateAsync({
        input: {
          supplyOrderId: order.id,
          notes: receiptNotes.trim() || undefined,
          lines: receiptLines,
        },
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to post material receipt');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-surface border border-border rounded-xl shadow-2xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h3 className="text-lg font-semibold">Receive Inbound Shipment</h3>
            <p className="text-xs text-muted">Purchase Order: {order.orderNumber} ({order.supplierName})</p>
          </div>
          <button type="button" onClick={onClose} className="text-muted hover:text-white">
            ✕
          </button>
        </div>

        {errorMsg && <FormErrorSummary message={errorMsg} />}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1">
              Receiving Storage Location <span className="text-red-500">*</span>
            </label>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="w-full rounded border border-border bg-surface px-3 py-2 text-sm"
              required
            >
              <option value="">-- Select receiving location --</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.code}) [{loc.type}]
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-medium border-b border-border pb-1">Line Items to Receive</h4>
            {order.lines.map((line) => {
              const entry = lineReceipts[line.id];
              const openQtyNum = Number(line.openAtoms) / 1_000_000;
              const isClosed = openQtyNum <= 0;

              return (
                <div
                  key={line.id}
                  className={`p-3 rounded border ${
                    isClosed ? 'opacity-50 bg-muted/10 border-border' : 'bg-muted/20 border-border'
                  } space-y-2`}
                >
                  <div className="flex justify-between items-center text-sm font-medium">
                    <span>
                      {line.itemCode} - {line.itemName}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-muted/40">
                      Open: {openQtyNum} units
                    </span>
                  </div>

                  {!isClosed && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="block text-muted mb-0.5">Quantity to Receive</label>
                        <input
                          type="number"
                          min="1"
                          max={openQtyNum}
                          value={entry?.receivedQty ?? 0}
                          onChange={(e) =>
                            setLineReceipts({
                              ...lineReceipts,
                              [line.id]: {
                                ...entry,
                                receivedQty: Number(e.target.value),
                              },
                            })
                          }
                          className="w-full rounded border border-border bg-surface px-2 py-1"
                          required
                        />
                      </div>

                      {line.tracking === 'LOT' && (
                        <div>
                          <label className="block text-muted mb-0.5">Assigned Lot #</label>
                          <input
                            type="text"
                            value={entry?.lotNumber ?? ''}
                            onChange={(e) =>
                              setLineReceipts({
                                ...lineReceipts,
                                [line.id]: {
                                  ...entry,
                                  lotNumber: e.target.value,
                                },
                              })
                            }
                            className="w-full rounded border border-border bg-surface px-2 py-1"
                            required
                          />
                        </div>
                      )}

                      {line.tracking === 'LOT' && (
                        <div>
                          <label className="block text-muted mb-0.5">Supplier Mill Heat #</label>
                          <input
                            type="text"
                            placeholder="e.g. HEAT-99824"
                            value={entry?.supplierLotNumber ?? ''}
                            onChange={(e) =>
                              setLineReceipts({
                                ...lineReceipts,
                                [line.id]: {
                                  ...entry,
                                  supplierLotNumber: e.target.value,
                                },
                              })
                            }
                            className="w-full rounded border border-border bg-surface px-2 py-1"
                          />
                        </div>
                      )}

                      {line.tracking === 'LOT' && (
                        <div>
                          <label className="block text-muted mb-0.5">Expiration Date</label>
                          <input
                            type="date"
                            value={entry?.expirationDate ?? ''}
                            onChange={(e) =>
                              setLineReceipts({
                                ...lineReceipts,
                                [line.id]: {
                                  ...entry,
                                  expirationDate: e.target.value,
                                },
                              })
                            }
                            className="w-full rounded border border-border bg-surface px-2 py-1"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1">
              Receipt Notes / Bill of Lading
            </label>
            <input
              type="text"
              value={receiptNotes}
              onChange={(e) => setReceiptNotes(e.target.value)}
              placeholder="e.g. BOL-88421, Delivered via DHL Freight in good condition"
              className="w-full rounded border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
            <Button type="button" variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={receiveSupply.isPending}>
              {receiveSupply.isPending ? 'Posting Receipt...' : 'Confirm Receipt'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
