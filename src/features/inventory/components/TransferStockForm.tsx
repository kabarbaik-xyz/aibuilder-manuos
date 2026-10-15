'use client';

import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useItems, useLocations } from '@/features/masters/hooks';
import { useStockTransfer } from '../hooks';
import { parseQuantity } from '@/domain/quantity';
import { Button } from '@/components/ui/button';

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

  const items = itemsRes?.data || [];
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
          sourceLotId: sourceLotId || null,
          destinationLotId: destinationLotId || sourceLotId || null,
          atoms: parseQuantity(quantity, 0),
          notes: notes || undefined,
        },
      });

      router.push('/inventory');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to transfer stock');
    }
  };

  return (
    <div className="card max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold">Transfer Stock Between Locations</h1>
        <p className="text-sm text-muted">
          Internal warehouse relocation preserving global quantity conservation.
        </p>
      </div>

      {errorMsg && (
        <div className="p-4 rounded bg-danger-soft border border-danger/20 text-danger text-sm">
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold uppercase text-muted mb-1">
            Item *
          
          <Select
            required
            className="input w-full"
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
          >
            <option value="">Select Item to Transfer...</option>
            {items.map((item: any) => (
              <option key={item.id} value={item.id}>
                {item.code} — {item.name} ({item.itemType})
              </option>
            ))}
          </Select></label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-muted mb-1">
              From Location (Source) *
            
            <Select
              required
              className="input w-full"
              value={sourceLocationId}
              onChange={(e) => setSourceLocationId(e.target.value)}
            >
              <option value="">Select Origin Location...</option>
              {locations.map((loc: any) => (
                <option key={loc.id} value={loc.id}>
                  {loc.code} — {loc.name} ({loc.kind})
                </option>
              ))}
            </Select></label>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-muted mb-1">
              To Location (Destination) *
            
            <Select
              required
              className="input w-full"
              value={destinationLocationId}
              onChange={(e) => setDestinationLocationId(e.target.value)}
            >
              <option value="">Select Destination Location...</option>
              {locations.map((loc: any) => (
                <option key={loc.id} value={loc.id}>
                  {loc.code} — {loc.name} ({loc.kind})
                </option>
              ))}
            </Select></label>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-muted mb-1">
              Lot ID (Optional / If LOT tracked)
            
            <Input
              type="text"
              placeholder="UUID of Lot"
              className="input w-full font-mono text-sm"
              value={sourceLotId}
              onChange={(e) => setSourceLotId(e.target.value)}
            /></label>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-muted mb-1">
              Quantity to Transfer *
            
            <Input
              type="number"
              step="any"
              min="0.000001"
              required
              placeholder="10"
              className="input w-full font-mono font-bold"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            /></label>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase text-muted mb-1">Notes
          <Input
            type="text"
            className="input w-full"
            placeholder="e.g. Move from Quarantine to Main Raw Rack"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          /></label>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-line">
          <Button type="button" variant="default" size="small" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="small"
            disabled={transferMutation.isPending}
          >
            {transferMutation.isPending ? 'Transferring...' : 'Execute Stock Transfer'}
          </Button>
        </div>
      </form>
    </div>
  );
}
