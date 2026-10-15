'use client';
import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';
import { useWorkspaceNavigation } from '@/components/workspace-navigation-context';
import { PageHeader } from '@/components/ui/page-header';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { FormErrorSummary } from '@/components/ui/form-errors';
import { LoadingState, ErrorState } from '@/components/ui/resource-state';

type Entity = { id:string; code:string; name:string; version:number; isActive:boolean; email?:string|null; phone?:string|null; address?:string|null; contactName?:string|null; contactEmail?:string|null; contactPhone?:string|null; leadTimeDays?:number };
export function CommercialDetail({kind}:{kind:'customer'|'supplier'}) {
 const {id}=useParams<{id:string}>();const router=useRouter();const prefix=useId();const client=useQueryClient();const url=`/api/${kind}s/${id}`;
 const query=useQuery({queryKey:kind==='customer'?queryKeys.customer(id):queryKeys.supplier(id),queryFn:()=>apiRequest<{data:Entity}>(url)});
 const entity=query.data?.data;const {principal}=useWorkspaceNavigation();const canEdit=principal?.permissions.includes(`${kind}.manage`);
 const [editing,setEditing]=useState(false);const [archive,setArchive]=useState(false);const [draft,setDraft]=useState<Record<string,string|number>>({});
 const fields: Array<{key:keyof Entity;label:string;type?:string}> = kind==='customer'?[{key:'name',label:'Customer name'},{key:'email',label:'Email',type:'email'},{key:'phone',label:'Phone',type:'tel'},{key:'address',label:'Address'}]:[{key:'name',label:'Supplier name'},{key:'contactName',label:'Contact name'},{key:'contactEmail',label:'Contact email',type:'email'},{key:'contactPhone',label:'Contact phone',type:'tel'},{key:'address',label:'Address'},{key:'leadTimeDays',label:'Lead time (days)',type:'number'}];
 useEffect(()=>{if(entity&&!editing){const next:Record<string,string|number>={};for(const field of fields)next[field.key]=entity[field.key] as string|number??'';setDraft(next)}},[entity,editing,kind]);
 const save=useMutation({mutationFn:()=>apiRequest(url,{method:'PATCH',body:JSON.stringify({...draft,expectedVersion:entity?.version})}),onSuccess:async()=>{setEditing(false);await query.refetch();await client.invalidateQueries({queryKey:[`${kind}s`]})}});
 const remove=useMutation({mutationFn:()=>apiRequest(url,{method:'DELETE'}),onSuccess:async()=>{await client.invalidateQueries({queryKey:[`${kind}s`]});router.push(`/settings/${kind}s`)}});
 return <div className="page-stack"><PageHeader title={entity?.name||`${kind==='customer'?'Customer':'Supplier'} detail`} description={entity?`${entity.code} · Version ${entity.version}`:undefined} actions={<><Link href={`/settings/${kind}s`} className="btn">Back to {kind}s</Link>{entity&&canEdit&&<><Button onClick={()=>setEditing(!editing)}>{editing?'Cancel editing':'Edit details'}</Button><Button onClick={()=>setArchive(true)}>Archive</Button></>}</>}/>
 {query.isPending?<LoadingState/>:query.error||!entity?<ErrorState message={query.error?.message||'Record not found'} onRetry={()=>query.refetch()}/>:<><Badge variant={entity.isActive?'success':'default'}>{entity.isActive?'Active':'Inactive'}</Badge>{editing?<form className="form-section page-stack max-w-3xl" onSubmit={event=>{event.preventDefault();if(!save.isPending)save.mutate()}}><FormErrorSummary error={save.error}/>{fields.map(field=><FormField key={field.key} id={`${prefix}-${field.key}`} label={field.label} required={field.key==='name'}><Input type={field.type||'text'} min={field.type==='number'?0:undefined} value={draft[field.key]??''} onChange={event=>setDraft({...draft,[field.key]:field.type==='number'?Number(event.target.value):event.target.value})} disabled={save.isPending}/></FormField>)}<div className="form-page-actions"><Button onClick={()=>setEditing(false)} disabled={save.isPending}>Cancel</Button><Button type="submit" variant="primary" disabled={save.isPending}>{save.isPending?'Saving…':'Save changes'}</Button></div></form>:<section className="form-section page-stack"><h2>Contact details</h2>{fields.filter(field=>field.key!=='name').map(field=><div className="spec-row" key={field.key}><span>{field.label}</span><strong>{entity[field.key]||'—'}</strong></div>)}</section>}</>}
 <Dialog isOpen={archive} onClose={()=>setArchive(false)} title={`Archive ${kind}?`} size="sm" pending={remove.isPending} footer={<><Button onClick={()=>setArchive(false)} disabled={remove.isPending}>Cancel</Button><Button variant="primary" onClick={()=>remove.mutate()} disabled={remove.isPending}>{remove.isPending?'Archiving…':'Archive'}</Button></>}><p>The {kind} will be removed from active selection. Existing order history is retained.</p><FormErrorSummary error={remove.error}/></Dialog>
 </div>;
}
