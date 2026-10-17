'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiRequest } from '@/lib/api/client';
import { useWorkspaceNavigation } from '@/components/workspace-navigation-context';
import { useApproveOvertime } from '../hooks';

interface OvertimePolicy { revision: number; timezone: string; maxOvertimeHoursPerDay: number; maxOvertimeHoursPerWeek: number }
interface OvertimeApproval { id: string; startAt: string; endAt: string; notes: string | null; technician: { id: string; code: string; name: string } | null }

export function OvertimeControls() {
  const { principal } = useWorkspaceNavigation();
  const queryClient = useQueryClient();
  const permissions = principal?.permissions ?? [];
  const canRead = permissions.some(permission => ['planning.read', 'planning.write', 'task.assign', 'resource.manage', 'workspace.admin', 'owner'].includes(permission));
  const canEdit = permissions.some(permission => ['resource.manage', 'workspace.admin', 'owner'].includes(permission));
  const policy = useQuery({ queryKey: ['planning', 'overtime-policy', principal?.workspaceId],
    queryFn: () => apiRequest<{ data: OvertimePolicy }>('/api/settings/workforce-policy').then(response => response.data), enabled: canRead });
  const approvals = useQuery({ queryKey: ['planning', 'overtime-approvals', principal?.workspaceId, principal?.membershipId],
    queryFn: () => apiRequest<{ data: OvertimeApproval[] }>('/api/planning/overtime/approvals').then(response => response.data), enabled: canRead });
  const [daily, setDaily] = useState('4'); const [weekly, setWeekly] = useState('20'); const [error, setError] = useState<string | null>(null);
  const approve = useApproveOvertime();
  useEffect(() => { if (policy.data) { setDaily(String(policy.data.maxOvertimeHoursPerDay)); setWeekly(String(policy.data.maxOvertimeHoursPerWeek)); } }, [policy.data?.revision, policy.data?.maxOvertimeHoursPerDay, policy.data?.maxOvertimeHoursPerWeek]);
  const savePolicy = useMutation({
    mutationFn: () => apiRequest('/api/settings/workforce-policy', { method: 'PATCH', headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ expectedRevision: policy.data!.revision, maxOvertimeHoursPerDay: Number(daily), maxOvertimeHoursPerWeek: Number(weekly) }) }),
    onSuccess: async () => { setError(null); await queryClient.invalidateQueries({ queryKey: ['planning', 'overtime-policy'] }); },
    onError: (reason: Error) => setError(reason.message),
  });
  if (!canRead) return null;
  if (policy.isLoading || approvals.isLoading) return <section className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">Loading overtime policy and supervisor approvals…</section>;
  if (policy.error || approvals.error) return <section className="rounded-xl border border-line bg-surface p-4 text-sm text-danger">Overtime controls could not be loaded. Refresh the page and try again.</section>;
  if (!policy.data) return null;
  return <section className="rounded-xl border border-line bg-surface p-4">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-base font-semibold text-ink">Overtime policy</h2><p className="mt-1 text-sm text-muted">Workspace time: {policy.data.timezone}. Unapproved hours do not add capacity.</p></div>
      <div className="flex flex-wrap items-end gap-3"><label className="text-xs font-medium text-muted">Max hours / day<Input aria-label="Maximum overtime hours per day" type="number" min="0" max="24" step="1" value={daily} disabled={!canEdit || savePolicy.isPending} onChange={event => setDaily(event.target.value)} /></label>
        <label className="text-xs font-medium text-muted">Max hours / week<Input aria-label="Maximum overtime hours per week" type="number" min="0" max="168" step="1" value={weekly} disabled={!canEdit || savePolicy.isPending} onChange={event => setWeekly(event.target.value)} /></label>
        {canEdit && <Button variant="primary" disabled={savePolicy.isPending || daily === '' || weekly === ''} onClick={() => savePolicy.mutate()}>{savePolicy.isPending ? 'Saving…' : 'Save policy'}</Button>}</div>
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
    <div className="mt-4 border-t border-line pt-4"><div className="flex items-baseline justify-between gap-3"><h3 className="font-semibold text-ink">Overtime awaiting your approval</h3><span className="text-sm text-muted">{approvals.data?.length ?? 0} pending</span></div>
      {approvals.data?.length ? <ul className="mt-2 divide-y divide-line">{approvals.data.map(interval => <li key={interval.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><strong className="text-sm text-ink">{interval.technician?.name ?? 'Technician'} · {interval.technician?.code ?? 'Profile unavailable'}</strong><p className="text-sm text-muted">{new Date(interval.startAt).toLocaleString()} – {new Date(interval.endAt).toLocaleTimeString()} · {interval.notes?.replace(/^Reason:\s*/, '') || 'No reason provided'}</p></div><Button size="small" variant="primary" disabled={approve.isPending} onClick={() => approve.mutate(interval.id)}>Approve overtime</Button></li>)}</ul> : <p className="mt-2 text-sm text-muted">No requests are assigned to your supervisor membership.</p>}
    </div>
  </section>;
}
