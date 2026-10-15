'use client';
import { useListSearch, usePaginatedList } from '@/lib/api/use-paginated-list';
import { Pagination } from '@/components/ui/pagination';
import { ListSearch } from '@/components/ui/list-search';
import type { WorkflowTemplateDto } from '@/features/workflows/api';

import { PageHeader } from '@/components/ui/page-header';
import React from 'react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingState, EmptyState, ErrorState } from '@/components/ui/resource-state';

export default function WorkflowsPage() {
  const { search, setSearch, query } = useListSearch();
  const { data: pageData, isPending, error, refetch, pagination } = usePaginatedList<WorkflowTemplateDto>('workflows', { search: query || undefined });
  const templates = pageData?.data || [];

  if (isPending) return <LoadingState message="Loading workflows…" />;
  if (error) return <ErrorState title="Failed to load workflows" onRetry={() => refetch()} />;

  return (
    <div className="space-y-6">
      <PageHeader title="Workflow Studio" description="Define process DAG routings, operation dependencies, skill requirements, and inspection gates." actions={<><Link href="/workflows/new" className="btn primary ">Create New Workflow</Link></>} />

      <ListSearch value={search} onChange={setSearch} placeholder="Search workflow code or name…" label="Search workflows" />

      {templates.length === 0 ? (
        <EmptyState
          title="No workflow templates found"
          description="Create your first workflow routing to standardize production operations."
          actionLabel="Create Workflow"
          onAction={() => window.location.assign('/workflows/new')}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((tpl) => {
            const latestVersion = tpl.versions?.[0];
            return (
              <div key={tpl.id} className="rounded-lg border bg-white p-5 shadow-sm space-y-3 border-line">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-mono text-xs font-bold text-primary">{tpl.code}</span>
                    <h2 className="text-base font-bold text-ink mt-0.5">{tpl.name}</h2>
                  </div>
                  {latestVersion && (
                    <Badge variant={latestVersion.status === 'PUBLISHED' ? 'success' : 'default'}>
                      v{latestVersion.versionNumber} · {latestVersion.status}
                    </Badge>
                  )}
                </div>

                <p className="text-xs text-muted line-clamp-2">
                  {tpl.description || 'No description provided.'}
                </p>

                <div className="text-xs text-muted border-t pt-2 border-line">
                  Order Type: <strong>{tpl.orderType?.name}</strong>
                </div>

                {latestVersion && (
                  <div className="pt-2">
                    <Link href={`/workflows/${tpl.id}/versions/${latestVersion.id}`} className="btn  w-full">
                        Open Routing Editor
                      </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <Pagination {...pagination} />
    </div>
  );
}
