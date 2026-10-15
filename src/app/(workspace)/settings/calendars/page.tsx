'use client';

import React, { useState } from 'react';
import { useCalendars, useAddCalendarException } from '@/features/masters/hooks';
import { Calendar } from '@/features/masters/api';
import { DataTable, Column } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { ErrorState } from '@/components/ui/resource-state';
import { FormErrorSummary } from '@/components/ui/form-errors';
import { CreateCalendarDrawer } from '@/features/masters/components/resource-forms';
import { ApiError } from '@/lib/api/client';

export default function CalendarsPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [exceptionCalendar, setExceptionCalendar] = useState<Calendar | null>(null);
  const [exceptionDate, setExceptionDate] = useState('');
  const [isWorkingDay, setIsWorkingDay] = useState(false);
  const [exceptionReason, setExceptionReason] = useState('');
  const [exceptionError, setExceptionError] = useState<ApiError | null>(null);

  const { data, isLoading, error, refetch } = useCalendars();
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
      render: (c) => <span className="font-mono font-semibold text-blue-400">{c.code}</span>,
    },
    {
      key: 'name',
      header: 'Calendar Name',
      render: (c) => <span className="font-medium text-neutral-100">{c.name}</span>,
    },
    {
      key: 'timezone',
      header: 'Timezone',
      render: (c) => <span className="font-mono text-neutral-300">{c.timezone}</span>,
    },
    {
      key: 'actions',
      header: 'Exceptions',
      render: (c) => (
        <Button variant="default" size="small" onClick={(e) => { e.stopPropagation(); setExceptionCalendar(c); }}>
          Add Exception
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-100">Working Calendars</h1>
          <p className="text-sm text-neutral-400">Configure standard operating hours, weekly shifts and holiday exceptions</p>
        </div>
        <Button variant="primary" icon="plus" onClick={() => setIsCreateOpen(true)}>
          New Calendar
        </Button>
      </div>

      {error ? (
        <ErrorState message={(error as any)?.message || 'Failed to load calendars'} onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={calendars}
          isLoading={isLoading}
          emptyTitle="No operating calendars defined"
          emptyDescription="Create standard working calendars to govern shop floor shift availability and scheduling."
        />
      )}

      <CreateCalendarDrawer isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />

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
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Date (YYYY-MM-DD) *</label>
            <input
              type="date"
              required
              value={exceptionDate}
              onChange={(e) => setExceptionDate(e.target.value)}
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={isWorkingDay}
                onChange={(e) => setIsWorkingDay(e.target.checked)}
                className="rounded border-neutral-700 bg-neutral-900 text-blue-600 focus:ring-0"
              />
              Is Working Day (e.g. Overtime Saturday)
            </label>
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Reason / Description</label>
            <input
              type="text"
              placeholder="e.g. Public Holiday or Planned Maintenance"
              value={exceptionReason}
              onChange={(e) => setExceptionReason(e.target.value)}
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-neutral-800">
            <Button variant="ghost" onClick={() => setExceptionCalendar(null)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={addException.isPending}>
              {addException.isPending ? 'Saving...' : 'Add Exception'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
