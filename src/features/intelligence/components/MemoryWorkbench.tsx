'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api/client';
import { formatQuantity } from '@/domain/quantity';
import { useWorkspaceNavigation } from '@/components/workspace-navigation-context';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingState } from '@/components/ui/resource-state';
import { DatePicker } from '@/components/ui/date-picker';
import type { FactoryMemoryDTO } from '@/server/modules/intelligence/memory';
import { memoryHrefForItem } from '../memory-navigation';

export function MemoryWorkbench({ initialItemId = '' }: { initialItemId?: string }) {
  const { principal } = useWorkspaceNavigation();
  const [itemId, setItemId] = useState(initialItemId);
  const [departmentId, setDepartmentId] = useState('');
  const [nodeKey, setNodeKey] = useState('');
  const [workflowVersionId, setWorkflowVersionId] = useState('');
  const [facilityId, setFacilityId] = useState('');
  const [completedFrom, setCompletedFrom] = useState('');
  const [completedTo, setCompletedTo] = useState('');
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['coreai-memory', principal?.membershipId, itemId, departmentId, nodeKey, workflowVersionId, facilityId, completedFrom, completedTo, page],
    enabled: Boolean(principal),
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: '10' });
      if (itemId.trim()) params.set('itemId', itemId.trim());
      if (departmentId.trim()) params.set('departmentId', departmentId.trim());
      if (nodeKey.trim()) params.set('nodeKey', nodeKey.trim());
      if (workflowVersionId.trim()) params.set('workflowVersionId', workflowVersionId.trim());
      if (facilityId.trim()) params.set('facilityId', facilityId.trim());
      if (completedFrom) params.set('completedFrom', completedFrom);
      if (completedTo) params.set('completedTo', completedTo);
      return apiRequest<{ data: FactoryMemoryDTO }>(`/api/intelligence/memory?${params.toString()}`);
    },
  });

  function setFilter(setter: (value: string) => void, value: string) {
    setter(value);
    setPage(1);
  }

  if (query.isPending) return <LoadingState message="Loading measured production evidence…" />;
  if (query.isError) return <ErrorState title="Could not load factory memory" error={query.error.message} onRetry={() => void query.refetch()} />;
  const memory = query.data.data;

  return (
    <div className="page-stack">
      <Panel className="p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div><label htmlFor="memory-item" className="mb-1 block text-xs font-medium text-ink">Item ID</label><Input id="memory-item" value={itemId} onChange={event => setFilter(setItemId, event.target.value)} placeholder="Filter by item ID" /></div>
          <div><label htmlFor="memory-department" className="mb-1 block text-xs font-medium text-ink">Department ID</label><Input id="memory-department" value={departmentId} onChange={event => setFilter(setDepartmentId, event.target.value)} placeholder="Filter by department ID" /></div>
          <div><label htmlFor="memory-node" className="mb-1 block text-xs font-medium text-ink">Process key</label><Input id="memory-node" value={nodeKey} onChange={event => setFilter(setNodeKey, event.target.value)} placeholder="Filter by process key" /></div>
          <div><label htmlFor="memory-version" className="mb-1 block text-xs font-medium text-ink">Workflow version ID</label><Input id="memory-version" value={workflowVersionId} onChange={event => setFilter(setWorkflowVersionId, event.target.value)} placeholder="Filter by version ID" /></div>
          <div><label htmlFor="memory-facility" className="mb-1 block text-xs font-medium text-ink">Facility ID</label><Input id="memory-facility" value={facilityId} onChange={event => setFilter(setFacilityId, event.target.value)} placeholder="Filter by facility ID" /></div>
          <div><label htmlFor="memory-completed-from" className="mb-1 block text-xs font-medium text-ink">Completed from</label><DatePicker id="memory-completed-from" value={completedFrom} onChange={value => setFilter(setCompletedFrom, value)} clearable /></div>
          <div><label htmlFor="memory-completed-to" className="mb-1 block text-xs font-medium text-ink">Completed through</label><DatePicker id="memory-completed-to" value={completedTo} onChange={value => setFilter(setCompletedTo, value)} clearable /></div>
        </div>
      </Panel>
      <div className="grid gap-3 sm:grid-cols-3">
        <Panel className="p-4"><p className="small muted">Completed runs</p><p className="mt-1 text-xl font-semibold">{memory.completedRunCount}</p></Panel>
        <Panel className="p-4"><p className="small muted">Measured duration samples</p><p className="mt-1 text-xl font-semibold">{memory.measuredSampleCount}</p></Panel>
        <Panel className="p-4"><p className="small muted">Mean measured overrun</p><p className="mt-1 text-xl font-semibold">{memory.meanOverrunPct === null ? 'Unavailable' : `${memory.meanOverrunPct}%`}</p></Panel>
      </div>
      <Panel className="p-4">
        <h2 className="font-semibold">{memory.recommendation.title}</h2>
        <p className="small muted mt-1">{memory.recommendation.description}</p>
        {memory.excludedRunCount > 0 && <p className="small muted mt-2">{memory.excludedRunCount} completed runs excluded from duration statistics due to missing measured or planned duration.</p>}
        {memory.meanReworkPct === null ? <p className="small muted mt-2">Inspection yield evidence is unavailable for this cohort.</p> : <p className="small muted mt-2">Rework share of finalized inspected atoms: {memory.meanReworkPct}%</p>}
      </Panel>
      {memory.runs.length === 0 ? (
        <Panel className="p-6 text-center"><h2 className="font-semibold">No completed runs in this cohort</h2><p className="muted mt-1">Try removing one or more filters.</p></Panel>
      ) : (
        <Panel className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-line bg-surface-muted text-xs uppercase text-muted"><tr><th className="p-3">Run</th><th className="p-3">Item</th><th className="p-3">Planned</th><th className="p-3">Measured</th><th className="p-3">Overrun</th><th className="p-3">QC atoms</th></tr></thead>
            <tbody>{memory.runs.map(run => (
              <tr key={run.taskId} className="border-b border-line last:border-0">
                <td className="p-3">{run.orderId ? <Link className="text-primary underline" href={`/orders/${encodeURIComponent(run.orderId)}`}>{run.orderNumber}</Link> : run.orderNumber}<span className="block small muted">{run.taskName}</span><span className="block small muted">Workflow {run.workflowVersionId ?? 'N/A'} · Facility {run.facilityId ?? 'N/A'}</span></td>
                <td className="p-3">{run.itemCode}{run.itemId && <Link className="ml-2 text-primary underline" href={memoryHrefForItem(run.itemId) ?? '/ai/memory'}>More from this item</Link>}</td>
                <td className="p-3">{run.plannedMinutes === null ? 'N/A' : `${run.plannedMinutes} min`}</td>
                <td className="p-3">{run.actualMinutes === null ? 'N/A' : `${run.actualMinutes} min`}</td>
                <td className="p-3">{run.overrunPct === null ? 'N/A' : `${run.overrunPct}%`}</td>
                <td className="p-3">Passed {formatQuantity(BigInt(run.passedAtoms))} · Rework {formatQuantity(BigInt(run.reworkAtoms))} · Scrap {formatQuantity(BigInt(run.scrappedAtoms))}</td>
              </tr>
            ))}</tbody>
          </table>
        </Panel>
      )}
      <Panel className="flex flex-wrap items-center justify-between gap-3 p-3">
        <p className="small muted">{memory.pagination.total} completed runs · page {memory.pagination.page} of {memory.pagination.totalPages}</p>
        <div className="flex gap-2">
          <Button variant="soft" size="small" disabled={memory.pagination.page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>Previous</Button>
          <Button variant="soft" size="small" disabled={memory.pagination.page >= memory.pagination.totalPages} onClick={() => setPage(value => value + 1)}>Next</Button>
        </div>
      </Panel>
    </div>
  );
}
