'use client';

import React, { useState } from 'react';
import { useSchedule, useAssignTask } from '../hooks';
import { Icon } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

export function PlanningScheduleView() {
  const { data: schedule, isLoading, error, refetch } = useSchedule();
  const assignMutation = useAssignTask();

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [technicianId, setTechnicianId] = useState('');
  const [machineId, setMachineId] = useState('');
  const [assignError, setAssignError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-400">
        <Icon name="clock" className="w-8 h-8 animate-spin mb-3 text-sky-400" />
        <p className="text-sm">Calculating deterministic production schedule & critical path...</p>
      </div>
    );
  }

  if (error || !schedule) {
    return (
      <div className="p-8 text-center bg-rose-950/20 border border-rose-900/30 rounded-xl my-6">
        <p className="text-rose-400 font-medium mb-2">Unable to load production schedule</p>
        <p className="text-xs text-slate-400 mb-4">{error?.message || 'Unknown error'}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg transition"
        >
          Retry Calculation
        </button>
      </div>
    );
  }

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTaskId) return;
    setAssignError(null);

    try {
      await assignMutation.mutateAsync({
        taskId: selectedTaskId,
        technicianId: technicianId.trim() || null,
        machineId: machineId.trim() || null,
      });
      setSelectedTaskId(null);
      setTechnicianId('');
      setMachineId('');
      refetch();
    } catch (err: any) {
      setAssignError(err.message || 'Failed to assign resource');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-xl backdrop-blur-md">
          <span className="text-xs font-semibold text-slate-400 tracking-wider uppercase">Projected Makespan</span>
          <div className="text-2xl font-bold text-slate-100 mt-1">
            {Math.floor(schedule.makespanMinutes / 60)}h {schedule.makespanMinutes % 60}m
          </div>
          <p className="text-xs text-slate-400 mt-1">Total active working duration</p>
        </div>

        <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-xl backdrop-blur-md">
          <span className="text-xs font-semibold text-slate-400 tracking-wider uppercase">Projected Finish</span>
          <div className="text-lg font-bold text-emerald-400 mt-1 truncate">
            {schedule.projectedEndAt ? new Date(schedule.projectedEndAt).toLocaleString() : 'N/A'}
          </div>
          <p className="text-xs text-slate-400 mt-1">Taking shifts & weekends into account</p>
        </div>

        <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-xl backdrop-blur-md">
          <span className="text-xs font-semibold text-slate-400 tracking-wider uppercase">Critical Path</span>
          <div className="text-2xl font-bold text-amber-400 mt-1">
            {schedule.criticalPath.length} Tasks
          </div>
          <p className="text-xs text-slate-400 mt-1">Zero slack activities</p>
        </div>

        <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-xl backdrop-blur-md">
          <span className="text-xs font-semibold text-slate-400 tracking-wider uppercase">Total Tasks</span>
          <div className="text-2xl font-bold text-sky-400 mt-1">
            {schedule.scheduledTasks.length}
          </div>
          <p className="text-xs text-slate-400 mt-1">Sequenced in routing network</p>
        </div>
      </div>

      {/* Schedule Table */}
      <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl overflow-hidden shadow-xl backdrop-blur-md">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/40">
          <div>
            <h2 className="text-base font-semibold text-slate-200">Production Routing & Critical Path Schedule</h2>
            <p className="text-xs text-slate-400">Timezone-aware scheduling engine with shift calendars and slack calculation</p>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition flex items-center gap-1.5"
          >
            <Icon name="reset" className="w-3.5 h-3.5" />
            Recalculate
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800/80 bg-slate-950/50 text-slate-400 uppercase tracking-wider font-semibold">
                <th className="py-3 px-4">Task ID</th>
                <th className="py-3 px-4">Path Type</th>
                <th className="py-3 px-4">Earliest Start</th>
                <th className="py-3 px-4">Projected Finish</th>
                <th className="py-3 px-4">Slack</th>
                <th className="py-3 px-4">Material Wait</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50 text-slate-300">
              {schedule.scheduledTasks.map((task) => (
                <tr
                  key={task.taskId}
                  className={`hover:bg-slate-800/40 transition-colors ${
                    task.isCriticalPath ? 'bg-amber-950/10' : ''
                  }`}
                >
                  <td className="py-3 px-4 font-mono font-medium text-slate-200">
                    <Link
                      href={`/planning/tasks/${task.taskId}`}
                      className="hover:text-sky-400 underline underline-offset-2 decoration-slate-700 hover:decoration-sky-400 transition"
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
                  <td className="py-3 px-4 text-slate-300">
                    {new Date(task.startAt).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="py-3 px-4 text-slate-300">
                    {new Date(task.endAt).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="py-3 px-4">
                    {task.slackMinutes === 0 ? (
                      <span className="text-amber-400 font-mono font-semibold">0m</span>
                    ) : (
                      <span className="text-slate-400 font-mono">
                        {Math.floor(task.slackMinutes / 60)}h {task.slackMinutes % 60}m
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {task.materialWaitMinutes > 0 ? (
                      <span className="text-rose-400 font-semibold font-mono">
                        +{Math.floor(task.materialWaitMinutes / 60)}h wait
                      </span>
                    ) : (
                      <span className="text-emerald-400 font-medium">Ready</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedTaskId(task.taskId)}
                      className="px-2.5 py-1 bg-sky-950/60 hover:bg-sky-900 border border-sky-800 text-sky-200 text-xs rounded transition"
                    >
                      Assign Resource
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Resource Assignment Modal */}
      {selectedTaskId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-base font-semibold text-slate-100">Assign Resources</h3>
              <button
                type="button"
                onClick={() => setSelectedTaskId(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAssignSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Task ID
                </label>
                <input
                  type="text"
                  disabled
                  value={selectedTaskId}
                  className="w-full bg-slate-950/50 border border-slate-800 rounded px-3 py-2 text-xs text-slate-400 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Technician ID
                </label>
                <input
                  type="text"
                  value={technicianId}
                  onChange={(e) => setTechnicianId(e.target.value)}
                  placeholder="e.g. UUID of assigned technician"
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Machine ID
                </label>
                <input
                  type="text"
                  value={machineId}
                  onChange={(e) => setMachineId(e.target.value)}
                  placeholder="e.g. UUID of assigned CNC/Machine"
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                />
              </div>

              {assignError && (
                <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded text-xs text-rose-300 whitespace-pre-wrap">
                  {assignError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedTaskId(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assignMutation.isPending}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs rounded transition disabled:opacity-50"
                >
                  {assignMutation.isPending ? 'Verifying & Assigning...' : 'Confirm Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
