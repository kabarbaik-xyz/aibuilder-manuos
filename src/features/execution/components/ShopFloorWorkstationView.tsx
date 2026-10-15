'use client';

import React, { useState, useEffect } from 'react';
import {
  useTaskExecutionDetail,
  useStartTask,
  usePauseTask,
  useResumeTask,
} from '../hooks';
import { Icon } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { formatQuantity } from '@/domain/quantity';

export interface ShopFloorWorkstationViewProps {
  taskId: string;
}

export function ShopFloorWorkstationView({ taskId }: ShopFloorWorkstationViewProps) {
  const { data: task, isLoading, error, refetch } = useTaskExecutionDetail(taskId);

  const startMutation = useStartTask();
  const pauseMutation = usePauseTask();
  const resumeMutation = useResumeTask();

  const [showPauseModal, setShowPauseModal] = useState(false);
  const [pauseReason, setPauseReason] = useState('BREAK');
  const [pauseNotes, setPauseNotes] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

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
      <div className="flex flex-col items-center justify-center p-16 text-slate-400">
        <Icon name="clock" className="w-10 h-10 animate-spin mb-4 text-sky-400" />
        <p className="text-sm">Loading workstation telemetry & material custody...</p>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="p-8 text-center bg-rose-950/20 border border-rose-900/30 rounded-xl my-6">
        <p className="text-rose-400 font-medium mb-2">Unable to load workstation task</p>
        <p className="text-xs text-slate-400 mb-4">{error?.message || 'Task not found'}</p>
        <Link
          href="/shop-floor"
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg transition"
        >
          Return to Shop Floor Tasks
        </Link>
      </div>
    );
  }

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
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-slate-900/80 border border-slate-800 p-6 rounded-2xl shadow-xl backdrop-blur-md">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link
              href="/shop-floor"
              className="text-xs text-sky-400 hover:underline flex items-center gap-1"
            >
              ← Back to My Tasks
            </Link>
            <span className="text-slate-600">·</span>
            <span className="px-2 py-0.5 text-xs font-mono font-bold bg-slate-800 text-slate-300 rounded">
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
          <h1 className="text-2xl font-bold text-slate-100">{task.nodeName}</h1>
          <p className="text-xs text-slate-400 mt-1">
            Order <strong className="text-slate-200">{task.order.orderNumber}</strong> · Customer:{' '}
            <strong className="text-slate-200">{task.order.customerName}</strong> · Instruction Rev:{' '}
            <strong className="text-slate-200">v{task.instructionRevision}</strong>
          </p>
        </div>

        {/* Live Telemetry Display */}
        <div className="flex items-center gap-6 bg-slate-950/60 border border-slate-800/80 p-4 rounded-xl">
          <div>
            <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
              Elapsed Time
            </div>
            <div
              className={`text-2xl font-mono font-bold tracking-tight mt-0.5 ${
                isRunning ? 'text-emerald-400' : 'text-slate-200'
              }`}
            >
              {formattedLiveTimer}
            </div>
            <div className="text-[10px] text-slate-400">
              Target: {task.plannedDurationMinutes}m
            </div>
          </div>

          <div className="h-10 w-px bg-slate-800" />

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {(task.status === 'READY' || task.status === 'ASSIGNED') && (
              <button
                type="button"
                onClick={handleStart}
                disabled={startMutation.isPending}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-emerald-950/50 transition flex items-center gap-2"
              >
                <Icon name="bolt" className="w-4 h-4" />
                {startMutation.isPending ? 'Starting...' : 'Start Operation'}
              </button>
            )}

            {isRunning && (
              <button
                type="button"
                onClick={() => setShowPauseModal(true)}
                disabled={pauseMutation.isPending}
                className="px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-amber-950/50 transition flex items-center gap-2"
              >
                <Icon name="clock" className="w-4 h-4" />
                Pause Work
              </button>
            )}

            {isPaused && (
              <button
                type="button"
                onClick={handleResume}
                disabled={resumeMutation.isPending}
                className="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-sky-950/50 transition flex items-center gap-2"
              >
                <Icon name="reset" className="w-4 h-4" />
                {resumeMutation.isPending ? 'Resuming...' : 'Resume Operation'}
              </button>
            )}
          </div>
        </div>
      </div>

      {actionError && (
        <div className="p-4 bg-rose-950/40 border border-rose-800 rounded-xl text-xs text-rose-300">
          <strong>Action Blocked:</strong> {actionError}
        </div>
      )}

      {/* Main Grid: Materials, Predecessors & Instructions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Material Readiness & Predecessor Guard */}
        <div className="lg:col-span-2 space-y-6">
          {/* Material Readiness Guard */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 shadow-lg backdrop-blur-md">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-200">
                  Material Custody & Allocation
                </h3>
                <p className="text-xs text-slate-400">
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
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                    <th className="py-2.5 px-3">Item</th>
                    <th className="py-2.5 px-3">Required</th>
                    <th className="py-2.5 px-3">WIP Issued</th>
                    <th className="py-2.5 px-3">Warehouse Stock</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {task.materialReadiness.demands.map((demand) => (
                    <tr key={demand.demandId}>
                      <td className="py-2.5 px-3 font-medium text-slate-200">
                        {demand.itemCode}
                        <span className="block text-[10px] text-slate-400 font-normal">
                          {demand.itemName}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-medium">
                        {formatQuantity(demand.requiredAtoms)}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-emerald-400 font-semibold">
                        {formatQuantity(demand.issuedAtoms)}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-400">
                        {formatQuantity(demand.availableInWarehouseAtoms)}
                      </td>
                      <td className="py-2.5 px-3">
                        {demand.issuedAtoms >= demand.requiredAtoms ? (
                          <span className="text-emerald-400 font-medium">✓ Ready in WIP</span>
                        ) : demand.reservedAtoms >= demand.requiredAtoms ? (
                          <span className="text-sky-400 font-medium">Reserved</span>
                        ) : (
                          <span className="text-amber-400 font-medium">Shortage</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Predecessor Tasks Guard */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 shadow-lg backdrop-blur-md">
            <h3 className="text-sm font-semibold text-slate-200 mb-1">
              Predecessor Operations Guard
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              All predecessor tasks must be marked COMPLETED before operation starts.
            </p>

            {task.predecessors.length === 0 ? (
              <p className="text-xs text-emerald-400">
                ✓ Root task: No predecessor dependencies required.
              </p>
            ) : (
              <div className="space-y-2">
                {task.predecessors.map((p) => (
                  <div
                    key={p.taskId}
                    className="flex justify-between items-center p-3 rounded-lg bg-slate-950/40 border border-slate-800 text-xs"
                  >
                    <span className="font-mono font-bold text-slate-300">
                      {p.nodeKey}
                    </span>
                    {p.isCompleted ? (
                      <span className="text-emerald-400 font-medium flex items-center gap-1">
                        ✓ Completed
                      </span>
                    ) : (
                      <span className="text-amber-400 font-medium flex items-center gap-1">
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
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 shadow-lg backdrop-blur-md">
            <h3 className="text-sm font-semibold text-slate-200 mb-1">
              Work Sessions Log
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Immutable server records of start, pause, and resume events
            </p>

            {task.sessions.length === 0 ? (
              <p className="text-xs text-slate-500">No work sessions started yet.</p>
            ) : (
              <div className="space-y-3">
                {task.sessions.map((sess) => (
                  <div
                    key={sess.id}
                    className="p-3 bg-slate-950/50 border border-slate-800 rounded-lg text-xs space-y-1"
                  >
                    <div className="flex justify-between items-center">
                      <span
                        className={`font-semibold ${
                          sess.sessionType === 'RUNNING' ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        {sess.sessionType}
                      </span>
                      <span className="text-slate-400 font-mono">
                        {sess.durationMinutes !== null
                          ? `${sess.durationMinutes}m`
                          : 'Active live'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Started: {new Date(sess.startedAt).toLocaleTimeString()}
                      {sess.endedAt && ` → ${new Date(sess.endedAt).toLocaleTimeString()}`}
                    </div>
                    {sess.notes && (
                      <div className="text-[11px] text-slate-400 italic">
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

      {/* Pause Reason Modal */}
      {showPauseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-base font-semibold text-slate-100">Pause Work Session</h3>
              <button
                type="button"
                onClick={() => setShowPauseModal(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handlePauseSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Reason for Pause
                </label>
                <select
                  value={pauseReason}
                  onChange={(e) => setPauseReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="BREAK">Shift Break / Meal</option>
                  <option value="TOOLING">Tooling Adjustment / Calibration</option>
                  <option value="MATERIAL_SHORTAGE">Material Shortage</option>
                  <option value="WAITING_QC">Waiting for In-Process QC</option>
                  <option value="MACHINE_MAINTENANCE">Machine Issue / Maintenance</option>
                  <option value="OTHER">Other Reason</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Additional Notes
                </label>
                <textarea
                  value={pauseNotes}
                  onChange={(e) => setPauseNotes(e.target.value)}
                  placeholder="Optional details regarding pause..."
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowPauseModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pauseMutation.isPending}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-medium text-xs rounded transition"
                >
                  {pauseMutation.isPending ? 'Pausing...' : 'Confirm Pause'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
