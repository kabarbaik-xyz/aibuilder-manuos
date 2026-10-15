'use client';

import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocations } from '@/features/masters/hooks';
import { useReturnUnusedMaterial } from '../hooks';
import { parseQuantity } from '@/domain/quantity';
import { Button } from '@/components/ui/button';

export function ReturnMaterialForm() {
  const router = useRouter();
  const { data: locationsRes } = useLocations();
  const returnMutation = useReturnUnusedMaterial();

  const [demandId, setDemandId] = useState('');
  const [wipLocationId, setWipLocationId] = useState('');
  const [destinationLocationId, setDestinationLocationId] = useState('');
  const [lotId, setLotId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const locations = locationsRes?.data || [];
  const wipLocations = locations.filter((l: any) => l.kind === 'WIP');
  const returnLocations = locations.filter((l: any) => l.kind === 'RAW' || l.kind === 'DEFAULT');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    try {
      await returnMutation.mutateAsync({
        input: {
          demandId,
          wipLocationId,
          destinationLocationId,
          lotId: lotId || null,
          atoms: parseQuantity(quantity, 0),
          notes: notes || undefined,
        },
      });

      router.push('/inventory');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to return unused material');
    }
  };

  return (
    <div className="card max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold">Return Unused Material from WIP</h1>
        <p className="text-sm text-muted">
          Return leftover materials from workstation WIP back to warehouse storage without fabricating new supplier receipts.
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
            Material Demand ID *
          
          <Input
            type="text"
            required
            placeholder="UUID of MaterialDemand from order"
            className="input w-full font-mono text-sm"
            value={demandId}
            onChange={(e) => setDemandId(e.target.value)}
          /></label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-muted mb-1">
              Source WIP Location *
            
            <Select
              required
              className="input w-full"
              value={wipLocationId}
              onChange={(e) => setWipLocationId(e.target.value)}
            >
              <option value="">Select WIP Location...</option>
              {wipLocations.map((loc: any) => (
                <option key={loc.id} value={loc.id}>
                  {loc.code} — {loc.name}
                </option>
              ))}
            </Select></label>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-muted mb-1">
              Destination Storage Location *
            
            <Select
              required
              className="input w-full"
              value={destinationLocationId}
              onChange={(e) => setDestinationLocationId(e.target.value)}
            >
              <option value="">Select Return Location...</option>
              {returnLocations.map((loc: any) => (
                <option key={loc.id} value={loc.id}>
                  {loc.code} — {loc.name}
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
              value={lotId}
              onChange={(e) => setLotId(e.target.value)}
            /></label>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-muted mb-1">
              Quantity to Return *
            
            <Input
              type="number"
              step="any"
              min="0.000001"
              required
              placeholder="3"
              className="input w-full font-mono font-bold"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            /></label>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase text-muted mb-1">Reason / Notes
          <Input
            type="text"
            className="input w-full"
            placeholder="e.g. Unused rod ends returned to stock"
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
            disabled={returnMutation.isPending}
          >
            {returnMutation.isPending ? 'Returning...' : 'Confirm Return to Storage'}
          </Button>
        </div>
      </form>
    </div>
  );
}
