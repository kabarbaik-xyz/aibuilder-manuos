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

export function CreateLocationModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const createLocation = useCreateLocation();
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    type: 'RAW',
    isPickable: true,
    isReceiving: false,
  });
  const [error, setError] = useState<ApiError | null>(null);

  const initialForm = useRef(JSON.stringify(formData));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createLocation.mutateAsync({
        code: formData.code.trim().toUpperCase(),
        name: formData.name.trim(),
        type: formData.type,
        isPickable: formData.isPickable,
        isReceiving: formData.isReceiving,
      });
      onClose();
      setFormData({ code: '', name: '', type: 'RAW', isPickable: true, isReceiving: false });
    } catch (err: any) {
      setError(err);
    }
  };

  return (
    <Dialog type="modal" size="md" pending={createLocation.isPending} dirty={JSON.stringify(formData) !== initialForm.current} isOpen={isOpen} onClose={()=>{setFormData(JSON.parse(initialForm.current));setError(null);onClose()}} title="New Warehouse Location" subtitle="Define physical zone, aisle, bin or staging area">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormErrorSummary error={error} />
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">Location Code *
          <Input
            type="text"
            required
            placeholder="e.g. WH-RAW-A01"
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value })}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-primary/20 focus:outline-none"
          /></label>
          <FieldError error={error} field="code" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">Location Name *
          <Input
            type="text"
            required
            placeholder="e.g. Raw Material Rack A - Shelf 01"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-primary/20 focus:outline-none"
          /></label>
          <FieldError error={error} field="name" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">Zone Type *
          <Select
            value={formData.type}
            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary/20 focus:outline-none"
          >
            <option value="RAW">Raw Material Zone</option>
            <option value="WIP">Work in Progress (WIP)</option>
            <option value="QUARANTINE">Quarantine / Inspection</option>
            <option value="FINISHED_GOODS">Finished Goods (FG)</option>
            <option value="SCRAP">Scrap / Defect Bin</option>
          </Select></label>
        </div>
        <div className="flex gap-6 pt-2">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={formData.isPickable}
              onChange={(e) => setFormData({ ...formData, isPickable: e.target.checked })}
              className="rounded border-line bg-surface text-primary focus:ring-0"
            />
            Eligible for Picking
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={formData.isReceiving}
              onChange={(e) => setFormData({ ...formData, isReceiving: e.target.checked })}
              className="rounded border-line bg-surface text-primary focus:ring-0"
            />
            Receiving Staging Zone
          </label>
        </div>
        <div className="form-actions flex justify-end gap-2 pt-4 border-t border-line">
          <Button variant="ghost" data-dialog-dismiss onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={createLocation.isPending}>
            {createLocation.isPending ? 'Saving...' : 'Create Location'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
