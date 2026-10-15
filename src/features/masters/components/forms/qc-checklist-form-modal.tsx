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

export function CreateQcChecklistModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const createQcChecklist = useCreateQcChecklist();
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    revision: 1,
    checkCode: 'DIM-01',
    checkDesc: 'Initial visual & dimensional check',
    checkMethod: 'MEASUREMENT',
    checkUnit: 'mm',
  });
  const [error, setError] = useState<ApiError | null>(null);

  const initialForm = useRef(JSON.stringify(formData));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createQcChecklist.mutateAsync({
        code: formData.code.trim().toUpperCase(),
        name: formData.name.trim(),
        revision: Number(formData.revision) || 1,
        checks: [
          {
            code: formData.checkCode.trim().toUpperCase(),
            description: formData.checkDesc.trim(),
            method: formData.checkMethod,
            unit: formData.checkUnit || null,
            limitsJson: JSON.stringify({ required: true }),
            isRequired: true,
          },
        ],
      });
      onClose();
      setFormData({
        code: '',
        name: '',
        revision: 1,
        checkCode: 'DIM-01',
        checkDesc: 'Initial visual & dimensional check',
        checkMethod: 'MEASUREMENT',
        checkUnit: 'mm',
      });
    } catch (err: any) {
      setError(err);
    }
  };

  return (
    <Dialog type="modal" size="lg" pending={createQcChecklist.isPending} dirty={JSON.stringify(formData) !== initialForm.current} isOpen={isOpen} onClose={()=>{setFormData(JSON.parse(initialForm.current));setError(null);onClose()}} title="New QC Checklist" subtitle="Define quality inspection criteria and tolerances">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormErrorSummary error={error} />
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">Checklist Code *
          <Input
            type="text"
            required
            placeholder="e.g. QC-INCOMING-RAW"
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value })}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-primary/20 focus:outline-none"
          /></label>
          <FieldError error={error} field="code" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">Checklist Name *
          <Input
            type="text"
            required
            placeholder="e.g. Incoming Raw Barstock Quality Inspection"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-primary/20 focus:outline-none"
          /></label>
          <FieldError error={error} field="name" />
        </div>
        <div className="rounded-lg border border-line bg-surface p-3 space-y-3">
          <div className="text-xs font-semibold text-ink">Initial Inspection Point</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">Check Code
              <Input
                type="text"
                required
                value={formData.checkCode}
                onChange={(e) => setFormData({ ...formData, checkCode: e.target.value })}
                className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary/20 focus:outline-none"
              /></label>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">Method
              <Select
                value={formData.checkMethod}
                onChange={(e) => setFormData({ ...formData, checkMethod: e.target.value })}
                className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary/20 focus:outline-none"
              >
                <option value="MEASUREMENT">Measurement</option>
                <option value="VISUAL">Visual</option>
                <option value="FUNCTIONAL">Functional</option>
                <option value="GAUGE">Gauge (Go / No-Go)</option>
              </Select></label>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">Description
            <Input
              type="text"
              required
              value={formData.checkDesc}
              onChange={(e) => setFormData({ ...formData, checkDesc: e.target.value })}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary/20 focus:outline-none"
            /></label>
          </div>
        </div>
        <div className="form-actions flex justify-end gap-2 pt-4 border-t border-line">
          <Button variant="ghost" data-dialog-dismiss onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={createQcChecklist.isPending}>
            {createQcChecklist.isPending ? 'Saving...' : 'Create Checklist'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
