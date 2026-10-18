 'use client';
import { useState } from 'react';
import { tasks, taskSteps } from '@/features/intelligence/task-catalog';
import { useGraphStore } from '@/store/graph-store';
import { useUiStore } from '@/store/ui-store';
import { PageHeader } from '@/components/ui/page-header';
import { Panel } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import type { ScreenType } from '@/lib/navigation';
import { demoOverview } from './demo-intelligence';

const destinations: Record<string, ScreenType> = { 'AII-02': 'risks', 'SCH-07': 'resources' };
export function DemoCoreAI() {
  const state = useGraphStore();
  const open = useUiStore(s => s.openModal);
  const [selected, setSelected] = useState<string | null>(null);
  const overview = demoOverview(state);
  return <div className="page-stack">
    <PageHeader title="CoreAI" description="What would you like help with? Explore the same task catalog as the operational workspace." actions={<Button variant="primary" icon="spark" onClick={() => open('brain')}>Ask AI</Button>} />
    <Panel className="p-5"><Badge>Public demo</Badge><p className="mt-2 muted">Answers and evidence use this session’s sample records. Production scheduling, AI drafting, and approvals require a configured operational workspace.</p></Panel>
    <section aria-labelledby="demo-coreai-tasks" className="page-stack"><div><h2 id="demo-coreai-tasks">What would you like to do?</h2><p className="small muted">AI drafts and explains; planning tools calculate. Your team reviews changes before applying them.</p></div><Panel>
      {Object.entries(tasks).map(([id, task]) => <article key={id} className="coreai-task-row"><div className="coreai-task-copy"><h3>{task.title}</h3><p>{task.outcome}</p><p className="small"><strong>Start with:</strong> {task.input}</p><details><summary>How this works</summary><ol className="coreai-task-steps">{taskSteps[id]?.map(step => <li key={step}>{step}</li>)}</ol></details></div>
        <Button variant="soft" onClick={() => id === 'AII-01' ? open('brain') : destinations[id] ? state.setScreen(destinations[id]) : setSelected(selected === id ? null : id)}>{id === 'AII-01' ? 'Ask AI' : destinations[id] ? (id === 'SCH-07' ? 'Inspect technicians' : task.action) : 'Explore workflow'}</Button>
      </article>)}
    </Panel></section>
    {selected && <Dialog type="modal" size="md" isOpen onClose={() => setSelected(null)} title="Workflow walkthrough"><div className="between"><h2>{tasks[selected].title}</h2><Button size="small" onClick={() => setSelected(null)}>Close walkthrough</Button></div><Badge>Operational workspace workflow</Badge><ol className="coreai-task-steps">{taskSteps[selected]?.map(step => <li key={step}>{step}</li>)}</ol><p className="small muted">This public demo explains the actual workflow; it does not generate provider-backed drafts or apply operational changes.</p></Dialog>}
    <Panel><div className="panel-head"><div><h2>Current demo exceptions</h2><p>{overview.risks.length} orders to review · {overview.shortages.length} material shortages</p></div><Button variant="soft" onClick={() => state.setScreen('risks')}>Open risk inbox</Button></div></Panel>
  </div>;
}
