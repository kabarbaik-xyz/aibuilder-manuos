'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Search, ShieldCheck, ArrowUpRight, Clock, User } from 'lucide-react';
import { ordersApi } from '../api';
import { Panel } from '@/components/ui/panel';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/resource-state';

const categoryLabels: Record<string, string> = {
  WORKFLOW: 'Workflow',
  ENGINEERING: 'Engineering',
  FORM: 'Form evidence',
  SCHEDULING: 'Scheduling',
  MATERIAL: 'Materials',
  PRODUCTION: 'Production',
  QUALITY: 'Quality',
  DELIVERY: 'Delivery',
  PASSPORT: 'Passport',
};

const categoryBadgeVariant = (
  category: string
): 'default' | 'success' | 'warning' | 'danger' | 'blue' => {
  switch (category) {
    case 'QUALITY':
    case 'PASSPORT':
    case 'DELIVERY':
      return 'success';
    case 'PRODUCTION':
    case 'ENGINEERING':
    case 'SCHEDULING':
      return 'blue';
    case 'MATERIAL':
    case 'FORM':
      return 'warning';
    default:
      return 'default';
  }
};

function formatEventTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Time unavailable'
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
}

export function OrderEvidenceTimeline({ orderId }: { orderId: string }) {
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('ALL');

  const timeline = useQuery({
    queryKey: ['orders', orderId, 'evidence', search],
    queryFn: () => ordersApi.getEvidenceTimeline(orderId, search),
  });

  const events = timeline.data?.events ?? [];

  const availableCategories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const ev of events) {
      counts.set(ev.category, (counts.get(ev.category) ?? 0) + 1);
    }
    return Array.from(counts.entries());
  }, [events]);

  const filteredEvents = useMemo(() => {
    if (activeCategory === 'ALL') return events;
    return events.filter((ev) => ev.category === activeCategory);
  }, [events, activeCategory]);

  return (
    <Panel className="od-panel p-6 space-y-5" id="evidence">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <h2 className="text-base font-semibold text-ink">Order traceability &amp; audit trail</h2>
            {!timeline.isPending && !timeline.error && (
              <Badge variant="default">{filteredEvents.length} events</Badge>
            )}
          </div>
          <p className="field-help">
            End-to-end workflow, engineering, scheduling, form, material, quality, and delivery evidence linked to this order.
          </p>
        </div>

        <form
          className="flex w-full gap-2 sm:w-auto"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(draft.trim());
          }}
        >
          <Input
            type="search"
            aria-label="Search order evidence"
            placeholder="Search reference, lot, task, actor…"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="sm:w-64"
          />
          <Button type="submit" aria-label="Apply evidence search">
            <Search className="h-4 w-4" />
            <span className="sr-only">Search</span>
          </Button>
          {search && (
            <Button
              type="button"
              onClick={() => {
                setDraft('');
                setSearch('');
              }}
            >
              Clear
            </Button>
          )}
        </form>
      </div>

      {/* Category Filter Pills */}
      {availableCategories.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter evidence by category">
          <button
            type="button"
            onClick={() => setActiveCategory('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
              activeCategory === 'ALL'
                ? 'bg-primary-soft text-primary border-primary/30'
                : 'bg-surface-muted text-muted border-line hover:text-ink'
            }`}
          >
            All ({events.length})
          </button>
          {availableCategories.map(([cat, count]) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                activeCategory === cat
                  ? 'bg-primary-soft text-primary border-primary/30'
                  : 'bg-surface-muted text-muted border-line hover:text-ink'
              }`}
            >
              {categoryLabels[cat] ?? cat} ({count})
            </button>
          ))}
        </div>
      )}

      {timeline.isPending ? (
        <LoadingState message="Loading order evidence…" />
      ) : timeline.error ? (
        <ErrorState message={timeline.error.message} onRetry={() => void timeline.refetch()} />
      ) : filteredEvents.length === 0 ? (
        <EmptyState
          title="No matching order evidence"
          description={
            search || activeCategory !== 'ALL'
              ? 'Try another category filter, reference, stage, item, or event.'
              : 'Evidence appears here as workflow and operational records are created.'
          }
        />
      ) : (
        <>
          {timeline.data.sampled && (
            <p className="small rounded-lg border border-line bg-surface-muted p-3 text-muted">
              Showing a bounded recent sample. Add a search term to narrow the evidence.
            </p>
          )}
          <ol className="divide-y divide-line rounded-xl border border-line bg-surface" aria-label="Order evidence events">
            {filteredEvents.map((event) => (
              <li
                key={event.reference}
                className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start hover:bg-surface-muted/50 transition-colors"
              >
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={categoryBadgeVariant(event.category)}>
                      {categoryLabels[event.category] ?? event.category}
                    </Badge>
                    <strong className="text-sm font-semibold text-ink">{event.title}</strong>
                    {event.label && (
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-surface-muted border border-line text-muted">
                        {event.label}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted leading-relaxed">{event.summary}</p>
                  {(event.actorName || event.references.length > 0) && (
                    <div className="flex flex-wrap items-center gap-2 pt-0.5 text-xs text-muted">
                      {event.actorName && (
                        <span className="inline-flex items-center gap-1 font-medium text-ink">
                          <User className="w-3 h-3 text-muted" />
                          {event.actorName}
                        </span>
                      )}
                      {event.references.map((reference) => (
                        <span
                          key={reference}
                          className="font-mono text-[11px] bg-surface-muted border border-line px-2 py-0.5 rounded text-muted"
                        >
                          {reference}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
                  <time className="inline-flex items-center gap-1 text-xs text-muted" dateTime={event.occurredAt}>
                    <Clock className="w-3 h-3" />
                    {formatEventTime(event.occurredAt)}
                  </time>
                  <Link
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                    href={event.href}
                  >
                    Open record
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </Panel>
  );
}

