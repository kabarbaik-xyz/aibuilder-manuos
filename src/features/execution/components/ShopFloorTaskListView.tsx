"use client";

import React from "react";
import { useMyTasks } from "../hooks";
import { Icon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export function ShopFloorTaskListView() {
  const { data: tasks, isLoading, error, refetch } = useMyTasks();

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-400">
        <Icon name="clock" className="w-8 h-8 animate-spin mb-3 text-sky-400" />
        <p className="text-sm">Loading active operator routing tasks...</p>
      </div>
    );
  }

  if (error || !tasks) {
    return (
      <div className="p-8 text-center bg-rose-950/20 border border-rose-900/30 rounded-xl my-6">
        <p className="text-rose-400 font-medium mb-2">Unable to load tasks</p>
        <p className="text-xs text-slate-400 mb-4">
          {error?.message || "Unknown error"}
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg transition"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900/60 border border-slate-800 p-4 rounded-xl backdrop-blur-md">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            Live Shop Floor Routing
          </h2>
          <p className="text-xs text-slate-400">
            Work sessions are server-timestamped and guarded against
            out-of-order execution.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition flex items-center gap-1.5"
        >
          <Icon name="reset" className="w-3.5 h-3.5" />
          Refresh Tasks
        </button>
      </div>

      {/* Task Cards Grid */}
      {tasks.length === 0 ? (
        <div className="p-12 text-center bg-slate-900/40 border border-slate-800 rounded-xl">
          <p className="text-slate-400 text-sm">
            No active tasks assigned to your workstation.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tasks.map((task) => {
            const isRunning = task.status === "RUNNING";
            const isPaused = task.status === "PAUSED";

            return (
              <div
                key={task.id}
                className={`flex flex-col justify-between p-5 rounded-xl border transition-all duration-200 backdrop-blur-md shadow-lg ${
                  isRunning
                    ? "bg-emerald-950/20 border-emerald-500/40 shadow-emerald-950/20"
                    : isPaused
                      ? "bg-amber-950/20 border-amber-500/40"
                      : "bg-slate-900/60 border-slate-800/80 hover:border-slate-700"
                }`}
              >
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <span className="px-2 py-0.5 text-xs font-mono font-bold bg-slate-800 text-slate-200 rounded">
                      {task.nodeKey}
                    </span>
                    {isRunning ? (
                      <Badge variant="blue">LIVE RUNNING</Badge>
                    ) : isPaused ? (
                      <Badge variant="warning">PAUSED</Badge>
                    ) : (
                      <Badge variant="default">{task.status}</Badge>
                    )}
                  </div>

                  <h3 className="text-base font-semibold text-slate-100 mb-1">
                    {task.nodeName}
                  </h3>
                  <p className="text-xs text-slate-400 mb-3 truncate">
                    Order:{" "}
                    <strong className="text-slate-300">
                      {task.orderNumber}
                    </strong>{" "}
                    ({task.customerName})
                  </p>

                  <div className="p-3 bg-slate-950/50 rounded-lg border border-slate-800/80 space-y-2 mb-4 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Target Item:</span>
                      <span className="text-slate-200 font-medium truncate max-w-40">
                        {task.itemName}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Planned Duration:</span>
                      <span className="text-slate-300 font-mono">
                        {task.plannedDurationMinutes} mins
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Elapsed Time:</span>
                      <span
                        className={`font-mono font-bold ${
                          isRunning
                            ? "text-emerald-400 animate-pulse"
                            : "text-slate-300"
                        }`}
                      >
                        {task.currentElapsedMinutes} mins
                      </span>
                    </div>
                  </div>

                  {task.blockReason && !task.canStart && (
                    <div className="p-2 mb-3 bg-rose-950/30 border border-rose-900/40 rounded text-[11px] text-rose-300">
                      ⚠ {task.blockReason}
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">
                    {task.canStart ? "Eligible for execution" : "Blocked"}
                  </span>
                  <Link
                    href={`/shop-floor/tasks/${task.id}`}
                    className="px-3.5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs rounded-lg transition shadow-md shadow-sky-950/40 flex items-center gap-1.5"
                  >
                    Open Workstation →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
