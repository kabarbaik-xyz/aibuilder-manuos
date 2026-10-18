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

import { tasks, taskSteps } from '../task-catalog';

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
