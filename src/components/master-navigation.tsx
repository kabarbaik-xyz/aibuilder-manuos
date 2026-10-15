'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { getMasterNavigation, getWorkflowNavigation, isMasterNavActive, type MasterNavItem } from '@/lib/master-navigation';
import { useGraphStore } from '@/store/graph-store';
import { useWorkspaceNavigation } from './workspace-navigation-context';
import { Icon } from './icons';
function NavigationGroup({title,items,pathname}:{title:string;items:readonly MasterNavItem[];pathname:string}) {
 const active=items.some(item=>isMasterNavActive(pathname,item.href));
 const [open,setOpen]=useState(true);
 const close=useGraphStore(s=>s.closeNavMenu);
 useEffect(()=>{try {const saved=localStorage.getItem(`nav-${title}`);if(saved!==null)setOpen(active || saved==='open');}catch{}},[title,active]);
 if(!items.length)return null;
 return <section className="navigation-group"><button type="button" className="nav-group-toggle" aria-expanded={open} onClick={()=>{const next=!open;setOpen(next);try{localStorage.setItem(`nav-${title}`,next?'open':'closed')}catch{}}}>{title}<Icon name="down" className={open?'':'nav-group-closed'}/></button>{open&&<nav className="nav-list" aria-label={title}>{items.map(item=><Link key={item.href} href={item.href} onClick={close} className={`nav-item ${isMasterNavActive(pathname,item.href)?'active':''}`} aria-current={isMasterNavActive(pathname,item.href)?'page':undefined}><Icon name={item.icon}/><span>{item.title}</span></Link>)}</nav>}</section>;
}
export function MasterNavigation(){
 const {principal,pathname,error,isPending,refetch}=useWorkspaceNavigation();const close=useGraphStore(s=>s.closeNavMenu);
 if(isPending)return <p className="small muted px-4" role="status">Loading workspace…</p>;
 if(error)return <nav className="nav-list" aria-label="Workspace access">{error instanceof ApiError && error.statusCode===401?<Link href="/login" className="nav-item" onClick={close}><Icon name="user"/>Sign in to workspace</Link>:<button type="button" className="nav-item" onClick={()=>refetch()}><Icon name="reset"/>Retry workspace access</button>}</nav>;
 const permissions=principal?.permissions??[];
 return <><NavigationGroup title="Operations" items={getWorkflowNavigation(permissions)} pathname={pathname}/><NavigationGroup title="Master data" items={getMasterNavigation(permissions)} pathname={pathname}/></>;
}
