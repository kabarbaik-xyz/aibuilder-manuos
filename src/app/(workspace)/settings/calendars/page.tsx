'use client';
import { useListSearch, usePaginatedList } from '@/lib/api/use-paginated-list';
import { ListSearch } from '@/components/ui/list-search';

import { PermissionGate } from '@/components/ui/permission-gate';
import { PageHeader } from '@/components/ui/page-header';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import React, { useState } from 'react';
import { useAddCalendarException } from '@/features/masters/hooks';
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

  const handleExceptionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exceptionCalendar) return;
    setExceptionError(null);
    try {
      await addException.mutateAsync({
        date: exceptionDate,
        isWorkingDay,
        reason: exceptionReason || undefined,
        intervalsJson: isWorkingDay ? JSON.stringify([{ start: '08:00', end: '17:00' }]) : undefined,
      });
      setExceptionCalendar(null);
      setExceptionDate('');
      setExceptionReason('');
    } catch (err: any) {
      setExceptionError(err);
    }
  };

  const columns: Column<Calendar>[] = [
    {
      key: 'code',
      header: 'Calendar Code',
      render: (c) => <span className="font-mono font-semibold text-primary">{c.code}</span>,
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
        <PermissionGate permission="resource.manage"><Button variant="default" size="small" onClick={(e) => { e.stopPropagation(); setExceptionCalendar(c); }}>
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
    <div className="space-y-6">
      <PageHeader title="Working Calendars" description="Configure standard operating hours, weekly shifts and holiday exceptions" actions={<><PermissionGate permission="resource.manage"><Button variant="primary" icon="plus" onClick={() => setIsCreateOpen(true)}>
          New Calendar
        </Button></PermissionGate></>} />

      <ListSearch value={search} onChange={setSearch} placeholder="Search calendar code or name…" label="Search calendars" />

      {error ? (
        <ErrorState message={(error as any)?.message || 'Failed to load calendars'} onRetry={() => refetch()} />
      ) : (
        <DataTable
          pagination={pagination}
          columns={columns}
          data={calendars}
          isLoading={isLoading}
          emptyTitle="No operating calendars defined"
          emptyDescription="Create standard working calendars to govern shop floor shift availability and scheduling."
        />
      )}

      <CreateCalendarModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
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
        subtitle="Schedule a holiday, shutdown or overtime day"
      >
        <form onSubmit={handleExceptionSubmit} className="space-y-4">
          <FormErrorSummary error={exceptionError} />
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
