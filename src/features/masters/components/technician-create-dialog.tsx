 'use client';
import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api/client';
import { useDepartments, useCalendars } from '@/features/masters/hooks';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/resource-state';
export function TechnicianCreateDialog({ onClose }: { onClose: () => void }) {
 const id = useId(); const router = useRouter(); const client = useQueryClient(); const departments = useDepartments(); const calendars = useCalendars();
 const [form, setForm] = useState({ code: '', name: '', departmentId: '', calendarId: '' });
 const [pending, setPending] = useState(false); const [error, setError] = useState(''); const attempt = useRef<{ body: string; key: string } | null>(null);
 async function save(event: React.FormEvent) { event.preventDefault(); if(pending)return; setPending(true); setError('');
 try { const body = JSON.stringify({ ...form, departmentId: form.departmentId || null, calendarId: form.calendarId || null }); if(attempt.current?.body !== body) attempt.current = { body, key: crypto.randomUUID() }; const result = await apiRequest<{data:{id:string}}>('/api/resources/technicians', { method: 'POST', headers: { 'idempotency-key': attempt.current.key }, body }); await client.invalidateQueries({ queryKey: ['technicians'] }); await client.invalidateQueries({ queryKey: ['access'] }); onClose(); router.push(`/settings/technicians/${result.data.id}`); } catch(reason) { setError(reason instanceof Error ? reason.message : 'Could not create profile'); } finally { setPending(false); } }
 return <Dialog isOpen onClose={onClose} title="Add technician profile" subtitle="Create a production resource. Link an account in People & Access to enable login." pending={pending} footer={<><Button onClick={onClose} disabled={pending}>Cancel</Button><Button type="submit" form={id} variant="primary" disabled={pending || departments.isPending || calendars.isPending}>{pending ? 'Creating…' : 'Create technician'}</Button></>}><form id={id} onSubmit={save} className="page-stack">{error && <ErrorState message={error} />}{(departments.error || calendars.error) && <ErrorState message="Could not load department or calendar options." />}<FormField id={`${id}-code`} label="Technician code" required><Input required maxLength={50} value={form.code} onChange={e => setForm({ ...form, code:e.target.value })}/></FormField><FormField id={`${id}-name`} label="Name" required><Input required maxLength={100} value={form.name} onChange={e => setForm({ ...form, name:e.target.value })}/></FormField><FormField id={`${id}-department`} label="Department"><Select value={form.departmentId} onChange={e=>setForm({...form,departmentId:e.target.value})}><option value="">Not assigned</option>{departments.data?.data.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</Select></FormField><FormField id={`${id}-calendar`} label="Working calendar"><Select value={form.calendarId} onChange={e=>setForm({...form,calendarId:e.target.value})}><option value="">Configure later</option>{calendars.data?.data.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</Select></FormField></form></Dialog>;
}
