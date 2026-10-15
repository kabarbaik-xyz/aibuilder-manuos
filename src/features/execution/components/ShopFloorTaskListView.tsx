'use client';

import { useState } from 'react';
import { usePaginatedList } from '@/lib/api/use-paginated-list';
import { useWorkspaceNavigation } from '@/components/workspace-navigation-context';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { ButtonLink } from '@/components/ui/button-link';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/resource-state';

interface WorkItem { id: string; nodeKey: string; nodeName: string; status: string; orderNumber: string; customerName: string; itemName: string; plannedDurationMinutes: number; currentElapsedMinutes: number; canStart: boolean; blockReason?: string }
const filters = [{ value: '', label: 'All active' }, { value: 'RUNNING', label: 'Running' }, { value: 'PAUSED', label: 'Paused' }, { value: 'READY', label: 'Ready' }, { value: 'ASSIGNED', label: 'Assigned' }, { value: 'WAITING_QC', label: 'Awaiting QC' }];
function minutes(value: number) { return value < 60 ? `${value}m` : `${Math.floor(value / 60)}h${value % 60 ? ` ${value % 60}m` : ''}`; }

export function ShopFloorTaskListView() {
  const { principal } = useWorkspaceNavigation();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const { data, isPending, error, refetch, pagination } = usePaginatedList<WorkItem, { statusCounts: Record<string, number> }>('my-work', { status, search });
  const counts = data?.summary?.statusCounts || {};
  const supervisor = principal?.permissions.some(permission => ['planning.read', 'task.assign', 'workspace.admin'].includes(permission));
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

  return <div className="page-stack my-work-page">
    <PageHeader title="My Work" description={supervisor ? 'Review active production work across your workspace.' : 'Your assigned production tasks, ready for the next step.'} actions={<Button icon="reset" disabled={pagination.disabled} onClick={() => void refetch()}>Refresh</Button>} />
    <section className="my-work-queue" aria-label="Active production work">
      <div className="my-work-toolbar">
        <div className="my-work-filters" role="group" aria-label="Filter work by status">{filters.map(filter => <button type="button" key={filter.value} aria-pressed={status === filter.value} className={status === filter.value ? 'active' : ''} onClick={() => setStatus(filter.value)}>{filter.label}<span>{isPending ? '—' : filter.value ? counts[filter.value] || 0 : total}</span></button>)}</div>
        <Input type="search" aria-label="Search active work" placeholder="Search order, item or customer…" value={search} onChange={event => setSearch(event.target.value)} />
      </div>
      {isPending ? <LoadingState message="Loading production work…" /> : error ? <ErrorState message={error.message} onRetry={() => void refetch()} /> : !data?.data.length ? <EmptyState title="No tasks found" description={search || status ? 'Try another status or search term.' : 'Assigned work will appear here when production orders are released.'} /> : <>
        <div className="my-work-column-head" aria-hidden="true"><span>Task & product</span><span>Order & customer</span><span>Time</span><span>Status</span><span /></div>
        <div className="my-work-rows">{data.data.map(task => <article key={task.id} className="my-work-row">
          <div className="my-work-identity"><div className="my-work-task-heading"><h2>{task.nodeName}</h2><span className="my-work-node">{task.nodeKey}</span></div><p>{task.itemName}</p></div>
          <div className="my-work-order"><strong>{task.orderNumber}</strong><p>{task.customerName}</p></div>
          <div className="my-work-time"><strong>{minutes(task.currentElapsedMinutes)} <span>elapsed</span></strong><p>{minutes(task.plannedDurationMinutes)} planned</p></div>
          <div className="my-work-status"><Badge variant={task.status === 'RUNNING' ? 'success' : task.status === 'PAUSED' || task.status === 'WAITING_QC' ? 'warning' : 'default'}>{filters.find(filter => filter.value === task.status)?.label || task.status}</Badge>{task.blockReason && <p>{task.blockReason}</p>}</div>
          <ButtonLink href={`/shop-floor/tasks/${task.id}`} size="small" variant={task.status === 'RUNNING' || task.status === 'PAUSED' ? 'primary' : 'default'}>{task.status === 'RUNNING' ? 'Continue work' : task.status === 'PAUSED' ? 'Review pause' : 'Open task'}</ButtonLink>
        </article>)}</div>
      </>}
      {!error && <Pagination {...pagination} />}
    </section>
  </div>;
}
