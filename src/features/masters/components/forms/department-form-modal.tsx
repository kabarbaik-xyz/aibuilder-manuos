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

export function CreateDepartmentModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const createDepartment = useCreateDepartment();
  const [formData, setFormData] = useState({ code: '', name: '' });
  const [error, setError] = useState<ApiError | null>(null);

  const initialForm = useRef(JSON.stringify(formData));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createDepartment.mutateAsync({
        code: formData.code.trim().toUpperCase(),
        name: formData.name.trim(),
      });
      onClose();
      setFormData({ code: '', name: '' });
    } catch (err: any) {
      setError(err);
    }
  };

  return (
    <Dialog type="modal" size="md" pending={createDepartment.isPending} dirty={JSON.stringify(formData) !== initialForm.current} isOpen={isOpen} onClose={()=>{setFormData(JSON.parse(initialForm.current));setError(null);onClose()}} title="New Department" subtitle="Define workshop or manufacturing functional department">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormErrorSummary error={error} />
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">Department Code *
          <Input
            type="text"
            required
            placeholder="e.g. CNC, ASSY, QA"
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value })}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-primary/20 focus:outline-none"
          /></label>
          <FieldError error={error} field="code" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">Department Name *
          <Input
            type="text"
            required
            placeholder="e.g. Precision CNC Machining"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-primary/20 focus:outline-none"
          /></label>
          <FieldError error={error} field="name" />
        </div>
        <div className="form-actions flex justify-end gap-2 pt-4 border-t border-line">
          <Button variant="ghost" data-dialog-dismiss onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={createDepartment.isPending}>
            {createDepartment.isPending ? 'Saving...' : 'Create Department'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
