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
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface LifecycleMemberOption { membershipId: string; name: string; roles: Array<{ code: string; name: string }> }

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
  canReassign: boolean;
}

export function LifecycleWorkQueue() {
  const [scope, setScope] = useState<'mine' | 'department'>('mine');
  const [reassigning, setReassigning] = useState<LifecycleWorkItem | null>(null);
  const [membershipId, setMembershipId] = useState('');
  const [reason, setReason] = useState('');
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['order-lifecycle-work-items', scope],
    queryFn: () => apiRequest<{ data: LifecycleWorkItem[] }>(`/api/order-lifecycle/work-items?scope=${scope}`),
  });
  const members = useQuery({
    queryKey: ['order-lifecycle-department-members', reassigning?.department.id],
    queryFn: () => apiRequest<{ data: LifecycleMemberOption[] }>(`/api/workflows/lifecycle-members?departmentId=${encodeURIComponent(reassigning!.department.id)}`),
    enabled: Boolean(reassigning),
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
  const reassignMutation = useMutation({
    mutationFn: () => {
      if (!reassigning) throw new Error('Choose a lifecycle stage first.');
      return apiRequest(`/api/order-lifecycle/stages/${reassigning.id}/reassign`, {
        method: 'POST', body: JSON.stringify({ expectedVersion: reassigning.version, membershipId, reason }),
      });
    },
    onSuccess: async () => {
      setReassigning(null); setMembershipId(''); setReason('');
      await queryClient.invalidateQueries({ queryKey: ['order-lifecycle-work-items'] });
    },
  });
  const closeReassignDialog = () => {
    if (reassignMutation.isPending) return;
    setReassigning(null); setMembershipId(''); setReason('');
  };
  const rows = query.data?.data ?? [];
  const destinationFor = (row: LifecycleWorkItem) => {
    switch (row.action) {
      case 'ENGINEERING_APPROVE': return { href: `/engineering/orders/${row.orderId}`, label: 'Review engineering' };
      case 'PLAN_PRODUCTION': return { href: '/planning', label: 'Open planning' };
      case 'EXECUTE_PRODUCTION': return { href: '/shop-floor', label: 'Open My Tasks' };
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
                {scope === 'department' && row.canReassign && <Button variant="default" onClick={() => setReassigning(row)}>Reassign</Button>}
                {row.action === 'REVIEW_EVIDENCE' && row.assignedTo && <Button variant="primary" onClick={() => completeReviewMutation.mutate(row)} disabled={completeReviewMutation.isPending}>{completeReviewMutation.isPending ? 'Completing…' : 'Complete review'}</Button>}
                <ButtonLink href={destinationFor(row).href} variant="soft">{destinationFor(row).label}</ButtonLink>
              </div>
            </div>
          </Panel>)}</section>}
    {claimMutation.error && <p className="text-sm text-danger" role="alert">{claimMutation.error.message}</p>}
    {completeReviewMutation.error && <p className="text-sm text-danger" role="alert">{completeReviewMutation.error.message}</p>}
    {reassignMutation.error && <p className="text-sm text-danger" role="alert">{reassignMutation.error.message}</p>}
    <Dialog isOpen={Boolean(reassigning)} onClose={closeReassignDialog} title="Reassign lifecycle stage" subtitle={reassigning ? `${reassigning.orderNumber} · ${reassigning.name} · ${reassigning.department.name}` : undefined} size="sm" pending={reassignMutation.isPending}>
      <div className="page-stack">
        {members.isPending ? <LoadingState message="Loading eligible department members…" /> : members.error ? <ErrorState message={members.error.message} onRetry={() => { void members.refetch(); }} /> : <FormField id="lifecycle-reassign-member" label="Assign to" help="Only active members with access to this facility and permission for this stage can be assigned." required>
          <Select value={membershipId} onChange={event => setMembershipId(event.target.value)}><option value="">Choose a member</option>{(members.data?.data ?? []).map(member => <option key={member.membershipId} value={member.membershipId}>{member.name} · {member.roles.map(role => role.name).join(', ') || 'No active role'}</option>)}</Select>
        </FormField>}
        <FormField id="lifecycle-reassign-reason" label="Reason" help="Recorded in the lifecycle audit trail (3–500 characters)." required>
          <Textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={500} rows={3} placeholder="Explain why this stage is being reassigned" />
        </FormField>
        <div className="flex justify-end gap-2"><Button variant="default" onClick={closeReassignDialog} disabled={reassignMutation.isPending}>Cancel</Button><Button variant="primary" onClick={() => reassignMutation.mutate()} disabled={!membershipId || reason.trim().length < 3 || reassignMutation.isPending || members.isPending}>{reassignMutation.isPending ? 'Reassigning…' : 'Confirm reassignment'}</Button></div>
      </div>
    </Dialog>
  </div>;
}
