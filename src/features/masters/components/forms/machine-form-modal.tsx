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
  useMachines,
} from '../../hooks';

export function CreateMachineModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const createMachine = useCreateMachine();
  const machinesQuery = useMachines();
  const classes = Array.from(new Map((machinesQuery.data?.data || []).filter(m => m.machineClassId).map(m => [m.machineClassId!, {id:m.machineClassId!,name:m.machineClass}])).values());
  const { data: deptData } = useDepartments();
  const { data: calData } = useCalendars();
  const departments = deptData?.data || [];
  const calendars = calData?.data || [];

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    machineClass: '',
    departmentId: '',
    calendarId: '',
    hourlyRateCents: 8500,
  });
  const [error, setError] = useState<ApiError | null>(null);

  const initialForm = useRef(JSON.stringify(formData));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createMachine.mutateAsync({
        code: formData.code.trim().toUpperCase(),
        name: formData.name.trim(),
        machineClass: formData.machineClass,
        departmentId: formData.departmentId || (departments[0]?.id ?? ''),
        calendarId: formData.calendarId || (calendars[0]?.id ?? ''),
        hourlyRateCents: Number(formData.hourlyRateCents) || 0,
      });
      onClose();
      setFormData({
        code: '',
        name: '',
        machineClass: '',
        departmentId: '',
        calendarId: '',
        hourlyRateCents: 8500,
      });
    } catch (err: any) {
      setError(err);
    }
  };

  return (
    <Dialog type="modal" size="lg" pending={createMachine.isPending} dirty={JSON.stringify(formData) !== initialForm.current} isOpen={isOpen} onClose={()=>{setFormData(JSON.parse(initialForm.current));setError(null);onClose()}} title="New Machine" subtitle="Register a manufacturing machine resource">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormErrorSummary error={error} />{!classes.length && !machinesQuery.isPending && <p className="field-help">No machine classes are available. Resource-class setup requires a supported catalog endpoint before a machine can be created.</p>}
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">Machine Code *
          <Input
            type="text"
            required
            placeholder="e.g. CNC-01"
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value })}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-primary/20 focus:outline-none"
          /></label>
          <FieldError error={error} field="code" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">Machine Name *
          <Input
            type="text"
            required
            placeholder="e.g. Haas VF-2SS 5-Axis Milling Center"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-primary/20 focus:outline-none"
          /></label>
          <FieldError error={error} field="name" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">Machine Class *
            <Select required value={formData.machineClass} onChange={e=>setFormData({...formData,machineClass:e.target.value})}><option value="">Select an existing machine class…</option>{classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</Select></label>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">Hourly Cost ($/hr)
            <Input
              type="number"
              step="0.01"
              disabled
              value=""
              placeholder="Cost rates are not supported yet"
              onChange={(e) => setFormData({ ...formData, hourlyRateCents: Math.round(Number(e.target.value) * 100) })}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary/20 focus:outline-none"
            /></label>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">Department *
            <Select
              required
              value={formData.departmentId || (departments[0]?.id ?? '')}
              onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary/20 focus:outline-none"
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
              ))}
            </Select></label>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">Calendar *
            <Select
              required
              value={formData.calendarId || (calendars[0]?.id ?? '')}
              onChange={(e) => setFormData({ ...formData, calendarId: e.target.value })}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary/20 focus:outline-none"
            >
              {calendars.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
              ))}
            </Select></label>
          </div>
        </div>
        <div className="form-actions flex justify-end gap-2 pt-4 border-t border-line">
          <Button variant="ghost" data-dialog-dismiss onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={createMachine.isPending || !formData.machineClass}>
            {createMachine.isPending ? 'Saving...' : 'Create Machine'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
