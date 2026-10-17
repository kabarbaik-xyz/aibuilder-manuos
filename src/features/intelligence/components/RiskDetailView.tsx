'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api/client';
import { useWorkspaceNavigation } from '@/components/workspace-navigation-context';
import { Panel } from '@/components/ui/panel';
import { Badge } from '@/components/ui/badge';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingState } from '@/components/ui/resource-state';
import type { RiskDetailDTO } from '@/server/modules/intelligence/risks';

export function RiskDetailView({ id }: { id: string }) {
  const { principal } = useWorkspaceNavigation();
  const query = useQuery({
    queryKey: ['coreai-risk-detail', principal?.membershipId, id],
    enabled: Boolean(principal && id),
    queryFn: () => apiRequest<{ data: RiskDetailDTO }>(`/api/intelligence/risks/${encodeURIComponent(id)}`),
  });

  if (query.isPending) return <LoadingState message="Resolving current risk evidence…" />;
  if (query.isError) return <ErrorState title="Could not resolve this risk" error={query.error.message} onRetry={() => void query.refetch()} />;

  const { risk, source, observedAt, coverageNote, cause, affectedRecords, evidence, missingData, permittedActions } = query.data.data;
  return (
    <div className="page-stack">
      <Panel className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="small muted">{risk.type.replaceAll('_', ' ')}</p>
            <h2 className="mt-1 text-lg font-semibold">{risk.title}</h2>
          </div>
          <Badge variant={risk.severity === 'CRITICAL' ? 'danger' : 'default'}>{risk.severity}</Badge>
        </div>
        <p className="mt-4">{risk.description}</p>
        <div className="mt-4 rounded-lg border border-line bg-surface-muted p-3"><h3 className="small font-semibold">Current cause</h3><p className="small mt-1">{cause}</p></div>
        <dl className="mt-5 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
          <div><dt className="small muted">Observed</dt><dd>{new Date(observedAt).toLocaleString()}</dd></div>
          <div><dt className="small muted">Source record</dt><dd>{source.type} · {source.id}</dd></div>
        </dl>
        <div className="mt-5 grid gap-5 border-t border-line pt-4 md:grid-cols-2">
          <section><h3 className="small font-semibold">Affected records</h3>{affectedRecords.length ? <ul className="mt-2 space-y-2">{affectedRecords.map(record => <li key={`${record.type}:${record.id}`} className="small"><span className="muted">{record.type} · </span><Link className="text-primary underline" href={record.href}>{record.label}</Link></li>)}</ul> : <p className="small muted mt-2">No affected record could be resolved in the current scope.</p>}</section>
          <section><h3 className="small font-semibold">Evidence</h3>{evidence.length ? <dl className="mt-2 space-y-2">{evidence.map(item => <div key={item.label} className="flex justify-between gap-3 small"><dt className="muted">{item.label}</dt><dd className="text-right">{item.value ?? 'Unavailable'}</dd></div>)}</dl> : <p className="small muted mt-2">No supporting evidence is available.</p>}</section>
        </div>
        {missingData.length > 0 && <div className="mt-4 rounded-lg border border-warning/30 bg-warning-soft p-3"><h3 className="small font-semibold">Missing data</h3><ul className="small mt-1 list-disc pl-5">{missingData.map(item => <li key={item}>{item}</li>)}</ul></div>}
        <div className="mt-5 flex flex-wrap gap-2">
          {permittedActions.map(action => <Link key={`${action.label}:${action.href}`} href={action.href} className="btn primary">{action.label}</Link>)}
          {permittedActions.length === 0 && <Link href={source.href} className="btn primary">{source.label}</Link>}
          <Link href="/ai/risks" className="btn soft">Back to risk inbox</Link>
        </div>
      </Panel>
      <Panel className="p-4">
        <h3 className="font-semibold">Evidence scope</h3>
        <p className="small muted mt-1">This is a derived dashboard exception. It has no acknowledge or resolve action.</p>
        <p className="small muted mt-2">{coverageNote}</p>
      </Panel>
    </div>
  );
}
