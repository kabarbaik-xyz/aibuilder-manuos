'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkspaceNavigation } from './workspace-navigation-context';
import { getAdminNavigation, getMasterNavigation, getWorkflowNavigation } from '@/lib/master-navigation';
import { useGraphStore } from '@/store/graph-store';
import { Icon } from './icons';
import { Input } from './ui/input';
export function SearchDialog(){const [query,setQuery]=useState('');const router=useRouter();const {principal}=useWorkspaceNavigation();const close=useGraphStore(s=>s.closeModal);const perms=principal?.permissions??[];const roles=principal?.roles??[];const items=[...getAdminNavigation(perms,roles),...getWorkflowNavigation(perms,roles),...getMasterNavigation(perms,roles)].filter(item=>item.title.toLowerCase().includes(query.toLowerCase()));return <div><label className="sr-only" htmlFor="workspace-search">Search navigation</label><Input id="workspace-search" autoFocus value={query} onChange={event=>setQuery(event.target.value)} placeholder="Find a page…"/><div className="search-results">{items.length?items.map(item=><button key={item.href} type="button" className="search-result" onClick={()=>{close();router.push(item.href)}}><Icon name={item.icon}/><span>{item.title}</span><Icon name="arrow"/></button>):<p className="empty-state">No matching pages available.</p>}</div></div>}
