'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspaceNavigation } from "@/components/workspace-navigation-context";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/resource-state";
import { useMyTasks, useScanBarcode } from "../hooks";
import { getScanOpenPath } from "../scan-routing";

function formatMinutes(value: number) {
  return value < 60 ? `${value}m` : `${Math.floor(value / 60)}h${value % 60 ? ` ${value % 60}m` : ""}`;
}

export function ShopFloorTodayView() {
  const router = useRouter();
  const { principal } = useWorkspaceNavigation();
  const [scanCode, setScanCode] = useState("");
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const scanMutation = useScanBarcode();

  const { data: myTasks, isLoading, error, refetch } = useMyTasks();

  const handleScanSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const code = scanCode.trim();
    if (!code) return;
    setScanMessage(null);
    try {
      const result = await scanMutation.mutateAsync(code);
      const openPath = getScanOpenPath(result, principal?.permissions.includes("order.read") ?? false);
      if (openPath) {
        setScanMessage(null);
        router.push(openPath);
        return;
      }
      setScanMessage(
        result.type === "JOB"
          ? `${result.displayCode} found, but no active task is available to open.`
          : "Code recognised, but your account does not have access to open this order."
      );
    } catch (submitErr) {
      setScanMessage(submitErr instanceof Error ? submitErr.message : "Code not found or not accessible with this account.");
    }
  };

  const todayStr = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());

  const activeTask = myTasks?.find((t) => t.status === "RUNNING");
  const pausedTask = myTasks?.find((t) => t.status === "PAUSED");
  const queuedTasks = (myTasks || []).filter((t) => t.status !== "COMPLETED" && t.status !== "CANCELLED");

  return (
    <div className="page-stack">
      <PageHeader
        title="Today on Shop Floor"
        description={`${todayStr} — Execution station for ${principal?.name || "Operator"}`}
        actions={
          <Button icon="reset" onClick={() => void refetch()}>
            Refresh
          </Button>
        }
      />

      {/* Subnavigation Bar */}
      <div className="flex items-center gap-2 border-b border-line pb-3">
        <ButtonLink href="/shop-floor" size="small" variant="default">
          All Tasks
        </ButtonLink>
        <ButtonLink href="/shop-floor/today" size="small" variant="primary">
          Today
        </ButtonLink>
        <ButtonLink href="/shop-floor/profile" size="small" variant="default">
          My Profile
        </ButtonLink>
      </div>

      {/* Online Mutation & Roster Badge */}
      <div className="p-3 bg-surface border border-line rounded-xl flex items-center justify-between flex-wrap gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
          <strong className="text-ink font-medium">Online Mode</strong>
          <span className="text-muted">— Server-authoritative live execution</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="blue">Assigned Shift: Active</Badge>
          {principal?.facilityId && <Badge variant="default">Facility: {principal.facilityId}</Badge>}
        </div>
      </div>

      {/* Quick Scan Entry */}
      <form
        className="p-4 bg-surface border border-line rounded-xl flex flex-wrap gap-2 items-center"
        onSubmit={handleScanSubmit}
        aria-label="Quick scan barcode on mobile workstation"
      >
        <div className="flex-1 min-w-[200px]">
          <Input
            type="text"
            placeholder="Scan QR or enter task / job barcode…"
            value={scanCode}
            onChange={(e) => setScanCode(e.target.value)}
          />
        </div>
        <Button type="submit" variant="primary" disabled={!scanCode.trim() || scanMutation.isPending}>
          {scanMutation.isPending ? "Checking…" : "Scan & Open"}
        </Button>
        {scanMessage && (
          <p role="status" className="w-full text-xs text-amber-700 font-medium mt-1">
            {scanMessage}
          </p>
        )}
      </form>

      {/* Active Running Session Alert */}
      {activeTask && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block" />
              <strong className="text-xs font-bold text-emerald-800 uppercase tracking-wide">
                Current Active Session
              </strong>
            </div>
            <h3 className="text-sm font-semibold text-ink mt-1">
              {activeTask.nodeKey} — {activeTask.itemName}
            </h3>
            <p className="text-xs text-muted">
              Order {activeTask.orderNumber} ({activeTask.customerName}) •{" "}
              {formatMinutes(activeTask.currentElapsedMinutes)} elapsed
            </p>
          </div>
          <ButtonLink href={`/shop-floor/tasks/${activeTask.id}`} variant="primary" size="small">
            Continue Work
          </ButtonLink>
        </div>
      )}

      {/* Paused Session Alert */}
      {!activeTask && pausedTask && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between flex-wrap gap-3">
          <div>
            <strong className="text-xs font-bold text-amber-800 uppercase tracking-wide">
              Work Session Paused
            </strong>
            <h3 className="text-sm font-semibold text-ink mt-1">
              {pausedTask.nodeKey} — {pausedTask.itemName}
            </h3>
            <p className="text-xs text-muted">
              Order {pausedTask.orderNumber} • Paused session awaiting resumption
            </p>
          </div>
          <ButtonLink href={`/shop-floor/tasks/${pausedTask.id}`} variant="primary" size="small">
            Review Pause & Resume
          </ButtonLink>
        </div>
      )}

      {/* Tasks Queue for Today */}
      <section className="space-y-3" aria-label="Today assigned tasks">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink">
            Active Queue ({queuedTasks.length})
          </h2>
          <span className="text-xs text-muted">Tap task to open execution station</span>
        </div>

        {isLoading ? (
          <LoadingState message="Loading today's schedule…" />
        ) : error ? (
          <ErrorState message={error.message} onRetry={() => void refetch()} />
        ) : queuedTasks.length === 0 ? (
          <EmptyState
            title="No tasks scheduled for today"
            description="Your work queue is clear. New production orders will appear here once released."
          />
        ) : (
          <div className="grid gap-3">
            {queuedTasks.map((t) => (
              <div
                key={t.id}
                className="p-4 bg-surface border border-line rounded-xl flex items-center justify-between flex-wrap gap-3 hover:border-primary transition"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-ink bg-surface-muted px-2 py-0.5 rounded border border-line">
                      {t.nodeKey}
                    </span>
                    <Badge
                      variant={
                        t.status === "RUNNING"
                          ? "success"
                          : t.status === "PAUSED" || t.status === "WAITING_QC"
                          ? "warning"
                          : "default"
                      }
                    >
                      {t.status}
                    </Badge>
                  </div>
                  <h3 className="text-sm font-medium text-ink mt-1.5">
                    {t.itemName}
                  </h3>
                  <p className="text-xs text-muted">
                    Order {t.orderNumber} • {t.customerName} • Planned{" "}
                    {formatMinutes(t.plannedDurationMinutes)}
                  </p>
                </div>
                <ButtonLink
                  href={`/shop-floor/tasks/${t.id}`}
                  size="small"
                  variant={t.status === "RUNNING" || t.status === "PAUSED" ? "primary" : "default"}
                >
                  {t.status === "RUNNING" ? "Continue" : t.status === "PAUSED" ? "Resume" : "Open Task"}
                </ButtonLink>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
