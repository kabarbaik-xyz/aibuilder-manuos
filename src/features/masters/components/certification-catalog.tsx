 'use client';
import { useId, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api/client';
import { useWorkspaceNavigation } from '@/components/workspace-navigation-context';
import { Panel } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { ErrorState, LoadingState } from '@/components/ui/resource-state';
import { DataTable } from '@/components/ui/data-table';
import { CatalogNameEditDialog } from './catalog-name-edit-dialog';
import { ArchiveMasterDialog, MasterRowActions } from './master-row-actions';
type Definition={id:string;code:string;name:string;issuer:string|null};
export function CertificationCatalog(){
 const client=useQueryClient();const {principal}=useWorkspaceNavigation();const canManage=principal?.permissions.includes('resource.manage');const id=useId();
 const query=useQuery({queryKey:['certifications',principal?.membershipId],queryFn:()=>apiRequest<{data:Definition[]}>('/api/resources/certifications')});
 const [create,setCreate]=useState(false);const [edit,setEdit]=useState<Definition|null>(null);const [archive,setArchive]=useState<Definition|null>(null);const [code,setCode]=useState('');const [name,setName]=useState('');const [issuer,setIssuer]=useState('');const [pending,setPending]=useState(false);const [error,setError]=useState('');const attempt=useRef<{body:string;key:string}|null>(null);
 async function save(event:React.FormEvent){event.preventDefault();if(pending)return;setPending(true);setError('');try{const body=JSON.stringify({code,name,issuer:issuer||null});if(attempt.current?.body!==body)attempt.current={body,key:crypto.randomUUID()};await apiRequest('/api/resources/certifications',{method:'POST',body,headers:{'idempotency-key':attempt.current.key}});await client.invalidateQueries({queryKey:['certifications']});await client.invalidateQueries({queryKey:['qualification-options']});setCreate(false);setCode('');setName('');setIssuer('');}catch(e){setError(e instanceof Error?e.message:'Could not save certification');}finally{setPending(false);}}
 return <Panel className="p-5 page-stack"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Certification definitions</h2><p className="small muted">Define qualification types here; record each person’s certificate and validity in their profile.</p></div>{canManage&&<Button onClick={()=>setCreate(true)}>Add certification</Button>}</div>{query.isError?<ErrorState message={query.error.message}/>:query.isPending?<LoadingState/>:<DataTable data={query.data?.data??[]} columns={[{key:'code',header:'Code'},{key:'name',header:'Certification'},{key:'issuer',header:'Issuer',render:r=>r.issuer??'Not specified'},{key:'actions',header:'Actions',render:r=>canManage?<MasterRowActions onEdit={()=>setEdit(r)} onArchive={()=>setArchive(r)}/>:null}]} emptyTitle="No certification definitions"/>}{create&&<Dialog isOpen onClose={()=>setCreate(false)} title="Add certification definition" pending={pending} footer={<><Button onClick={()=>setCreate(false)} disabled={pending}>Cancel</Button><Button form={id} type="submit" variant="primary" disabled={pending}>Save definition</Button></>}><form id={id} onSubmit={save} className="page-stack">{error&&<ErrorState message={error}/>}<FormField id={`${id}-code`} label="Code" required><Input required maxLength={50} value={code} onChange={e=>setCode(e.target.value)}/></FormField><FormField id={`${id}-name`} label="Name" required><Input required maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></FormField><FormField id={`${id}-issuer`} label="Issuer"><Input maxLength={100} value={issuer} onChange={e=>setIssuer(e.target.value)}/></FormField></form></Dialog>}<CatalogNameEditDialog resource="certifications" record={edit} onClose={()=>setEdit(null)}/><ArchiveMasterDialog isOpen={Boolean(archive)} onClose={()=>setArchive(null)} endpoint={`/api/resources/catalog/certifications/${archive?.id}`} recordName={archive?.name??'certification'} onArchived={()=>{void query.refetch();void client.invalidateQueries({queryKey:['qualification-options']});}}/></Panel>;
}
