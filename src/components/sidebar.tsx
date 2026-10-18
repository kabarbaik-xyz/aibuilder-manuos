'use client';
import Link from 'next/link';
import { BrandLogo } from './brand-logo';
import { useGraphStore } from '@/store/graph-store';
import { SCREENS } from '@/lib/navigation';
import { Icon } from './icons';
import { MasterNavigation } from './master-navigation';
import { useWorkspaceNavigation } from './workspace-navigation-context';
export function Sidebar(){
 const {principal,isDemo}=useWorkspaceNavigation();
 const {isNavMenuOpen,closeNavMenu,currentScreen,setScreen,openModal,disruption,injectDisruption,resetScenario}=useGraphStore();
 return <aside className={`sidebar ${isNavMenuOpen?'open':''}`} id="sidebar" aria-label="Main navigation">
 <div className="sidebar-heading"><Link className="brand" href={isDemo?'/demo':'/'} onClick={closeNavMenu} aria-label="ManuOS home"><BrandLogo className="w-36" /></Link>
 <div className="factory-switch"><span className="factory-mark"><Icon name="factory"/></span><div><strong>{isDemo?'Precision Works':principal?.workspaceName||'Workspace'}</strong><span className="small muted">{isDemo?'Demo workspace':'Manufacturing workspace'}</span></div></div></div>
 <div className="sidebar-nav-scroll">{isDemo?<><div className="nav-group-label">Demo workspace</div><nav className="nav-list" aria-label="Demo workspace">{SCREENS.map(item=><button key={item.id} type="button" className={`nav-item ${currentScreen===item.id?'active':''}`} onClick={()=>{setScreen(item.id);closeNavMenu()}}><Icon name={item.icon}/><span>{item.title}</span></button>)}</nav><div className="nav-divider"/><nav className="nav-list" aria-label="Demo knowledge"><button type="button" className="nav-item" onClick={()=>openModal('memory')}><Icon name="book"/>Factory memory</button><button type="button" className="nav-item" onClick={()=>openModal('audit')}><Icon name="clock"/>Activity log</button></nav></>:<MasterNavigation/>}</div>
 {isDemo?<div className="sidebar-bottom"><div className="demo-control"><strong>Demo controls</strong><p>Explore a material delay and its recovery.</p><button type="button" className="btn full" onClick={()=>disruption.isDelayed?resetScenario():injectDisruption()}><Icon name="bolt"/>{disruption.isDelayed?'Reset scenario':'Simulate delay'}</button></div></div>:<div className="sidebar-footnote"><Icon name="shield"/><span>Access follows your workspace role</span></div>}
 </aside>;
}
