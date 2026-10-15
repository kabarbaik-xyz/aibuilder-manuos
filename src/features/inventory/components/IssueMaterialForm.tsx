'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocations } from '@/features/masters/hooks';
import { useIssueToProduction } from '../hooks';
import { parseQuantity } from '@/domain/quantity';
import { Button } from '@/components/ui/button';

export function IssueMaterialForm() {
  const router = useRouter();
  const { data: locationsRes } = useLocations();
  const issueMutation = useIssueToProduction();

  const [demandId, setDemandId] = useState('');
  const [sourceLocationId, setSourceLocationId] = useState('');
  const [wipLocationId, setWipLocationId] = useState('');
  const [sourceLotId, setSourceLotId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const locations = locationsRes?.data || [];
  const rawLocations = locations.filter((l: any) => l.kind === 'RAW' || l.kind === 'DEFAULT' || l.kind === 'QUARANTINE');
  const wipLocations = locations.filter((l: any) => l.kind === 'WIP');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    try {
      await issueMutation.mutateAsync({
        input: {
          demandId,
          sourceLocationId,
          wipLocationId,
          sourceLotId: sourceLotId || null,
          atoms: parseQuantity(quantity, 0),
          notes: notes || undefined,
        },
      });

      router.push('/inventory');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to issue material to WIP');
    }
  };

  return (
    <div className="card max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold">Issue Material to Production (WIP)</h1>
        <p className="text-sm text-muted">
          Transfer materials from raw storage into workstation custody for an active production demand.
        </p>
      </div>

      {errorMsg && (
        <div className="p-4 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold uppercase text-muted mb-1">
            Material Demand ID *
          </label>
          <input
            type="text"
            required
            placeholder="UUID of MaterialDemand from released order"
            className="input w-full font-mono text-sm"
            value={demandId}
            onChange={(e) => setDemandId(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-muted mb-1">
              Source Location (Raw / Store) *
            </label>
            <select
              required
              className="input w-full"
              value={sourceLocationId}
              onChange={(e) => setSourceLocationId(e.target.value)}
            >
              <option value="">Select Raw Location...</option>
              {rawLocations.map((loc: any) => (
                <option key={loc.id} value={loc.id}>
                  {loc.code} — {loc.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-muted mb-1">
              Destination WIP Location *
            </label>
            <select
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
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-muted mb-1">
              Source Lot ID (Required for LOT tracking)
            </label>
            <input
              type="text"
              placeholder="UUID of source lot if applicable"
              className="input w-full font-mono text-sm"
              value={sourceLotId}
              onChange={(e) => setSourceLotId(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-muted mb-1">
              Quantity to Issue *
            </label>
            <input
              type="number"
              step="any"
              min="0.000001"
              required
              placeholder="10"
              className="input w-full font-mono font-bold"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase text-muted mb-1">Notes</label>
          <input
            type="text"
            className="input w-full"
            placeholder="e.g. Batch issued for setup"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <Button type="button" variant="default" size="small" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="small"
            disabled={issueMutation.isPending}
          >
            {issueMutation.isPending ? 'Posting Issue...' : 'Confirm Issue to WIP'}
          </Button>
        </div>
      </form>
    </div>
  );
}
