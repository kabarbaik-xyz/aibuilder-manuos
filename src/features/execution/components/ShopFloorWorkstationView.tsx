'use client';

import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { DatePicker } from '@/components/ui/date-picker';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  useTaskExecutionDetail,
  useStartTask,
  usePauseTask,
  useResumeTask,
  useCorrectTaskWorkInterval,
  useRecordTaskOutput,
  useTaskIssues,
  useCreateTaskIssue,
  useResolveTaskIssue,
  useReopenTaskIssue,
  useScanBarcode,
  useIssueReasons,
} from '../hooks';
import { getScanOpenPath } from '../scan-routing';
import { QrScannerOverlay } from '@/components/ui/qr-scanner-overlay';
import type { ScanResultDTO } from '@/server/modules/execution/contracts';
import { useWorkspaceNavigation } from '@/components/workspace-navigation-context';
import { Icon } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { formatQuantity, parseQuantity } from '@/domain/quantity';
import { mastersApi, Location } from '@/features/masters/api';
import { useOnlineStatus } from '../use-online-status';
import { SubjectFormEvidence } from '@/features/forms/components/subject-form-evidence';

export interface ShopFloorWorkstationViewProps {
  taskId: string;
}

const taskStatusLabels: Record<string, string> = {
  READY: 'Ready',
  ASSIGNED: 'Assigned',
  RUNNING: 'Running',
  PAUSED: 'Paused',
  WAITING_QC: 'Waiting QC',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export function ShopFloorWorkstationView({ taskId }: ShopFloorWorkstationViewProps) {
  const router = useRouter();
  const { principal } = useWorkspaceNavigation();
  const isOnline = useOnlineStatus();
  const { data: task, isLoading, error, refetch } = useTaskExecutionDetail(taskId);

  const startMutation = useStartTask();
  const pauseMutation = usePauseTask();
  const resumeMutation = useResumeTask();
  const correctIntervalMutation = useCorrectTaskWorkInterval(taskId);
  const recordOutputMutation = useRecordTaskOutput();

  const [showPauseModal, setShowPauseModal] = useState(false);
  const [pauseReasonId, setPauseReasonId] = useState('');
  const [pauseNotes, setPauseNotes] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  // Issues & Blocker management
  const { data: issues, refetch: refetchIssues } = useTaskIssues(taskId);
  const createIssueMutation = useCreateTaskIssue();
  const resolveIssueMutation = useResolveTaskIssue(taskId);
  const reopenIssueMutation = useReopenTaskIssue(taskId);
  const scanMutation = useScanBarcode();
  const { data: issueReasons } = useIssueReasons();
  const { data: pauseReasons, isLoading: pauseReasonsLoading } = useIssueReasons('PAUSE');
  const [selectedReasonId, setSelectedReasonId] = useState("");
  const [issueEvidence, setIssueEvidence] = useState<Array<{ id: string; fileName: string }>>([]);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [issueOwnerId, setIssueOwnerId] = useState('');
  const [issueMaterialId, setIssueMaterialId] = useState('');
  const [issueEtaDate, setIssueEtaDate] = useState('');
  const [issueEtaTime, setIssueEtaTime] = useState('17:00');

  useEffect(() => {
    if (!pauseReasons?.length) {
      setPauseReasonId('');
      return;
    }
    setPauseReasonId((current) => pauseReasons.some((reason) => reason.id === current) ? current : pauseReasons[0].id);
  }, [pauseReasons]);

  const [showIssueModal, setShowIssueModal] = useState(false);
  const [issueTitle, setIssueTitle] = useState("");
  const [issueSeverity, setIssueSeverity] = useState<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL">("HIGH");
  const [issueDescription, setIssueDescription] = useState("");

  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolvingIssueId, setResolvingIssueId] = useState<string | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");

  const [showCamera, setShowCamera] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [scanCode, setScanCode] = useState("");
  const [scanResult, setScanResult] = useState<ScanResultDTO | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const openIssues = issues || [];
  const blockingIssues = openIssues.filter(
    (i) => (i.status === "OPEN" || i.status === "REOPENED") && (i.severity === "CRITICAL" || i.severity === "HIGH")
  );
  const isExecutionBlocked = blockingIssues.length > 0;
  const startBlockReasons = task?.readinessReasons.map((reason) => reason.message) ?? [];

  // Production Output Modal state
  const [showOutputModal, setShowOutputModal] = useState(false);
  const [outputQty, setOutputQty] = useState('');
  const [destLocationId, setDestLocationId] = useState('');
  const [lotNumber, setLotNumber] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [outputNotes, setOutputNotes] = useState('');
  const [correctionSessionId, setCorrectionSessionId] = useState<string | null>(null);
  const [correctionMinutes, setCorrectionMinutes] = useState('');
  const [correctionReasonCode, setCorrectionReasonCode] = useState('MISSED_CLOCK');
  const [correctionReason, setCorrectionReason] = useState('');
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
        <p className="text-sm">Loading task and material status…</p>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="p-8 text-center bg-danger-soft border border-line rounded-xl my-6">
        <p className="text-danger font-medium mb-2">Workstation task could not be loaded</p>
        <p className="text-xs text-muted mb-4">{error?.message || 'Task not found'}</p>
        <Link
          href="/shop-floor"
          className="px-4 py-2 bg-surface hover:bg-surface-muted text-ink text-xs rounded-lg transition"
        >
          Back to production task list
        </Link>
      </div>
    );
  }

  
  const handleReportIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    if (!isOnline) {
      setActionError('You are offline. Issue changes are not queued and require a server connection.');
      return;
    }
    try {
      await createIssueMutation.mutateAsync({
        taskId: task.id,
        input: {
          title: issueTitle.trim(),
          severity: issueSeverity,
          description: issueDescription.trim() || undefined,
          issueReasonId: selectedReasonId || undefined,
          evidenceDocumentIds: issueEvidence.map((document) => document.id),
          ownerUserId: issueOwnerId || undefined,
          affectedMaterialId: issueMaterialId || undefined,
          expectedResolutionAt: issueEtaDate ? new Date(`${issueEtaDate}T${issueEtaTime || '17:00'}`).toISOString() : undefined,
        },
      });
      setShowIssueModal(false);
      setIssueTitle("");
      setIssueDescription("");
      setSelectedReasonId("");
      setIssueEvidence([]); setIssueOwnerId(''); setIssueMaterialId(''); setIssueEtaDate('');
      refetchIssues();
    } catch (err: any) {
      setActionError(err.message || "Issue could not be reported.");
    }
  };

  const uploadIssueEvidence = async (file: File) => {
    if (!isOnline || uploadingEvidence) return;
    if (file.size > 10 * 1024 * 1024) { setActionError('Evidence must be 10 MB or smaller.'); return; }
    setUploadingEvidence(true); setActionError(null);
    try {
      const body = new FormData();
      body.set('file', file); body.set('parentType', 'TASK'); body.set('parentId', task.id);
      const response = await fetch('/api/documents/upload', { method: 'POST', body });
      if (!response.ok) throw new Error('Evidence upload failed. Check task access and your connection.');
      const document = await response.json() as { id: string; fileName: string };
      setIssueEvidence((current) => [...current, document]);
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Evidence upload failed.'); }
    finally { setUploadingEvidence(false); }
  };

  const handleResolveIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvingIssueId) return;
    setActionError(null);
    if (!isOnline) {
      setActionError('You are offline. Issue changes are not queued and require a server connection.');
      return;
    }
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
      setActionError(err.message || "Issue could not be resolved.");
    }
  };

  const handleReopenIssue = async (issueId: string) => {
    setActionError(null);
    if (!isOnline) {
      setActionError('You are offline. Issue changes are not queued and require a server connection.');
      return;
    }
    try {
      await reopenIssueMutation.mutateAsync({
        issueId,
        notes: "Reopened from the production workstation",
      });
      refetchIssues();
    } catch (err: any) {
      setActionError(err.message || "Issue could not be reopened.");
    }
  };

  const handleScanSubmit = async (e?: React.FormEvent, override?: string) => {
    e?.preventDefault();
    const code = (override ?? scanCode).trim();
    if (!code) return;
    if (!isOnline) {
      setScanError('You are offline. Scanning requires a server connection.');
      return;
    }
    setScanError(null);
    try {
      const res = await scanMutation.mutateAsync(code);
      setScanResult(res);
    } catch (err: any) {
      setScanResult(null);
      setScanError(err?.message || "Code could not be verified.");
    }
  };

  const openScannedEntity = () => {
    if (!scanResult) return;
    const path = getScanOpenPath(scanResult, principal?.permissions.includes('order.read') ?? false);
    if (!path) return;
    setShowScanModal(false);
    setScanResult(null);
    setScanError(null);
    router.push(path);
  };

  const handleStart = async () => {
    setActionError(null);
    if (!isOnline) {
      setActionError('You are offline. Production changes are not queued and require a server connection.');
      return;
    }
    try {
      await startMutation.mutateAsync({ taskId: task.id });
      refetch();
    } catch (err: any) {
      setActionError(err.message || 'Task could not be started.');
    }
  };

  const handlePauseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    if (!isOnline) {
      setActionError('You are offline. Production changes are not queued and require a server connection.');
      return;
    }
    const selectedPauseReason = pauseReasons?.find((reason) => reason.id === pauseReasonId);
    if (!selectedPauseReason) {
      setActionError('Atur alasan jeda yang aktif sebelum menjeda tugas ini.');
      return;
    }
    try {
      await pauseMutation.mutateAsync({
        taskId: task.id,
        reasonId: selectedPauseReason.id,
        reason: selectedPauseReason.code,
        notes: pauseNotes,
      });
      setShowPauseModal(false);
      setPauseNotes('');
      refetch();
    } catch (err: any) {
      setActionError(err.message || 'Task could not be paused.');
    }
  };

  const handleResume = async () => {
    setActionError(null);
    if (!isOnline) {
      setActionError('You are offline. Production changes are not queued and require a server connection.');
      return;
    }
    try {
      await resumeMutation.mutateAsync({ taskId: task.id });
      refetch();
    } catch (err: any) {
      setActionError(err.message || 'Task could not be resumed.');
    }
  };

  const handleCorrectInterval = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!correctionSessionId) return;
    setActionError(null);
    try {
      await correctIntervalMutation.mutateAsync({
        sessionId: correctionSessionId,
        correctedDurationMinutes: Number(correctionMinutes),
        reasonCode: correctionReasonCode,
        reason: correctionReason.trim(),
      });
      setCorrectionSessionId(null);
      setCorrectionMinutes('');
      setCorrectionReason('');
      await refetch();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Duration correction could not be saved.');
    }
  };

  const handleOutputSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    if (!isOnline) {
      setActionError('You are offline. Production changes are not queued and require a server connection.');
      return;
    }
    try {
      const atoms = parseQuantity(outputQty, 0);
      await recordOutputMutation.mutateAsync({
        taskId: task.id,
        outputAtoms: atoms,
        destinationLocationId: destLocationId,
        lotNumber: task.order.itemTracking !== 'SERIAL' ? lotNumber.trim() || undefined : undefined,
        serialNumber: task.order.itemTracking === 'SERIAL' ? serialNumber.trim() || undefined : undefined,
        notes: outputNotes.trim() || undefined,
      });
      setShowOutputModal(false);
      setOutputNotes('');
      setSerialNumber(''); setOutputQty('');
      refetch();
    } catch (err: any) {
      setActionError(err.message || 'Production output could not be recorded.');
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
      <div role="status" className="p-3 bg-surface border border-line rounded-xl flex flex-wrap items-center gap-2 text-xs text-muted">
        <Badge variant={isOnline ? 'success' : 'warning'}>{isOnline ? 'Online' : 'Offline'}</Badge>
        <span>
          {isOnline
            ? 'Production changes are recorded only after the server confirms them and are not saved while offline.'
            : 'Scanning, production, output recording, and issue changes are disabled until the connection is restored.'}
        </span>
      </div>

      {/* Workstation Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-surface border border-line p-6 rounded-2xl">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link
              href="/shop-floor"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              ← Back to task list
            </Link>
            <span className="text-muted">·</span>
            <span className="px-2 py-0.5 text-xs font-mono font-bold bg-surface text-ink rounded">
              {task.nodeKey}
            </span>
            {isRunning ? (
              <Badge variant="blue">RUNNING</Badge>
            ) : isPaused ? (
              <Badge variant="warning">PAUSED</Badge>
            ) : (
              <Badge variant="default">{taskStatusLabels[task.status] || task.status}</Badge>
            )}
          </div>
          <h1 className="text-2xl font-bold text-ink">{task.nodeName}</h1>
          <p className="text-xs text-muted mt-1">
            Order <strong className="text-ink">{task.order.orderNumber}</strong> · Customer:{' '}
            <strong className="text-ink">{task.order.customerName}</strong>
          </p>
          <div className="mt-2">
            {task.workInstruction ? <div className="page-stack">
              <Badge variant="blue">Drawing {task.workInstruction.drawingNumber || '—'} · revision {task.workInstruction.revisionCode || '—'}</Badge>
              {task.workInstruction.documentId && task.workInstruction.fileName ? (
                <a className="text-primary text-xs hover:underline" href={`/api/documents/${encodeURIComponent(task.workInstruction.documentId)}/download`} target="_blank" rel="noreferrer">Open released instruction/drawing: {task.workInstruction.fileName}</a>
              ) : (
                <p role="status" className="text-xs text-warning">Engineering revision attached, but the instruction file is not available yet.</p>
              )}
              <span className="small muted">Engineering revision {task.workInstruction.engineeringRevisionNumber} · document pinned to this job</span>
              {task.workInstruction.notes && <p className="small">{task.workInstruction.notes}</p>}
            </div> : <Badge variant="warning">Drawing / instructions not pinned · revision v{task.instructionRevision}</Badge>}
          </div>
        </div>

        {/* Task timer and online-only actions */}
        <div className="flex items-center gap-6 bg-surface border border-line p-4 rounded-xl">
          <div>
            <div className="text-xs font-medium text-muted uppercase tracking-wider">
              Work time
            </div>
            <div
              className={`text-2xl font-mono font-bold tracking-tight mt-0.5 ${
                isRunning ? 'text-success' : 'text-ink'
              }`}
            >
              {formattedLiveTimer}
            </div>
            <div className="text-xs text-muted">
              Target: {task.plannedDurationMinutes} min
            </div>
          </div>

          <div className="h-10 w-px bg-surface" />

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <Button
              onClick={() => { setScanResult(null); setScanError(null); setScanCode(""); setShowCamera(true); }}
              disabled={!isOnline}
              icon="qr"
            >
              Scan code
            </Button>
            <Button
              onClick={() => setShowIssueModal(true)}
              disabled={!isOnline}
              icon="alert"
            >
              Report issue
            </Button>
            {(task.status === "READY" || task.status === "ASSIGNED") && (
              <Button
                variant="primary"
                onClick={handleStart}
                disabled={!isOnline || startMutation.isPending || !task.canStart}
                icon="bolt"
              >
                  {startMutation.isPending ? "Starting…" : !task.canStart ? "Check start requirements" : "Start operation"}
              </Button>
            )}

            {isRunning && (
              <>
                <Button
                  onClick={() => setShowPauseModal(true)}
                  disabled={!isOnline || pauseMutation.isPending}
                  icon="clock"
                >
                  Pause operation
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    setOutputQty(formatQuantity(BigInt(task.order.targetAtoms)));
                    setShowOutputModal(true);
                  }}
                  disabled={!isOnline || recordOutputMutation.isPending}
                  icon="check"
                >
                  Record output
                </Button>
              </>
            )}

            {isPaused && (
              <Button
                variant="primary"
                onClick={handleResume}
                disabled={!isOnline || resumeMutation.isPending}
                icon="reset"
              >
                {resumeMutation.isPending ? 'Resume…' : 'Continue operation'}
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
                Active blockers ({blockingIssues.length})
              </div>
              <p className="text-xs text-ink mt-0.5">
                {blockingIssues[0]?.title} — resolve the blocker before starting this operation.
              </p>
            </div>
          </div>
          <Button size="small" onClick={() => setShowIssueModal(true)}>
            View / add notes
          </Button>
        </div>
      )}

      {actionError && (
        <div className="p-4 bg-danger-soft border border-line rounded-xl text-xs text-danger">
          <strong>Action blocked:</strong> {actionError}
        </div>
      )}

      <SubjectFormEvidence subjectType="TASK" subjectId={task.id} />

      {(task.status === 'READY' || task.status === 'ASSIGNED') && (
        <section aria-labelledby="task-start-readiness-title" className={`p-4 border border-line rounded-xl ${startBlockReasons.length ? 'bg-warning-soft' : 'bg-success-soft'}`}>
          <h2 id="task-start-readiness-title" className="text-sm font-semibold text-ink">
            Pre-start checks
          </h2>
          <p className="text-xs text-muted mt-1">
            Reasons come from server checks on the technician, blockers, previous operations, materials, order status, and operation status.
          </p>
          {startBlockReasons.length ? (
            <ul className="mt-3 space-y-1 text-xs text-ink" role="list">
              {startBlockReasons.map((reason) => <li key={reason}>• {reason}</li>)}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-success">All available checks are satisfied.</p>
          )}
        </section>
      )}

      <section aria-labelledby="stage-quantity-title" className="bg-surface border border-line rounded-xl p-5">
        <h2 id="stage-quantity-title" className="text-sm font-semibold text-ink">Operation output reconciliation</h2>
        <p className="text-xs text-muted mt-1">Figures come from saved output and QC records, in product atom units.</p>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {[
            ['Input cap', task.stageQuantitySummary.stageInputCapAtoms],
            ['Recorded', task.stageQuantitySummary.cumulativeRecordedAtoms],
            ['Scrap', task.stageQuantitySummary.cumulativeScrapAtoms],
            ['Rework in', task.stageQuantitySummary.cumulativeReworkInAtoms],
            ['Rework out', task.stageQuantitySummary.cumulativeReworkOutAtoms],
            ['Remaining recordable', task.stageQuantitySummary.remainingRecordableAtoms],
          ].map(([label, atoms]) => (
            <div key={label} className="rounded-lg border border-line bg-surface-muted p-3">
              <div className="text-[11px] text-muted">{label}</div>
              <div className="mt-1 font-mono text-sm font-semibold text-ink">{formatQuantity(BigInt(atoms))}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Main Grid: Materials, Predecessors & Instructions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Material Readiness & Predecessor Guard */}
        <div className="lg:col-span-2 space-y-6">
          {/* Material Readiness Guard */}
          <div className="bg-surface border border-line rounded-xl p-5">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-sm font-semibold text-ink">
              Material availability and allocation
                </h3>
                <p className="text-xs text-muted">
                  Checks on requirements, WIP stock, allocations, and warehouse stock
                </p>
              </div>
              {task.materialReadiness.isFullyIssued ? (
                <Badge variant="blue">ALL MATERIAL IN WIP</Badge>
              ) : task.materialReadiness.isFullyAllocated ? (
                <Badge variant="blue">AVAILABLE IN WAREHOUSE</Badge>
              ) : (
                <Badge variant="warning">AWAITING ISSUE</Badge>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse border-line">
                <thead>
                  <tr className="border-b border-line text-muted font-semibold uppercase tracking-wider">
                    <th className="py-2.5 px-3">Item</th>
                    <th className="py-2.5 px-3">Required</th>
                    <th className="py-2.5 px-3">Issued to WIP</th>
                    <th className="py-2.5 px-3">Warehouse stock</th>
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
                          <span className="text-primary font-medium">Allocated</span>
                        ) : (
                          <span className="text-warning font-medium">Short</span>
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
              Predecessor operations
            </h3>
            <p className="text-xs text-muted mb-4">
              All previous operations must be completed before this operation can start.
            </p>

            {task.predecessors.length === 0 ? (
              <p className="text-xs text-success">
                ✓ First operation: no predecessors.
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
                        ⏳ Not completed ({p.status})
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
              Work session history
            </h3>
            <p className="text-xs text-muted mb-4">
              Server records for session start, pause, resume, and completion
            </p>

            {task.sessions.length === 0 ? (
              <p className="text-xs text-muted">No work sessions yet.</p>
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
                        {sess.sessionType === 'RUNNING' ? 'RUNNING' : 'PAUSED'}
                      </span>
                      <span className="text-muted font-mono">
                        {sess.durationMinutes !== null
                          ? `${sess.durationMinutes} min`
                          : 'Currently active'}
                      </span>
                    </div>
                    <div className="text-xs text-muted">
                      Start: {new Date(sess.startedAt).toLocaleTimeString('en-US')}
                      {sess.endedAt && ` → ${new Date(sess.endedAt).toLocaleTimeString('en-US')}`}
                    </div>
                    {sess.notes && (
                      <div className="text-xs text-muted italic">
                        &ldquo;{sess.notes}&rdquo;
                      </div>
                    )}
                    {task.intervalCorrections.filter((correction) => correction.sessionId === sess.id).map((correction) => (
                      <div key={correction.id} className="mt-2 rounded-md border border-line bg-warning-soft p-2 text-xs text-ink">
                        <div className="font-semibold">Correction: {correction.previousDurationMinutes ?? '—'} → {correction.correctedDurationMinutes} min</div>
                        <div>{correction.reasonCode}: {correction.reason}</div>
                        <div className="text-muted">By {correction.actorName || 'active account'} · {new Date(correction.occurredAt).toLocaleString('en-US')}</div>
                      </div>
                    ))}
                    {sess.endedAt && sess.durationMinutes !== null && principal?.permissions.some((permission) => ['task.assign', 'planning.write', 'workspace.admin'].includes(permission)) && (
                      <Button
                        size="small"
                        onClick={() => {
                          setCorrectionSessionId(sess.id);
                          setCorrectionMinutes(String(sess.durationMinutes));
                        }}
                      >
                        Correct duration
                      </Button>
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
              Issues, blockers, and downtime
            </h3>
            <p className="text-xs text-muted">
              Blocker records, downtime context, and resolution history
            </p>
          </div>
          <Button
            size="small"
            onClick={() => setShowIssueModal(true)}
            icon="plus"
          >
            Report issue
          </Button>
        </div>

        {(!issues || issues.length === 0) ? (
          <div className="text-center py-8 text-muted text-xs bg-surface-muted rounded-lg border border-line">
            No active issues or blockers on this task.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse border-line">
              <thead>
                <tr className="border-b border-line text-muted font-semibold uppercase tracking-wider">
                  <th className="py-2.5 px-3">Severity</th>
                  <th className="py-2.5 px-3">Title and notes</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Reported by</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-ink">
                {issues.map((iss) => (
                  <tr key={iss.id}>
                    <td className="py-2.5 px-3">
                      <Badge variant={iss.severity === "CRITICAL" ? "danger" : iss.severity === "HIGH" ? "warning" : "default"}>
                        {({ LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', CRITICAL: 'CRITICAL' } as const)[iss.severity]}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <strong className="text-ink font-medium">{iss.title}</strong>
                        {iss.issueReasonLabel && (
                          <Badge variant="default">{iss.issueReasonLabel}</Badge>
                        )}
                      </div>
                      {iss.description && (
                        <p className="text-xs text-muted mt-0.5">{iss.description}</p>
                      )}
                      {iss.evidence && iss.evidence.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5 items-center">
                          <span className="text-xs text-muted font-medium">Evidence:</span>
                          {iss.evidence.map((url, idx) => (
                            <a
                              key={idx}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface border border-line text-xs text-primary hover:underline"
                            >
                              Photo #{idx + 1}
                            </a>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <Badge variant={iss.status === "RESOLVED" ? "success" : iss.status === "OPEN" ? "warning" : "blue"}>
                        {({ OPEN: 'Open', REOPENED: 'Reopened', RESOLVED: 'Resolved' } as const)[iss.status as 'OPEN' | 'REOPENED' | 'RESOLVED'] || iss.status}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 text-muted">
                      {iss.reporterUserName || "Operator"}
                      <span className="block text-xs text-muted">
                      {new Date(iss.createdAt).toLocaleString('en-US')}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {iss.status === "RESOLVED" ? (
                        <Button
                          size="small"
                          onClick={() => handleReopenIssue(iss.id)}
                          disabled={!isOnline || reopenIssueMutation.isPending}
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
                  Pause reason
                
                <Select
                  value={pauseReasonId}
                  disabled={!isOnline || pauseReasonsLoading || !pauseReasons?.length || pauseMutation.isPending}
                  onChange={(e) => setPauseReasonId(e.target.value)}
                  className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink focus:outline-none focus:border-warning/20"
                >
                  <option value="">{pauseReasonsLoading ? 'Loading reasons…' : 'Select an available reason'}</option>
                  {pauseReasons?.map((reason) => (
                    <option key={reason.id} value={reason.id}>{reason.code} · {reason.label}</option>
                  ))}
                </Select></label>
                {!pauseReasonsLoading && !pauseReasons?.length && (
                  <p className="mt-1 text-xs text-warning">No active pause reasons are configured in this workspace.</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  Additional Notes
                
                <Textarea
                  value={pauseNotes}
                  onChange={(e) => setPauseNotes(e.target.value)}
                  placeholder="Pause notes (optional)…"
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
                  disabled={!isOnline || pauseMutation.isPending || pauseReasonsLoading || !pauseReasonId}
                >
                {pauseMutation.isPending ? 'Pausing…' : 'Pause session'}
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
          title="Record production output"
          size="md"
          pending={recordOutputMutation.isPending}
        >
          <form onSubmit={handleOutputSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Output quantity (units)
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
                Operation output quantity to be moved to the holding/quarantine location.
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Destination location
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

            <p className="text-xs text-muted">
              Whether this is the final stage is determined by the released routing.
            </p>

            {task.order.itemTracking === 'SERIAL' ? <FormField id="output-serial" label="Unit serial number" required help="One unit per record on the final production operation. Rework reuses existing output.">
              <Input value={serialNumber} onChange={(event) => setSerialNumber(event.target.value)} required />
            </FormField> : <FormField id="output-lot" label="Lot / batch number" help="Generated automatically when left blank.">
              <Input value={lotNumber} onChange={(event) => setLotNumber(event.target.value)} />
            </FormField>}

            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Production notes
              </label>
              <Textarea
                value={outputNotes}
                onChange={(e) => setOutputNotes(e.target.value)}
                placeholder="Process notes, machine condition, or batch observations (optional)…"
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
                disabled={!isOnline || recordOutputMutation.isPending}
              >
                {recordOutputMutation.isPending ? 'Recording output…' : 'Record output'}
              </Button>
            </div>
          </form>
        </Dialog>
      )}

      {correctionSessionId && (
        <Dialog
          isOpen
          onClose={() => setCorrectionSessionId(null)}
          title="Correct work session duration"
          size="sm"
          pending={correctIntervalMutation.isPending}
        >
          <form onSubmit={handleCorrectInterval} className="space-y-4">
            <FormField id="corrected-duration" label="Corrected duration (min)" required>
              <Input
                id="corrected-duration"
                type="number"
                min="0"
                max="10080"
                step="1"
                required
                value={correctionMinutes}
                onChange={(event) => setCorrectionMinutes(event.target.value)}
              />
            </FormField>
            <FormField id="correction-reason-code" label="Reason code" required>
              <Select id="correction-reason-code" value={correctionReasonCode} onChange={(event) => setCorrectionReasonCode(event.target.value)}>
                <option value="MISSED_CLOCK">Missed start/pause clock</option>
                <option value="TIME_ENTRY_ERROR">Time entry error</option>
                <option value="OTHER">Other reason</option>
              </Select>
            </FormField>
            <FormField id="correction-reason" label="Reason explanation and evidence" required>
              <Textarea id="correction-reason" minLength={3} maxLength={500} required value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} rows={3} />
            </FormField>
            <p className="text-xs text-muted">Corrections store the previous value, the change, the reason, and the changing account in the operation history.</p>
            <div className="dialog-actions">
              <Button onClick={() => setCorrectionSessionId(null)}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={correctIntervalMutation.isPending}>
                {correctIntervalMutation.isPending ? 'Saving…' : 'Save correction'}
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
          title="Report issue / blocker"
          size="md"
          pending={createIssueMutation.isPending || uploadingEvidence}
          dirty={Boolean(issueTitle || issueDescription || issueEvidence.length)}
        >
          <form onSubmit={handleReportIssue} className="space-y-4">
            {actionError && <p role="alert" className="text-danger">{actionError}</p>}
            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Issue title / summary
              </label>
              <input
                type="text"
                required
                value={issueTitle}
                onChange={(e) => setIssueTitle(e.target.value)}
                placeholder="e.g. spindle temperature exceeds limit"
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Issue category and reason
              </label>
              <Select
                value={selectedReasonId}
                onChange={(e: any) => setSelectedReasonId(e.target.value)}
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink focus:outline-none focus:border-primary"
              >
                <option value="">Select an issue/blocker reason (optional)…</option>
                {issueReasons?.map((r) => (
                  <option key={r.id} value={r.id}>
                    [{r.category}] {r.code} - {r.label}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Severity
              </label>
              <Select
                value={issueSeverity}
                onChange={(e: any) => setIssueSeverity(e.target.value)}
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink focus:outline-none focus:border-primary"
              >
                <option value="LOW">Low (informational, not blocking)</option>
                <option value="MEDIUM">Medium (degraded performance)</option>
                <option value="HIGH">High (blocks start / safety warning)</option>
                <option value="CRITICAL">Critical (requires immediate work stoppage)</option>
              </Select>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Description and notes
              </label>
              <Textarea
                value={issueDescription}
                onChange={(e) => setIssueDescription(e.target.value)}
                placeholder="Measurement results, error codes, or tool wear…"
                rows={3}
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink focus:outline-none focus:border-primary"
              />
            </div>

            <FormField id="issue-owner" label="Owner" required={issueSeverity === 'HIGH' || issueSeverity === 'CRITICAL'}>
              <Select value={issueOwnerId} required={issueSeverity === 'HIGH' || issueSeverity === 'CRITICAL'} onChange={(event) => setIssueOwnerId(event.target.value)}>
                <option value="">Not assigned yet</option>
                {task.issueOwnerOptions.map((owner) => <option key={owner.userId} value={owner.userId}>{owner.name}</option>)}
              </Select>
            </FormField>
            <FormField id="issue-material" label="Affected material">
              <Select value={issueMaterialId} onChange={(event) => setIssueMaterialId(event.target.value)}>
                <option value="">Not related to a specific material</option>
                {[...new Map(task.materialReadiness.demands.map((demand) => [demand.itemId, demand])).values()].map((demand) => <option key={demand.itemId} value={demand.itemId}>{demand.itemCode} · {demand.itemName}</option>)}
              </Select>
            </FormField>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField id="issue-eta-date" label="Target resolution date">
                <DatePicker value={issueEtaDate} onChange={setIssueEtaDate} clearable />
              </FormField>
              <FormField id="issue-eta-time" label="Device time" help={Intl.DateTimeFormat().resolvedOptions().timeZone}>
                <Input type="time" value={issueEtaTime} onChange={(event) => setIssueEtaTime(event.target.value)} />
              </FormField>
            </div>
            <FormField id="issue-evidence" label="Evidence photos / documents" help="PNG, JPEG, or PDF, up to 10 MB per file. Evidence is stored as internal documents of this task.">
              <Input type="file" accept="image/png,image/jpeg,application/pdf" disabled={!isOnline || uploadingEvidence || issueEvidence.length >= 10} onChange={(event) => {
                const file = event.target.files?.[0]; event.target.value = ''; if (file) void uploadIssueEvidence(file);
              }} />
            </FormField>
            {uploadingEvidence && <p role="status" className="small muted">Uploading evidence…</p>}
            {issueEvidence.length > 0 && <ul className="space-y-2">{issueEvidence.map((document) => <li key={document.id} className="flex justify-between items-center gap-2">
              <a className="text-primary text-xs hover:underline" href={`/api/documents/${encodeURIComponent(document.id)}/download`} target="_blank" rel="noreferrer">{document.fileName}</a>
              <Button variant="text" size="small" disabled={createIssueMutation.isPending} onClick={() => setIssueEvidence((current) => current.filter((item) => item.id !== document.id))}>Remove attachment</Button>
            </li>)}</ul>}

            <div className="dialog-actions">
              <Button type="button" data-dialog-dismiss disabled={uploadingEvidence || createIssueMutation.isPending}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={!isOnline || uploadingEvidence || createIssueMutation.isPending}
              >
                {createIssueMutation.isPending ? "Saving…" : "Report issue"}
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
          title="Resolve issue"
          size="sm"
          pending={resolveIssueMutation.isPending}
        >
          <form onSubmit={handleResolveIssue} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Resolution notes
              </label>
              <Textarea
                required
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Actions taken to clear the blocker, e.g. replacing a worn insert or clearing the coolant channel…"
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
                disabled={!isOnline || resolveIssueMutation.isPending}
              >
                {resolveIssueMutation.isPending ? "Resolving…" : "Resolve issue"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}

      {/* Scan Barcode Modal */}
      {showScanModal && (
        <Dialog
          isOpen
          onClose={() => { setShowScanModal(false); setScanResult(null); setScanError(null); }}
          title="Scan task / job / order code"
          size="sm"
          pending={scanMutation.isPending}
        >
          <form onSubmit={handleScanSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-ink mb-1" htmlFor="workstation-scan-input">
                Barcode / QR code
              </label>
              <input
                id="workstation-scan-input"
                type="text"
                required
                autoFocus
                value={scanCode}
                onChange={(e) => setScanCode(e.target.value)}
                placeholder="Scan or enter a TASK:, JOB:, or ORDER: code…"
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink font-mono focus:outline-none focus:border-primary"
              />
            </div>
            <Button type="button" icon="qr" className="w-full" onClick={() => { setShowScanModal(false); setShowCamera(true); }}>Open QR camera</Button>

            {scanError && (
              <p role="alert" className="text-xs text-danger m-0">{scanError}</p>
            )}

            {scanResult && (
              <div className="p-3 bg-surface-muted border border-line rounded text-xs space-y-1" role="status">
                <div className="flex items-center gap-2">
                  <Badge variant="success">{scanResult.type}</Badge>
                  <span className="font-mono text-ink font-semibold">{scanResult.displayCode}</span>
                  <Badge variant="default">{scanResult.status}</Badge>
                </div>
                <p className="text-ink m-0">{scanResult.title}</p>
                {scanResult.taskId && getScanOpenPath(scanResult, principal?.permissions.includes('order.read') ?? false) && (
                  <Button type="button" variant="primary" size="small" onClick={openScannedEntity}>
                    Open
                  </Button>
                )}
              </div>
            )}

            <div className="dialog-actions">
              <Button onClick={() => { setShowScanModal(false); setScanResult(null); setScanError(null); }}>
                Close
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={!isOnline || scanMutation.isPending}
              >
                {scanMutation.isPending ? "Checking…" : "Check code"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
      <QrScannerOverlay
        open={showCamera}
        onClose={() => setShowCamera(false)}
        onManualFallback={() => { setShowCamera(false); setShowScanModal(true); }}
        onDetect={(code) => { setShowCamera(false); setScanCode(code); setShowScanModal(true); void handleScanSubmit(undefined, code); }}
      />

    </div>
  );
}
