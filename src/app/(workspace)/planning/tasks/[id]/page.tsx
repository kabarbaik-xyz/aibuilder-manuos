import React from 'react';
import { AppShell } from '@/components/app-shell';
import Link from 'next/link';
import { requirePrincipal } from '@/server/auth/auth';
import { headers } from 'next/headers';
import { planningService } from '@/server/modules/planning/service';
import { executionService } from '@/server/modules/execution/service';
import { Badge } from '@/components/ui/badge';
import { notFound } from 'next/navigation';

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

  let task: any;
  try {
    const principal = await requirePrincipal(mockReq);
    task = await executionService.getTaskExecutionDetail(principal, id);
  } catch {
    notFound();
  }

  return (
    <AppShell
      breadcrumb={
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Link href="/planning" className="hover:underline">Planning</Link>
          <span>/</span>
          <span>Tasks</span>
          <span>/</span>
          <span className="text-slate-100 font-medium font-mono">{task.nodeKey}</span>
        </div>
      }
      activeTitle={`Task Assignment: ${task.nodeKey}`}
    >
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex justify-between items-center bg-slate-900/60 border border-slate-800 p-5 rounded-xl backdrop-blur-md">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs px-2 py-0.5 bg-slate-800 text-slate-300 rounded font-bold">
                {task.nodeKey}
              </span>
              <Badge variant="default">{task.status}</Badge>
            </div>
            <h1 className="text-xl font-bold text-slate-100">{task.nodeName}</h1>
            <p className="text-xs text-slate-400">
              Order {task.order.orderNumber} ({task.order.customerName}) · Item: {task.order.itemCode}
            </p>
          </div>
          <Link
            href={`/shop-floor/tasks/${task.id}`}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-lg transition"
          >
            Open Workstation Telemetry →
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-xl space-y-3">
            <h2 className="text-sm font-semibold text-slate-200">Assigned Resources</h2>
            <div className="p-3 bg-slate-950/50 border border-slate-800 rounded-lg text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Technician:</span>
                <span className="text-slate-200 font-medium">
                  {task.assignedTechnician ? task.assignedTechnician.name : 'Unassigned'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Machine / Station:</span>
                <span className="text-slate-200 font-medium">
                  {task.assignedMachine ? task.assignedMachine.name : 'Unassigned'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Planned Duration:</span>
                <span className="text-slate-200 font-mono font-medium">
                  {task.plannedDurationMinutes} minutes
                </span>
              </div>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-xl space-y-3">
            <h2 className="text-sm font-semibold text-slate-200">Predecessor Status</h2>
            {task.predecessors.length === 0 ? (
              <p className="text-xs text-emerald-400">No predecessors required. Ready for execution.</p>
            ) : (
              <div className="space-y-2 text-xs">
                {task.predecessors.map((p: any) => (
                  <div key={p.taskId} className="flex justify-between p-2.5 bg-slate-950/40 rounded border border-slate-800">
                    <span className="font-mono text-slate-300">{p.nodeKey}</span>
                    <span className={p.isCompleted ? 'text-emerald-400 font-medium' : 'text-amber-400'}>
                      {p.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
