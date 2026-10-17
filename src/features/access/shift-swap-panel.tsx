'use client';
import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWorkspaceNavigation } from '@/components/workspace-navigation-context';
import { apiRequest } from '@/lib/api/client';
import { Panel } from '@/components/ui/panel';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ErrorState, LoadingState } from '@/components/ui/resource-state';
import type { ShiftSwapService } from '@/server/modules/masters/shift-swap';
import type { TechnicianProfile } from './person-detail';

type SwapData = Awaited<ReturnType<ShiftSwapService['list']>>;
const when = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
export function ShiftSwapPanel({ technicianId, roster, onChanged }: { technicianId: string; roster: TechnicianProfile['roster']; onChanged: () => void }) {
  const { principal } = useWorkspaceNavigation(); const client = useQueryClient();
  const [sourceId, setSourceId] = useState(''); const [targetId, setTargetId] = useState('');
  const [reason, setReason] = useState(''); const [error, setError] = useState(''); const [pending, setPending] = useState(false);
  const [decision, setDecision] = useState<{ request: SwapData['requests'][number]; action: 'APPROVE' | 'REJECT' } | null>(null);
  const [note, setNote] = useState(''); const [notice, setNotice] = useState('');
  const attempt = useRef<{ body: string; key: string } | null>(null);
  const query = useQuery({ queryKey: ['shift-swaps', principal?.membershipId, technicianId, sourceId], queryFn: () => apiRequest<{ data: SwapData }>(`/api/roster/shift-swaps?${new URLSearchParams({ technicianId, ...(sourceId ? { sourceId } : {}) })}`) });
  const shifts = roster.filter(r => r.intervalType === 'SHIFT' && r.status === 'PUBLISHED' && new Date(r.startAt) > new Date());
  const source = shifts.find(r => r.id === sourceId); const target = query.data?.data.candidates.find(r => r.id === targetId);
  function keyFor(body: string) { if (attempt.current?.body !== body) attempt.current = { body, key: crypto.randomUUID() }; return attempt.current.key; }
  async function refresh() { await Promise.all([client.invalidateQueries({ queryKey: ['shift-swaps'] }), client.invalidateQueries({ queryKey: ['person-profile'] }), client.invalidateQueries({ queryKey: ['planning'] })]); onChanged(); }
  async function submit() {
    if (!source || !target || pending) return; setError(''); setPending(true);
    try { const body = JSON.stringify({ sourceRosterId: source.id, sourceVersion: source.version, targetRosterId: target.id, targetVersion: target.version, reason }); await apiRequest('/api/roster/shift-swaps', { method: 'POST', body, headers: { 'idempotency-key': keyFor(body) } }); setSourceId(''); setTargetId(''); setReason(''); setNotice('Swap requested. Neither shift nor its work changes until approval.'); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not request shift swap.'); } finally { setPending(false); }
  }
  async function decide() {
    if (!decision || pending) return; setError(''); setPending(true);
    try { const body = JSON.stringify({ expectedVersion: decision.request.version, decision: decision.action, note }); const response = await apiRequest<{ data: { movedTasks: number; status: string } }>(`/api/roster/shift-swaps/${decision.request.id}`, { method: 'PATCH', body, headers: { 'idempotency-key': keyFor(`${decision.request.id}:${body}`) } }); setDecision(null); setNote(''); setNotice(response.data.status === 'APPROVED' ? `Shift swap approved. ${response.data.movedTasks} scheduled task assignments transferred.` : 'Swap rejected. Shifts and assignments are unchanged.'); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not decide shift swap.'); } finally { setPending(false); }
  }
  return <Panel className="person-section person-swaps">
    <div className="people-section-head"><div><h2>Shift swaps</h2><p className="small muted">Exchange two published shifts. Scheduled work moves with its time slot after qualification and booking checks.</p></div><Button onClick={() => { setSourceId(shifts[0]?.id ?? ''); setTargetId(''); setError(''); }} disabled={!shifts.length}>Request swap</Button></div>
    {!shifts.length && <p className="small muted">No future published shifts in the selected date range. Publish availability or change the date range first.</p>}
    {notice && <p className="small text-success" role="status">{notice}</p>}
    {query.isPending ? <LoadingState message="Loading shift swaps…" /> : query.isError ? <ErrorState message={query.error.message} onRetry={() => void query.refetch()} /> : !query.data?.data.requests.length ? <p className="muted">No shift swap requests for this technician.</p> : <ul className="people-records">{query.data.data.requests.map(request => <li key={request.id}>
      <div><strong>{request.snapshot.slots.map(s => s.technicianName).join(' ↔ ')}</strong><div className="small muted mt-1">{request.snapshot.slots.map((s, i) => <p key={i}>{s.technicianName}: {when(s.startAt)} – {when(s.endAt)}</p>)}</div><p className="small mt-2">{request.reason}</p><p className="small muted">{request.snapshot.transfers.length} booked tasks included</p>{request.decisionNote && <p className="small muted">Decision note: {request.decisionNote}</p>}</div><div className="flex flex-wrap items-center gap-2"><Badge variant={request.status === 'APPROVED' ? 'success' : request.status === 'PENDING' ? 'warning' : 'default'}>{request.status.toLowerCase()}</Badge>{request.status === 'PENDING' && <><Button size="small" onClick={() => { setDecision({ request, action: 'REJECT' }); setNote(''); setError(''); }}>Reject</Button><Button size="small" variant="primary" onClick={() => { setDecision({ request, action: 'APPROVE' }); setNote(''); setError(''); }}>Review & approve</Button></>}</div>
    </li>)}</ul>}
    {query.data?.data.truncated && <p className="small muted">Showing the latest 50 requests.</p>}
    {sourceId && <Dialog isOpen onClose={() => { if (!pending) setSourceId(''); }} title="Request a shift swap" subtitle={`Times shown in ${Intl.DateTimeFormat().resolvedOptions().timeZone}. Both shifts must be future shifts in one facility.`} size="lg" pending={pending} footer={<><Button onClick={() => setSourceId('')} disabled={pending}>Cancel</Button><Button variant="primary" disabled={pending || !source || !target || reason.trim().length < 3 || query.isFetching} onClick={() => void submit()}>{pending ? 'Requesting…' : 'Request swap'}</Button></>}>
      <div className="page-stack">{error && <ErrorState message={error} />}<FormField id="swap-source" label="Current technician’s shift"><Select value={sourceId} disabled={pending} onChange={e => { setSourceId(e.target.value); setTargetId(''); setError(''); }}>{shifts.map(s => <option key={s.id} value={s.id}>{when(s.startAt)} – {when(s.endAt)}</option>)}</Select></FormField>{query.isFetching ? <LoadingState message="Finding other shifts…" /> : query.isError ? <ErrorState message={query.error.message} /> : <FormField id="swap-target" label="Exchange with"><Select value={targetId} disabled={pending} onChange={e => setTargetId(e.target.value)}><option value="">Select another technician’s shift</option>{query.data?.data.candidates.map(c => <option key={c.id} value={c.id}>{c.technicianName} · {when(c.startAt)} – {when(c.endAt)}</option>)}</Select></FormField>}{query.data && !query.isFetching && !query.data.data.candidates.length && <p className="small muted">No other published shifts found within 31 days of this shift in the same facility.</p>}<FormField id="swap-reason" label="Reason" required><Textarea rows={3} maxLength={500} value={reason} disabled={pending} onChange={e => setReason(e.target.value)} /></FormField><p className="small muted">The request does not change schedules. Approval rechecks shift versions, qualifications, bookings and weekly limits. Running work and bookings crossing a shift boundary cannot be swapped.</p></div>
    </Dialog>}
    {decision && <Dialog isOpen onClose={() => { if (!pending) setDecision(null); }} title={decision.action === 'APPROVE' ? 'Approve this shift swap?' : 'Reject this shift swap?'} size="lg" pending={pending} footer={<><Button onClick={() => setDecision(null)} disabled={pending}>Keep pending</Button><Button variant="primary" onClick={() => void decide()} disabled={pending || (decision.action === 'REJECT' && note.trim().length < 3)}>{pending ? 'Checking and saving…' : decision.action === 'APPROVE' ? 'Approve & swap' : 'Reject swap'}</Button></>}><div className="page-stack">{error && <ErrorState message={error} />}{decision.request.snapshot.slots.map((s, i) => <p key={i}><strong>{s.technicianName}</strong> gives {when(s.startAt)} – {when(s.endAt)} to <strong>{decision.request.snapshot.slots[1 - i].technicianName}</strong>.</p>)}<p className="small muted">{decision.request.snapshot.transfers.length} scheduled tasks will transfer with the shifts. Machine bookings and task times stay fixed. Any stale evidence or failed qualification check rolls back the whole approval.</p>{decision.request.snapshot.transfers.length > 0 && <ul className="small list-disc pl-5">{decision.request.snapshot.transfers.map((t, i) => <li key={i}>{t.orderNumber} · {t.operation}</li>)}</ul>}<FormField id="swap-decision-note" label={decision.action === 'REJECT' ? 'Reason for rejection' : 'Approval note (optional)'}><Textarea rows={2} value={note} maxLength={500} disabled={pending} onChange={e => setNote(e.target.value)} /></FormField><details className="small muted"><summary className="cursor-pointer">Working-limit check</summary><p>Published working hours are checked conservatively against each technician’s configured weekly limit, using Monday–Sunday UTC weeks and including breaks.</p></details></div></Dialog>}
  </Panel>;
}
