'use client';

import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useItem, useUpdateItem, useAddItemConversion, useUoms } from '@/features/masters/hooks';
import { LoadingState, ErrorState } from '@/components/ui/resource-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormErrorSummary, FieldError } from '@/components/ui/form-errors';
import { ApiError } from '@/lib/api/client';
import { parseQuantity, formatQuantity } from '@/domain/quantity';

export default function ItemDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const { data, isLoading, error, refetch } = useItem(id);
  const { data: uomsData } = useUoms();
  const updateItem = useUpdateItem(id);
  const addConversion = useAddItemConversion(id);

  const item = data?.data;
  const uoms = uomsData?.data || [];

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState('');
  const [isLotTracked, setIsLotTracked] = useState(false);
  const [isSerialTracked, setIsSerialTracked] = useState(false);
  const [shelfLifeDays, setShelfLifeDays] = useState('');
  const [updateError, setUpdateError] = useState<ApiError | null>(null);

  // Conversion form state
  const [conversionUomId, setConversionUomId] = useState('');
  const [conversionFactor, setConversionFactor] = useState('');
  const [conversionError, setConversionError] = useState<ApiError | null>(null);

  React.useEffect(() => {
    if (item) {
      setName(item.name);
      setIsLotTracked(item.isLotTracked);
      setIsSerialTracked(item.isSerialTracked);
      setShelfLifeDays(item.shelfLifeDays ? String(item.shelfLifeDays) : '');
    }
  }, [item]);

  if (isLoading) return <LoadingState />;
  if (error || !item) {
    return <ErrorState message={(error as any)?.message || 'Item not found'} onRetry={() => refetch()} />;
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdateError(null);
    try {
      await updateItem.mutateAsync({
        expectedVersion: item.version,
        name: name.trim(),
        isLotTracked,
        isSerialTracked,
        shelfLifeDays: shelfLifeDays ? Number(shelfLifeDays) : undefined,
      });
      setIsEditing(false);
    } catch (err: any) {
      setUpdateError(err);
    }
  };

  const handleAddConversion = async (e: React.FormEvent) => {
    e.preventDefault();
    setConversionError(null);
    try {
      const targetUom = uoms.find((u) => u.id === (conversionUomId || uoms[0]?.id));
      const targetUomPrecision = targetUom?.precision ?? 0;
      const factorAtoms = parseQuantity(conversionFactor, targetUomPrecision).toString();

      await addConversion.mutateAsync({
        toUomId: conversionUomId || (uoms[0]?.id ?? ''),
        factorAtoms,
      });
      setConversionFactor('');
    } catch (err: any) {
      setConversionError(err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="small" icon="arrow-left" onClick={() => router.push('/inventory/items')}>
          Back to Items
        </Button>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-line pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-ink">{item.name}</h1>
            <Badge variant={item.type === 'RAW_MATERIAL' ? 'blue' : item.type === 'FINISHED_GOOD' ? 'success' : 'default'}>
              {item.type.replace('_', ' ')}
            </Badge>
            <Badge variant={item.status === 'ACTIVE' ? 'success' : 'default'}>{item.status}</Badge>
          </div>
          <p className="font-mono text-sm text-muted mt-1">Code: {item.code} · Rev: v{item.version}</p>
        </div>
        <div className="flex gap-2">
          {!isEditing ? (
            <Button variant="default" onClick={() => setIsEditing(true)}>Edit Item</Button>
          ) : (
            <Button variant="ghost" onClick={() => setIsEditing(false)}>Cancel</Button>
          )}
        </div>
      </div>

      {isEditing ? (
        <form onSubmit={handleSave} className="max-w-xl space-y-4 rounded-lg border border-line bg-surface p-5">
          <FormErrorSummary error={updateError} />
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">Item Name
            <Input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary/20 focus:outline-none"
            /></label>
          </div>
          <p className="field-help">Tracking changes and shelf-life configuration are not supported by the current item update API.</p><div className="flex gap-6 pt-2">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={isLotTracked}
                disabled
                onChange={(e) => setIsLotTracked(e.target.checked)}
                className="rounded border-line bg-surface text-primary focus:ring-0"
              />
              Lot / Batch Tracked
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={isSerialTracked}
                disabled
                onChange={(e) => setIsSerialTracked(e.target.checked)}
                className="rounded border-line bg-surface text-primary focus:ring-0"
              />
              Serial Tracked
            </label>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">Shelf Life (Days)
            <Input
              type="number"
              min={0}
              value={shelfLifeDays}
              disabled
              onChange={(e) => setShelfLifeDays(e.target.value)}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary/20 focus:outline-none"
            /></label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" variant="primary" disabled={updateItem.isPending}>
              {updateItem.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-lg border border-line bg-surface p-5 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink">Inventory Properties</h2>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-muted">Base Unit of Measure</span>
              <span className="font-mono text-ink">{item.baseUom?.code} ({item.baseUom?.name})</span>
              <span className="text-muted">Base Precision</span>
              <span className="text-ink">{item.baseUom?.precision} decimal places</span>
              <span className="text-muted">Lot Tracking</span>
              <span className="text-ink">{item.isLotTracked ? 'Enabled' : 'Disabled'}</span>
              <span className="text-muted">Serial Tracking</span>
              <span className="text-ink">{item.isSerialTracked ? 'Enabled' : 'Disabled'}</span>
              <span className="text-muted">Shelf Life</span>
              <span className="text-ink">{item.shelfLifeDays != null ? `${item.shelfLifeDays} days` : 'Not configured'}</span>
            </div>
          </div>

          <div className="rounded-lg border border-line bg-surface p-5 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink">UOM Conversions</h2>
            {item.conversions && item.conversions.length > 0 ? (
              <div className="space-y-2">
                {item.conversions.map((conv) => (
                  <div key={conv.id} className="flex items-center justify-between text-sm border-b border-line pb-2">
                    <span className="text-ink font-mono">1 {conv.toUom?.code}</span>
                    <span className="text-muted font-mono">= {conv.ratioNumerator != null ? `${conv.ratioNumerator}/${conv.ratioDenominator}` : '—'} {item.baseUom?.code}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted italic">No alternative units configured</p>
            )}

            <form onSubmit={handleAddConversion} className="pt-3 border-t border-line space-y-3">
              <div className="text-xs font-semibold text-ink">Add Conversion Factor</div>
              <FormErrorSummary error={conversionError} />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-muted uppercase tracking-wider mb-1">Input UOM
                  <Select
                    value={conversionUomId || (uoms[0]?.id ?? '')}
                    onChange={(e) => setConversionUomId(e.target.value)}
                    className="w-full rounded-md border border-line bg-surface px-2 py-1.5 text-xs text-ink focus:border-primary/20 focus:outline-none"
                  >
                    {uoms.filter((u) => u.id !== item.baseUomId).map((u) => (
                      <option key={u.id} value={u.id}>{u.code} ({u.name})</option>
                    ))}
                  </Select></label>
                </div>
                <div>
                  <label className="block text-xs text-muted uppercase tracking-wider mb-1">Base UOM Units
                  <Input
                    type="text"
                    required
                    placeholder="e.g. 10.0"
                    value={conversionFactor}
                    onChange={(e) => setConversionFactor(e.target.value)}
                    className="w-full rounded-md border border-line bg-surface px-2 py-1.5 text-xs text-ink focus:border-primary/20 focus:outline-none"
                  /></label>
                  <FieldError error={conversionError} field="factorAtoms" />
                </div>
              </div>
              <Button type="submit" variant="default" size="small" disabled={addConversion.isPending}>
                {addConversion.isPending ? 'Adding...' : 'Add Conversion'}
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
