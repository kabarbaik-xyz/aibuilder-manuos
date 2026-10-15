'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useItems, useLocations } from '@/features/masters/hooks';
import { useCreateStockCount, useStockBalances } from '../hooks';
import { parseQuantity } from '@/domain/quantity';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, ClipboardCheck } from 'lucide-react';

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

  const items = (itemsRes?.data || []).filter((i: any) => i.status === 'ACTIVE');
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
    <Panel className="p-6 max-w-4xl mx-auto space-y-6">
      {errorMsg && (
        <div className="p-4 rounded-xl bg-danger-soft border border-line text-danger text-xs font-medium">
          <strong>Validation Error:</strong> {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-ink mb-1.5">
              Target Location <span className="text-muted">(Optional)</span>
            </label>
            <Select
              className="w-full text-xs"
              value={locationId}
              onChange={(e) => {
                const newLoc = e.target.value;
                setLocationId(newLoc);
                setLines(lines.map((l) => ({ ...l, locationId: l.locationId || newLoc })));
              }}
            >
              <option value="">All Locations / Facility-Wide Audit</option>
              {locations.map((loc: any) => (
                <option key={loc.id} value={loc.id}>
                  {loc.code} — {loc.name} ({loc.kind})
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted mt-1">
              Select a specific area or audit across all warehouse bins.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink mb-1.5">
              Reason / Cycle Count Code <span className="text-danger">*</span>
            </label>
            <Input
              type="text"
              required
              className="w-full text-xs"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Monthly Finished Goods Count"
            />
            <p className="text-xs text-muted mt-1">
              Internal reference code or audit reason for variance logs.
            </p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-ink mb-1.5">
            Audit Scope & Context Notes <span className="text-muted">(Optional)</span>
          </label>
          <Textarea
            className="w-full h-18 py-2 text-xs"
            placeholder="Document counting conditions, counter teams, or specific bin ranges..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {/* Lines */}
        <div className="space-y-3 pt-2 border-t border-line">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
                Counted Line Items ({lines.length})
              </h2>
              <p className="text-xs text-muted mt-0.5">
                Record actual physical units observed in the selected location
              </p>
            </div>
            <Button type="button" variant="default" onClick={handleAddLine}>
              <span className="inline-flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                Add Item Line
              </span>
            </Button>
          </div>

          <div className="space-y-2.5">
            {lines.map((line, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-xl bg-surface-muted/60 border border-line flex flex-col md:flex-row gap-3 items-end transition-all"
              >
                <div className="flex-1 w-full">
                  <label className="block text-xs font-medium text-ink mb-1">
                    Item <span className="text-danger">*</span>
                  </label>
                  <Select
                    required
                    className="w-full text-xs"
                    value={line.itemId}
                    onChange={(e) => handleLineChange(idx, 'itemId', e.target.value)}
                  >
                    <option value="">Select Item...</option>
                    {items.map((item: any) => (
                      <option key={item.id} value={item.id}>
                        {item.code} — {item.name}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="flex-1 w-full">
                  <label className="block text-xs font-medium text-ink mb-1">
                    Location <span className="text-danger">*</span>
                  </label>
                  <Select
                    required
                    className="w-full text-xs"
                    value={line.locationId}
                    onChange={(e) => handleLineChange(idx, 'locationId', e.target.value)}
                  >
                    <option value="">Select Location...</option>
                    {locations.map((loc: any) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.code} ({loc.kind})
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="w-full md:w-36">
                  <label className="block text-xs font-medium text-ink mb-1">
                    Counted Qty <span className="text-danger">*</span>
                  </label>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    required
                    className="w-full font-mono font-bold text-xs"
                    value={line.countedQuantity}
                    onChange={(e) => handleLineChange(idx, 'countedQuantity', e.target.value)}
                  />
                </div>

                {lines.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => handleRemoveLine(idx)}
                    title="Remove line"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-danger" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end items-center gap-3 pt-4 border-t border-line">
          <Button type="button" variant="default" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={createMutation.isPending}
          >
            <span className="inline-flex items-center gap-1.5">
              <ClipboardCheck className="w-4 h-4" />
              {createMutation.isPending ? 'Submitting Count...' : 'Submit Physical Count'}
            </span>
          </Button>
        </div>
      </form>
    </Panel>
  );
}
