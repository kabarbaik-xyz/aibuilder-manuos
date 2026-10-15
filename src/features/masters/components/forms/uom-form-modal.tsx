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

export function CreateUomModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const createUom = useCreateUom();
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    precision: 0,
    dimension: 'PIECE',
  });
  const [error, setError] = useState<ApiError | null>(null);

  const initialForm = useRef(JSON.stringify(formData));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createUom.mutateAsync({
        code: formData.code.trim().toUpperCase(),
        name: formData.name.trim(),
        precision: Number(formData.precision),
        dimension: formData.dimension,
      });
      onClose();
      setFormData({ code: '', name: '', precision: 0, dimension: 'PIECE' });
    } catch (err: any) {
      setError(err);
    }
  };

  return (
    <Dialog type="modal" size="md" pending={createUom.isPending} dirty={JSON.stringify(formData) !== initialForm.current} isOpen={isOpen} onClose={()=>{setFormData(JSON.parse(initialForm.current));setError(null);onClose()}} title="New Unit of Measure" subtitle="Define physical measure unit and decimal precision">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormErrorSummary error={error} />
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">UOM Code *
          <Input
            type="text"
            required
            placeholder="e.g. PCS, KG, M"
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value })}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-primary/20 focus:outline-none"
          /></label>
          <FieldError error={error} field="code" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">Unit Name *
          <Input
            type="text"
            required
            placeholder="e.g. Pieces, Kilogram, Meter"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-primary/20 focus:outline-none"
          /></label>
          <FieldError error={error} field="name" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">Decimal Precision (0-6)
            <Input
              type="number"
              min={0}
              max={6}
              value={formData.precision}
              onChange={(e) => setFormData({ ...formData, precision: Number(e.target.value) })}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary/20 focus:outline-none"
            /></label>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">Dimension
            <Select
              value={formData.dimension}
              onChange={(e) => setFormData({ ...formData, dimension: e.target.value })}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary/20 focus:outline-none"
            >
              <option value="PIECE">Piece / Count</option>
              <option value="MASS">Mass / Weight</option>
              <option value="LENGTH">Length</option>
              <option value="VOLUME">Volume</option>
              <option value="TIME">Time</option>
              <option value="AREA">Area</option>
            </Select></label>
          </div>
        </div>
        <div className="form-actions flex justify-end gap-2 pt-4 border-t border-line">
          <Button variant="ghost" data-dialog-dismiss onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={createUom.isPending}>
            {createUom.isPending ? 'Saving...' : 'Create UOM'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
