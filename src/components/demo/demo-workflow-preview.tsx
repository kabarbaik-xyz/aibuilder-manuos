 'use client';
import { tasks, taskSteps } from '@/features/intelligence/task-catalog';
import { useGraphStore } from '@/store/graph-store';
import { useUiStore } from '@/store/ui-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

export function DemoWorkflowPreview({ capability }: { capability: string }) {
  const task = tasks[capability];
  return <div className="page-stack"><Badge>Workflow preview</Badge><h3>{task.title}</h3><p>{task.outcome}</p><ol className="coreai-task-steps">{taskSteps[capability]?.map(step => <li key={step}>{step}</li>)}</ol><p className="muted small">This public demo explains the implemented workflow. AI generation and constraint-checked operational changes require an authenticated workspace; this preview does not submit private API requests.</p><Button variant="soft" onClick={() => { useUiStore.getState().closeModal(); useGraphStore.getState().setScreen('coreai'); }}>Explore CoreAI tasks</Button></div>;
}

export function DemoPassport({ serial }: { serial: string }) {
  const passport = useGraphStore(s => s.passports.find(p => p.unitSerial === serial));
  if (!passport) return <EmptyState title="No demo passport found" description="Choose a serial number recorded in the demo customer portal." />;
  return <div className="page-stack"><Badge>Sample traceability evidence</Badge><h3>{passport.partName}</h3><div className="spec-row"><span>Serial</span><strong>{passport.unitSerial}</strong></div><div className="spec-row"><span>Material lot</span><strong>{passport.materialLot}</strong></div><div className="spec-row"><span>Quality</span><strong>{passport.qcStatus.replaceAll('_', ' ')}</strong></div>{passport.steps.map((step, index) => <div className="page-stack" key={index}><h3>{step.title}</h3><p>{step.detail}</p><p className="small muted">{step.date}{step.operator ? ` · ${step.operator}` : ''}{step.machine ? ` · ${step.machine}` : ''}</p></div>)}<p className="small muted">Demo evidence only. Operational passports use recorded snapshots and publication controls.</p></div>;
}


export function DemoSourceEvidence({ id, screen }: { id: string; screen: string }) {
  const state = useGraphStore();
  const record = screen === 'orders' ? state.orders.find(o => o.id === id) : screen === 'inventory' ? state.materials.find(m => m.id === id) : screen === 'orchestrator' ? state.tasks.find(t => t.id === id) : state.machines.find(m => m.id === id) ?? state.technicians.find(t => t.id === id);
  if (!record) return <EmptyState title="Source not found" description="This record is no longer present in the current demo state." />;
  const labels: Record<string, string> = { number: 'Order', partName: 'Part', customerName: 'Customer', orderedQty: 'Ordered quantity', completedQty: 'Completed quantity', qcPassedQty: 'QC-passed quantity', promisedDate: 'Promised date', expectedDate: 'Expected date', status: 'Status', partNumber: 'Material', description: 'Description', quantityInStock: 'In stock', quantityReserved: 'Reserved', etaDate: 'ETA', name: 'Name', machineClass: 'Machine class', capacityHoursPerDay: 'Capacity hours / day', assignedHoursThisWeek: 'Assigned hours / week', plannedHours: 'Planned hours', actualHours: 'Actual hours', department: 'Department', requiredCert: 'Required certificate', role: 'Role' };
  return <div className="page-stack"><Badge>Current demo source</Badge>{Object.entries(record).filter(([key, value]) => labels[key] && (typeof value === 'string' || typeof value === 'number')).map(([key, value]) => <div key={key} className="spec-row"><span>{labels[key]}</span><strong>{String(value).replaceAll('_', ' ')}</strong></div>)}<p className="small muted">This source reflects the current session. Earlier chat answers remain snapshots of the records when asked.</p></div>;
}
