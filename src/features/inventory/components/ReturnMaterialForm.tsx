'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocations } from '@/features/masters/hooks';
import { useReturnUnusedMaterial } from '../hooks';
import { parseQuantity } from '@/domain/quantity';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Undo2 } from 'lucide-react';

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
          demandId: demandId.trim(),
          wipLocationId,
          destinationLocationId,
          lotId: lotId.trim() || null,
          atoms: parseQuantity(quantity, 0),
          notes: notes.trim() || undefined,
        },
      });

      router.push('/inventory');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to return unused material');
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
            Material Demand ID <span className="text-danger">*</span>
          </label>
          <Input
            type="text"
            required
            placeholder="UUID of MaterialDemand from order"
            className="w-full font-mono text-xs"
            value={demandId}
            onChange={(e) => setDemandId(e.target.value)}
          />
          <p className="text-xs text-muted mt-1">
            Reference identifier of the work order material demand being credited.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-ink mb-1.5">
              Source WIP Location <span className="text-danger">*</span>
            </label>
            <Select
              required
              className="w-full text-xs"
              value={wipLocationId}
              onChange={(e) => setWipLocationId(e.target.value)}
            >
              <option value="">Select Workstation WIP Location...</option>
              {wipLocations.map((loc: any) => (
                <option key={loc.id} value={loc.id}>
                  {loc.code} — {loc.name}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted mt-1">
              Shop floor cell or staging buffer releasing the stock.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink mb-1.5">
              Destination Storage Location <span className="text-danger">*</span>
            </label>
            <Select
              required
              className="w-full text-xs"
              value={destinationLocationId}
              onChange={(e) => setDestinationLocationId(e.target.value)}
            >
              <option value="">Select Return Location...</option>
              {returnLocations.map((loc: any) => (
                <option key={loc.id} value={loc.id}>
                  {loc.code} — {loc.name}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted mt-1">
              Warehouse bin where the returned physical units will be restored.
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
              value={lotId}
              onChange={(e) => setLotId(e.target.value)}
            />
            <p className="text-xs text-muted mt-1">
              Preserves batch trace if material belongs to a specific lot.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink mb-1.5">
              Quantity to Return <span className="text-danger">*</span>
            </label>
            <Input
              type="number"
              step="any"
              min="0.000001"
              required
              placeholder="3"
              className="w-full font-mono font-bold text-xs"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
            <p className="text-xs text-muted mt-1">
              Exact number of unused units returning to storage.
            </p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-ink mb-1.5">
            Reason / Return Notes <span className="text-muted">(Optional)</span>
          </label>
          <Input
            type="text"
            className="w-full text-xs"
            placeholder="e.g. Unused rod ends returned to stock after batch completion"
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
            disabled={returnMutation.isPending}
          >
            <span className="inline-flex items-center gap-1.5">
              <Undo2 className="w-4 h-4" />
              {returnMutation.isPending ? 'Returning...' : 'Confirm Return to Storage'}
            </span>
          </Button>
        </div>
      </form>
    </Panel>
  );
}
