'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api/client';
import { useWorkspaceNavigation } from '@/components/workspace-navigation-context';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { Badge } from '@/components/ui/badge';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingState } from '@/components/ui/resource-state';
import type { RiskListDTO } from '@/server/modules/intelligence/risks';

const typeLabels = {
  AT_RISK_ETA: 'Overdue commitment',
  MATERIAL_SHORTAGE: 'Material shortage',
  PENDING_APPROVAL: 'Pending engineering approval',
  QC_REWORK: 'QC rework',
} as const;

export function RiskInbox() {
  const { principal } = useWorkspaceNavigation();
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [severity, setSeverity] = useState('');
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['coreai-risks', principal?.membershipId, search, type, severity, page],
    enabled: Boolean(principal),
    queryFn: () => {
      const params = new URLSearchParams({ search, page: String(page), pageSize: '10' });
      if (type) params.set('type', type);
      if (severity) params.set('severity', severity);
      return apiRequest<{ data: RiskListDTO }>(`/api/intelligence/risks?${params.toString()}`);
    },
  });

  function updateFilter(setter: (value: string) => void, value: string) {
    setter(value);
    setPage(1);
  }

  if (query.isPending) return <LoadingState message="Loading workspace exceptions…" />;
  if (query.isError) {
    return <ErrorState title="Could not load the risk inbox" error={query.error.message} onRetry={() => void query.refetch()} />;
  }

  const result = query.data.data;
  return (
    <div className="page-stack">
      <Panel className="p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label htmlFor="risk-inbox-search" className="mb-1 block text-xs font-medium text-ink">Search exceptions</label>
            <Input id="risk-inbox-search" value={search} onChange={event => updateFilter(setSearch, event.target.value)} placeholder="Order, material, or exception" />
          </div>
          <div>
            <label htmlFor="risk-inbox-type" className="mb-1 block text-xs font-medium text-ink">Type</label>
            <Select id="risk-inbox-type" value={type} onChange={event => updateFilter(setType, event.target.value)}>
              <option value="">All types</option>
              <option value="AT_RISK_ETA">Overdue commitment</option>
              <option value="MATERIAL_SHORTAGE">Material shortage</option>
              <option value="PENDING_APPROVAL">Pending approval</option>
              <option value="QC_REWORK">QC rework</option>
            </Select>
          </div>
          <div>
            <label htmlFor="risk-inbox-severity" className="mb-1 block text-xs font-medium text-ink">Severity</label>
            <Select id="risk-inbox-severity" value={severity} onChange={event => updateFilter(setSeverity, event.target.value)}>
              <option value="">All severities</option>
              <option value="CRITICAL">Critical</option>
              <option value="WARNING">Warning</option>
              <option value="INFO">Info</option>
            </Select>
          </div>
        </div>
        <p className="small muted mt-3">{result.coverage.note}</p>
      </Panel>
      {result.items.length === 0 ? (
        <Panel className="p-6 text-center">
          <h2 className="font-semibold">{search || type || severity ? 'No matching exceptions' : 'No current exceptions'}</h2>
          <p className="muted mt-1">{search || type || severity ? 'Try changing the filters.' : 'The dashboard found no operational exceptions in its current scope.'}</p>
        </Panel>
      ) : (
        <div className="grid gap-3">
          {result.items.map(exception => (
            <Panel key={exception.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{exception.title}</h2>
                    <Badge variant={exception.severity === 'CRITICAL' ? 'danger' : 'default'}>{exception.severity}</Badge>
                  </div>
                  <p className="small muted mt-1">{typeLabels[exception.type]}</p>
                  <p className="mt-2">{exception.description}</p>
                </div>
                <Link href={`/ai/risks/${encodeURIComponent(exception.id)}`} className="btn soft">Review evidence</Link>
              </div>
            </Panel>
          ))}
        </div>
      )}
      <Panel className="flex flex-wrap items-center justify-between gap-3 p-3">
        <p className="small muted">{result.pagination.total} matching exceptions · page {result.pagination.page} of {result.pagination.totalPages}</p>
        <div className="flex gap-2">
          <Button variant="soft" size="small" disabled={result.pagination.page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>Previous</Button>
          <Button variant="soft" size="small" disabled={result.pagination.page >= result.pagination.totalPages} onClick={() => setPage(value => value + 1)}>Next</Button>
        </div>
      </Panel>
    </div>
  );
}
