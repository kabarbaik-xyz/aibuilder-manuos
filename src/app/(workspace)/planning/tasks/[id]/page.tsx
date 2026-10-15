import React from 'react';
import Link from 'next/link';
import { requirePrincipal } from '@/server/auth/auth';
import { headers } from 'next/headers';
import { planningService } from '@/server/modules/planning/service';
import { executionService } from '@/server/modules/execution/service';
import { Badge } from '@/components/ui/badge';
import { notFound } from 'next/navigation';
import { NotFoundError } from '@/domain/errors';

export const metadata = {
  title: 'Task Planning & Resource Assignment | ManuOS',
  description: 'Detailed resource assignment and qualification audit for routing tasks.',
};

export default async function PlanningTaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const h = await headers();
  const mockReq = { headers: h } as any;

  const principal = await requirePrincipal(mockReq);
  let task: any;
  try {
    task = await executionService.getTaskExecutionDetail(principal, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  return (
    <div className="page-stack">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex justify-between items-center bg-surface border border-line p-5 rounded-xl">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs px-2 py-0.5 bg-surface text-ink rounded font-bold">
                {task.nodeKey}
              </span>
              <Badge variant="default">{task.status}</Badge>
            </div>
            <h1 className="text-xl font-bold text-ink">{task.nodeName}</h1>
            <p className="text-xs text-muted">
              Order {task.order.orderNumber} ({task.order.customerName}) · Item: {task.order.itemCode}
            </p>
          </div>
          <Link
            href={`/shop-floor/tasks/${task.id}`}
            className="px-4 py-2 bg-primary hover:bg-primary-soft text-white text-xs font-semibold rounded-lg transition"
          >
            Open Workstation Telemetry →
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-surface border border-line p-5 rounded-xl space-y-3">
            <h2 className="text-sm font-semibold text-ink">Assigned Resources</h2>
            <div className="p-3 bg-surface border border-line rounded-lg text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-muted">Technician:</span>
                <span className="text-ink font-medium">
                  {task.assignedTechnician ? task.assignedTechnician.name : 'Unassigned'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Machine / Station:</span>
                <span className="text-ink font-medium">
                  {task.assignedMachine ? task.assignedMachine.name : 'Unassigned'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Planned Duration:</span>
                <span className="text-ink font-mono font-medium">
                  {task.plannedDurationMinutes} minutes
                </span>
              </div>
            </div>
          </div>

          <div className="bg-surface border border-line p-5 rounded-xl space-y-3">
            <h2 className="text-sm font-semibold text-ink">Predecessor Status</h2>
            {task.predecessors.length === 0 ? (
              <p className="text-xs text-success">No predecessors required. Ready for execution.</p>
            ) : (
              <div className="space-y-2 text-xs">
                {task.predecessors.map((p: any) => (
                  <div key={p.taskId} className="flex justify-between p-2.5 bg-surface rounded border border-line">
                    <span className="font-mono text-ink">{p.nodeKey}</span>
                    <span className={p.isCompleted ? 'text-success font-medium' : 'text-warning'}>
                      {p.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
