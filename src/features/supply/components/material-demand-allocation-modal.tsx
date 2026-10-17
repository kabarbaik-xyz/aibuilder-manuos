'use client';

import { useEffect, useMemo, useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FormErrorSummary } from '@/components/ui/form-errors';
import { formatQuantity, parseQuantity } from '@/domain/quantity';
import { MaterialDemandAllocationCandidateDTO } from '@/server/modules/supply/contracts';
import { useMaterialDemandAllocationContext, useSetMaterialDemandAllocations } from '../hooks';

interface MaterialDemandAllocationModalProps {
  supplyOrderId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function MaterialDemandAllocationModal({ supplyOrderId, isOpen, onClose }: MaterialDemandAllocationModalProps) {
  const context = useMaterialDemandAllocationContext(supplyOrderId, isOpen);
  const saveAllocations = useSetMaterialDemandAllocations();
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !context.data) return;
    const next: Record<string, string> = {};
    for (const candidate of context.data.candidates) {
      const key = `${candidate.supplyOrderLineId}:${candidate.id}`;
      next[key] = formatQuantity(candidate.currentAllocatedAtoms);
    }
    setAmounts(next);
    setError(null);
  }, [isOpen, context.data]);

  const candidatesByLine = useMemo(() => {
    const grouped = new Map<string, MaterialDemandAllocationCandidateDTO[]>();
    for (const candidate of context.data?.candidates ?? []) {
      const rows = grouped.get(candidate.supplyOrderLineId) ?? [];
      rows.push(candidate);
      grouped.set(candidate.supplyOrderLineId, rows);
    }
    return grouped;
  }, [context.data]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!context.data) return;
    setError(null);
    try {
      const allocations = context.data.candidates.flatMap((candidate) => {
        const key = `${candidate.supplyOrderLineId}:${candidate.id}`;
        const value = (amounts[key] ?? '').trim();
        if (!value) return [];
        const atoms = parseQuantity(value, candidate.quantityPrecision);
        if (atoms <= 0n) return [];
        return [{ supplyOrderLineId: candidate.supplyOrderLineId, demandId: candidate.id, allocatedAtoms: atoms }];
      });
      await saveAllocations.mutateAsync({ id: supplyOrderId, input: { allocations }, idempotencyKey: crypto.randomUUID() });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save material allocations.');
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Allocate material to production demand" size="lg" pending={saveAllocations.isPending}>
      {error && <FormErrorSummary message={error} />}
      {context.isLoading ? (
        <p className="text-sm text-muted">Loading open production demand…</p>
      ) : context.error ? (
        <FormErrorSummary message={context.error instanceof Error ? context.error.message : 'Could not load material demands.'} />
      ) : context.data ? (
        <form onSubmit={submit} className="space-y-5">
          <p className="text-sm text-muted">Assign approved inbound quantity to an open demand for the same item. Allocated PO quantity is an ETA signal only; stock is schedulable only after receipt and an active inventory reservation.</p>
          {context.data.lines.map((line) => {
            const candidates = candidatesByLine.get(line.id) ?? [];
            return (
              <section key={line.id} className="rounded-xl border border-line bg-surface-muted p-4">
                <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-3">
                  <div>
                    <h3 className="font-semibold text-ink">{line.itemCode} · {line.itemName}</h3>
                    <p className="text-xs text-muted">Open PO quantity {formatQuantity(line.openAtoms)} {line.uomCode} · currently allocated {formatQuantity(line.allocatedAtoms)}</p>
                  </div>
                </header>
                {candidates.length === 0 ? (
                  <p className="text-sm text-muted">No matching open demand is available for this item.</p>
                ) : (
                  <div className="space-y-3">
                    {candidates.map((candidate) => {
                      const key = `${candidate.supplyOrderLineId}:${candidate.id}`;
                      const value = amounts[key] ?? formatQuantity(candidate.currentAllocatedAtoms);
                      return (
                        <div key={key} className="grid gap-3 rounded-lg border border-line bg-surface p-3 md:grid-cols-[minmax(0,1fr)_10rem] md:items-center">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-ink">{candidate.orderNumber} · {candidate.itemName}</p>
                            <p className="mt-1 text-xs text-muted">Demand {formatQuantity(candidate.requiredAtoms)} {candidate.uomCode} · reserved {formatQuantity(candidate.reservedAtoms)} · available to allocate {formatQuantity(candidate.availableToAllocateAtoms)}</p>
                          </div>
                          <label className="text-xs font-medium text-muted">Allocate ({candidate.uomCode})
                            <Input
                              type="number"
                              min="0"
                              step={candidate.quantityPrecision > 0 ? `0.${'0'.repeat(Math.max(candidate.quantityPrecision - 1, 0))}1` : '1'}
                              max={formatQuantity(candidate.availableToAllocateAtoms)}
                              value={value}
                              onChange={(event) => setAmounts((current) => ({ ...current, [key]: event.target.value }))}
                              className="mt-1 w-full"
                            />
                          </label>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
          {context.data.candidates.length >= 500 && <p className="text-xs text-muted">Showing the first 500 matching demands. Narrow demand selection before assigning a later record.</p>}
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button type="button" variant="default" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={saveAllocations.isPending}>{saveAllocations.isPending ? 'Saving…' : 'Save allocations'}</Button>
          </div>
        </form>
      ) : null}
    </Dialog>
  );
}
