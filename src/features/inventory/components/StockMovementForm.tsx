'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api/client';
import { useItems, useLocations } from '@/features/masters/hooks';
import { useIssueToProduction, useReturnUnusedMaterial, useStockTransfer } from '../hooks';
import { parseQuantity } from '@/domain/quantity';
import { Panel } from '@/components/ui/panel';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { LoadingState, ErrorState } from '@/components/ui/resource-state';
import type { movementOptions } from '@/server/modules/inventory/movement-options';
import './inventory-forms.css';
type Options = Awaited<ReturnType<typeof movementOptions>>;
export function StockMovementForm({ mode }: { mode: 'issue' | 'return' | 'transfer' }) {
 const router=useRouter(); const items=useItems(); const locations=useLocations();
 const issue=useIssueToProduction(); const returns=useReturnUnusedMaterial(); const transfer=useStockTransfer();
 const [demandId,setDemand]=useState('');const [selectedItem,setItem]=useState('');const [source,setSource]=useState('');const [destination,setDestination]=useState('');const [lot,setLot]=useState('');const [quantity,setQuantity]=useState('');const [notes,setNotes]=useState('');const [error,setError]=useState('');
 const attempt=useRef<{ body:string; key:string }|null>(null);
 const options=useQuery({ queryKey:['movement-options',mode,selectedItem,source], queryFn:()=>apiRequest<{data:Options}>(`/api/inventory/movement-options?${new URLSearchParams({mode,...(selectedItem?{itemId:selectedItem}:{}),...(source?{locationId:source}:{})})}`) });
 const demand=options.data?.data.demands.find(d=>d.id===demandId);
 const item=items.data?.data.find(i=>i.id===selectedItem);
 const pending=issue.isPending||returns.isPending||transfer.isPending;
 const sourceKinds=mode==='return'?['WIP']:mode==='issue'?['RAW','DEFAULT','QUARANTINE']:['RAW','WIP','FINISHED_GOODS','QUARANTINE','DEFAULT'];
 const destinationKinds=mode==='issue'?['WIP']:mode==='return'?['RAW','DEFAULT']:['RAW','WIP','FINISHED_GOODS','QUARANTINE','DEFAULT'];
 const activeLocations=(locations.data?.data??[]).filter(l=>l.status==='ACTIVE');
 const balances=(options.data?.data.balances??[]).filter(b=>!(demand?.tracking==='LOT'||item?.isLotTracked)||Boolean(b.lotId));
 const title=mode==='issue'?'Issue to production':mode==='return'?'Return to storage':'Transfer stock';
 async function submit(event:React.FormEvent) {
  event.preventDefault(); if(pending) return;setError('');
  try {
   if(source===destination) throw new Error('Choose different source and destination locations.');
   const atoms=parseQuantity(quantity,demand?.precision??item?.baseUom?.precision??0);
   if(atoms<=0n) throw new Error('Enter a quantity greater than zero.');
   const selectedBalance=balances.find(b=>(b.lotId??'__NO_LOT__')===lot);
   if(!selectedBalance) throw new Error('Select stock from the source location.');
   if(atoms>BigInt(selectedBalance.onHandAtoms)) throw new Error('Quantity exceeds source stock.');
   const payload={demandId,itemId:selectedItem,source,destination,lot,quantity,notes};const body=JSON.stringify(payload);
   if(attempt.current?.body!==body) attempt.current={body,key:crypto.randomUUID()};const idempotencyKey=attempt.current.key;
   const lotId=lot==='__NO_LOT__'?null:lot;
   if(mode==='issue') await issue.mutateAsync({input:{demandId,sourceLocationId:source,wipLocationId:destination,sourceLotId:lotId,atoms,notes:notes.trim()||undefined},idempotencyKey});
   else if(mode==='return') await returns.mutateAsync({input:{demandId,wipLocationId:source,destinationLocationId:destination,lotId,atoms,notes:notes.trim()||undefined},idempotencyKey});
   else await transfer.mutateAsync({input:{itemId:selectedItem,sourceLocationId:source,destinationLocationId:destination,sourceLotId:lotId,destinationLotId:lotId,atoms,notes:notes.trim()||undefined},idempotencyKey});
   router.push('/inventory');
  } catch(error) {setError(error instanceof Error?error.message:'Could not complete stock movement.');}
 }
 if(items.isPending||locations.isPending) return <LoadingState message="Loading materials and locations…"/>;
 if(items.isError||locations.isError) return <ErrorState message={items.error?.message??locations.error?.message??'Could not load form options'} onRetry={()=>{void items.refetch();void locations.refetch();}}/>;
 return <Panel className="inventory-movement-panel"><form onSubmit={submit} className="inventory-movement-form"><div className="inventory-form-intro"><h2>Material & locations</h2><p>Select the material, then choose where stock moves.</p></div>
 {error&&<ErrorState message={error}/>}
 {options.isError&&<ErrorState message={options.error.message} onRetry={()=>void options.refetch()}/>}
 <fieldset disabled={pending} className="inventory-form-fields">
 {mode==='transfer'?<FormField id="movement-item" label="Material" required><Select id="movement-item" required value={selectedItem} onChange={e=>{setItem(e.target.value);setSource('');setDestination('');setLot('');setQuantity('');}}><option value="">Choose a material</option>{items.data?.data.filter(i=>i.status==='ACTIVE').map(i=><option key={i.id} value={i.id}>{i.code} · {i.name}</option>)}</Select></FormField>:<FormField id="movement-demand" label="Order & material" required help={demand?`Order requirement: ${demand.required} ${demand.unit}`:undefined}><Select id="movement-demand" value={demandId} required disabled={options.isFetching} onChange={e=>{const next=options.data?.data.demands.find(d=>d.id===e.target.value);setDemand(e.target.value);setItem(next?.itemId??'');setSource('');setDestination('');setLot('');setQuantity('');}}><option value="">Choose an order material requirement</option>{options.data?.data.demands.map(d=><option key={d.id} value={d.id}>{d.label}</option>)}</Select></FormField>}
 <div className="inventory-form-pair"><FormField id="movement-source" label={mode==='return'?'From production (WIP)':'From location'} required><Select id="movement-source" required value={source} disabled={!selectedItem} onChange={e=>{setSource(e.target.value);if(destination===e.target.value)setDestination('');setLot('');setQuantity('');}}><option value="">Choose source location</option>{activeLocations.filter(l=>sourceKinds.includes(l.type)).map(l=><option key={l.id} value={l.id}>{l.code} · {l.name}</option>)}</Select></FormField>
 <FormField id="movement-destination" label={mode==='issue'?'To production (WIP)':'To location'} required><Select id="movement-destination" required value={destination} disabled={!selectedItem} onChange={e=>setDestination(e.target.value)}><option value="">Choose destination location</option>{activeLocations.filter(l=>destinationKinds.includes(l.type)&&l.id!==source).map(l=><option key={l.id} value={l.id}>{l.code} · {l.name}</option>)}</Select></FormField></div>
 <div className="inventory-form-divider"><h2>Quantity & traceability</h2><p>Choose a source lot or unassigned stock. Availability is checked again when posted.</p></div>
 <div className="inventory-form-pair"><FormField id="movement-lot" label="Source stock / lot" required help={source&&!options.isFetching&&!balances.length?'No positive stock for this material at this location.':undefined}><Select id="movement-lot" required value={lot} disabled={!source||options.isFetching} onChange={e=>setLot(e.target.value)}><option value="">{!source?'Choose a source location first':options.isFetching?'Loading stock…':'Choose source stock'}</option>{balances.map(b=><option key={b.lotId??'__NO_LOT__'} value={b.lotId??'__NO_LOT__'}>{b.lotNumber} · {b.onHand} on hand</option>)}</Select></FormField>
 <FormField id="movement-quantity" label={`Quantity${demand?.unit||item?.baseUom?.code?` (${demand?.unit??item?.baseUom?.code})`:''}`} required><Input id="movement-quantity" required inputMode="decimal" placeholder="Enter quantity" value={quantity} onChange={e=>setQuantity(e.target.value)}/></FormField></div>
 <FormField id="movement-notes" label="Notes (optional)"><Textarea id="movement-notes" rows={2} maxLength={1000} placeholder="Reason or handling instructions" value={notes} onChange={e=>setNotes(e.target.value)}/></FormField>
 </fieldset>
 {options.data?.data.truncated&&<p className="small muted">Showing the latest500 order requirements and up to200 stock lots.</p>}
 <div className="inventory-form-actions"><Button onClick={()=>router.push('/inventory')} disabled={pending}>Cancel</Button><Button type="submit" variant="primary" disabled={pending||options.isFetching||options.isError||!selectedItem||!source||!destination||!lot||!quantity}>{pending?'Posting…':title}</Button></div>
 </form></Panel>;
}
