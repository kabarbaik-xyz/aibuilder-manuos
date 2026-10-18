 'use client';
import { useState } from 'react';
import { useGraphStore } from '@/store/graph-store';
import { useUiStore } from '@/store/ui-store';
import { PageHeader } from '@/components/ui/page-header';
import { Panel } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { DataTable } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import type { Order } from '@/domain/types';
import { demoOverview } from './demo-intelligence';

function status(order: Order) { return <Badge variant={order.status === 'AT_RISK' ? 'danger' : order.status === 'WATCH' ? 'warning' : 'default'}>{order.status.replaceAll('_', ' ')}</Badge>; }

export function DemoOrders({ risksOnly = false }: { risksOnly?: boolean }) {
  const state = useGraphStore();
  const open = useUiStore(s => s.openModal);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = state.orders.find(o => o.id === selectedId);
  const overview = demoOverview(state);
  const orders = (risksOnly ? overview.risks : state.orders).filter(o => `${o.number} ${o.partName} ${o.customerName}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="page-stack"><PageHeader title={risksOnly ? 'Risk inbox' : 'Order Hub'} description={risksOnly ? 'Review sample orders affected by the current demo scenario.' : 'Recorded quantities, commitments, and production evidence in this demo session.'} actions={<Button variant="soft" icon="spark" onClick={() => open('brain')}>Ask AI</Button>} />
    <Panel><div className="panel-head"><div><h2>{risksOnly ? 'Orders needing attention' : 'Orders'}</h2><p>{orders.length} matching records</p></div><label><span className="sr-only">Search demo orders</span><Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find an order or customer…" /></label></div><DataTable data={orders} emptyTitle="No matching orders" emptyDescription={risksOnly ? 'Simulate a delay to explore exceptions, or clear your search.' : 'Clear your search to see the sample orders.'} onRowClick={o => setSelectedId(o.id)} columns={[
      { key: 'number', header: 'Order', render: o => <div><strong>{o.number}</strong><p className="small muted">{o.partName}</p></div> },
      { key: 'customerName', header: 'Customer' }, { key: 'status', header: 'Status', render: status },
      { key: 'qc', header: 'QC-passed / ordered', render: o => `${o.qcPassedQty} / ${o.orderedQty}` },
      { key: 'promisedDate', header: 'Promised' }, { key: 'expectedDate', header: 'Expected' },
    ]} /></Panel>
    {risksOnly && <Panel><div className="panel-head"><div><h2>Material exceptions</h2><p>Source records behind shortages and delays</p></div><Button onClick={() => state.setScreen('inventory')}>Open inventory</Button></div>{overview.shortages.length ? <ul className="demo-exception-list">{overview.shortages.map(m => <li key={m.id}><strong>{m.partNumber} · {m.description}</strong><span>{m.quantityInStock} in stock · {m.quantityReserved} reserved · ETA {m.etaDate}</span></li>)}</ul> : <div className="p-5 muted">No material exceptions in the current demo state.</div>}</Panel>}
    {selected && <Dialog type="drawer" isOpen title={selected.number} subtitle="Sample order evidence · read only" onClose={() => setSelectedId(null)}><div className="page-stack"><h3>{selected.partName}</h3><p>{selected.customerName}</p>{status(selected)}<div className="spec-row"><span>QC-passed / ordered</span><strong>{selected.qcPassedQty} / {selected.orderedQty}</strong></div><div className="spec-row"><span>Completed</span><strong>{selected.completedQty}</strong></div><div className="spec-row"><span>Promised / expected</span><strong>{selected.promisedDate} / {selected.expectedDate}</strong></div><h3>Production tasks</h3>{state.tasks.filter(t => t.orderId === selected.id).map(t => <div className="spec-row" key={t.id}><span>{t.id} · {t.name}</span><Badge>{t.status}</Badge></div>)}<Button variant="soft" onClick={() => { setSelectedId(null); state.setScreen('orchestrator'); }}>Open production planning</Button><Button variant="primary" icon="spark" onClick={() => { setSelectedId(null); open('brain', { question: selected.number }); }}>Ask about this order</Button></div></Dialog>}
  </div>;
}

export function DemoInventory() {
  const { materials } = useGraphStore();
  return <div className="page-stack"><PageHeader title="Inventory" description="Sample material balances and availability. Demo quantities are illustrative; operational stock uses the server ledger." /><Panel><DataTable data={materials} columns={[
    { key: 'partNumber', header: 'Material', render: m => <div><strong>{m.partNumber}</strong><p className="small muted">{m.description}</p></div> },
    { key: 'quantityInStock', header: 'In stock' }, { key: 'quantityReserved', header: 'Reserved' },
    { key: 'status', header: 'Status', render: m => <Badge variant={m.status === 'DELAYED' ? 'warning' : 'default'}>{m.status.replaceAll('_', ' ')}</Badge> }, { key: 'etaDate', header: 'ETA' },
  ]} /></Panel></div>;
}

export function DemoResources() {
  const { machines, technicians } = useGraphStore();
  return <div className="page-stack"><PageHeader title="Machines & technicians" description="Inspect recorded capacity and qualifications. This public demo does not publish resource assignments." /><Panel><div className="panel-head"><h2>Machines</h2></div><DataTable data={machines} columns={[{ key: 'name', header: 'Machine' }, { key: 'machineClass', header: 'Class' }, { key: 'status', header: 'Status', render: m => <Badge>{m.status}</Badge> }, { key: 'assignedHoursThisWeek', header: 'Assigned hours / week' }, { key: 'capacityHoursPerDay', header: 'Capacity hours / day' }]} /></Panel><Panel><div className="panel-head"><h2>Technicians</h2></div><DataTable data={technicians} columns={[{ key: 'name', header: 'Technician' }, { key: 'role', header: 'Role' }, { key: 'skills', header: 'Skills', render: t => t.skills.map(s => `${s.name} L${s.level}`).join(', ') }, { key: 'certifications', header: 'Certificates', render: t => t.certifications.map(c => `${c.name} · until ${c.validUntil}`).join(', ') || 'None recorded' }]} /></Panel></div>;
}

export function DemoDashboard() {
  const state = useGraphStore();
  const overview = demoOverview(state);
  const open = useUiStore(s => s.openModal);
  const metrics = [
    { label: 'Active orders', value: overview.active.length, detail: 'Current sample orders' },
    { label: 'Orders at risk', value: overview.risks.length, detail: 'Review recorded exceptions' },
    { label: 'QC-passed units', value: overview.passed, detail: `${overview.completed} completed units` },
    { label: 'Material shortages', value: overview.shortages.length, detail: 'Availability exceptions' },
    { label: 'Pending reviews', value: overview.pending, detail: 'Demo proposal state' },
  ];
  return <div className="page-stack"><PageHeader title="Command Center" description="Production, commitments, and the decisions that keep work moving." actions={<><Button variant="soft" icon="spark" onClick={() => open('brain')}>Ask AI</Button><Button variant="primary" onClick={() => state.setScreen('coreai')}>Open CoreAI</Button></>} />
    <Panel className="demo-decision-banner"><div><Badge variant={overview.risks.length || overview.shortages.length ? 'warning' : 'default'}>{overview.risks.length || overview.shortages.length ? 'Needs review' : 'Demo workspace'}</Badge><h2>{overview.risks.length ? `${overview.risks.length} orders need a closer look` : overview.shortages.length ? `${overview.shortages.length} material ${overview.shortages.length === 1 ? 'exception needs' : 'exceptions need'} review` : 'Explore your factory with CoreAI'}</h2><p>{overview.shortages.length} material {overview.shortages.length === 1 ? 'shortage' : 'shortages'} · {overview.pending} pending proposal reviews</p></div><Button variant="soft" onClick={() => state.setScreen('risks')}>Open risk inbox</Button></Panel>
    <section className="metric-strip demo-metric-strip" aria-label="Demo factory metrics">{metrics.map(m => <div className="metric" key={m.label}><div className="metric-label">{m.label}</div><div className="metric-value">{m.value}</div><div className="metric-caption">{m.detail}</div></div>)}</section>
    <div className="demo-dashboard-columns"><Panel><div className="panel-head"><div><h2>Order flow</h2><p>QC-passed output against ordered quantity</p></div><Button size="small" onClick={() => state.setScreen('orders')}>All orders</Button></div><div className="demo-order-progress">{overview.active.map(o => <button type="button" key={o.id} onClick={() => { state.setScreen('orders'); }}><div><strong>{o.number}</strong><span>{o.qcPassedQty} / {o.orderedQty} QC-passed</span></div><progress max={o.orderedQty} value={o.qcPassedQty} aria-label={`${o.number} QC-passed progress`} /><span className="small muted">{o.partName} · expected {o.expectedDate}</span></button>)}</div></Panel>
    <Panel><div className="panel-head"><div><h2>Decision queue</h2><p>Current scenario evidence</p></div></div>{overview.risks.length ? <ul className="demo-exception-list">{overview.risks.map(o => <li key={o.id}><Badge variant="warning">{o.status.replaceAll('_', ' ')}</Badge><button type="button" onClick={() => state.setScreen('risks')}>{o.number} · {o.partName}</button><span>Promised {o.promisedDate} · expected {o.expectedDate}</span></li>)}</ul> : <EmptyState title="No orders at risk" description="Use Simulate delay to see how a material exception affects orders and Ask AI answers." />}<div className="panel-footer"><Button variant="soft" icon="spark" onClick={() => open('brain')}>Ask what needs attention</Button></div></Panel></div>
  </div>;
}


export function DemoTasks({ shopFloor = false }: { shopFloor?: boolean }) {
  const state = useGraphStore();
  const open = useUiStore(s => s.openModal);
  const [taskId, setTaskId] = useState<string | null>(null);
  const task = state.tasks.find(t => t.id === taskId);
  const visible = shopFloor ? state.tasks.filter(t => ['READY', 'ASSIGNED', 'RUNNING', 'PAUSED', 'BLOCKED'].includes(t.status)) : state.tasks;
  return <div className="page-stack"><PageHeader title={shopFloor ? 'Shop floor' : 'Production planning'} description={shopFloor ? 'Sample work queue, current task status, and production context.' : 'Inspect task dependencies, recorded requirements, and assigned resources.'} actions={<Button variant="soft" icon="spark" onClick={() => open('brain')}>Ask AI</Button>} />
    <Panel><DataTable data={visible} onRowClick={t => setTaskId(t.id)} emptyTitle="No tasks in this view" columns={[
      { key: 'name', header: 'Task', render: t => <div><strong>{t.id} · {t.name}</strong><p className="small muted">Order {t.orderId}</p></div> },
      { key: 'department', header: 'Department' }, { key: 'status', header: 'Status', render: t => <Badge variant={t.status === 'BLOCKED' ? 'warning' : 'default'}>{t.status.replaceAll('_', ' ')}</Badge> },
      { key: 'plannedHours', header: 'Planned hours' }, { key: 'dependsOn', header: 'Dependencies', render: t => t.dependsOn.join(', ') || 'None' },
      { key: 'assignedTechnicianId', header: 'Technician', render: t => state.technicians.find(person => person.id === t.assignedTechnicianId)?.name || 'Unassigned' },
    ]} /></Panel>
    <p className="small muted">This public view inspects sample work. Publishing schedules, assigning resources, recording production output, and QC dispositions use authenticated domain commands in the operational workspace.</p>
    {task && <Dialog type="drawer" isOpen title={`${task.id} · ${task.name}`} subtitle="Work context · demo evidence" onClose={() => setTaskId(null)}><div className="page-stack"><Badge>{task.status}</Badge><div className="spec-row"><span>Order</span><strong>{state.orders.find(o => o.id === task.orderId)?.number ?? task.orderId}</strong></div><div className="spec-row"><span>Department</span><strong>{task.department}</strong></div><div className="spec-row"><span>Machine class</span><strong>{task.machineClass}</strong></div><div className="spec-row"><span>Required certificate</span><strong>{task.requiredCert || 'Not recorded'}</strong></div><div className="spec-row"><span>Planned / actual hours</span><strong>{task.plannedHours} / {task.actualHours ?? 'Not recorded'}</strong></div><h3>Dependencies</h3>{task.dependsOn.length ? task.dependsOn.map(id => <div className="spec-row" key={id}><span>{id} · {state.tasks.find(t => t.id === id)?.name}</span><Badge>{state.tasks.find(t => t.id === id)?.status ?? 'Unknown'}</Badge></div>) : <p className="muted">No upstream dependencies.</p>}<Button variant="soft" onClick={() => { setTaskId(null); state.setScreen('resources'); }}>Inspect resource evidence</Button></div></Dialog>}
  </div>;
}

export function DemoCustomerPortal() {
  const state = useGraphStore();
  const open = useUiStore(s => s.openModal);
  // Customer scope stays explicit; the public sample buyer sees only its order.
  const order = state.orders.find(o => o.id === '1042');
  if (!order) return <EmptyState title="No sample customer order" />;
  const passports = state.passports.filter(p => p.orderId === order.id);
  return <div className="page-stack"><PageHeader title="Customer portal" description={`${order.customerName} · sample customer order visibility`} /><Panel className="p-6"><div className="between"><div><h2>{order.number}</h2><p className="muted">{order.partName}</p></div>{status(order)}</div><div className="spec-row"><span>QC-passed / ordered</span><strong>{order.qcPassedQty} / {order.orderedQty}</strong></div><div className="spec-row"><span>Promised</span><strong>{order.promisedDate}</strong></div><div className="spec-row"><span>Current expected date</span><strong>{order.expectedDate}</strong></div></Panel><Panel><div className="panel-head"><h2>Available passport evidence</h2></div>{passports.length ? <ul className="demo-exception-list">{passports.map(p => <li key={p.unitSerial}><strong>{p.unitSerial}</strong><span>{p.partName} · {p.qcStatus.replaceAll('_', ' ')}</span><Button size="small" onClick={() => open('passport', { serial: p.unitSerial })}>Inspect passport</Button></li>)}</ul> : <EmptyState title="No passport evidence recorded" />}</Panel><p className="small muted">Customers see their authorized orders and published evidence in the operational workspace. Internal Ask AI access is not granted to customers by this preview.</p></div>;
}
