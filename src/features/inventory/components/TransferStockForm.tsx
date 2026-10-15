'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useItems, useLocations } from '@/features/masters/hooks';
import { useStockTransfer } from '../hooks';
import { parseQuantity } from '@/domain/quantity';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ArrowRightLeft } from 'lucide-react';

export function TransferStockForm() {
  const router = useRouter();
  const { data: itemsRes } = useItems();
  const { data: locationsRes } = useLocations();
  const transferMutation = useStockTransfer();

  const [itemId, setItemId] = useState('');
  const [sourceLocationId, setSourceLocationId] = useState('');
  const [destinationLocationId, setDestinationLocationId] = useState('');
  const [sourceLotId, setSourceLotId] = useState('');
  const [destinationLotId, setDestinationLotId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const items = (itemsRes?.data || []).filter((i: any) => i.status === 'ACTIVE');
  const locations = locationsRes?.data || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (sourceLocationId === destinationLocationId) {
      setErrorMsg('Source and Destination locations must be distinct');
      return;
    }

    try {
      await transferMutation.mutateAsync({
        input: {
          itemId,
          sourceLocationId,
          destinationLocationId,
          sourceLotId: sourceLotId.trim() || null,
          destinationLotId: destinationLotId.trim() || sourceLotId.trim() || null,
          atoms: parseQuantity(quantity, 0),
          notes: notes.trim() || undefined,
        },
      });

      router.push('/inventory');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to transfer stock');
    }
  };

  return (
    <Panel className="p-6 max-w-3xl mx-auto space-y-6">
      {errorMsg && (
        <div className="p-4 rounded-xl bg-danger-soft border border-line text-danger text-xs font-medium">
          <strong>Action Blocked:</strong> {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-xs font-medium text-ink mb-1.5">
            Material Item <span className="text-danger">*</span>
          </label>
          <Select
            required
            className="w-full text-xs"
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
          >
            <option value="">Select Item to Transfer...</option>
            {items.map((item: any) => (
              <option key={item.id} value={item.id}>
                {item.code} — {item.name} ({item.itemType})
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted mt-1">
            Physical stock item to be relocated in warehouse balances.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-ink mb-1.5">
              From Location (Source) <span className="text-danger">*</span>
            </label>
            <Select
              required
              className="w-full text-xs"
              value={sourceLocationId}
              onChange={(e) => setSourceLocationId(e.target.value)}
            >
              <option value="">Select Origin Location...</option>
              {locations.map((loc: any) => (
                <option key={loc.id} value={loc.id}>
                  {loc.code} — {loc.name} ({loc.kind})
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted mt-1">
              Current holding area where stock will be decremented.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink mb-1.5">
              To Location (Destination) <span className="text-danger">*</span>
            </label>
            <Select
              required
              className="w-full text-xs"
              value={destinationLocationId}
              onChange={(e) => setDestinationLocationId(e.target.value)}
            >
              <option value="">Select Destination Location...</option>
              {locations.map((loc: any) => (
                <option key={loc.id} value={loc.id}>
                  {loc.code} — {loc.name} ({loc.kind})
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted mt-1">
              Destination warehouse bin or rack where stock will be incremented.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-ink mb-1.5">
              Lot ID <span className="text-muted">(Optional / If Lot Tracked)</span>
            </label>
            <Input
              type="text"
              placeholder="UUID of Lot"
              className="w-full font-mono text-xs"
              value={sourceLotId}
              onChange={(e) => setSourceLotId(e.target.value)}
            />
            <p className="text-xs text-muted mt-1">
              Transfer specific lot bucket or leave blank for unassigned stock.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink mb-1.5">
              Quantity to Transfer <span className="text-danger">*</span>
            </label>
            <Input
              type="number"
              step="any"
              min="0.000001"
              required
              placeholder="10"
              className="w-full font-mono font-bold text-xs"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
            <p className="text-xs text-muted mt-1">
              Units to relocate under strict double-entry balance conservation.
            </p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-ink mb-1.5">
            Transfer Notes & Reason <span className="text-muted">(Optional)</span>
          </label>
          <Input
            type="text"
            className="w-full text-xs"
            placeholder="e.g. Move from Quarantine to Main Raw Rack for production staging"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="flex justify-end items-center gap-3 pt-4 border-t border-line">
          <Button type="button" variant="default" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={transferMutation.isPending}
          >
            <span className="inline-flex items-center gap-1.5">
              <ArrowRightLeft className="w-4 h-4" />
              {transferMutation.isPending ? 'Transferring...' : 'Execute Stock Transfer'}
            </span>
          </Button>
        </div>
      </form>
    </Panel>
  );
}
