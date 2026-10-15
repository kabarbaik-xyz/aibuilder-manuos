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
      <div className="flex flex-col items-center justify-center p-12 text-muted">
        <Icon name="clock" className="w-8 h-8 animate-spin mb-3 text-primary" />
        <p className="text-sm">Loading active operator routing tasks...</p>
      </div>
    );
  }

  if (error || !tasks) {
    return (
      <div className="p-8 text-center bg-danger-soft border border-line rounded-xl my-6">
        <p className="text-danger font-medium mb-2">Unable to load tasks</p>
        <p className="text-xs text-muted mb-4">
          {error?.message || "Unknown error"}
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="px-4 py-2 bg-surface hover:bg-surface-muted text-ink text-xs rounded-lg transition"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-surface border border-line p-4 rounded-xl">
        <div>
          <h2 className="text-lg font-bold text-ink flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-success-soft animate-pulse" />
            Live Shop Floor Routing
          </h2>
          <p className="text-xs text-muted">
            Work sessions are server-timestamped and guarded against
            out-of-order execution.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="px-3 py-1.5 bg-surface hover:bg-surface-muted text-ink text-xs rounded-lg transition flex items-center gap-1.5"
        >
          <Icon name="reset" className="w-3.5 h-3.5" />
          Refresh Tasks
        </button>
      </div>

      {/* Task Cards Grid */}
      {tasks.length === 0 ? (
        <div className="p-12 text-center bg-surface border border-line rounded-xl">
          <p className="text-muted text-sm">
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
                className={`flex flex-col justify-between p-5 rounded-xl border transition-all duration-200   ${
                  isRunning
                    ? "bg-success-soft border-success/20 "
                    : isPaused
                      ? "bg-warning-soft border-warning/20"
                      : "bg-surface border-line hover:border-line"
                }`}
              >
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <span className="px-2 py-0.5 text-xs font-mono font-bold bg-surface text-ink rounded">
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

                  <h3 className="text-base font-semibold text-ink mb-1">
                    {task.nodeName}
                  </h3>
                  <p className="text-xs text-muted mb-3 truncate">
                    Order:{" "}
                    <strong className="text-ink">
                      {task.orderNumber}
                    </strong>{" "}
                    ({task.customerName})
                  </p>

                  <div className="p-3 bg-surface rounded-lg border border-line space-y-2 mb-4 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted">Target Item:</span>
                      <span className="text-ink font-medium truncate max-w-40">
                        {task.itemName}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Planned Duration:</span>
                      <span className="text-ink font-mono">
                        {task.plannedDurationMinutes} mins
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted">Elapsed Time:</span>
                      <span
                        className={`font-mono font-bold ${
                          isRunning
                            ? "text-success animate-pulse"
                            : "text-ink"
                        }`}
                      >
                        {task.currentElapsedMinutes} mins
                      </span>
                    </div>
                  </div>

                  {task.blockReason && !task.canStart && (
                    <div className="p-2 mb-3 bg-danger-soft border border-line rounded text-xs text-danger">
                      ⚠ {task.blockReason}
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-line flex items-center justify-between">
                  <span className="text-xs text-muted">
                    {task.canStart ? "Eligible for execution" : "Blocked"}
                  </span>
                  <Link
                    href={`/shop-floor/tasks/${task.id}`}
                    className="px-3.5 py-1.5 bg-primary hover:bg-primary-soft text-white font-medium text-xs rounded-lg transition shadow-md flex items-center gap-1.5"
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
