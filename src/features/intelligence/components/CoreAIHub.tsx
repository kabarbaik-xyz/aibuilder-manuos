'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/page-header';
import { Panel } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingState } from '@/components/ui/resource-state';
import { Icon, type IconName } from '@/components/icons';
import { useWorkspaceNavigation } from '@/components/workspace-navigation-context';
import { useGraphStore } from '@/store/graph-store';
import { apiRequest } from '@/lib/api/client';
import type { CoreAICapabilityRegistryDTO } from '@/server/modules/intelligence/capabilities';
import type { DashboardOverviewDTO } from '@/server/modules/intelligence/dashboard';

function stateLabel(state: string) {
  switch (state) {
    case 'AVAILABLE': return 'Available';
    case 'DETERMINISTIC_READY': return 'Deterministic support';
    case 'UNCONFIGURED_PROVIDER': return 'Provider setup needed';
    case 'PILOT_GATED': return 'Pilot gated';
    default: return 'Not connected yet';
  }
}

function stateVariant(state: string): 'success' | 'warning' | 'default' {
  if (state === 'AVAILABLE') return 'success';
  if (state === 'UNCONFIGURED_PROVIDER' || state === 'PILOT_GATED') return 'warning';
  return 'default';
}

function stateIcon(state: string): IconName {
  if (state === 'AVAILABLE') return 'spark';
  if (state === 'DETERMINISTIC_READY') return 'check';
  if (state === 'UNCONFIGURED_PROVIDER' || state === 'PILOT_GATED') return 'lock';
  return 'info';
}

function severityVariant(severity: string): 'danger' | 'warning' | 'default' {
  if (severity === 'CRITICAL') return 'danger';
  if (severity === 'WARNING') return 'warning';
  return 'default';
}

export function CoreAIHub() {
  const { principal } = useWorkspaceNavigation();
  const openModal = useGraphStore(state => state.openModal);
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
  const availableCount = capabilities.filter(c => c.state === 'AVAILABLE' || c.state === 'DETERMINISTIC_READY').length;
  const exceptions = risks.data?.data.exceptions ?? [];
  const criticalCount = exceptions.filter(e => e.severity === 'CRITICAL').length;

  return (
    <div className="page-stack">
      <PageHeader
        title="CoreAI"
        description="AI tools for orders, engineering, planning, and quality. Answers use authorized records; people approve changes."
        actions={<Button variant="primary" icon="spark" onClick={() => openModal('brain')}>Ask AI</Button>}
      />

      {(query.data || (canReadDashboard && risks.data)) && (
        <div className="coreai-strip">
          <div className="coreai-strip-item">
            <span className="coreai-strip-label">Tools ready</span>
            <strong className="coreai-strip-value">{availableCount}<span> / {capabilities.length}</span></strong>
          </div>
          {canReadDashboard && (
            <>
              <div className="coreai-strip-item">
                <span className="coreai-strip-label">Open exceptions</span>
                <strong className="coreai-strip-value">{exceptions.length}</strong>
              </div>
              <div className="coreai-strip-item">
                <span className="coreai-strip-label">Critical</span>
                <strong className={`coreai-strip-value ${criticalCount > 0 ? 'danger-text' : ''}`}>{criticalCount}</strong>
              </div>
            </>
          )}
        </div>
      )}

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
                  <span className="coreai-exception-title">{exception.title}</span>
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

      {query.isPending ? (
        <LoadingState message="Loading available intelligence tools…" />
      ) : query.isError ? (
        <ErrorState
          title="Could not load CoreAI tools"
          error={query.error.message}
          onRetry={() => void query.refetch()}
        />
      ) : capabilities.length === 0 ? (
        <Panel className="p-6">
          <h2 className="font-semibold">No AI tools are available for this role</h2>
          <p className="muted mt-1">Access follows your workspace permissions.</p>
        </Panel>
      ) : (
        <section aria-label="AI tools" className="coreai-grid">
          {capabilities.map(capability => (
            <article key={capability.id} className="coreai-card">
              <header className="coreai-card-head">
                <span className={`coreai-card-icon ${stateVariant(capability.state)}`}>
                  <Icon name={stateIcon(capability.state)} />
                </span>
                <div className="coreai-card-title">
                  <span className="coreai-card-code">{capability.code}</span>
                  <h2>{capability.title}</h2>
                </div>
                <Badge variant={stateVariant(capability.state)}>{stateLabel(capability.state)}</Badge>
              </header>
              <p className="coreai-card-summary">{capability.summary}</p>
              <div className="coreai-card-status">
                <strong>{capability.statusLabel}</strong>
                {capability.unavailableReason && <p>{capability.unavailableReason}</p>}
                {capability.prerequisite && <p><b>Next:</b> {capability.prerequisite}</p>}
              </div>
              <footer className="coreai-card-foot">
                <span className="coreai-card-where"><Icon name="location" /> {capability.contextualEntryLabel}</span>
                {capability.href && capability.availablePage && (
                  <Link href={capability.href} className="btn soft small-btn">Open <Icon name="arrow" /></Link>
                )}
              </footer>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
