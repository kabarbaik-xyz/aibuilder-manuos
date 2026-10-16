'use client';

import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import React, { useState, useEffect } from 'react';
import {
  useTaskExecutionDetail,
  useStartTask,
  usePauseTask,
  useResumeTask,
  useRecordTaskOutput,
  useTaskIssues,
  useCreateTaskIssue,
  useResolveTaskIssue,
  useReopenTaskIssue,
  useScanBarcode,
} from '../hooks';
import { Icon } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { formatQuantity, parseQuantity } from '@/domain/quantity';
import { mastersApi, Location } from '@/features/masters/api';

export interface ShopFloorWorkstationViewProps {
  taskId: string;
}

export function ShopFloorWorkstationView({ taskId }: ShopFloorWorkstationViewProps) {
  const { data: task, isLoading, error, refetch } = useTaskExecutionDetail(taskId);

  const startMutation = useStartTask();
  const pauseMutation = usePauseTask();
  const resumeMutation = useResumeTask();
  const recordOutputMutation = useRecordTaskOutput();

  const [showPauseModal, setShowPauseModal] = useState(false);
  const [pauseReason, setPauseReason] = useState('BREAK');
  const [pauseNotes, setPauseNotes] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  // Issues & Blocker management
  const { data: issues, refetch: refetchIssues } = useTaskIssues(taskId);
  const createIssueMutation = useCreateTaskIssue();
  const resolveIssueMutation = useResolveTaskIssue(taskId);
  const reopenIssueMutation = useReopenTaskIssue(taskId);
  const scanMutation = useScanBarcode();

  const [showIssueModal, setShowIssueModal] = useState(false);
  const [issueTitle, setIssueTitle] = useState("");
  const [issueSeverity, setIssueSeverity] = useState<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL">("HIGH");
  const [issueDescription, setIssueDescription] = useState("");

  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolvingIssueId, setResolvingIssueId] = useState<string | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");

  const [showScanModal, setShowScanModal] = useState(false);
  const [scanCode, setScanCode] = useState("");
  const [scanResult, setScanResult] = useState<any>(null);

  const openIssues = issues || [];
  const blockingIssues = openIssues.filter(
    (i) => (i.status === "OPEN" || i.status === "REOPENED") && (i.severity === "CRITICAL" || i.severity === "HIGH")
  );
  const isExecutionBlocked = blockingIssues.length > 0;

  // Production Output Modal state
  const [showOutputModal, setShowOutputModal] = useState(false);
  const [outputQty, setOutputQty] = useState('');
  const [destLocationId, setDestLocationId] = useState('');
  const [lotNumber, setLotNumber] = useState('');
  const [isFinal, setIsFinal] = useState(true);
  const [outputNotes, setOutputNotes] = useState('');
  const [locations, setLocations] = useState<Location[]>([]);

  useEffect(() => {
    mastersApi.getLocations().then((res: any) => {
      setLocations(res.data);
      const defaultLoc = res.data.find(
        (l: any) => l.type === 'QUARANTINE' || l.type === 'FINISHED_GOODS'
      );
      if (defaultLoc) setDestLocationId(defaultLoc.id);
    });
  }, []);

  // Live timer tick derived from server session start timestamp
  const [secondsOffset, setSecondsOffset] = useState(0);

  const isRunning = task?.status === 'RUNNING';
  const isPaused = task?.status === 'PAUSED';

  useEffect(() => {
    if (!isRunning || !task?.activeSession?.startedAt) {
      setSecondsOffset(0);
      return;
    }

    const sessionStart = new Date(task.activeSession.startedAt).getTime();
    const interval = setInterval(() => {
      const now = Date.now();
      const diffSec = Math.max(0, Math.floor((now - sessionStart) / 1000));
      setSecondsOffset(diffSec);
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, task?.activeSession?.startedAt]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-muted">
        <Icon name="clock" className="w-10 h-10 animate-spin mb-4 text-primary" />
        <p className="text-sm">Loading workstation telemetry & material custody...</p>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="p-8 text-center bg-danger-soft border border-line rounded-xl my-6">
        <p className="text-danger font-medium mb-2">Unable to load workstation task</p>
        <p className="text-xs text-muted mb-4">{error?.message || 'Task not found'}</p>
        <Link
          href="/shop-floor"
          className="px-4 py-2 bg-surface hover:bg-surface-muted text-ink text-xs rounded-lg transition"
        >
          Return to Shop Floor Tasks
        </Link>
      </div>
    );
  }

  
  const handleReportIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    try {
      await createIssueMutation.mutateAsync({
        taskId: task.id,
        input: {
          title: issueTitle.trim(),
          severity: issueSeverity,
          description: issueDescription.trim() || undefined,
        },
      });
      setShowIssueModal(false);
      setIssueTitle("");
      setIssueDescription("");
      refetchIssues();
    } catch (err: any) {
      setActionError(err.message || "Failed to report issue");
    }
  };

  const handleResolveIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvingIssueId) return;
    setActionError(null);
    try {
      await resolveIssueMutation.mutateAsync({
        issueId: resolvingIssueId,
        notes: resolutionNotes.trim() || undefined,
      });
      setShowResolveModal(false);
      setResolvingIssueId(null);
      setResolutionNotes("");
      refetchIssues();
    } catch (err: any) {
      setActionError(err.message || "Failed to resolve issue");
    }
  };

  const handleReopenIssue = async (issueId: string) => {
    setActionError(null);
    try {
      await reopenIssueMutation.mutateAsync({
        issueId,
        notes: "Reopened from workstation terminal",
      });
      refetchIssues();
    } catch (err: any) {
      setActionError(err.message || "Failed to reopen issue");
    }
  };

  const handleScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanCode.trim()) return;
    try {
      const res = await scanMutation.mutateAsync(scanCode.trim());
      setScanResult(res);
    } catch (err: any) {
      setScanResult({ valid: false, error: err.message || "Scan verification failed" });
    }
  };

  const handleStart = async () => {
    setActionError(null);
    try {
      await startMutation.mutateAsync({ taskId: task.id });
      refetch();
    } catch (err: any) {
      setActionError(err.message || 'Failed to start task');
    }
  };

  const handlePauseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    try {
      await pauseMutation.mutateAsync({
        taskId: task.id,
        reason: pauseReason,
        notes: pauseNotes,
      });
      setShowPauseModal(false);
      setPauseNotes('');
      refetch();
    } catch (err: any) {
      setActionError(err.message || 'Failed to pause task');
    }
  };

  const handleResume = async () => {
    setActionError(null);
    try {
      await resumeMutation.mutateAsync({ taskId: task.id });
      refetch();
    } catch (err: any) {
      setActionError(err.message || 'Failed to resume task');
    }
  };

  const handleOutputSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    try {
      const atoms = parseQuantity(outputQty, 0);
      await recordOutputMutation.mutateAsync({
        taskId: task.id,
        outputAtoms: atoms,
        destinationLocationId: destLocationId,
        lotNumber: lotNumber.trim() || undefined,
        isFinal,
        notes: outputNotes.trim() || undefined,
      });
      setShowOutputModal(false);
      setOutputNotes('');
      refetch();
    } catch (err: any) {
      setActionError(err.message || 'Failed to record output');
    }
  };

  // Calculate live formatted duration
  const baseMinutes = task.actualDurationMinutes;
  const totalSeconds = baseMinutes * 60 + (isRunning ? secondsOffset : 0);
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  const formattedLiveTimer = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  return (
    <div className="space-y-6">
      {/* Workstation Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-surface border border-line p-6 rounded-2xl">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link
              href="/shop-floor"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              ← Back to My Tasks
            </Link>
            <span className="text-muted">·</span>
            <span className="px-2 py-0.5 text-xs font-mono font-bold bg-surface text-ink rounded">
              {task.nodeKey}
            </span>
            {isRunning ? (
              <Badge variant="blue">RUNNING LIVE</Badge>
            ) : isPaused ? (
              <Badge variant="warning">PAUSED</Badge>
            ) : (
              <Badge variant="default">{task.status}</Badge>
            )}
          </div>
          <h1 className="text-2xl font-bold text-ink">{task.nodeName}</h1>
          <p className="text-xs text-muted mt-1">
            Order <strong className="text-ink">{task.order.orderNumber}</strong> · Customer:{' '}
            <strong className="text-ink">{task.order.customerName}</strong> · Instruction Rev:{' '}
            <strong className="text-ink">v{task.instructionRevision}</strong>
          </p>
        </div>

        {/* Live Telemetry Display */}
        <div className="flex items-center gap-6 bg-surface border border-line p-4 rounded-xl">
          <div>
            <div className="text-xs font-medium text-muted uppercase tracking-wider">
              Elapsed Time
            </div>
            <div
              className={`text-2xl font-mono font-bold tracking-tight mt-0.5 ${
                isRunning ? 'text-success' : 'text-ink'
              }`}
            >
              {formattedLiveTimer}
            </div>
            <div className="text-xs text-muted">
              Target: {task.plannedDurationMinutes}m
            </div>
          </div>

          <div className="h-10 w-px bg-surface" />

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <Button
              onClick={() => { setScanResult(null); setScanCode(""); setShowScanModal(true); }}
              icon="search"
            >
              Scan Barcode
            </Button>
            <Button
              onClick={() => setShowIssueModal(true)}
              icon="alert"
            >
              Report Issue
            </Button>
            {(task.status === "READY" || task.status === "ASSIGNED") && (
              <Button
                variant="primary"
                onClick={handleStart}
                disabled={startMutation.isPending || isExecutionBlocked}
                icon="bolt"
              >
                {startMutation.isPending ? "Starting..." : isExecutionBlocked ? "Blocked by Issue" : "Start Operation"}
              </Button>
            )}

            {isRunning && (
              <>
                <Button
                  onClick={() => setShowPauseModal(true)}
                  disabled={pauseMutation.isPending}
                  icon="clock"
                >
                  Pause Work
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    setOutputQty(formatQuantity(BigInt(task.order.targetAtoms)));
                    setShowOutputModal(true);
                  }}
                  disabled={recordOutputMutation.isPending}
                  icon="check"
                >
                  Record Output
                </Button>
              </>
            )}

            {isPaused && (
              <Button
                variant="primary"
                onClick={handleResume}
                disabled={resumeMutation.isPending}
                icon="reset"
              >
                {resumeMutation.isPending ? 'Resuming...' : 'Resume Operation'}
              </Button>
            )}
          </div>
        </div>
      </div>

      {isExecutionBlocked && (
        <div className="p-4 bg-danger-soft border border-line rounded-xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Icon name="alert" className="w-5 h-5 text-danger flex-shrink-0" />
            <div>
              <div className="text-xs font-bold text-danger uppercase tracking-wide">
                Workstation Execution Blocked ({blockingIssues.length} active issue{blockingIssues.length > 1 ? "s" : ""})
              </div>
              <p className="text-xs text-ink mt-0.5">
                {blockingIssues[0]?.title} — Critical/high severity issues must be resolved before starting this operation.
              </p>
            </div>
          </div>
          <Button size="small" onClick={() => setShowIssueModal(true)}>
            View / Add Notes
          </Button>
        </div>
      )}

      {actionError && (
        <div className="p-4 bg-danger-soft border border-line rounded-xl text-xs text-danger">
          <strong>Action Blocked:</strong> {actionError}
        </div>
      )}

      {/* Main Grid: Materials, Predecessors & Instructions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Material Readiness & Predecessor Guard */}
        <div className="lg:col-span-2 space-y-6">
          {/* Material Readiness Guard */}
          <div className="bg-surface border border-line rounded-xl p-5">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-sm font-semibold text-ink">
                  Material Custody & Allocation
                </h3>
                <p className="text-xs text-muted">
                  Live verification of shop-floor WIP vs raw warehouse balances
                </p>
              </div>
              {task.materialReadiness.isFullyIssued ? (
                <Badge variant="blue">ALL MATERIALS IN WIP</Badge>
              ) : task.materialReadiness.isFullyAllocated ? (
                <Badge variant="blue">RESERVED IN WAREHOUSE</Badge>
              ) : (
                <Badge variant="warning">WAITING ISSUE</Badge>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse border-line">
                <thead>
                  <tr className="border-b border-line text-muted font-semibold uppercase tracking-wider">
                    <th className="py-2.5 px-3">Item</th>
                    <th className="py-2.5 px-3">Required</th>
                    <th className="py-2.5 px-3">WIP Issued</th>
                    <th className="py-2.5 px-3">Warehouse Stock</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line text-ink">
                  {task.materialReadiness.demands.map((demand) => (
                    <tr key={demand.demandId}>
                      <td className="py-2.5 px-3 font-medium text-ink">
                        {demand.itemCode}
                        <span className="block text-xs text-muted font-normal">
                          {demand.itemName}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-medium">
                        {formatQuantity(demand.requiredAtoms)}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-success font-semibold">
                        {formatQuantity(demand.issuedAtoms)}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-muted">
                        {formatQuantity(demand.availableInWarehouseAtoms)}
                      </td>
                      <td className="py-2.5 px-3">
                        {demand.issuedAtoms >= demand.requiredAtoms ? (
                          <span className="text-success font-medium">✓ Ready in WIP</span>
                        ) : demand.reservedAtoms >= demand.requiredAtoms ? (
                          <span className="text-primary font-medium">Reserved</span>
                        ) : (
                          <span className="text-warning font-medium">Shortage</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Predecessor Tasks Guard */}
          <div className="bg-surface border border-line rounded-xl p-5">
            <h3 className="text-sm font-semibold text-ink mb-1">
              Predecessor Operations Guard
            </h3>
            <p className="text-xs text-muted mb-4">
              All predecessor tasks must be marked COMPLETED before operation starts.
            </p>

            {task.predecessors.length === 0 ? (
              <p className="text-xs text-success">
                ✓ Root task: No predecessor dependencies required.
              </p>
            ) : (
              <div className="space-y-2">
                {task.predecessors.map((p) => (
                  <div
                    key={p.taskId}
                    className="flex justify-between items-center p-3 rounded-lg bg-surface border border-line text-xs"
                  >
                    <span className="font-mono font-bold text-ink">
                      {p.nodeKey}
                    </span>
                    {p.isCompleted ? (
                      <span className="text-success font-medium flex items-center gap-1">
                        ✓ Completed
                      </span>
                    ) : (
                      <span className="text-warning font-medium flex items-center gap-1">
                        ⏳ Incomplete ({p.status})
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Work Sessions Telemetry & History */}
        <div className="space-y-6">
          <div className="bg-surface border border-line rounded-xl p-5">
            <h3 className="text-sm font-semibold text-ink mb-1">
              Work Sessions Log
            </h3>
            <p className="text-xs text-muted mb-4">
              Immutable server records of start, pause, and resume events
            </p>

            {task.sessions.length === 0 ? (
              <p className="text-xs text-muted">No work sessions started yet.</p>
            ) : (
              <div className="space-y-3">
                {task.sessions.map((sess) => (
                  <div
                    key={sess.id}
                    className="p-3 bg-surface border border-line rounded-lg text-xs space-y-1"
                  >
                    <div className="flex justify-between items-center">
                      <span
                        className={`font-semibold ${
                          sess.sessionType === 'RUNNING' ? 'text-success' : 'text-warning'
                        }`}
                      >
                        {sess.sessionType}
                      </span>
                      <span className="text-muted font-mono">
                        {sess.durationMinutes !== null
                          ? `${sess.durationMinutes}m`
                          : 'Active live'}
                      </span>
                    </div>
                    <div className="text-xs text-muted">
                      Started: {new Date(sess.startedAt).toLocaleTimeString()}
                      {sess.endedAt && ` → ${new Date(sess.endedAt).toLocaleTimeString()}`}
                    </div>
                    {sess.notes && (
                      <div className="text-xs text-muted italic">
                        &ldquo;{sess.notes}&rdquo;
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

            {/* Task Issues & Downtime Events Section */}
      <div className="bg-surface border border-line rounded-xl p-5">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-sm font-semibold text-ink">
              Task Issues, Blockers & Downtime
            </h3>
            <p className="text-xs text-muted">
              Active disruptions, machine fault telemetry, and operator resolution log
            </p>
          </div>
          <Button
            size="small"
            onClick={() => setShowIssueModal(true)}
            icon="plus"
          >
            Report Issue
          </Button>
        </div>

        {(!issues || issues.length === 0) ? (
          <div className="text-center py-8 text-muted text-xs bg-surface-muted rounded-lg border border-line">
            No active issues or blockers reported on this workstation.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse border-line">
              <thead>
                <tr className="border-b border-line text-muted font-semibold uppercase tracking-wider">
                  <th className="py-2.5 px-3">Severity</th>
                  <th className="py-2.5 px-3">Title & Notes</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Reported By</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-ink">
                {issues.map((iss) => (
                  <tr key={iss.id}>
                    <td className="py-2.5 px-3">
                      <Badge variant={iss.severity === "CRITICAL" ? "danger" : iss.severity === "HIGH" ? "warning" : "default"}>
                        {iss.severity}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3">
                      <strong className="text-ink font-medium">{iss.title}</strong>
                      {iss.description && (
                        <p className="text-xs text-muted mt-0.5">{iss.description}</p>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <Badge variant={iss.status === "RESOLVED" ? "success" : iss.status === "OPEN" ? "warning" : "blue"}>
                        {iss.status}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 text-muted">
                      {iss.reporterUserName || "Operator"}
                      <span className="block text-xs text-muted">
                        {new Date(iss.createdAt).toLocaleString()}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {iss.status === "RESOLVED" ? (
                        <Button
                          size="small"
                          onClick={() => handleReopenIssue(iss.id)}
                          disabled={reopenIssueMutation.isPending}
                        >
                          Reopen
                        </Button>
                      ) : (
                        <Button
                          size="small"
                          variant="primary"
                          onClick={() => {
                            setResolvingIssueId(iss.id);
                            setResolutionNotes("");
                            setShowResolveModal(true);
                          }}
                        >
                          Resolve
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pause Reason Modal */}
      {showPauseModal && (
        <Dialog isOpen onClose={() => setShowPauseModal(false)} title="Pause work session" size="md" pending={pauseMutation.isPending}>
          
            

            <form onSubmit={handlePauseSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  Reason for Pause
                
                <Select
                  value={pauseReason}
                  onChange={(e) => setPauseReason(e.target.value)}
                  className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink focus:outline-none focus:border-warning/20"
                >
                  <option value="BREAK">Shift Break / Meal</option>
                  <option value="TOOLING">Tooling Adjustment / Calibration</option>
                  <option value="MATERIAL_SHORTAGE">Material Shortage</option>
                  <option value="WAITING_QC">Waiting for In-Process QC</option>
                  <option value="MACHINE_MAINTENANCE">Machine Issue / Maintenance</option>
                  <option value="OTHER">Other Reason</option>
                </Select></label>
              </div>

              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  Additional Notes
                
                <Textarea
                  value={pauseNotes}
                  onChange={(e) => setPauseNotes(e.target.value)}
                  placeholder="Optional details regarding pause..."
                  rows={3}
                  className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink focus:outline-none focus:border-warning/20"
                /></label>
              </div>

              <div className="dialog-actions">
                <Button
                  onClick={() => setShowPauseModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={pauseMutation.isPending}
                >
                  {pauseMutation.isPending ? 'Pausing...' : 'Confirm Pause'}
                </Button>
              </div>
            </form>
          
        </Dialog>
      )}

      {/* Production Output Modal */}
      {showOutputModal && (
        <Dialog
          isOpen
          onClose={() => setShowOutputModal(false)}
          title="Record Production Output"
          size="md"
          pending={recordOutputMutation.isPending}
        >
          <form onSubmit={handleOutputSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Output Quantity (units)
              </label>
              <input
                type="number"
                step="any"
                required
                min="0.000001"
                value={outputQty}
                onChange={(e) => setOutputQty(e.target.value)}
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink focus:outline-none focus:border-primary"
                placeholder="e.g. 10"
              />
              <span className="text-xs text-muted block mt-1">
                Quantity produced from this operation to be transferred into holding/quarantine.
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Destination Location
              </label>
              <Select
                value={destLocationId}
                onChange={(e) => setDestLocationId(e.target.value)}
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink focus:outline-none focus:border-primary"
              >
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} ({loc.type})
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Lot / Batch Number (Optional)
              </label>
              <input
                type="text"
                value={lotNumber}
                onChange={(e) => setLotNumber(e.target.value)}
                placeholder="Auto-generated if left blank"
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink focus:outline-none focus:border-primary"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="isFinalOp"
                checked={isFinal}
                onChange={(e) => setIsFinal(e.target.checked)}
                className="rounded border-line text-primary focus:ring-primary"
              />
              <label htmlFor="isFinalOp" className="text-xs text-ink cursor-pointer">
                Final operation (posts output to Quarantine and awaits QC Inspection)
              </label>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Production Notes
              </label>
              <Textarea
                value={outputNotes}
                onChange={(e) => setOutputNotes(e.target.value)}
                placeholder="Optional remarks, machine telemetry, batch observations..."
                rows={2}
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink focus:outline-none focus:border-primary"
              />
            </div>

            <div className="dialog-actions">
              <Button
                onClick={() => setShowOutputModal(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={recordOutputMutation.isPending}
              >
                {recordOutputMutation.isPending ? 'Recording Output...' : 'Confirm Output'}
              </Button>
            </div>
          </form>
        </Dialog>
      )}

      {/* Report Issue Modal */}
      {showIssueModal && (
        <Dialog
          isOpen
          onClose={() => setShowIssueModal(false)}
          title="Report Task Issue or Blocker"
          size="md"
          pending={createIssueMutation.isPending}
        >
          <form onSubmit={handleReportIssue} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Issue Title / Summary
              </label>
              <input
                type="text"
                required
                value={issueTitle}
                onChange={(e) => setIssueTitle(e.target.value)}
                placeholder="e.g. Spindle overheating above tolerance"
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Severity Level
              </label>
              <Select
                value={issueSeverity}
                onChange={(e: any) => setIssueSeverity(e.target.value)}
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink focus:outline-none focus:border-primary"
              >
                <option value="LOW">Low (Informational, non-blocking)</option>
                <option value="MEDIUM">Medium (Degraded performance)</option>
                <option value="HIGH">High (Blocks work start / safety alert)</option>
                <option value="CRITICAL">Critical (Immediate workstation shutdown)</option>
              </Select>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Description & Notes
              </label>
              <Textarea
                value={issueDescription}
                onChange={(e) => setIssueDescription(e.target.value)}
                placeholder="Observed readings, error codes, tooling wear..."
                rows={3}
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink focus:outline-none focus:border-primary"
              />
            </div>

            <div className="dialog-actions">
              <Button onClick={() => setShowIssueModal(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={createIssueMutation.isPending}
              >
                {createIssueMutation.isPending ? "Submitting..." : "Report Issue"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}

      {/* Resolve Issue Modal */}
      {showResolveModal && (
        <Dialog
          isOpen
          onClose={() => { setShowResolveModal(false); setResolvingIssueId(null); }}
          title="Resolve Task Issue"
          size="sm"
          pending={resolveIssueMutation.isPending}
        >
          <form onSubmit={handleResolveIssue} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Resolution Notes
              </label>
              <Textarea
                required
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Action taken to clear the blocker (e.g. replaced worn insert, cleaned cooling port)..."
                rows={3}
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink focus:outline-none focus:border-primary"
              />
            </div>

            <div className="dialog-actions">
              <Button onClick={() => { setShowResolveModal(false); setResolvingIssueId(null); }}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={resolveIssueMutation.isPending}
              >
                {resolveIssueMutation.isPending ? "Resolving..." : "Confirm Resolution"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}

      {/* Scan Barcode Modal */}
      {showScanModal && (
        <Dialog
          isOpen
          onClose={() => { setShowScanModal(false); setScanResult(null); }}
          title="Scan Material / Lot Barcode"
          size="sm"
          pending={scanMutation.isPending}
        >
          <form onSubmit={handleScanSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Barcode / QR Code String
              </label>
              <input
                type="text"
                required
                autoFocus
                value={scanCode}
                onChange={(e) => setScanCode(e.target.value)}
                placeholder="Scan or enter barcode code..."
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink font-mono focus:outline-none focus:border-primary"
              />
            </div>

            {scanResult && (
              <div className="p-3 bg-surface-muted border border-line rounded text-xs space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant={scanResult.valid ? "success" : "danger"}>
                    {scanResult.valid ? "VALID CODE" : "INVALID / UNKNOWN"}
                  </Badge>
                  <span className="font-mono text-muted">{scanResult.targetType || "Unknown"}</span>
                </div>
                {scanResult.error && (
                  <p className="text-danger mt-1">{scanResult.error}</p>
                )}
                {scanResult.item && (
                  <div className="mt-2 text-ink">
                    <strong>Item:</strong> {scanResult.item.name} ({scanResult.item.code})
                  </div>
                )}
                {scanResult.lot && (
                  <div className="text-ink">
                    <strong>Lot:</strong> {scanResult.lot.lotNumber}
                  </div>
                )}
              </div>
            )}

            <div className="dialog-actions">
              <Button onClick={() => { setShowScanModal(false); setScanResult(null); }}>
                Close
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={scanMutation.isPending}
              >
                {scanMutation.isPending ? "Verifying..." : "Verify Code"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}

    </div>
  );
}
