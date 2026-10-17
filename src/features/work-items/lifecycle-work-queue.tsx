'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/resource-state';
import { PageHeader } from '@/components/ui/page-header';
import { Panel } from '@/components/ui/panel';
import { ButtonLink } from '@/components/ui/button-link';

interface LifecycleWorkItem {
  id: string;
  version: number;
  orderId: string;
  orderNumber: string;
  customerName: string;
  itemName: string;
  workflowName: string;
  workflowVersion: number;
  key: string;
  name: string;
  action: string;
  state: string;
  department: { id: string; name: string };
  assignedTo: string | null;
  dueAt: string | null;
  schedule: { kind: string; dueAfterMinutes?: number };
  formPins: Array<{ formVersionId: string; required: boolean }>;
  scheduledWork: Array<{ taskId: string; operation: string; status: string; bookings: Array<{ id: string; resourceType: string; startAt: string; endAt: string }> }>;
  predecessorKeys: string[];
  assignmentKind: 'MEMBER' | 'DEPARTMENT_QUEUE';
  claimedByMe: boolean;
}

export function LifecycleWorkQueue() {
  const [scope, setScope] = useState<'mine' | 'department'>('mine');
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['order-lifecycle-work-items', scope],
    queryFn: () => apiRequest<{ data: LifecycleWorkItem[] }>(`/api/order-lifecycle/work-items?scope=${scope}`),
  });
  const claimMutation = useMutation({
    mutationFn: (row: LifecycleWorkItem) => apiRequest(`/api/order-lifecycle/stages/${row.id}/claim`, {
      method: 'POST', body: JSON.stringify({ expectedVersion: row.version }),
    }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['order-lifecycle-work-items'] }); },
  });
  const completeReviewMutation = useMutation({
    mutationFn: (row: LifecycleWorkItem) => apiRequest(`/api/order-lifecycle/stages/${row.id}/complete`, {
      method: 'POST', body: JSON.stringify({ expectedVersion: row.version }),
    }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['order-lifecycle-work-items'] }); },
  });
  const rows = query.data?.data ?? [];
  const destinationFor = (row: LifecycleWorkItem) => {
    switch (row.action) {
      case 'ENGINEERING_APPROVE': return { href: `/engineering/orders/${row.orderId}`, label: 'Review engineering' };
      case 'PLAN_PRODUCTION': return { href: '/planning', label: 'Open planning' };
      case 'EXECUTE_PRODUCTION': return { href: '/shop-floor', label: 'Open My Work' };
      case 'FINALIZE_QC': return { href: '/quality/inspections', label: 'Open inspections' };
      case 'CONFIRM_DELIVERY': return { href: '/delivery/shipments', label: 'Open delivery' };
      default: return { href: `/orders/${row.orderId}`, label: 'Open order' };
    }
  };

  return <div className="page-stack">
    <PageHeader
      title="Order lifecycle work"
      description="Review the next cross-department actions assigned to you or your eligible department queue. Complete forms and domain work in their operational modules."
      actions={<div className="flex gap-2"><Button variant={scope === 'mine' ? 'primary' : 'default'} onClick={() => setScope('mine')}>My assignments</Button><Button variant={scope === 'department' ? 'primary' : 'default'} onClick={() => setScope('department')}>Department queue</Button></div>}
    />
    {query.isPending ? <LoadingState message="Loading lifecycle work…" />
      : query.error ? <ErrorState message={query.error.message} onRetry={() => { void query.refetch(); }} />
        : rows.length === 0 ? <Panel><EmptyState title="No lifecycle work is waiting" description={scope === 'mine' ? 'New stages assigned to you or your eligible department queue will appear here.' : 'No ready stages match your active department and roles.'} icon="work" kind="no-results" /></Panel>
          : <section className="page-stack" aria-label="Order lifecycle stages">{rows.map((row) => <Panel key={row.id} className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="small muted">{row.workflowName} · v{row.workflowVersion} · {row.key}</p><h2 className="text-base font-semibold text-ink">{row.name}</h2><p className="field-help">{row.orderNumber} · {row.customerName} · {row.itemName}</p></div>
              <Badge variant={row.state === 'ACTIVE' ? 'blue' : row.state === 'BLOCKED' ? 'warning' : 'default'}>{row.state}</Badge>
            </div>
            <dl className="grid gap-3 border-t border-line pt-3 text-sm sm:grid-cols-4">
              <div><dt className="muted">Next action</dt><dd className="font-medium">{row.action.replaceAll('_', ' ')}</dd></div>
              <div><dt className="muted">Department</dt><dd className="font-medium">{row.department.name}</dd></div>
              <div><dt className="muted">Assigned to</dt><dd className="font-medium">{row.assignedTo ?? 'Eligible department queue'}</dd></div>
              <div><dt className="muted">Due</dt><dd className="font-medium">{row.dueAt ? new Date(row.dueAt).toLocaleString() : row.schedule.kind === 'RESOURCE_CAPACITY' ? 'Production schedule' : 'No deadline'}</dd></div>
            </dl>
            {row.schedule.kind === 'RESOURCE_CAPACITY' && <div className="rounded-lg border border-line bg-surface-muted px-3 py-2 text-sm">
              <strong>Production schedule</strong>
              {row.scheduledWork.length === 0
                ? <p className="small muted">No released production tasks yet. Engineering release creates the tasks that Planning schedules.</p>
                : <ul className="mt-2 grid gap-2 sm:grid-cols-2">{row.scheduledWork.map(task => <li key={task.taskId} className="flex flex-wrap justify-between gap-2"><span>{task.operation} · {task.status.replaceAll('_', ' ').toLowerCase()}</span><span className="muted">{task.bookings.length ? task.bookings.map(booking => `${booking.resourceType.toLowerCase()} · ${new Date(booking.startAt).toLocaleString()}–${new Date(booking.endAt).toLocaleTimeString()}`).join(' · ') : 'Not scheduled'}</span></li>)}</ul>}
            </div>}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
              <p className="text-xs text-muted">{row.predecessorKeys.length ? `After: ${row.predecessorKeys.join(', ')}` : 'No predecessor'} · {row.formPins.filter(form => form.required).length} required pinned form(s)</p>
              <div className="flex gap-2">
                {scope === 'department' && row.assignmentKind === 'DEPARTMENT_QUEUE' && !row.assignedTo && <Button variant="default" onClick={() => claimMutation.mutate(row)} disabled={claimMutation.isPending}>{claimMutation.isPending ? 'Claiming…' : 'Claim stage'}</Button>}
                {row.action === 'REVIEW_EVIDENCE' && row.assignedTo && <Button variant="primary" onClick={() => completeReviewMutation.mutate(row)} disabled={completeReviewMutation.isPending}>{completeReviewMutation.isPending ? 'Completing…' : 'Complete review'}</Button>}
                <ButtonLink href={destinationFor(row).href} variant="soft">{destinationFor(row).label}</ButtonLink>
              </div>
            </div>
          </Panel>)}</section>}
    {claimMutation.error && <p className="text-sm text-danger" role="alert">{claimMutation.error.message}</p>}
    {completeReviewMutation.error && <p className="text-sm text-danger" role="alert">{completeReviewMutation.error.message}</p>}
  </div>;
}
