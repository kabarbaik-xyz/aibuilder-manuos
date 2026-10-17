 'use client';
import Link from 'next/link';
import { useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { ErrorState, LoadingState } from '@/components/ui/resource-state';
import { useWorkspaceNavigation } from '@/components/workspace-navigation-context';
import { apiRequest } from '@/lib/api/client';
import type { TechnicianProfile } from './person-detail';

export function PersonActionDialog({kind,technician,onClose,onSaved}:{kind:'skill'|'cert'|'roster';technician:TechnicianProfile['technician'];onClose:()=>void;onSaved:()=>void}) {
 const { principal } = useWorkspaceNavigation();
 const id=useId(); const [pending,setPending]=useState(false); const [error,setError]=useState('');
 const [option,setOption]=useState(''); const [level,setLevel]=useState('2'); const [status,setStatus]=useState('OBSERVED');
 const [from,setFrom]=useState(''); const [until,setUntil]=useState(''); const [startTime,setStartTime]=useState('08:00'); const [endTime,setEndTime]=useState('17:00'); const [type,setType]=useState('SHIFT'); const [evidence,setEvidence]=useState(''); const [notes,setNotes]=useState('');
 const attempt=useRef<{body:string;key:string}|null>(null);
 const options=useQuery({queryKey:['qualification-options',principal?.membershipId,kind],enabled:kind!=='roster',queryFn:()=>apiRequest<{data:Array<{id:string;code:string;name:string}>}>(kind==='skill'?'/api/resources/skills':'/api/resources/certifications')});
 async function save(event:React.FormEvent) { event.preventDefault(); if(pending)return; setError('');setPending(true);
 try {
  let url:string; let payload:unknown;
  if(kind==='roster') {
   const start=new Date(`${from}T${startTime}:00`); const end=new Date(`${until||from}T${endTime}:00`);
   if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start)throw new Error('Choose an end time after the start time.');
   url='/api/roster/intervals'; payload={intervals:[{technicianId:technician.id,...(technician.facilityId?{facilityId:technician.facilityId}:{}),intervalType:type,startAt:start.toISOString(),endAt:end.toISOString(),notes}]};
  } else if(kind==='skill') {
   if(!option)throw new Error('Choose a skill.');
   url=`/api/technicians/${technician.id}/skills`; payload={skillId:option,level:Number(level),assessmentStatus:status,...(from?{validFrom:`${from}T00:00:00.000Z`}:{}),...(until?{expiresAt:`${until}T23:59:59.999Z`}:{}),evidence,notes};
  } else {
   if(!option||!from||!until)throw new Error('Choose a certificate and its issue and expiry dates.');
   url=`/api/technicians/${technician.id}/certifications`; payload={certificationId:option,issuedDate:from,validUntil:until,evidence,notes};
  }
  const body=JSON.stringify(payload);if(attempt.current?.body!==body)attempt.current={body,key:crypto.randomUUID()};await apiRequest(url,{method:'POST',body,headers:{'idempotency-key':attempt.current.key}});onSaved();
 } catch(reason){setError(reason instanceof Error?reason.message:'Could not save.');}finally{setPending(false);}
 }
 return <Dialog isOpen onClose={onClose} title={kind==='roster'?'Publish availability':kind==='skill'?'Assess technician skill':'Record technician certificate'} subtitle={technician.name} size="md" pending={pending} footer={<><Button onClick={onClose} disabled={pending}>Cancel</Button><Button type="submit" form={id} variant="primary" disabled={pending||(kind!=='roster'&&(options.isPending||options.isError))}>{pending?'Saving…':kind==='roster'?'Publish interval':'Save assessment'}</Button></>}><form id={id} onSubmit={save} className="page-stack">{error&&<ErrorState message={error}/>}{kind!=='roster' && (options.isPending?<LoadingState/>:options.isError?<ErrorState message={options.error.message}/>:<FormField id={`${id}-option`} label={kind==='skill'?'Skill':'Certification'} required><Select value={option} onChange={e=>setOption(e.target.value)}><option value="">Select {kind==='skill'?'skill':'certification'}</option>{options.data?.data.map(o=><option key={o.id} value={o.id}>{o.name} · {o.code}</option>)}</Select></FormField>)}{kind!=='roster' && !options.isPending && !options.isError && !options.data?.data.length&&<p className="small muted">No definitions available. <Link href="/settings/skills-certifications" className="text-primary underline">Configure qualification definitions</Link> first.</p>}
 {kind==='skill'&&<div className="form-grid"><FormField id={`${id}-level`} label="Skill level"><Select value={level} onChange={e=>setLevel(e.target.value)}>{['0 · None','1 · Training','2 · Supervised','3 · Autonomous','4 · Expert'].map((name,i)=><option key={i} value={i}>{name}</option>)}</Select></FormField><FormField id={`${id}-status`} label="Assessment status"><Select value={status} onChange={e=>setStatus(e.target.value)}>{['CLAIMED','OBSERVED','VERIFIED','REVOKED'].map(s=><option key={s} value={s}>{s.toLowerCase()}</option>)}</Select></FormField></div>}
 {kind==='roster'&&<><p className="small muted">This publishes availability, not a task booking. Times are in {Intl.DateTimeFormat().resolvedOptions().timeZone}. Shift adds working time; leave or training blocks time. Existing bookings are not rescheduled automatically; review any affected work.</p><FormField id={`${id}-type`} label="Interval type"><Select value={type} onChange={e=>setType(e.target.value)}>{['SHIFT','LEAVE','TRAINING','HOLIDAY'].map(s=><option key={s} value={s}>{s.toLowerCase()}</option>)}</Select></FormField></>}
 <div className="form-grid"><FormField id={`${id}-from`} label={kind==='cert'?'Issued on':kind==='roster'?'Start date':'Valid from (optional)'}><DatePicker value={from} onChange={setFrom}/></FormField><FormField id={`${id}-until`} label={kind==='cert'?'Valid through':kind==='roster'?'End date (defaults to start)':'Expires on (optional)'}><DatePicker value={until} onChange={setUntil}/></FormField></div>
 {kind==='roster'?<div className="form-grid"><FormField id={`${id}-start`} label="Start time"><Input type="time" required value={startTime} onChange={e=>setStartTime(e.target.value)}/></FormField><FormField id={`${id}-end`} label="End time"><Input type="time" required value={endTime} onChange={e=>setEndTime(e.target.value)}/></FormField></div>:<FormField id={`${id}-evidence`} label="Assessment / certificate evidence"><Input maxLength={500} value={evidence} onChange={e=>setEvidence(e.target.value)}/></FormField>}
 <FormField id={`${id}-notes`} label="Notes"><Textarea maxLength={500} rows={3} value={notes} onChange={e=>setNotes(e.target.value)}/></FormField></form></Dialog>;
}
