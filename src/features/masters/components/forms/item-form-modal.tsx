'use client';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import React, { useState, useRef } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FormErrorSummary, FieldError } from '@/components/ui/form-errors';
import { ApiError } from '@/lib/api/client';
import {
  useCreateCustomer,
  useCreateSupplier,
  useCreateItem,
  useCreateUom,
  useCreateLocation,
  useCreateDepartment,
  useCreateCalendar,
  useCreateMachine,
  useCreateTechnician,
  useCreateSkill,
  useCreateOrderType,
  useCreateQcChecklist,
  useUoms,
  useDepartments,
  useCalendars,
  useSkills,
} from '../../hooks';

export function CreateItemModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const createItem = useCreateItem();
  const { data: uomsData } = useUoms();
  const uoms = uomsData?.data || [];

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    type: 'RAW_MATERIAL',
    baseUomId: '',
    isLotTracked: false,
    isSerialTracked: false,
    shelfLifeDays: '',
  });
  const [error, setError] = useState<ApiError | null>(null);

  const initialForm = useRef(JSON.stringify(formData));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createItem.mutateAsync({
        code: formData.code.trim().toUpperCase(),
        name: formData.name.trim(),
        type: formData.type,
        baseUomId: formData.baseUomId || (uoms[0]?.id ?? ''),
        isLotTracked: formData.isLotTracked,
        isSerialTracked: formData.isSerialTracked,
        shelfLifeDays: formData.shelfLifeDays ? Number(formData.shelfLifeDays) : undefined,
      });
      onClose();
      setFormData({
        code: '',
        name: '',
        type: 'RAW_MATERIAL',
        baseUomId: '',
        isLotTracked: false,
        isSerialTracked: false,
        shelfLifeDays: '',
      });
    } catch (err: any) {
      setError(err);
    }
  };

  return (
    <Dialog type="modal" size="lg" pending={createItem.isPending} dirty={JSON.stringify(formData) !== initialForm.current} isOpen={isOpen} onClose={()=>{setFormData(JSON.parse(initialForm.current));setError(null);onClose()}} title="New Item" subtitle="Create raw material, component or finished product">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormErrorSummary error={error} />
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">Item Code / Part No *
          <Input
            type="text"
            required
            placeholder="e.g. AL-6061-ROD"
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value })}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-primary/20 focus:outline-none"
          /></label>
          <FieldError error={error} field="code" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">Item Name *
          <Input
            type="text"
            required
            placeholder="e.g. Aluminium 6061-T6 Round Bar 25mm"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-primary/20 focus:outline-none"
          /></label>
          <FieldError error={error} field="name" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">Item Type *
            <Select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary/20 focus:outline-none"
            >
              <option value="RAW_MATERIAL">Raw Material</option>
              <option value="COMPONENT">Component</option>
              <option value="SUBASSEMBLY">Subassembly</option>
              <option value="FINISHED_GOOD">Finished Good</option>
              
            </Select></label>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">Base UOM *
            <Select
              required
              value={formData.baseUomId || (uoms[0]?.id ?? '')}
              onChange={(e) => setFormData({ ...formData, baseUomId: e.target.value })}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary/20 focus:outline-none"
            >
              {uoms.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code} ({u.name})
                </option>
              ))}
            </Select></label>
          </div>
        </div>
        <div className="flex gap-6 pt-2">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={formData.isLotTracked}
              onChange={(e) => setFormData({ ...formData, isLotTracked: e.target.checked, isSerialTracked: false })}
              className="rounded border-line bg-surface text-primary focus:ring-0"
            />
            Lot / Batch Tracked
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={formData.isSerialTracked}
              onChange={(e) => setFormData({ ...formData, isSerialTracked: e.target.checked, isLotTracked: false })}
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
            placeholder="Optional expiry days"
            value={formData.shelfLifeDays}
            onChange={(e) => setFormData({ ...formData, shelfLifeDays: e.target.value })}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-primary/20 focus:outline-none"
          /></label>
        </div>
        <div className="form-actions flex justify-end gap-2 pt-4 border-t border-line">
          <Button variant="ghost" data-dialog-dismiss onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={createItem.isPending}>
            {createItem.isPending ? 'Saving...' : 'Create Item'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
