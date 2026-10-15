'use client';
import { useId, useRef, useState } from 'react';
import { useCreateCustomer } from '../../hooks';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { FormErrorSummary } from '@/components/ui/form-errors';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api/client';
const empty = { code: '', name: '', email: '', phone: '', address: '' };
export function CreateCustomerModal({isOpen,onClose}:{isOpen:boolean;onClose:()=>void}){
 const prefix=useId(); const mutation=useCreateCustomer(); const [form,setForm]=useState(empty);const [error,setError]=useState<ApiError|null>(null);
 async function submit(event:React.FormEvent){event.preventDefault();if(mutation.isPending)return;setError(null);try{await mutation.mutateAsync({...form,email:form.email.trim()||undefined,code:form.code.trim().toUpperCase(),name:form.name.trim()});setForm(empty);onClose()}catch(err){setError(err as ApiError)}}
 return <Dialog isOpen={isOpen} onClose={()=>{setForm(empty);setError(null);onClose()}} title="New customer" subtitle="Add a customer to this workspace" type="modal" size="md" pending={mutation.isPending} dirty={JSON.stringify(form)!==JSON.stringify(empty)} footer={<><Button data-dialog-dismiss onClick={onClose} disabled={mutation.isPending}>Cancel</Button><Button type="submit" form={`${prefix}-form`} variant="primary" disabled={mutation.isPending}>{mutation.isPending?'Creating…':'Create customer'}</Button></>}>
 <form id={`${prefix}-form`} onSubmit={submit} className="page-stack"><FormErrorSummary error={error}/><p className="field-help">Fields marked * are required.</p><FormField id={`${prefix}-code`} label="Customer code" required error={error?.fieldErrors?.code}><Input type="text"  value={form.code} onChange={event=>setForm({...form,code:event.target.value})} disabled={mutation.isPending} /></FormField><FormField id={`${prefix}-name`} label="Customer name" required error={error?.fieldErrors?.name}><Input type="text"  value={form.name} onChange={event=>setForm({...form,name:event.target.value})} disabled={mutation.isPending} /></FormField><FormField id={`${prefix}-email`} label="Email"  error={error?.fieldErrors?.email}><Input type="email"  value={form.email} onChange={event=>setForm({...form,email:event.target.value})} disabled={mutation.isPending} /></FormField><FormField id={`${prefix}-phone`} label="Phone"  error={error?.fieldErrors?.phone}><Input type="tel"  value={form.phone} onChange={event=>setForm({...form,phone:event.target.value})} disabled={mutation.isPending} /></FormField><FormField id={`${prefix}-address`} label="Address"  error={error?.fieldErrors?.address}><Input type="text"  value={form.address} onChange={event=>setForm({...form,address:event.target.value})} disabled={mutation.isPending} /></FormField></form></Dialog>;
}
