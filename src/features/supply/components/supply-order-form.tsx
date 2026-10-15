'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateSupplyOrder } from '../hooks';
import { useSuppliers, useItems } from '@/features/masters/hooks';
import { Button } from '@/components/ui/button';
import { FormErrorSummary } from '@/components/ui/form-errors';
import { parseQuantity } from '@/domain/quantity';

interface LineItemDraft {
  itemId: string;
  quantity: number;
  unitPrice: number;
  notes: string;
}

export function SupplyOrderForm() {
  const router = useRouter();
  const createOrder = useCreateSupplyOrder();

  const { data: suppliersRes } = useSuppliers();
  const { data: itemsRes } = useItems();

  const suppliers = (suppliersRes?.data || []).filter((s) => s.status === 'ACTIVE');
  const items = (itemsRes?.data || []).filter((i) => i.status === 'ACTIVE');

  const [supplierId, setSupplierId] = useState('');
  const [expectedDate, setExpectedDate] = useState('2026-11-20');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineItemDraft[]>([
    { itemId: '', quantity: 100, unitPrice: 25000, notes: '' },
  ]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleAddLine = () => {
    setLines([...lines, { itemId: '', quantity: 10, unitPrice: 10000, notes: '' }]);
  };

  const handleRemoveLine = (index: number) => {
    if (lines.length <= 1) return;
    setLines(lines.filter((_, i) => i !== index));
  };

  const handleLineChange = (index: number, field: keyof LineItemDraft, val: any) => {
    const updated = [...lines];
    updated[index] = { ...updated[index], [field]: val };
    setLines(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!supplierId) {
      setErrorMsg('Please select a supplier');
      return;
    }

    if (lines.some((l) => !l.itemId || l.quantity <= 0)) {
      setErrorMsg('Each line item must specify a valid item and quantity > 0');
      return;
    }

    try {
      const payload = {
        supplierId,
        expectedDate: new Date(expectedDate).toISOString(),
        notes: notes.trim() || undefined,
        lines: lines.map((l) => ({
          itemId: l.itemId,
          orderedAtoms: parseQuantity(String(l.quantity), 0),
          unitPriceCents: Math.round(l.unitPrice),
          notes: l.notes.trim() || undefined,
        })),
      };

      const res = await createOrder.mutateAsync({
        input: payload,
      });

      router.push(`/supply-orders/${res.data.id}`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create purchase order');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
      {errorMsg && <FormErrorSummary message={errorMsg} />}

      <div className="card space-y-4">
        <h3 className="font-semibold text-lg border-b border-border pb-2">Purchase Order Header</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-muted mb-1">
              Supplier <span className="text-red-500">*</span>
            </label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="w-full rounded border border-border bg-surface px-3 py-2 text-sm"
              required
            >
              <option value="">-- Select supplier --</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code}) - {s.leadTimeDays}d lead
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-muted mb-1">
              Expected Delivery Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={expectedDate}
              onChange={(e) => setExpectedDate(e.target.value)}
              className="w-full rounded border border-border bg-surface px-3 py-2 text-sm"
              required
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-medium uppercase tracking-wider text-muted mb-1">
              Header Notes / Terms
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. FOB Destination, standard net 30 payment terms"
              className="w-full rounded border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="card space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <h3 className="font-semibold text-lg">Line Items & Materials</h3>
          <Button type="button" variant="default" size="small" onClick={handleAddLine}>
            + Add Line
          </Button>
        </div>

        <div className="space-y-3">
          {lines.map((line, idx) => (
            <div key={idx} className="flex flex-col md:flex-row gap-3 items-start p-3 bg-muted/20 rounded border border-border">
              <div className="flex-1 w-full">
                <label className="block text-xs text-muted mb-1">Item / Material</label>
                <select
                  value={line.itemId}
                  onChange={(e) => handleLineChange(idx, 'itemId', e.target.value)}
                  className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
                  required
                >
                  <option value="">-- Select material --</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} ({i.code}) [{i.type}]
                    </option>
                  ))}
                </select>
              </div>

              <div className="w-full md:w-32">
                <label className="block text-xs text-muted mb-1">Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={line.quantity}
                  onChange={(e) => handleLineChange(idx, 'quantity', Number(e.target.value))}
                  className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
                  required
                />
              </div>

              <div className="w-full md:w-36">
                <label className="block text-xs text-muted mb-1">Unit Rate (cents)</label>
                <input
                  type="number"
                  min="0"
                  value={line.unitPrice}
                  onChange={(e) => handleLineChange(idx, 'unitPrice', Number(e.target.value))}
                  className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
                />
              </div>

              <div className="flex-1 w-full">
                <label className="block text-xs text-muted mb-1">Line Notes</label>
                <input
                  type="text"
                  value={line.notes}
                  placeholder="Specs, heat requirements..."
                  onChange={(e) => handleLineChange(idx, 'notes', e.target.value)}
                  className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
                />
              </div>

              <div className="pt-6">
                <button
                  type="button"
                  onClick={() => handleRemoveLine(idx)}
                  disabled={lines.length <= 1}
                  className="text-red-500 hover:text-red-700 disabled:opacity-30 text-sm px-2 py-1"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <Button type="button" variant="default" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={createOrder.isPending}>
          {createOrder.isPending ? 'Creating Purchase Order...' : 'Create Supply Order'}
        </Button>
      </div>
    </form>
  );
}
