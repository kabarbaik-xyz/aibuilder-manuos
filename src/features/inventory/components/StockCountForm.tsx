'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useItems, useLocations } from '@/features/masters/hooks';
import { useCreateStockCount, useStockBalances } from '../hooks';
import { parseQuantity } from '@/domain/quantity';
import { Button } from '@/components/ui/button';

export function StockCountForm() {
  const router = useRouter();
  const { data: itemsRes } = useItems();
  const { data: locationsRes } = useLocations();
  const { data: balances } = useStockBalances();

  const createMutation = useCreateStockCount();

  const [locationId, setLocationId] = useState('');
  const [reason, setReason] = useState('Routine Cycle Count');
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [lines, setLines] = useState<Array<{
    itemId: string;
    locationId: string;
    lotId: string;
    countedQuantity: string;
    notes: string;
  }>>([
    { itemId: '', locationId: '', lotId: '', countedQuantity: '0', notes: '' },
  ]);

  const items = itemsRes?.data || [];
  const locations = locationsRes?.data || [];

  const handleAddLine = () => {
    setLines([
      ...lines,
      { itemId: '', locationId: locationId || '', lotId: '', countedQuantity: '0', notes: '' },
    ]);
  };

  const handleRemoveLine = (idx: number) => {
    if (lines.length === 1) return;
    setLines(lines.filter((_, i) => i !== idx));
  };

  const handleLineChange = (idx: number, field: string, val: string) => {
    const updated = [...lines];
    (updated[idx] as any)[field] = val;
    setLines(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    // Validate lines
    for (const l of lines) {
      if (!l.itemId || !l.locationId) {
        setErrorMsg('Every line must have an Item and a Location selected');
        return;
      }
    }

    try {
      const payloadLines = lines.map((l) => ({
        itemId: l.itemId,
        locationId: l.locationId,
        lotId: l.lotId || null,
        countedAtoms: parseQuantity(l.countedQuantity || '0', 0),
        notes: l.notes || undefined,
      }));

      const res = await createMutation.mutateAsync({
        input: {
          locationId: locationId || null,
          reason,
          notes: notes || undefined,
          lines: payloadLines,
        },
      });

      router.push(`/inventory/counts/${res.data.id}`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit physical count');
    }
  };

  return (
    <div className="card max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold">Record Physical Inventory Count</h1>
        <p className="text-sm text-muted">
          Capture counted stock levels against current system book snapshots. Discrepancies will be submitted for owner approval.
        </p>
      </div>

      {errorMsg && (
        <div className="p-4 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-muted mb-1">
              Target Location (Optional)
            </label>
            <select
              className="input w-full"
              value={locationId}
              onChange={(e) => {
                setLocationId(e.target.value);
                // Also update lines with this location if empty
                setLines(lines.map((l) => ({ ...l, locationId: l.locationId || e.target.value })));
              }}
            >
              <option value="">All Locations / Facility-Wide</option>
              {locations.map((loc: any) => (
                <option key={loc.id} value={loc.id}>
                  {loc.code} — {loc.name} ({loc.kind})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-muted mb-1">
              Reason / Cycle Count Code *
            </label>
            <input
              type="text"
              required
              className="input w-full"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase text-muted mb-1">Notes</label>
          <textarea
            className="input w-full h-16 py-2"
            placeholder="Optional context about this stock count..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {/* Lines */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-semibold uppercase text-muted">Count Lines ({lines.length})</h2>
            <Button type="button" variant="default" size="small" onClick={handleAddLine}>
              + Add Item Line
            </Button>
          </div>

          <div className="space-y-3">
            {lines.map((line, idx) => (
              <div key={idx} className="p-3 card bg-muted/5 border border-border flex flex-col md:flex-row gap-3 items-end">
                <div className="flex-1 w-full">
                  <label className="block text-xs text-muted mb-1">Item *</label>
                  <select
                    required
                    className="input w-full text-sm"
                    value={line.itemId}
                    onChange={(e) => handleLineChange(idx, 'itemId', e.target.value)}
                  >
                    <option value="">Select Item...</option>
                    {items.map((item: any) => (
                      <option key={item.id} value={item.id}>
                        {item.code} — {item.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex-1 w-full">
                  <label className="block text-xs text-muted mb-1">Location *</label>
                  <select
                    required
                    className="input w-full text-sm"
                    value={line.locationId}
                    onChange={(e) => handleLineChange(idx, 'locationId', e.target.value)}
                  >
                    <option value="">Select Location...</option>
                    {locations.map((loc: any) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.code} ({loc.kind})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="w-full md:w-36">
                  <label className="block text-xs text-muted mb-1">Counted Qty *</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    className="input w-full font-mono font-bold"
                    value={line.countedQuantity}
                    onChange={(e) => handleLineChange(idx, 'countedQuantity', e.target.value)}
                  />
                </div>

                {lines.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="small"
                    onClick={() => handleRemoveLine(idx)}
                  >
                    ✕
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <Button type="button" variant="default" size="small" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="small"
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? 'Submitting Count...' : 'Submit Physical Count'}
          </Button>
        </div>
      </form>
    </div>
  );
}
