'use client';
import { useListSearch, usePaginatedList } from '@/lib/api/use-paginated-list';
import { Pagination } from '@/components/ui/pagination';
import { ListSearch } from '@/components/ui/list-search';
import type { ScheduledTaskResult } from '@/engines/schedule';

import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { PermissionGate } from '@/components/ui/permission-gate';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import React, { useState } from 'react';
import { useTechnicians, useMachines } from '@/features/masters/hooks';
import { useAssignTask, useTaskReadiness, useEvaluateAssignment, usePublishedSchedules, usePublishSchedule } from '../hooks';
import type { AssignmentEvaluationResult } from '@/server/modules/planning/contracts';
import { Icon } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

export function PlanningScheduleView() {
  const { search, setSearch, query } = useListSearch();
  const { data: pageData, isLoading, error, refetch, pagination } = usePaginatedList<ScheduledTaskResult, { makespanMinutes: number; projectedEndAt: string; criticalPathCount: number; scheduledTaskCount: number }>('planning', { search: query || undefined });
  const schedule = pageData?.summary ? { ...pageData.summary, scheduledTasks: pageData.data } : undefined;
  const assignMutation = useAssignTask();
  const techniciansQuery = useTechnicians();
  const machinesQuery = useMachines();

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTaskVersion, setSelectedTaskVersion] = useState<number | null>(null);
  const [technicianId, setTechnicianId] = useState('');
  const [machineId, setMachineId] = useState('');
  const [assignError, setAssignError] = useState<string | null>(null);
  const { data: readiness, isLoading: isReadinessLoading } = useTaskReadiness(selectedTaskId);
  const evaluateMutation = useEvaluateAssignment();
  const [evaluation, setEvaluation] = useState<AssignmentEvaluationResult | null>(null);
  const { data: publishedSchedules, refetch: refetchPublished } = usePublishedSchedules();
  const publishMutation = usePublishSchedule();
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishTitle, setPublishTitle] = useState("");
  const [publishPeriodStart, setPublishPeriodStart] = useState(new Date().toISOString().slice(0, 10));
  const [publishPeriodEnd, setPublishPeriodEnd] = useState(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [publishError, setPublishError] = useState<string | null>(null);

  // Trigger qualification evaluation on resource selection
  React.useEffect(() => {
    if (!selectedTaskId || (!technicianId && !machineId)) {
      setEvaluation(null);
      return;
    }
    evaluateMutation.mutateAsync({
      taskId: selectedTaskId,
      technicianId: technicianId.trim() || null,
      machineId: machineId.trim() || null,
    }).then(res => setEvaluation(res)).catch(() => setEvaluation(null));
  }, [selectedTaskId, technicianId, machineId]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-muted">
        <Icon name="clock" className="w-8 h-8 animate-spin mb-3 text-primary" />
        <p className="text-sm">Loading production schedule…</p>
      </div>
    );
  }

  if (error || !schedule) {
    return (
      <div className="p-8 text-center bg-danger-soft border border-line rounded-xl my-6">
        <p className="text-danger font-medium mb-2">Unable to load production schedule</p>
        <p className="text-xs text-muted mb-4">{error?.message || 'Unknown error'}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="px-4 py-2 bg-surface hover:bg-surface-muted text-ink text-xs rounded-lg transition"
        >
          Retry Calculation
        </button>
      </div>
    );
  }

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTaskId || selectedTaskVersion === null) return;
    setAssignError(null);

    try {
      await assignMutation.mutateAsync({
        taskId: selectedTaskId,
        expectedVersion: selectedTaskVersion,
        technicianId: technicianId.trim() || null,
        machineId: machineId.trim() || null,
      });
      setSelectedTaskId(null);
      setSelectedTaskVersion(null);
      setTechnicianId('');
      setMachineId('');
      refetch();
    } catch (err: any) {
      setAssignError(err.message || 'Failed to assign resource');
    }
  };

  return (
    <div className="page-stack">
      <PageHeader title="Planning" description="Review the production schedule, critical work and resource assignments." actions={
        <div className="flex items-center gap-2">
          <Button onClick={() => refetch()} icon="reset">
            Recalculate
          </Button>
          <PermissionGate permission={["planning.write", "order.release"]}>
            <Button
              variant="primary"
              onClick={() => {
                setPublishTitle(`Master Schedule ${new Date().toISOString().slice(0, 10)}`);
                setPublishError(null);
                setShowPublishModal(true);
              }}
            >
              Publish Schedule
            </Button>
          </PermissionGate>
        </div>
      } />
      {/* Top Metric Cards */}
      {publishedSchedules && publishedSchedules.length > 0 && (
        <div className="p-3 bg-surface border border-line rounded-xl flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-2">
            <Badge variant="success">Rev #{publishedSchedules[0].revisionNumber} Published</Badge>
            <strong className="text-ink">{publishedSchedules[0].title}</strong>
            <span className="text-muted">
              Covering {new Date(publishedSchedules[0].periodStart).toLocaleDateString()} – {new Date(publishedSchedules[0].periodEnd).toLocaleDateString()}
            </span>
          </div>
          <span className="text-muted">
            Published {new Date(publishedSchedules[0].createdAt).toLocaleString()}
          </span>
        </div>
      )}
      <div className="planning-metrics">
        <div className="planning-metric">
          <span className="text-xs font-semibold text-muted tracking-wider uppercase">Scheduled duration</span>
          <div className="text-2xl font-bold text-ink mt-1">
            {Math.floor(schedule.makespanMinutes / 60)}h {schedule.makespanMinutes % 60}m
          </div>
          <p className="text-xs text-muted mt-1">Total active working duration</p>
        </div>

        <div className="planning-metric">
          <span className="text-xs font-semibold text-muted tracking-wider uppercase">Expected finish</span>
          <div className="text-lg font-bold text-ink mt-1 truncate">
            {schedule.scheduledTaskCount && schedule.projectedEndAt ? new Date(schedule.projectedEndAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Not scheduled'}
          </div>
          <p className="text-xs text-muted mt-1">Taking shifts & weekends into account</p>
        </div>

        <div className="planning-metric">
          <span className="text-xs font-semibold text-muted tracking-wider uppercase">Critical Path</span>
          <div className="text-2xl font-bold text-ink mt-1">
            {schedule.criticalPathCount} Tasks
          </div>
          <p className="text-xs text-muted mt-1">Zero slack activities</p>
        </div>

        <div className="planning-metric">
          <span className="text-xs font-semibold text-muted tracking-wider uppercase">Scheduled tasks</span>
          <div className="text-2xl font-bold text-ink mt-1">
            {schedule.scheduledTaskCount}
          </div>
          <p className="text-xs text-muted mt-1">Sequenced in routing network</p>
        </div>
      </div>

      {/* Schedule Table */}
      <ListSearch value={search} onChange={setSearch} placeholder="Search order, item or operation…" label="Search production schedule" />
      <div className="bg-surface border border-line rounded-xl overflow-hidden">
        <div className="p-4 border-b border-line flex justify-between items-center bg-surface">
          <div>
            <h2 className="text-base font-semibold text-ink">Production schedule</h2>
            <p className="text-xs text-muted">Scheduled stages, material readiness and available time before a delay affects delivery.</p>
          </div>

        </div>

        {schedule.scheduledTasks.length === 0 ? <div className="resource-state"><span className="state-icon"><Icon name="calendar" /></span><h3>No production work scheduled</h3><p>Release an order with an approved workflow to see its stages and delivery schedule here.</p><Link className="btn" href="/orders">View orders</Link></div> : <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs border-line">
            <thead>
              <tr className="border-b border-line bg-surface text-muted uppercase tracking-wider font-semibold">
                <th className="py-3 px-4">Task ID</th>
                <th className="py-3 px-4">Path Type</th>
                <th className="py-3 px-4">Earliest Start</th>
                <th className="py-3 px-4">Expected finish</th>
                <th className="py-3 px-4">Slack</th>
                <th className="py-3 px-4">Material Wait</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-ink">
              {schedule.scheduledTasks.map((task) => (
                <tr
                  key={task.taskId}
                  className={`hover:bg-surface transition-colors ${
                    task.isCriticalPath ? 'bg-warning-soft' : ''
                  }`}
                >
                  <td className="py-3 px-4 font-mono font-medium text-ink">
                    <Link
                      href={`/planning/tasks/${task.taskId}`}
                      className="hover:text-primary underline underline-offset-2 decoration-line hover:decoration-sky-400 transition"
                    >
                      {task.taskId.slice(0, 12)}...
                    </Link>
                  </td>
                  <td className="py-3 px-4">
                    {task.isCriticalPath ? (
                      <Badge variant="warning">CRITICAL PATH</Badge>
                    ) : (
                      <Badge variant="default">Flexible</Badge>
                    )}
                  </td>
                  <td className="py-3 px-4 text-ink">
                    {new Date(task.startAt).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="py-3 px-4 text-ink">
                    {new Date(task.endAt).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="py-3 px-4">
                    {task.slackMinutes === 0 ? (
                      <span className="text-warning font-mono font-semibold">0m</span>
                    ) : (
                      <span className="text-muted font-mono">
                        {Math.floor(task.slackMinutes / 60)}h {task.slackMinutes % 60}m
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {task.materialWaitMinutes > 0 ? (
                      <span className="text-danger font-semibold font-mono">
                        +{Math.floor(task.materialWaitMinutes / 60)}h wait
                      </span>
                    ) : (
                      <span className="text-success font-medium">Ready</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <PermissionGate permission={['task.assign', 'planning.write', 'resource.manage']}><Button size="small" onClick={() => { setAssignError(null); setSelectedTaskId(task.taskId); setSelectedTaskVersion(task.version); }}>Assign resources</Button></PermissionGate>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>}
      </div>

      <Pagination {...pagination} />

      {/* Resource Assignment Modal */}
      {selectedTaskId && (
        <Dialog isOpen onClose={() => { setSelectedTaskId(null); setSelectedTaskVersion(null); }} title="Assign resources" size="md" pending={assignMutation.isPending}>
          
            

            <form onSubmit={handleAssignSubmit} className="space-y-4">
              {/* Readiness summary */}
              {isReadinessLoading ? (
                <div className="p-3 bg-surface border border-line rounded text-xs text-muted">
                  Checking stage predecessors & inventory readiness...
                </div>
              ) : readiness ? (
                <div className="p-3 bg-surface-muted border border-line rounded space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted uppercase tracking-wider">Dispatch Readiness</span>
                    <Badge variant={readiness.readinessStatus === "READY" ? "success" : readiness.readinessStatus === "WAITING_PREDECESSOR" ? "warning" : readiness.readinessStatus === "BLOCKED_MATERIAL" ? "danger" : "blue"}>
                      {readiness.readinessStatus}
                    </Badge>
                  </div>
                  {readiness.uncompletedPredecessors.length > 0 && (
                    <div className="text-xs text-warning">
                      <strong>Uncompleted Predecessors:</strong> {readiness.uncompletedPredecessors.map(p => p.nodeKey + " (" + p.status + ")").join(", ")}
                    </div>
                  )}
                  {readiness.uncoveredDemands.length > 0 && (
                    <div className="text-xs text-danger">
                      <strong>Unallocated Materials:</strong> {readiness.uncoveredDemands.length} required item demand(s) lack allocated warehouse inventory.
                    </div>
                  )}
                </div>
              ) : null}

              <div>
                <label className="block text-xs font-medium text-muted mb-1">
                  Task ID
                
                <Input
                  type="text"
                  disabled
                  value={selectedTaskId}
                  className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-muted font-mono"
                /></label>
              </div>

              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  Technician
                
                <Select value={technicianId} onChange={e => setTechnicianId(e.target.value)} disabled={techniciansQuery.isPending || !!techniciansQuery.error}><option value="">No technician assigned</option>{techniciansQuery.data?.data.map(resource => <option key={resource.id} value={resource.id}>{resource.name}</option>)}</Select></label>
              </div>

              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  Machine
                
                <Select value={machineId} onChange={e => setMachineId(e.target.value)} disabled={machinesQuery.isPending || !!machinesQuery.error}><option value="">No machine assigned</option>{machinesQuery.data?.data.map(resource => <option key={resource.id} value={resource.id}>{resource.name}</option>)}</Select></label>
              </div>

              {/* Qualification Evaluation Feedback */}
              {evaluation && (
                <div className="space-y-2">
                  {evaluation.isEligible ? (
                    <div className="p-2.5 bg-success-soft border border-line rounded text-xs text-success flex items-center gap-2">
                      <Icon name="check" className="w-4 h-4 flex-shrink-0" />
                      <span>Technician is fully certified and machine capability matches stage specification.</span>
                    </div>
                  ) : (
                    <div className="p-2.5 bg-danger-soft border border-line rounded text-xs text-danger space-y-1">
                      <div className="font-semibold flex items-center gap-1.5">
                        <Icon name="alert" className="w-4 h-4 flex-shrink-0" />
                        <span>Resource Allocation Violations:</span>
                      </div>
                      <ul className="list-disc list-inside space-y-0.5">
                        {evaluation.violations.map((v, i) => (
                          <li key={i}>{v}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {evaluation.warnings && evaluation.warnings.length > 0 && (
                    <div className="p-2.5 bg-warning-soft border border-line rounded text-xs text-warning space-y-1">
                      <div className="font-semibold">Schedule Advisory:</div>
                      <ul className="list-disc list-inside space-y-0.5">
                        {evaluation.warnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {assignError && (
                <div className="p-3 bg-danger-soft border border-line rounded text-xs text-danger whitespace-pre-wrap">
                  {assignError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-line">
                <button
                  type="button"
                  onClick={() => { setSelectedTaskId(null); setSelectedTaskVersion(null); }}
                  className="px-4 py-2 bg-surface hover:bg-surface-muted text-ink text-xs rounded transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assignMutation.isPending}
                  className="btn primary"
                >
                  {assignMutation.isPending ? 'Verifying & Assigning...' : 'Confirm Assignment'}
                </button>
              </div>
            </form>
          
        </Dialog>
      )}
    </div>
  );
}
