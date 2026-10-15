'use client';

import React from 'react';
import Link from 'next/link';
import { useWorkflowTemplates } from '@/features/workflows/hooks';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingState, EmptyState, ErrorState } from '@/components/ui/resource-state';

export default function WorkflowsPage() {
  const { data: templates = [], isPending, error, refetch } = useWorkflowTemplates();

  if (isPending) return <LoadingState message="Loading workflows…" />;
  if (error) return <ErrorState title="Failed to load workflows" onRetry={() => refetch()} />;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Workflow Studio</h1>
          <p className="text-sm text-slate-500">
            Define process DAG routings, operation dependencies, skill requirements, and inspection gates.
          </p>
        </div>

        <Link href="/workflows/new">
          <Button variant="primary">Create New Workflow</Button>
        </Link>
      </div>

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
              <div key={tpl.id} className="rounded-lg border bg-white p-5 shadow-sm space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-mono text-xs font-bold text-blue-600">{tpl.code}</span>
                    <h2 className="text-base font-bold text-slate-900 mt-0.5">{tpl.name}</h2>
                  </div>
                  {latestVersion && (
                    <Badge variant={latestVersion.status === 'PUBLISHED' ? 'success' : 'default'}>
                      v{latestVersion.versionNumber} · {latestVersion.status}
                    </Badge>
                  )}
                </div>

                <p className="text-xs text-slate-500 line-clamp-2">
                  {tpl.description || 'No description provided.'}
                </p>

                <div className="text-xs text-slate-400 border-t pt-2">
                  Order Type: <strong>{tpl.orderType?.name}</strong>
                </div>

                {latestVersion && (
                  <div className="pt-2">
                    <Link href={`/workflows/${tpl.id}/versions/${latestVersion.id}`}>
                      <Button variant="default" className="w-full">
                        Open Routing Editor
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
