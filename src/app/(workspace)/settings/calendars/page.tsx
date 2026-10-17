'use client';
import { useListSearch, usePaginatedList } from '@/lib/api/use-paginated-list';
import { ListSearch } from '@/components/ui/list-search';

import { PermissionGate } from '@/components/ui/permission-gate';
import { PageHeader } from '@/components/ui/page-header';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import React, { useState } from 'react';
import { Icon } from '@/components/icons';
import { Tabs } from '@/components/ui/tabs';
import { Select } from '@/components/ui/select';
import { Pagination } from '@/components/ui/pagination';
import { LoadingState } from '@/components/ui/resource-state';
import { WorkingCalendarView } from '@/features/masters/components/working-calendar-view';
import { operatingDay } from '@/features/masters/calendar-presentation';
import { useCalendars, useAddCalendarException } from '@/features/masters/hooks';
import { Calendar } from '@/features/masters/api';
import { DataTable, Column } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { ErrorState } from '@/components/ui/resource-state';
import { FormErrorSummary } from '@/components/ui/form-errors';
import { CreateCalendarModal } from '@/features/masters/components/resource-forms';
import { ApiError } from '@/lib/api/client';
import { ArchiveMasterDialog, MasterRowActions } from '@/features/masters/components/master-row-actions';
import { CatalogNameEditDialog } from '@/features/masters/components/catalog-name-edit-dialog';

export default function CalendarsPage() {
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [calendarId, setCalendarId] = useState('');
  const [exceptionValidation, setExceptionValidation] = useState('');
  const [exceptionShifts, setExceptionShifts] = useState([{ start: '08:00', end: '17:00' }]);
  const detailQuery = useCalendars();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [exceptionCalendar, setExceptionCalendar] = useState<Calendar | null>(null);
  const [exceptionDate, setExceptionDate] = useState('');
  const [isWorkingDay, setIsWorkingDay] = useState(false);
  const [exceptionReason, setExceptionReason] = useState('');
  const [exceptionError, setExceptionError] = useState<ApiError | null>(null);
  const [selectedCalendar, setSelectedCalendar] = useState<Calendar | null>(null);
  const [calendarToArchive, setCalendarToArchive] = useState<Calendar | null>(null);

  const { search, setSearch, query } = useListSearch();
  const { data, isLoading, error, refetch, pagination } = usePaginatedList<Calendar>('calendars', { search: query || undefined });
  const addException = useAddCalendarException(exceptionCalendar?.id ?? '');

  const calendars = data?.data || [];
  const activeCalendar = calendars.find(calendar => calendar.id === calendarId) || calendars[0];
  const calendarDetail = detailQuery.data?.data.find(calendar => calendar.id === activeCalendar?.id);
  const openException = (calendar: Calendar, date = '') => {
    setExceptionError(null); setExceptionValidation(''); setExceptionDate(date); setExceptionCalendar(calendar);
    const state = date ? operatingDay(calendar, new Date(`${date}T12:00:00`)) : null;
    setIsWorkingDay(Boolean(state?.intervals?.length)); setExceptionReason(state?.reason || '');
    setExceptionShifts(state?.intervals?.length ? state.intervals : [{ start: '08:00', end: '17:00' }]);
  };

  const handleExceptionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exceptionCalendar) return;
    setExceptionError(null); setExceptionValidation('');
    if (isWorkingDay && exceptionShifts.some(shift => !shift.start || !shift.end || shift.end <= shift.start)) { setExceptionValidation('Shift end must be after shift start.'); return; }
    const orderedShifts = [...exceptionShifts].sort((left, right) => left.start.localeCompare(right.start));
    if (isWorkingDay && orderedShifts.some((shift, index) => index > 0 && orderedShifts[index - 1].end > shift.start)) { setExceptionValidation('Working intervals must not overlap.'); return; }
    try {
      await addException.mutateAsync({
        date: exceptionDate,
        isWorkingDay,
        reason: exceptionReason || undefined,
        intervalsJson: isWorkingDay ? JSON.stringify(orderedShifts) : undefined,
      });
      setExceptionCalendar(null);
      setExceptionDate('');
      setExceptionReason('');
      refetch();
    } catch (err: any) {
      setExceptionError(err);
    }
  };

  const columns: Column<Calendar>[] = [
    {
      key: 'code',
      header: 'Calendar Code',
      render: (c) => <button type="button" className="wc-code-link" onClick={() => { setCalendarId(c.id); setView('calendar'); }}>{c.code}<Icon name="arrow" /></button>,
    },
    {
      key: 'name',
      header: 'Calendar Name',
      render: (c) => <span className="font-medium text-ink">{c.name}</span>,
    },
    {
      key: 'timezone',
      header: 'Timezone',
      render: (c) => <span className="font-mono text-ink">{c.timezone}</span>,
    },
    {
      key: 'actions',
      header: 'Exceptions',
      render: (c) => (
        <PermissionGate permission="resource.manage"><Button variant="default" size="small" onClick={(e) => { e.stopPropagation(); openException(detailQuery.data?.data.find(calendar => calendar.id === c.id) || c); }}>
          Add Exception
        </Button></PermissionGate>
      ),
    },
    {
      key: 'manage',
      header: 'Manage',
      render: (calendar) => (
        <PermissionGate permission="resource.manage">
          <MasterRowActions onEdit={() => setSelectedCalendar(calendar)} onArchive={() => setCalendarToArchive(calendar)} />
        </PermissionGate>
      ),
    },
  ];

  return (
    <div className="page-stack working-calendar">
      <PageHeader title="Working Calendars" description="Configure standard operating hours, weekly shifts and holiday exceptions" actions={<><PermissionGate permission="resource.manage"><Button variant="primary" icon="plus" onClick={() => setIsCreateOpen(true)}>
          New Calendar
        </Button></PermissionGate></>} />

      <div className="ov-toolbar"><ListSearch value={search} onChange={setSearch} placeholder="Search calendar code or name…" label="Search calendars" /><Tabs variant="segmented" activeId={view} onChange={setView} ariaLabel="Working calendars view" items={[{ id: 'calendar', label: 'Calendar', icon: 'calendar' }, { id: 'list', label: 'List', icon: 'order' }]} /></div>

      {error ? (
        <ErrorState message={(error as any)?.message || 'Failed to load calendars'} onRetry={() => refetch()} />
      ) : view === 'calendar' ? isLoading ? <LoadingState message="Loading operating calendars…" /> : calendars.length === 0 ? <div className="ov-empty"><Icon name="calendar" /><h2>No matching calendars</h2><p>Create a working calendar or adjust the search to see its shifts and exceptions.</p></div> : <>

        {detailQuery.isPending ? <LoadingState message="Loading shifts and exceptions…" /> : detailQuery.error ? <ErrorState message={detailQuery.error.message} onRetry={() => detailQuery.refetch()} /> : calendarDetail ? <WorkingCalendarView calendar={calendarDetail} calendars={calendars} onCalendarChange={setCalendarId} onException={date => openException(calendarDetail, date)} /> : <ErrorState message="Calendar details are unavailable. Refresh to try again." onRetry={() => detailQuery.refetch()} />}
        <Pagination {...pagination} />
      </> : (
        <DataTable
          pagination={pagination}
          columns={columns}
          data={calendars}
          isLoading={isLoading}
          emptyTitle="No operating calendars defined"
          emptyDescription="Create standard working calendars to govern shop floor shift availability and scheduling."
        />
      )}

      <CreateCalendarModal isOpen={isCreateOpen} onClose={() => { setIsCreateOpen(false); refetch(); }} />
      <CatalogNameEditDialog resource="calendars" record={selectedCalendar} onClose={() => setSelectedCalendar(null)} />
      <ArchiveMasterDialog
        isOpen={!!calendarToArchive}
        onClose={() => setCalendarToArchive(null)}
        endpoint={`/api/resources/catalog/calendars/${calendarToArchive?.id}`}
        recordName={calendarToArchive?.name || 'calendar'}
        onArchived={refetch}
      />

      {/* Exception Dialog */}
      <Dialog
        isOpen={!!exceptionCalendar}
        onClose={() => setExceptionCalendar(null)}
        title={`Calendar Exception: ${exceptionCalendar?.code}`}
        subtitle="Override the regular pattern for a holiday, shutdown, or extra working day."
        type="modal" pending={addException.isPending}
      >
        <form onSubmit={handleExceptionSubmit} className="space-y-4">
          <FormErrorSummary error={exceptionError} />
          {exceptionValidation && <p className="ov-error" role="alert">{exceptionValidation}</p>}
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">Date (YYYY-MM-DD) *
            <DatePicker value={exceptionDate} onChange={setExceptionDate} required /></label>
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={isWorkingDay}
                onChange={(e) => setIsWorkingDay(e.target.checked)}
                className="rounded border-line bg-surface text-primary focus:ring-0"
              />
              Is Working Day (e.g. Overtime Saturday)
            </label>
          </div>
          <p className="text-xs text-muted">Saving replaces the working intervals for this date. Other dates keep their existing pattern.</p>
          {isWorkingDay && <div className="wc-exception-shifts">{exceptionShifts.map((shift, index) => <div className="wc-exception-shift" key={index}><label>Start time<Input type="time" required value={shift.start} onChange={event => setExceptionShifts(previous => previous.map((item, i) => i === index ? { ...item, start: event.target.value } : item))} /></label><label>End time<Input type="time" required value={shift.end} onChange={event => setExceptionShifts(previous => previous.map((item, i) => i === index ? { ...item, end: event.target.value } : item))} /></label><button className="icon-btn" type="button" aria-label={`Remove interval ${index + 1}`} disabled={exceptionShifts.length === 1} onClick={() => setExceptionShifts(previous => previous.filter((_, i) => i !== index))}><Icon name="close" /></button></div>)}<Button type="button" size="small" icon="plus" onClick={() => setExceptionShifts(previous => [...previous, { start: '08:00', end: '17:00' }])}>Add interval</Button></div>}
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">Reason / Description
            <Input
              type="text"
              placeholder="e.g. Public Holiday or Planned Maintenance"
              value={exceptionReason}
              onChange={(e) => setExceptionReason(e.target.value)}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary/20 focus:outline-none"
            /></label>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-line">
            <PermissionGate permission="resource.manage"><Button variant="ghost" onClick={() => setExceptionCalendar(null)}>Cancel</Button></PermissionGate>
            <Button type="submit" variant="primary" disabled={addException.isPending}>
              {addException.isPending ? 'Saving...' : 'Add Exception'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
