'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/page-header';
import { Panel } from '@/components/ui/panel';
import { Badge } from '@/components/ui/badge';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingState } from '@/components/ui/resource-state';
import { Icon } from '@/components/icons';
import { useWorkspaceNavigation } from '@/components/workspace-navigation-context';
import { apiRequest } from '@/lib/api/client';
import type { CoreAICapabilityRegistryDTO } from '@/server/modules/intelligence/capabilities';
import type { DashboardOverviewDTO } from '@/server/modules/intelligence/dashboard';

type TaskEntry = { title: string; input: string; outcome: string; action: string; href?: string };
const tasks: Record<string, TaskEntry> = {
  'AII-01': { title: 'Ask about an order', input: 'An order, item, or production question.', outcome: 'An answer with links to the records behind it.', action: 'Ask AI', href: '/ai/assistant' },
  'AII-02': { title: 'Find orders that need attention', input: 'Current orders and operational exceptions.', outcome: 'Review delivery risks, material shortages, and pending approvals.', action: 'Review risks', href: '/ai/risks' },
  'AII-03': { title: 'Turn an RFQ into an order draft', input: 'Customer request text and specifications.', outcome: 'Review extracted fields before creating an order draft.', action: 'Import RFQ', href: '/orders/intake' },
  'AII-04': { title: 'Check a delivery date', input: 'A released order, active job, full job quantity, and requested date.', outcome: 'See projected completion and missing evidence. Request a date change for review if feasible.', action: 'Check delivery date', href: '/ai/promise' },
  'SCH-08': { title: 'Build a production schedule', input: 'A released order with routing, materials, and resource availability.', outcome: 'Review task times and assignments before applying the schedule.', action: 'Build schedule', href: '/ai/schedule' },
  'AII-06': { title: 'Replan after a disruption', input: 'A released order with an active job.', outcome: 'Save a revised schedule, review it, then apply assignments after revalidation.', action: 'Review recovery', href: '/ai/recovery' },
  'AII-05': { title: 'Learn from similar jobs', input: 'An item and recorded production history.', outcome: 'Compare measured work duration and inspection results.', action: 'Compare past jobs', href: '/ai/memory' },
  'SCH-07': { title: 'Find a qualified technician', input: 'In Planning, select a task and open Assign resources.', outcome: 'Compare eligible technicians for the task time window.', action: 'Go to Planning', href: '/planning' },
  'CST-03': { title: 'Understand cost differences', input: 'Select an order, then open Costing → Explain variance.', outcome: 'See standard versus actual costs and their source entries.', action: 'Choose an order', href: '/orders' },
  'BLD-01': { title: 'Draft a workflow or form', input: 'Describe the process in Workflow Studio or Form Templates.', outcome: 'Review an AI-generated draft before publishing.', action: 'Go to Workflow Studio', href: '/workflows' },
};

const taskSteps: Record<string, string[]> = {
  'AII-01': ['Ask a question about orders, inventory, or production. From an order detail, Ask AI carries that order into the conversation.', 'Read the answer and open its Sources to verify the underlying records.', 'Ask a follow-up when you need more detail. The assistant is read only; it does not change operational records.'],
  'AII-02': ['Open the risk inbox and choose an exception.', 'Review the linked order and the evidence for the delay, shortage, or pending approval.', 'Follow the linked operational page to address the cause. Reviewing a risk does not resolve it automatically.'],
  'AII-03': ['Enter the customer request text and run extraction.', 'Review the suggested fields and open questions; correct them before saving.', 'Save the reviewed draft and continue to new order intake. Review the order before creating it.'],
  'AII-04': ['Select a released order and its active production job.', 'Enter the full released job quantity and the requested delivery date, then run the evaluation.', 'Review projected completion and missing inputs. If feasible, request a date change for authorized review; evaluation does not change the customer commitment.'],
  'SCH-08': ['Select a released order, active job, and how many days to look ahead.', 'Preview the schedule and inspect proposed task times, technicians, machines, and any unscheduled tasks.', 'For a complete proposal, review and confirm Apply. Current evidence is checked again before assignments and bookings change; publishing the schedule is a separate action.'],
  'AII-06': ['Select the affected released order and active job, then generate a finite-capacity schedule review.', 'Compare the priority schedule with feasible alternate machines and overtime scenarios that satisfy current roster, machine, qualification, booking, and configured daily/weekly overtime limits.', 'Applying an overtime scenario requires approval from the affected technician direct supervisor and atomically publishes that interval with the reviewed assignments. For subcontracting, set the workspace batch limit, request approval, track vendor status and returned quantity, then resume internal work after the full target returns. Alternate routing and split shipment are not available.'],
  'AII-05': ['Open measured job history, or use Similar jobs on an order to carry its item into the view.', 'Review the comparable records, measured durations, inspection results, and missing data.', 'Use the evidence to inform planning. The view does not automatically change duration estimates or planning buffers.'],
  'SCH-07': ['Open Planning and choose Assign resources for a task.', 'Set the task time window and review qualified technician suggestions.', 'Select a suggestion and confirm the assignment. Qualifications and bookings are checked again when assigning.'],
  'CST-03': ['Choose an order and open its Costing tab.', 'Select Explain variance to compare standard and actual costs by category.', 'Open the source entries to investigate a difference. Revenue and margin are not calculated by this explanation.'],
  'BLD-01': ['Open Workflow Studio or Form Templates and choose Draft with AI.', 'Describe the process or fields you need, then generate a draft.', 'Review the generated steps or fields and any validation findings. Save and publish through the normal review flow; generation alone does not publish it.'],
};

function severityVariant(severity: string): 'danger' | 'warning' | 'default' {
  if (severity === 'CRITICAL') return 'danger';
  if (severity === 'WARNING') return 'warning';
  return 'default';
}

export function CoreAIHub() {
  const { principal } = useWorkspaceNavigation();
  const canReadDashboard = Boolean(principal && (
    principal.roles.includes('OWNER') ||
    ['order.read', 'planning.read', 'execution.read', 'customer_order.read_own'].some(permission => principal.permissions.includes(permission))
  ));
  const query = useQuery({
    queryKey: ['coreai-capabilities', principal?.membershipId],
    enabled: Boolean(principal),
    queryFn: () => apiRequest<{ data: CoreAICapabilityRegistryDTO }>('/api/intelligence/capabilities'),
  });
  const risks = useQuery({
    queryKey: ['coreai-risk-preview', principal?.membershipId],
    enabled: canReadDashboard,
    queryFn: () => apiRequest<{ data: DashboardOverviewDTO }>('/api/intelligence/dashboard'),
  });

  const capabilities = query.data?.data.capabilities ?? [];
  const ready = capabilities.filter(c => c.availablePage && ['AVAILABLE', 'DETERMINISTIC_READY'].includes(c.state));
  const unavailable = capabilities.filter(c => !ready.includes(c));
  const exceptions = risks.data?.data.exceptions ?? [];

  return (
    <div className="page-stack">
      <PageHeader
        title="CoreAI"
        description="What would you like help with? Choose a task to see what you need and what happens next."
        actions={ready.some(c => c.id === 'AII-01') ? <Link href="/ai/assistant" className="btn primary">Ask AI <Icon name="spark" /></Link> : undefined}
      />

      {query.isPending ? <LoadingState message="Loading available tasks…" /> : query.isError ? (
        <ErrorState title="Could not load CoreAI tasks" error={query.error.message} onRetry={() => void query.refetch()} />
      ) : <>
        <section aria-labelledby="coreai-tasks" className="page-stack">
          <div><h2 id="coreai-tasks">What would you like to do?</h2><p className="muted small">AI drafts and explains; planning tools calculate from your records. You review changes before applying them.</p></div>
          {ready.length === 0 ? <Panel className="p-6"><h3>No tasks available for this role</h3><p className="muted">Access follows your workspace permissions.</p></Panel> : <Panel>
            {ready.map(capability => {
              const task = tasks[capability.id];
              if (!task) return null;
              return <article key={capability.id} className="coreai-task-row">
                <div className="coreai-task-copy"><h3>{task.title}</h3><p>{task.outcome}</p><p className="small"><strong>Start with:</strong> {task.input}</p>
                  <details><summary>How this works</summary><ol className="coreai-task-steps">{taskSteps[capability.id]?.map(step => <li key={step}>{step}</li>)}</ol>{capability.unavailableReason && <p className="coreai-task-limit"><strong>Limit:</strong> {capability.unavailableReason}</p>}</details>
                </div>
                <Link href={task.href ?? capability.href ?? '/ai'} className="btn soft">{task.action}<Icon name="arrow" /></Link>
              </article>;
            })}
          </Panel>}
        </section>
        {unavailable.length > 0 && <Panel className="p-5"><details><summary className="font-semibold">Not available yet ({unavailable.length})</summary><p className="small muted mt-2">These tools need setup or further implementation before you can use them.</p><ul className="mt-3 space-y-4">{unavailable.map(capability => <li key={capability.id}><h3 className="text-sm font-semibold">{tasks[capability.id]?.title ?? capability.title}</h3><p className="small muted">{capability.unavailableReason ?? capability.statusLabel}</p></li>)}</ul></details></Panel>}
      </>}
      {canReadDashboard && (
        <Panel>
          <div className="panel-head">
            <div>
              <h2>Current workspace exceptions</h2>
              <p>Dashboard-derived signals for review</p>
            </div>
            <Link href="/ai/risks" className="btn soft">Open risk inbox <Icon name="arrow" /></Link>
          </div>
          {risks.isPending ? (
            <div className="panel-body"><LoadingState message="Loading current exceptions…" /></div>
          ) : risks.isError ? (
            <div className="panel-body"><ErrorState title="Could not load exception preview" error={risks.error.message} onRetry={() => void risks.refetch()} /></div>
          ) : exceptions.length === 0 ? (
            <p className="panel-body muted">No exceptions in the dashboard's current scope.</p>
          ) : (
            <ul className="coreai-exceptions">
              {exceptions.slice(0, 4).map(exception => (
                <li key={exception.id} className={`coreai-exception sev-${exception.severity.toLowerCase()}`}>
                  <span className="coreai-exception-dot" aria-hidden="true" />
                  <Link href={`/ai/risks/${encodeURIComponent(exception.id)}`} className="coreai-exception-title text-primary hover:underline">{exception.title}</Link>
                  <Badge variant={severityVariant(exception.severity)}>{exception.severity}</Badge>
                </li>
              ))}
            </ul>
          )}
          <div className="panel-footer">
            <span>The inbox is paginated; order-derived exceptions still cover only the dashboard's 50 most recently created orders.</span>
          </div>
        </Panel>
      )}

    </div>
  );
}
