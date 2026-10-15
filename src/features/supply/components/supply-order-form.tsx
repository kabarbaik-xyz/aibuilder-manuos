'use client';

import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
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
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineItemDraft[]>([
    { itemId: '', quantity: 1, unitPrice: 0, notes: '' },
  ]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleAddLine = () => {
    setLines([...lines, { itemId: '', quantity: 1, unitPrice: 0, notes: '' }]);
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
    if (createOrder.isPending) return;
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
    <form onSubmit={handleSubmit} className="page-stack order-intake">
      {errorMsg && <FormErrorSummary message={errorMsg} />}

      <div className="form-section space-y-5">
        <h3 className="font-semibold text-lg border-b border-line pb-2">Supplier & delivery</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block block text-sm font-medium text-ink mb-2">
              Supplier <span className="text-danger">*</span>
            
            <Select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="w-full rounded border border-line bg-surface px-3 py-2 text-sm"
              required
            >
              <option value="">-- Select supplier --</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code}) - {s.leadTimeDays}d lead
                </option>
              ))}
            </Select></label>
          </div>

          <div>
            <label className="block block text-sm font-medium text-ink mb-2">
              Expected Delivery Date <span className="text-danger">*</span>
            
            <Input
              type="date"
              value={expectedDate}
              onChange={(e) => setExpectedDate(e.target.value)}
              className="w-full rounded border border-line bg-surface px-3 py-2 text-sm"
              required
            /></label>
          </div>

          <div className="md:col-span-2">
            <label className="block block text-sm font-medium text-ink mb-2">
              Header Notes / Terms
            
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. FOB Destination, standard net 30 payment terms"
              className="w-full rounded border border-line bg-surface px-3 py-2 text-sm"
            /></label>
          </div>
        </div>
      </div>

      <div className="form-section space-y-5">
        <div className="inline-cluster justify-between border-b border-line pb-4">
          <h3 className="font-semibold text-lg">Materials to purchase</h3>
          <Button type="button" variant="default" size="small" onClick={handleAddLine}>
            + Add Line
          </Button>
        </div>

        <div className="space-y-3">
          {lines.map((line, idx) => (
            <div key={idx} className="flex flex-col md:flex-row gap-3 items-start p-3 bg-surface-muted rounded border border-line">
              <div className="flex-1 w-full">
                <label className="block block text-sm font-medium text-ink mb-2">Item / Material
                <Select
                  value={line.itemId}
                  onChange={(e) => handleLineChange(idx, 'itemId', e.target.value)}
                  className="w-full rounded border border-line bg-surface px-2 py-1.5 text-sm"
                  required
                >
                  <option value="">-- Select material --</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} ({i.code}) [{i.type}]
                    </option>
                  ))}
                </Select></label>
              </div>

              <div className="w-full md:w-32">
                <label className="block block text-sm font-medium text-ink mb-2">Quantity
                <Input
                  type="number"
                  min="1"
                  value={line.quantity}
                  onChange={(e) => handleLineChange(idx, 'quantity', Number(e.target.value))}
                  className="w-full rounded border border-line bg-surface px-2 py-1.5 text-sm"
                  required
                /></label>
              </div>

              <div className="w-full md:w-36">
                <label className="block block text-sm font-medium text-ink mb-2">Unit Rate (cents)
                <Input
                  type="number"
                  min="0"
                  value={line.unitPrice}
                  onChange={(e) => handleLineChange(idx, 'unitPrice', Number(e.target.value))}
                  className="w-full rounded border border-line bg-surface px-2 py-1.5 text-sm"
                /></label>
              </div>

              <div className="flex-1 w-full">
                <label className="block block text-sm font-medium text-ink mb-2">Line Notes
                <Input
                  type="text"
                  value={line.notes}
                  placeholder="Specs, heat requirements..."
                  onChange={(e) => handleLineChange(idx, 'notes', e.target.value)}
                  className="w-full rounded border border-line bg-surface px-2 py-1.5 text-sm"
                /></label>
              </div>

              <div className="pt-6">
                <button
                  type="button"
                  aria-label={`Remove line ${idx + 1}`}
                  onClick={() => handleRemoveLine(idx)}
                  disabled={lines.length <= 1}
                  className="text-danger hover:text-danger disabled:opacity-30 text-sm px-2 py-1"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="form-page-actions">
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
