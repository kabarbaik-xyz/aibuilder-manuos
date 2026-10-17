'use client';
import { useListSearch, usePaginatedList } from '@/lib/api/use-paginated-list';
import { Pagination } from '@/components/ui/pagination';
import { ListSearch } from '@/components/ui/list-search';
import type { ScheduledTaskRow } from '../schedule-presentation';
import { ScheduleGantt, ScheduleCalendar } from './ScheduleVisualizations';
import { Tabs } from '@/components/ui/tabs';
import './planning-workspace.css';

import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { PermissionGate } from '@/components/ui/permission-gate';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import React, { useState } from 'react';
import { useTechnicians, useMachines } from '@/features/masters/hooks';
import { useAssignTask, useTaskReadiness, useEvaluateAssignment, usePublishedSchedules, usePublishSchedule, useRequestOvertime } from '../hooks';
import { Textarea } from '@/components/ui/textarea';
import type { AssignmentEvaluationResult } from '@/server/modules/planning/contracts';
import { Icon } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api/client';
import type { TechnicianRecommendationReportDTO } from '@/server/modules/planning/recommendations';
import { ScheduleProposalWorkbench } from './ScheduleProposalWorkbench';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState, LoadingState } from '@/components/ui/resource-state';
import { ButtonLink } from '@/components/ui/button-link';
import { toPublishedScheduleRange } from '../schedule-date-range';

const slotFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const formatSlot = (value: string) => slotFormatter.format(new Date(value));

export function PlanningScheduleView() {
  const { search, setSearch, query } = useListSearch();
  const [view, setView] = useState<'gantt' | 'calendar' | 'list'>('gantt');
  const { data: pageData, isLoading, error, refetch, pagination } = usePaginatedList<ScheduledTaskRow, { makespanMinutes: number; projectedEndAt: string; criticalPathCount: number; scheduledTaskCount: number }>('planning', { search: query || undefined });
  const schedule = pageData?.summary ? { ...pageData.summary, scheduledTasks: pageData.data } : undefined;
  const assignMutation = useAssignTask();
  const techniciansQuery = useTechnicians();
  const machinesQuery = useMachines();

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTaskVersion, setSelectedTaskVersion] = useState<number | null>(null);
  const selectedScheduledTask = schedule?.scheduledTasks.find(task => task.taskId === selectedTaskId);
  const recommendations = useQuery({
    queryKey: ['planning', 'technician-recommendations', selectedTaskId, selectedScheduledTask?.startAt, selectedScheduledTask?.endAt],
    enabled: Boolean(selectedTaskId && selectedScheduledTask),
    queryFn: () => apiRequest<{ data: TechnicianRecommendationReportDTO }>('/api/planning/technician-recommendations', {
      method: 'POST',
      body: JSON.stringify({ taskId: selectedTaskId, slotStart: selectedScheduledTask!.startAt, slotEnd: selectedScheduledTask!.endAt }),
    }).then(response => response.data),
  });
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

  const requestOtMutation = useRequestOvertime();
  const [showOtModal, setShowOtModal] = useState(false);
  const [otTechId, setOtTechId] = useState("");
  const [otDate, setOtDate] = useState(new Date().toISOString().slice(0, 10));
  const [otStartTime, setOtStartTime] = useState("17:00");
  const [otEndTime, setOtEndTime] = useState("21:00");
  const [otReason, setOtReason] = useState("");
  const [otError, setOtError] = useState<string | null>(null);

  const handlePublishSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setPublishError(null);
      const period = toPublishedScheduleRange(publishPeriodStart, publishPeriodEnd);
      await publishMutation.mutateAsync({
        title: publishTitle.trim(),
        ...period,
      });
      setShowPublishModal(false);
      refetchPublished();
    } catch (err: any) {
      setPublishError(err?.message || "Failed to publish schedule revision");
    }
  };

  const handleOtSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otTechId) {
      setOtError("Please select a technician");
      return;
    }
    const startAt = new Date(`${otDate}T${otStartTime}:00.000Z`).toISOString();
    const endAt = new Date(`${otDate}T${otEndTime}:00.000Z`).toISOString();
    const diffHours = (new Date(endAt).getTime() - new Date(startAt).getTime()) / (1000 * 60 * 60);
    if (diffHours <= 0) {
      setOtError("End time must be after start time");
      return;
    }
    if (diffHours > 8) {
      setOtError(`Overtime request exceeds statutory daily maximum of 8 hours (requested: ${diffHours.toFixed(1)}h)`);
      return;
    }
    try {
      setOtError(null);
      await requestOtMutation.mutateAsync({
        technicianId: otTechId,
        startAt,
        endAt,
        reason: otReason.trim(),
      });
      setShowOtModal(false);
      setOtReason("");
      refetch();
    } catch (err: any) {
      setOtError(err?.message || "Failed to submit overtime request");
    }
  };

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
      scheduledStartAt: selectedScheduledTask?.startAt,
      scheduledEndAt: selectedScheduledTask?.endAt,
    }).then(res => setEvaluation(res)).catch(() => setEvaluation(null));
  }, [selectedTaskId, technicianId, machineId, selectedScheduledTask?.startAt, selectedScheduledTask?.endAt]);

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
        startAt: selectedScheduledTask?.startAt,
        endAt: selectedScheduledTask?.endAt,
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

  const openAssignment = (task: ScheduledTaskRow) => {
    setAssignError(null);
    setSelectedTaskId(task.taskId);
    setSelectedTaskVersion(task.version);
  };

  return (
    <div className="page-stack planning-workspace">
      <PageHeader title="Planning" description="Sequence production work, inspect critical paths, and coordinate resource assignments." actions={
        <div className="flex items-center gap-2">
          <Button onClick={() => refetch()} icon="reset">
            Recalculate
          </Button>
          <PermissionGate permission={["planning.write", "resource.manage"]}>
            <Button
              onClick={() => {
                setOtError(null);
                setOtReason("");
                setOtTechId(techniciansQuery.data?.data?.[0]?.id || "");
                setShowOtModal(true);
              }}
            >
              Request Overtime
            </Button>
          </PermissionGate>
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
      {isLoading ? (
        <LoadingState message="Calculating production schedule…" />
      ) : error || !schedule ? (
        <ErrorState
          title="Unable to load production schedule"
          message={error?.message || 'Please try again. Your changes have not been submitted.'}
          onRetry={() => refetch()}
        />
      ) : (
        <>
      <div className="ps-estimate-banner" role="note" aria-label="Schedule estimate limitations">
        <span className="ps-estimate-symbol"><Icon name="graph" /></span>
        <div className="ps-estimate-copy"><div><strong>Dependency sequence preview</strong><Badge variant="warning">Estimate only</Badge></div>
          <p>Explore timing and critical work. Validate resource capacity before dispatch.</p>
          <details><summary>About these dates</summary><p>This sequence uses dependencies and the default calendar. It does not validate finite resource capacity, full-slot qualifications, published shifts and leave, confirmed bookings, or BOM-specific material readiness. These dates are not a delivery promise or a capacity-validated schedule. Use a schedule proposal and assignment checks to review feasibility.</p></details>
        </div>
        <Link href="/ai/promise" className="btn soft">Check delivery date</Link><ScheduleProposalWorkbench />
      </div>
      <div className="planning-metrics">
        <div className="planning-metric">
          <span className="text-xs font-semibold text-muted tracking-wider uppercase">Sequence duration</span>
          <div className="text-2xl font-bold text-ink mt-1 tabular-nums">
            {Math.floor(schedule.makespanMinutes / 60)}h {schedule.makespanMinutes % 60}m
          </div>
          <p className="text-xs text-muted mt-1">Dependency-based calendar estimate</p>
        </div>

        <div className="planning-metric">
          <span className="text-xs font-semibold text-muted tracking-wider uppercase">Sequence finish</span>
          <div className="text-2xl font-bold text-ink mt-1 tabular-nums truncate">
            {schedule.scheduledTaskCount > 0 && schedule.projectedEndAt ? formatSlot(schedule.projectedEndAt) : 'Not scheduled'}
          </div>
          <p className="text-xs text-muted mt-1">Uses the current default calendar</p>
        </div>

        <div className="planning-metric">
          <span className="text-xs font-semibold text-muted tracking-wider uppercase">Critical path</span>
          <div className="text-2xl font-bold text-ink mt-1 tabular-nums">
            {schedule.criticalPathCount} Tasks
          </div>
          <p className="text-xs text-muted mt-1">Zero slack activities</p>
        </div>

        <div className="planning-metric">
          <span className="text-xs font-semibold text-muted tracking-wider uppercase">Scheduled tasks</span>
          <div className="text-2xl font-bold text-ink mt-1 tabular-nums">
            {schedule.scheduledTaskCount}
          </div>
          <p className="text-xs text-muted mt-1">Sequenced in routing network</p>
        </div>
      </div>

      {/* Schedule Table */}
      <div className="ps-view-toolbar">
        <ListSearch value={search} onChange={setSearch} placeholder="Search order, item or operation…" label="Search production schedule" />
        <Tabs variant="segmented" activeId={view} onChange={setView} ariaLabel="Production schedule view" items={[{ id: 'gantt', label: 'Gantt', icon: 'chart' }, { id: 'calendar', label: 'Calendar', icon: 'calendar' }, { id: 'list', label: 'List', icon: 'order' }]} />
      </div>
      <div className="ps-schedule-panel" role="tabpanel" aria-label={`${view} production schedule`}>
        <div className="ps-schedule-heading">
          <div><h2>{view === 'gantt' ? 'Production timeline' : view === 'calendar' ? 'Production calendar' : 'Production task list'}</h2>
          <p>{schedule.scheduledTasks.length} of {pageData?.pagination.total || 0} matching tasks · current results page · {Intl.DateTimeFormat().resolvedOptions().timeZone}</p></div>
          <div className="ps-legend"><span><i className="is-flexible" />Flexible</span><span><i className="is-critical" />Critical path</span><span><i className="has-wait" />Material wait</span></div>
        </div>

        {schedule.scheduledTasks.length === 0 ? <EmptyState icon="calendar" title="No production work scheduled" description="Release an order with an approved workflow to see its stages and delivery schedule here." action={<ButtonLink href="/orders">View orders</ButtonLink>} /> : view === 'gantt' ? <ScheduleGantt tasks={schedule.scheduledTasks} onAssign={openAssignment} /> : view === 'calendar' ? <ScheduleCalendar key={`${pagination.page}-${pagination.pageSize}-${query}`} tasks={schedule.scheduledTasks} onAssign={openAssignment} /> : <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-line">
                <th className="py-3 px-4">Operation</th>
                <th className="py-3 px-4">Order</th>
                <th className="py-3 px-4">Path</th>
                <th className="py-3 px-4">Earliest start</th>
                <th className="py-3 px-4">Expected finish</th>
                <th className="py-3 px-4">Slack</th>
                <th className="py-3 px-4">Material wait</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-ink">
              {schedule.scheduledTasks.map((task) => (
                <tr
                  key={task.taskId}
                  className={`transition-colors hover:bg-surface-muted/50 ${
                    task.isCriticalPath ? 'bg-warning-soft' : ''
                  }`}
                >
                  <td className="py-3 px-4">
                    <Link
                      href={`/planning/tasks/${task.taskId}`}
                      className="text-primary font-semibold hover:underline"
                    >
                      {task.nodeName || task.nodeKey || `${task.taskId.slice(0, 12)}…`}
                    </Link>
                    {task.nodeName && task.nodeKey && task.nodeKey !== task.nodeName && (
                      <div className="font-mono text-xs text-muted mt-0.5">{task.nodeKey}</div>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-medium text-ink">{task.orderNumber || '—'}</div>
                    {task.itemName && <div className="text-xs text-muted mt-0.5">{task.itemName}</div>}
                  </td>
                  <td className="py-3 px-4">
                    {task.isCriticalPath ? (
                      <Badge variant="warning">Critical path</Badge>
                    ) : (
                      <Badge variant="default">Flexible</Badge>
                    )}
                  </td>
                  <td className="py-3 px-4 tabular-nums">
                    {formatSlot(task.startAt)}
                  </td>
                  <td className="py-3 px-4 tabular-nums">
                    {formatSlot(task.endAt)}
                  </td>
                  <td className="py-3 px-4">
                    {task.slackMinutes === 0 ? (
                      <span className="text-warning font-mono font-semibold">0m</span>
                    ) : (
                      <span className="text-muted font-mono tabular-nums">
                        {Math.floor(task.slackMinutes / 60)}h {task.slackMinutes % 60}m
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {task.materialWaitMinutes > 0 ? (
                      <span className="text-danger font-semibold font-mono tabular-nums">
                        +{Math.floor(task.materialWaitMinutes / 60)}h wait
                      </span>
                    ) : (
                      <span className="text-muted">No estimated wait</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <PermissionGate permission={['task.assign', 'planning.write', 'resource.manage']}><Button size="small" onClick={() => openAssignment(task)}>Assign resources</Button></PermissionGate>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>}
      </div>

      <Pagination {...pagination} />
        </>
      )}

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

              <label className="block text-xs font-medium text-ink mb-1">
                Task ID
                <Input
                  type="text"
                  disabled
                  value={selectedTaskId}
                  className="mt-1 font-mono text-muted"
                />
              </label>

              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  Technician
                
                <Select value={technicianId} onChange={e => setTechnicianId(e.target.value)} disabled={techniciansQuery.isPending || !!techniciansQuery.error}><option value="">No technician assigned</option>{techniciansQuery.data?.data.map(resource => <option key={resource.id} value={resource.id}>{resource.name}</option>)}</Select></label>
              </div>

              <div className="rounded-lg border border-line bg-surface-muted p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-ink">Qualified technician suggestions</p>
                    <p className="small muted">For the task's scheduled window. Confirm revalidates that same slot.</p>
                  </div>
                  {recommendations.isFetching && <span className="small muted">Checking…</span>}
                </div>
                {recommendations.isError ? (
                  <p className="small mt-2 text-danger" role="alert">Suggestions unavailable: {recommendations.error.message}</p>
                ) : recommendations.data ? (
                  recommendations.data.eligibleCount === 0 ? (
                    <p className="small mt-2 text-warning">{recommendations.data.qualifiedCapacityGap}</p>
                  ) : (
                    <ul className="mt-2 grid gap-2">
                      {recommendations.data.candidates.filter(candidate => candidate.isEligible).slice(0, 3).map(candidate => (
                        <li key={candidate.technicianId} className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
                          <div><strong className="text-sm">{candidate.name}</strong><p className="small muted">{candidate.rationale}</p></div>
                          <Button type="button" variant="soft" size="small" onClick={() => setTechnicianId(candidate.technicianId)}>
                            {technicianId === candidate.technicianId ? 'Selected' : 'Use suggestion'}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )
                ) : null}
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

              <div className="dialog-actions">
                <Button
                  type="button"
                  onClick={() => { setSelectedTaskId(null); setSelectedTaskVersion(null); }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={assignMutation.isPending}
                >
                  {assignMutation.isPending ? 'Verifying & assigning...' : 'Confirm assignment'}
                </Button>
              </div>
            </form>
          
        </Dialog>
      )}
    
      {/* Publish Schedule Modal (SCH-06) */}
      {showPublishModal && (
        <Dialog
          isOpen
          onClose={() => { setShowPublishModal(false); setPublishError(null); }}
          title="Publish Master Production Schedule (SCH-06)"
          size="md"
          pending={publishMutation.isPending}
        >
          <form onSubmit={handlePublishSubmit} className="space-y-4">
            <p className="text-xs text-muted">
              Publishes a versioned snapshot of confirmed resource bookings in this date range. This records the operational schedule for review; it does not create bookings or change customer delivery commitments.
            </p>
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Schedule Revision Title</label>
              <Input
                type="text"
                required
                value={publishTitle}
                onChange={(e) => setPublishTitle(e.target.value)}
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink mb-1">Period Start</label>
                <Input
                  type="date"
                  required
                  value={publishPeriodStart}
                  onChange={(e) => setPublishPeriodStart(e.target.value)}
                  className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink mb-1">Period End</label>
                <Input
                  type="date"
                  required
                  value={publishPeriodEnd}
                  onChange={(e) => setPublishPeriodEnd(e.target.value)}
                  className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
                />
              </div>
            </div>
            {publishError && (
              <div className="p-2.5 bg-danger-soft border border-line rounded text-xs text-danger">
                {publishError}
              </div>
            )}
            <div className="dialog-actions">
              <Button type="button" onClick={() => setShowPublishModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={publishMutation.isPending}>
                {publishMutation.isPending ? "Publishing Schedule..." : "Publish Authoritative Schedule"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}

      {/* Request Overtime Modal (RES-09) */}
      {showOtModal && (
        <Dialog
          isOpen
          onClose={() => { setShowOtModal(false); setOtError(null); }}
          title="Request Technician Overtime Shift (RES-09)"
          size="md"
          pending={requestOtMutation.isPending}
        >
          <form onSubmit={handleOtSubmit} className="space-y-4">
            <p className="text-xs text-muted">
              Overtime intervals expand qualified capacity only after approval. Requests exceeding the statutory daily limit (8 hours per shift) will be rejected.
            </p>
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Technician</label>
              <Select
                value={otTechId}
                onChange={(e) => setOtTechId(e.target.value)}
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
              >
                <option value="">Select technician...</option>
                {techniciansQuery.data?.data.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} ({t.code})</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Shift Date</label>
              <Input
                type="date"
                required
                value={otDate}
                onChange={(e) => setOtDate(e.target.value)}
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink mb-1">Start Time</label>
                <Input
                  type="time"
                  required
                  value={otStartTime}
                  onChange={(e) => setOtStartTime(e.target.value)}
                  className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink mb-1">End Time</label>
                <Input
                  type="time"
                  required
                  value={otEndTime}
                  onChange={(e) => setOtEndTime(e.target.value)}
                  className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Business Reason & Operational Need</label>
              <Textarea
                required
                rows={2}
                value={otReason}
                onChange={(e) => setOtReason(e.target.value)}
                placeholder="e.g. Critical aerospace lot CNC milling expedited to meet promise date..."
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
              />
            </div>
            {otError && (
              <div className="p-2.5 bg-danger-soft border border-line rounded text-xs text-danger">
                {otError}
              </div>
            )}
            <div className="dialog-actions">
              <Button type="button" onClick={() => setShowOtModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={requestOtMutation.isPending || !otTechId || !otReason.trim()}>
                {requestOtMutation.isPending ? "Submitting Request..." : "Submit Overtime Request"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}

    </div>
  );
}
