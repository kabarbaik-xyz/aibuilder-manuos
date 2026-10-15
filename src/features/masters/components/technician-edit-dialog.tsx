'use client';

import { useEffect, useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Technician } from '@/features/masters/api';
import { useCalendars, useDepartments } from '@/features/masters/hooks';
import { ApiError, apiRequest } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormErrorSummary } from '@/components/ui/form-errors';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

export function TechnicianEditDialog({ technician, onClose }: { technician: Technician | null; onClose: () => void }) {
  const id = useId();
  const queryClient = useQueryClient();
  const { data: departmentsData } = useDepartments();
  const { data: calendarsData } = useCalendars();
  const [departmentId, setDepartmentId] = useState('');
  const [calendarId, setCalendarId] = useState('');
  const [maxWeeklyMinutes, setMaxWeeklyMinutes] = useState(2400);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    setDepartmentId(technician?.departmentId || '');
    setCalendarId(technician?.calendarId || '');
    setMaxWeeklyMinutes(technician?.maxWeeklyMinutes ?? 2400);
    setError(null);
  }, [technician]);

  const save = useMutation({
    mutationFn: () => apiRequest(`/api/resources/catalog/technicians/${technician!.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        expectedVersion: technician?.version,
        departmentId: departmentId || null,
        calendarId: calendarId || null,
        maxWeeklyMinutes,
      }),
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['technicians'] });
      onClose();
    },
    onError: (reason) => setError(reason as ApiError),
  });

  return (
    <Dialog
      isOpen={!!technician}
      onClose={onClose}
      title="Edit technician profile"
      subtitle={technician ? `${technician.code} · ${technician.name || technician.membership?.user?.name || 'Technician'}` : undefined}
      type="modal"
      size="md"
      pending={save.isPending}
      footer={<>
        <Button onClick={onClose} disabled={save.isPending}>Cancel</Button>
        <Button type="submit" form={id} variant="primary" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </>}
    >
      <form id={id} className="page-stack" onSubmit={(event) => { event.preventDefault(); setError(null); save.mutate(); }}>
        <FormErrorSummary error={error} />
        <FormField id={`${id}-department`} label="Department">
          <Select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)} disabled={save.isPending}>
            <option value="">No department</option>
            {(departmentsData?.data || []).map(department => <option key={department.id} value={department.id}>{department.name} ({department.code})</option>)}
          </Select>
        </FormField>
        <FormField id={`${id}-calendar`} label="Working calendar">
          <Select value={calendarId} onChange={(event) => setCalendarId(event.target.value)} disabled={save.isPending}>
            <option value="">No calendar</option>
            {(calendarsData?.data || []).map(calendar => <option key={calendar.id} value={calendar.id}>{calendar.name} ({calendar.code})</option>)}
          </Select>
        </FormField>
        <FormField id={`${id}-weekly-limit`} label="Maximum weekly minutes" required>
          <Input type="number" min={0} step={1} value={maxWeeklyMinutes} onChange={(event) => setMaxWeeklyMinutes(Number(event.target.value))} disabled={save.isPending} />
        </FormField>
      </form>
    </Dialog>
  );
}
