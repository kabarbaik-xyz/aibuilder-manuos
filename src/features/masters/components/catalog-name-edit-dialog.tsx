'use client';

import { useEffect, useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiRequest } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormErrorSummary } from '@/components/ui/form-errors';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

export type CatalogNameResource = 'certifications' | 'locations' | 'departments' | 'calendars' | 'machines' | 'skills' | 'uoms' | 'qc-checklists';
export type CatalogNameRecord = {
  id: string;
  code: string;
  name: string;
  version?: number;
  timezone?: string;
  weeklyJson?: string;
  status?: string;
  hourlyRateCents?: number | null;
  recoveryPriority?: number;
  scaleMax?: number;
  precision?: number;
};

const labels: Record<CatalogNameResource, string> = {
  certifications: 'certification',
  locations: 'location',
  departments: 'department',
  calendars: 'calendar',
  machines: 'machine',
  skills: 'skill',
  uoms: 'unit of measure',
  'qc-checklists': 'QC checklist',
};

function endpointFor(resource: CatalogNameResource, id: string) {
  return resource === 'locations'
    ? `/api/locations/${id}`
    : `/api/resources/catalog/${resource}/${id}`;
}

export function CatalogNameEditDialog({
  resource,
  record,
  onClose,
}: {
  resource: CatalogNameResource;
  record: CatalogNameRecord | null;
  onClose: () => void;
}) {
  const id = useId();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [startHour, setStartHour] = useState('08:00');
  const [endHour, setEndHour] = useState('17:00');
  const [machineStatus, setMachineStatus] = useState('AVAILABLE');
  const [hourlyRateCents, setHourlyRateCents] = useState('');
  const [recoveryPriority, setRecoveryPriority] = useState('100');
  const [scaleMax, setScaleMax] = useState(5);
  const [precision, setPrecision] = useState(0);
  const [initial, setInitial] = useState({ name: '', timezone: 'UTC', startHour: '08:00', endHour: '17:00', machineStatus: 'AVAILABLE', hourlyRateCents: '', recoveryPriority: '100', scaleMax: 5, precision: 0 });
  const [error, setError] = useState<ApiError | null>(null);
  const label = labels[resource];
  useEffect(() => {
    setError(null);
    const status = record?.status || 'AVAILABLE';
    const next = {
      name: record?.name || '',
      timezone: record?.timezone || 'UTC',
      startHour: '08:00',
      endHour: '17:00',
      machineStatus: status === 'ACTIVE' ? 'AVAILABLE' : status === 'DECOMMISSIONED' ? 'OFFLINE' : status,
      hourlyRateCents: record?.hourlyRateCents === null || record?.hourlyRateCents === undefined ? '' : String(record.hourlyRateCents),
      recoveryPriority: String(record?.recoveryPriority ?? 100),
      scaleMax: record?.scaleMax || 5,
      precision: record?.precision || 0,
    };
    try {
      const parsed = JSON.parse(record?.weeklyJson || '{}');
      const day = Array.isArray(parsed) ? parsed[0] : parsed.days?.[0];
      const interval = day?.intervals?.[0];
      next.startHour = interval?.start || '08:00';
      next.endHour = interval?.end || '17:00';
    } catch {
      next.startHour = '08:00';
      next.endHour = '17:00';
    }
    setInitial(next);
    setName(next.name);
    setTimezone(next.timezone);
    setStartHour(next.startHour);
    setEndHour(next.endHour);
    setMachineStatus(next.machineStatus);
    setHourlyRateCents(next.hourlyRateCents);
    setRecoveryPriority(next.recoveryPriority);
    setScaleMax(next.scaleMax);
    setPrecision(next.precision);
  }, [record]);

  const save = useMutation({
    mutationFn: () => {
      const payload: Record<string, string | number | null | undefined> = {
        expectedVersion: record?.version,
        name: name.trim(),
      };
      if (resource === 'calendars') {
        if (timezone !== initial.timezone) payload.timezone = timezone;
        if (startHour !== initial.startHour || endHour !== initial.endHour) {
          payload.weeklyShiftsJson = JSON.stringify({
            days: [1, 2, 3, 4, 5].map(dayOfWeek => ({ dayOfWeek, intervals: [{ start: startHour, end: endHour }] })),
          });
        }
      }
      if (resource === 'machines') { payload.status = machineStatus; payload.hourlyRateCents = hourlyRateCents.trim() ? Number(hourlyRateCents) : null; payload.recoveryPriority = Number(recoveryPriority); }
      if (resource === 'skills') payload.scaleMax = scaleMax;
      if (resource === 'uoms') payload.precision = precision;
      return apiRequest(endpointFor(resource, record!.id), { method: 'PATCH', body: JSON.stringify(payload) });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [resource] });
      onClose();
    },
    onError: (reason) => setError(reason as ApiError),
  });

  return (
    <Dialog
      isOpen={!!record}
      onClose={onClose}
      title={`Edit ${label}`}
      subtitle={record ? `${record.code} · Update the display name` : undefined}
      type="modal"
      size="md"
      pending={save.isPending}
      dirty={JSON.stringify({ name, timezone, startHour, endHour, machineStatus, hourlyRateCents, recoveryPriority, scaleMax, precision }) !== JSON.stringify(initial)}
      footer={<>
        <Button onClick={onClose} disabled={save.isPending}>Cancel</Button>
        <Button type="submit" form={id} variant="primary" disabled={save.isPending || !name.trim()}>
          {save.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </>}
    >
      <form id={id} className="page-stack" onSubmit={(event) => { event.preventDefault(); setError(null); save.mutate(); }}>
        <FormErrorSummary error={error} />
        <FormField id={`${id}-name`} label={`${label} name`} required>
          <Input value={name} onChange={(event) => setName(event.target.value)} disabled={save.isPending} />
        </FormField>
        {resource === 'calendars' && <>
          <FormField id={`${id}-timezone`} label="Timezone" required>
            <Input value={timezone} onChange={(event) => setTimezone(event.target.value)} disabled={save.isPending} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField id={`${id}-start`} label="Weekday shift starts">
              <Input type="time" value={startHour} onChange={(event) => setStartHour(event.target.value)} disabled={save.isPending} />
            </FormField>
            <FormField id={`${id}-end`} label="Weekday shift ends">
              <Input type="time" value={endHour} onChange={(event) => setEndHour(event.target.value)} disabled={save.isPending} />
            </FormField>
          </div>
        </>}
        {resource === 'machines' && <FormField id={`${id}-status`} label="Machine status">
          <Select value={machineStatus} onChange={(event) => setMachineStatus(event.target.value)} disabled={save.isPending}>
            <option value="AVAILABLE">Available</option>
            <option value="MAINTENANCE">Maintenance</option>
            <option value="OFFLINE">Offline</option>
          </Select>
        </FormField>}
        {resource === 'machines' && <FormField id={`${id}-hourly-rate`} label="Machine cost (minor units / hour)" help="Leave blank if the rate is unknown; unknown costs stay unavailable in comparisons.">
          <Input type="number" min="0" step="1" value={hourlyRateCents} onChange={(event) => setHourlyRateCents(event.target.value)} disabled={save.isPending} />
        </FormField>}
        {resource === 'machines' && <FormField id={`${id}-recovery-priority`} label="Recovery priority (lower first)" help="Only breaks ties between equally available capable machines. Availability takes precedence.">
          <Input type="number" min="0" max="10000" step="1" value={recoveryPriority} onChange={(event) => setRecoveryPriority(event.target.value)} disabled={save.isPending} />
        </FormField>}
        {resource === 'skills' && <FormField id={`${id}-scale`} label="Proficiency scale maximum" required>
          <Input type="number" min={1} max={10} value={scaleMax} onChange={(event) => setScaleMax(Number(event.target.value))} disabled={save.isPending} />
        </FormField>}
        {resource === 'uoms' && <FormField id={`${id}-precision`} label="Decimal precision" required>
          <Input type="number" min={0} max={6} value={precision} onChange={(event) => setPrecision(Number(event.target.value))} disabled={save.isPending} />
        </FormField>}
      </form>
    </Dialog>
  );
}
