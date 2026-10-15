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

export function CreateCalendarModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const createCalendar = useCreateCalendar();
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    timezone: 'UTC',
    startHour: '08:00',
    endHour: '17:00',
  });
  const [error, setError] = useState<ApiError | null>(null);

  const initialForm = useRef(JSON.stringify(formData));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const weekly = {
        days: [
          { dayOfWeek: 1, intervals: [{ start: formData.startHour, end: formData.endHour }] },
          { dayOfWeek: 2, intervals: [{ start: formData.startHour, end: formData.endHour }] },
          { dayOfWeek: 3, intervals: [{ start: formData.startHour, end: formData.endHour }] },
          { dayOfWeek: 4, intervals: [{ start: formData.startHour, end: formData.endHour }] },
          { dayOfWeek: 5, intervals: [{ start: formData.startHour, end: formData.endHour }] },
        ],
      };
      await createCalendar.mutateAsync({
        code: formData.code.trim().toUpperCase(),
        name: formData.name.trim(),
        timezone: formData.timezone,
        weeklyJson: JSON.stringify(weekly),
      });
      onClose();
      setFormData({ code: '', name: '', timezone: 'UTC', startHour: '08:00', endHour: '17:00' });
    } catch (err: any) {
      setError(err);
    }
  };

  return (
    <Dialog type="modal" size="lg" pending={createCalendar.isPending} dirty={JSON.stringify(formData) !== initialForm.current} isOpen={isOpen} onClose={()=>{setFormData(JSON.parse(initialForm.current));setError(null);onClose()}} title="New Working Calendar" subtitle="Set regular shift intervals and timezone">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormErrorSummary error={error} />
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">Calendar Code *
          <Input
            type="text"
            required
            placeholder="e.g. CAL-DAY-SHIFT"
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value })}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-primary/20 focus:outline-none"
          /></label>
          <FieldError error={error} field="code" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">Calendar Name *
          <Input
            type="text"
            required
            placeholder="e.g. Standard 5-Day Single Shift"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-primary/20 focus:outline-none"
          /></label>
          <FieldError error={error} field="name" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">Timezone *
          <Input
            type="text"
            required
            value={formData.timezone}
            onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary/20 focus:outline-none"
          /></label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">Work Start (Mon-Fri)
            <Input
              type="time"
              required
              value={formData.startHour}
              onChange={(e) => setFormData({ ...formData, startHour: e.target.value })}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary/20 focus:outline-none"
            /></label>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">Work End (Mon-Fri)
            <Input
              type="time"
              required
              value={formData.endHour}
              onChange={(e) => setFormData({ ...formData, endHour: e.target.value })}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary/20 focus:outline-none"
            /></label>
          </div>
        </div>
        <div className="form-actions flex justify-end gap-2 pt-4 border-t border-line">
          <Button variant="ghost" data-dialog-dismiss onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={createCalendar.isPending}>
            {createCalendar.isPending ? 'Saving...' : 'Create Calendar'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
