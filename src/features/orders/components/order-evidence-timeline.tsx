'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { ordersApi } from '../api';
import { Panel } from '@/components/ui/panel';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/resource-state';

const categoryLabels: Record<string, string> = {
  WORKFLOW: 'Workflow', ENGINEERING: 'Engineering', FORM: 'Form evidence', SCHEDULING: 'Scheduling',
  MATERIAL: 'Materials', PRODUCTION: 'Production', QUALITY: 'Quality', DELIVERY: 'Delivery', PASSPORT: 'Passport',
};

function formatEventTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Time unavailable' : new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium', timeStyle: 'short',
  }).format(date);
}

export function OrderEvidenceTimeline({ orderId }: { orderId: string }) {
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const timeline = useQuery({
    queryKey: ['orders', orderId, 'evidence', search],
    queryFn: () => ordersApi.getEvidenceTimeline(orderId, search),
  });

  return <Panel className="p-5 page-stack" id="evidence">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-base font-semibold text-ink">Order traceability</h2><p className="field-help">Workflow, engineering, scheduling, form, material, quality and delivery evidence linked to this order.</p></div>
      <form className="flex w-full gap-2 sm:w-auto" role="search" onSubmit={event => { event.preventDefault(); setSearch(draft.trim()); }}>
        <Input type="search" aria-label="Search order evidence" placeholder="Search evidence…" value={draft} onChange={event => setDraft(event.target.value)} className="sm:w-64" />
        <Button type="submit" aria-label="Apply evidence search"><Search className="h-4 w-4" /><span className="sr-only">Search</span></Button>
      </form>
    </div>
    {timeline.isPending ? <LoadingState message="Loading order evidence…" />
      : timeline.error ? <ErrorState message={timeline.error.message} onRetry={() => void timeline.refetch()} />
        : timeline.data.events.length === 0 ? <EmptyState title="No matching order evidence" description={search ? 'Try another reference, stage, item or event.' : 'Evidence appears here as workflow and operational records are created.'} /> : <>
          {timeline.data.sampled && <p className="small rounded-lg border border-line bg-surface-muted p-3 text-muted">Showing a bounded recent sample. Add a search term to narrow the evidence.</p>}
          <ol className="divide-y divide-line" aria-label="Order evidence events">
            {timeline.data.events.map(event => <li key={event.reference} className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><Badge variant="default">{categoryLabels[event.category] ?? event.category}</Badge><strong className="text-sm text-ink">{event.title}</strong><span className="text-sm text-muted">{event.label}</span></div>
                <p className="mt-1 text-sm text-muted">{event.summary}</p>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                  {event.actorName && <span>By {event.actorName}</span>}
                  {event.references.map(reference => <span key={reference}>{reference}</span>)}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
                <time className="small muted" dateTime={event.occurredAt}>{formatEventTime(event.occurredAt)}</time>
                <Link className="small font-medium text-primary underline" href={event.href}>Open record</Link>
              </div>
            </li>)}
          </ol>
        </>}
  </Panel>;
}
