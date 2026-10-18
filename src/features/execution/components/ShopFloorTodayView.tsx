'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspaceNavigation } from "@/components/workspace-navigation-context";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/resource-state";
import { useMyTasks, useScanBarcode } from "../hooks";
import { getScanOpenPath } from "../scan-routing";
import { QrScannerOverlay } from '@/components/ui/qr-scanner-overlay';
import { useOnlineStatus } from "../use-online-status";

function formatMinutes(value: number) {
  return value < 60 ? `${value}m` : `${Math.floor(value / 60)}h${value % 60 ? ` ${value % 60}m` : ""}`;
}

const taskStatusLabels: Record<string, string> = {
  RUNNING: "Running",
  PAUSED: "Paused",
  WAITING_QC: "Waiting QC",
  READY: "Ready",
  ASSIGNED: "Assigned",
  BLOCKED: "Blocked",
};

export function ShopFloorTodayView() {
  const router = useRouter();
  const { principal } = useWorkspaceNavigation();
  const isOnline = useOnlineStatus();
  const [scanCode, setScanCode] = useState("");
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const scanMutation = useScanBarcode();

  const { data: myTasks, isLoading, error, refetch } = useMyTasks();

  const [showCamera, setShowCamera] = useState(false);
  const handleScanSubmit = async (e?: React.FormEvent<HTMLFormElement>, override?: string) => {
    e?.preventDefault();
    const code = (override ?? scanCode).trim();
    if (!code) return;
    if (!isOnline) {
      setScanMessage('Scanning requires a server connection. Reconnect and try again.');
      return;
    }
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
          ? `${result.displayCode} found, but no active tasks can be opened.`
          : "Code recognized, but this account does not have access to open that order."
      );
    } catch (submitErr) {
      setScanMessage(submitErr instanceof Error ? submitErr.message : "Code not found or not accessible to this account.");
    }
  };

  const activeTask = myTasks?.find((t) => t.status === "RUNNING");
  const pausedTask = myTasks?.find((t) => t.status === "PAUSED");
  const queuedTasks = (myTasks || []).filter((t) => t.status !== "COMPLETED" && t.status !== "CANCELLED");

  return (
    <div className="page-stack">
      <PageHeader
        title="Work queue"
        description={`Active production tasks for ${principal?.name || "Operator"}`}
        actions={
          <Button icon="reset" onClick={() => void refetch()}>
            Refresh
          </Button>
        }
      />

      {/* Subnavigation Bar */}
      <Tabs
        ariaLabel="Shop floor navigation"
        activeId="today"
        items={[
          { id: "all", label: "All tasks", href: "/shop-floor", icon: "work" },
          { id: "today", label: "Work queue", href: "/shop-floor/today", icon: "clock", count: isLoading ? undefined : queuedTasks.length },
          { id: "profile", label: "My profile", href: "/shop-floor/profile", icon: "technician" },
        ]}
      />

      {/* Online-only mutation state */}
      <div className="p-3 bg-surface border border-line rounded-xl flex items-center justify-between flex-wrap gap-2 text-xs">
        <div className="flex items-center gap-2">
          <Badge variant={isOnline ? "success" : "warning"}>
              {isOnline ? "Device online" : "Device offline"}
          </Badge>
          <span className="text-muted">
            {isOnline
              ? "Changes require a server connection and are not saved while offline."
              : "Scanning and execution become available after reconnecting."}
          </span>
        </div>
        {principal?.facilityId && !/^[a-z]+-[0-9a-f]{8}-/i.test(principal.facilityId) && (
          <Badge variant="default">Facility: {principal.facilityId}</Badge>
        )}
      </div>

      {/* Quick Scan Entry */}
      <form
        className="my-work-scan rounded-xl border border-line bg-surface"
        onSubmit={handleScanSubmit}
        aria-label="Scan a barcode at the workstation"
      >
        <Input
          type="text"
          placeholder="Scan a QR code or enter a task / job code…"
          value={scanCode}
          onChange={(e) => setScanCode(e.target.value)}
        />
        <Button type="button" icon="qr" disabled={!isOnline || scanMutation.isPending} onClick={() => setShowCamera(true)}>
          Scan QR
        </Button>
        <Button type="submit" variant="primary" disabled={!isOnline || !scanCode.trim() || scanMutation.isPending}>
          {scanMutation.isPending ? "Checking…" : "Open code"}
        </Button>
        {scanMessage && (
          <p role="status" className="my-work-scan-message text-amber-700 font-medium">
            {scanMessage}
          </p>
        )}
      </form>
      <QrScannerOverlay
        open={showCamera}
        onClose={() => setShowCamera(false)}
        onDetect={(code) => { setShowCamera(false); setScanCode(code); void handleScanSubmit(undefined, code); }}
      />

      {/* Active Running Session Alert */}
      {activeTask && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block" />
              <strong className="text-xs font-bold text-emerald-800 uppercase tracking-wide">
                Active session
              </strong>
            </div>
            <h3 className="text-sm font-semibold text-ink mt-1">
              {activeTask.nodeKey} — {activeTask.itemName}
            </h3>
            <p className="text-xs text-muted">
              Order {activeTask.orderNumber} ({activeTask.customerName}) •{" "}
              elapsed {formatMinutes(activeTask.currentElapsedMinutes)}
            </p>
          </div>
          <ButtonLink href={`/shop-floor/tasks/${activeTask.id}`} variant="primary" size="small">
            Continue work
          </ButtonLink>
        </div>
      )}

      {/* Paused Session Alert */}
      {!activeTask && pausedTask && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between flex-wrap gap-3">
          <div>
            <strong className="text-xs font-bold text-amber-800 uppercase tracking-wide">
              Work session paused
            </strong>
            <h3 className="text-sm font-semibold text-ink mt-1">
              {pausedTask.nodeKey} — {pausedTask.itemName}
            </h3>
            <p className="text-xs text-muted">
              Order {pausedTask.orderNumber} • Waiting for the session to resume
            </p>
          </div>
          <ButtonLink href={`/shop-floor/tasks/${pausedTask.id}`} variant="primary" size="small">
            Review & continue
          </ButtonLink>
        </div>
      )}

      {/* Tasks Queue for Today */}
      <section className="space-y-3" aria-label="Active task queue">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink">
          Active queue ({queuedTasks.length})
          </h2>
          <span className="text-xs text-muted">Select a task to open the workstation</span>
        </div>

        {isLoading ? (
          <LoadingState message="Loading work queue…" />
        ) : error ? (
          <ErrorState message={error.message} onRetry={() => void refetch()} />
        ) : queuedTasks.length === 0 ? (
          <EmptyState
            title="No active tasks"
            description="Active production tasks will appear here once they are assigned."
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
                      {taskStatusLabels[t.status] || t.status}
                    </Badge>
                  </div>
                  <h3 className="text-sm font-medium text-ink mt-1.5">
                    {t.itemName}
                  </h3>
                    <p className="text-xs text-muted">
                      Order {t.orderNumber} • {t.customerName} • Planned {formatMinutes(t.plannedDurationMinutes)}
                  </p>
                </div>
                <ButtonLink
                  href={`/shop-floor/tasks/${t.id}`}
                  size="small"
                  variant={t.status === "RUNNING" || t.status === "PAUSED" ? "primary" : "default"}
                >
                  {t.status === "RUNNING" ? "Running" : t.status === "PAUSED" ? "Paused" : "View task"}
                </ButtonLink>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
