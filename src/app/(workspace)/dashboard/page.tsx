"use client";

import React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { LoadingState, ErrorState } from "@/components/ui/resource-state";
import { apiRequest } from "@/lib/api/client";
import { useGraphStore } from "@/store/graph-store";
import type { DashboardOverviewDTO } from "@/server/modules/intelligence/dashboard";
import { parseQuantity } from "@/domain/quantity";

export default function DashboardPage() {
  const openModal = useGraphStore((s) => s.openModal);
  const [showAllExceptions, setShowAllExceptions] = React.useState(false);

  const {
    data: overview,
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: ["dashboard", "overview"],
    queryFn: async () => {
      const res = await apiRequest<{ data: DashboardOverviewDTO }>(
        "/api/intelligence/dashboard",
      );
      return res.data;
    },
    refetchInterval: 15000,
  });

  if (isPending)
    return <LoadingState message="Loading factory Command Center…" />;
  if (error)
    return (
      <ErrorState
        title="Failed to load dashboard overview"
        onRetry={() => refetch()}
      />
    );
  const metrics = overview.metrics;

  const exceptions = overview.exceptions;
  const orders = overview.orders;

  const exceptionPriority: Record<string, number> = {
    CRITICAL: 0,
    WARNING: 1,
    INFO: 2,
  };
  const prioritizedExceptions = [...exceptions].sort(
    (left, right) =>
      exceptionPriority[left.severity] - exceptionPriority[right.severity],
  );
  const visibleExceptions = showAllExceptions
    ? prioritizedExceptions
    : prioritizedExceptions.slice(0, 5);
  const criticalCount = exceptions.filter(
    (item) => item.severity === "CRITICAL",
  ).length;
  const warningCount = exceptions.filter(
    (item) => item.severity === "WARNING",
  ).length;
  const infoCount = exceptions.filter(
    (item) => item.severity === "INFO",
  ).length;
  const recentOrders = orders.slice(0, 5);

  const inspectedAtoms = parseQuantity(metrics.qcInspectedUnits);
  const passedAtoms = parseQuantity(metrics.qcPassedUnits);
  const yieldPct =
    inspectedAtoms > 0n
      ? Math.round(Number((passedAtoms * 10000n) / inspectedAtoms) / 100)
      : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Command Center"
        description="Live factory overview, operational exceptions, order progress, and resource utilization."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="soft" onClick={() => openModal("brain")}>
              <Icon name="spark" />
              <span>Ask ManuOS</span>
            </Button>
            <Link href="/orders/new" className="btn primary">
              <Icon name="plus" />
              <span>New Order Intake</span>
            </Link>
          </div>
        }
      />

      {/* Factory snapshot */}
      <Panel className="overflow-hidden bg-surface border-line">
        <div className="border-b border-line px-5 py-3.5">
          <h2 className="text-sm font-bold text-ink">Factory snapshot</h2>
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-line md:grid-cols-3 xl:grid-cols-6 xl:divide-y-0">
          <div className="min-w-0 px-4 py-4 xl:px-4">
            <div className="text-xs font-semibold text-muted">Active orders</div>
            <div className="mt-1 tabular-nums text-2xl font-bold tracking-tight text-ink">
              {metrics.activeOrdersCount}
            </div>
            <div className="mt-1 text-xs text-muted">
              {metrics.ordersDueThisWeekCount} due this week
            </div>
          </div>
          <div className="min-w-0 px-4 py-4 xl:px-4">
            <div className="text-xs font-semibold text-muted">At risk</div>
            <div className="mt-1 tabular-nums text-2xl font-bold tracking-tight text-ink">
              {metrics.atRiskOrdersCount}
            </div>
            <div className="mt-1 text-xs text-muted">Lead time or shortages</div>
          </div>
          <div className="min-w-0 px-4 py-4 xl:px-4">
            <div className="text-xs font-semibold text-muted">First-pass yield</div>
            <div className="mt-1 tabular-nums text-2xl font-bold tracking-tight text-ink">
              {yieldPct === null ? "—" : `${yieldPct}%`}
            </div>
            <div className="mt-1 text-xs text-muted">
              {inspectedAtoms === 0n
                ? "No finalized inspections yet"
                : `${metrics.qcPassedUnits} passed · ${metrics.reworkUnits} rework`}
            </div>
          </div>
          <div className="min-w-0 px-4 py-4 xl:px-4">
            <div className="text-xs font-semibold text-muted">
              Machine utilization
            </div>
            <div className="mt-1 tabular-nums text-2xl font-bold tracking-tight text-ink">
              {metrics.machineUtilizationPct === null
                ? "—"
                : `${metrics.machineUtilizationPct}%`}
            </div>
            <div className="mt-1 text-xs text-muted">
              {metrics.activeMachinesCount} active units
            </div>
          </div>
          <div className="min-w-0 px-4 py-4 xl:px-4">
            <div className="text-xs font-semibold text-muted">Material shortages</div>
            <div className="mt-1 tabular-nums text-2xl font-bold tracking-tight text-ink">
              {metrics.materialShortagesCount}
            </div>
            <div className="mt-1 text-xs text-muted">Awaiting PO arrival</div>
          </div>
          <div className="min-w-0 px-4 py-4 xl:px-4">
            <div className="text-xs font-semibold text-muted">Pending approvals</div>
            <div className="mt-1 tabular-nums text-2xl font-bold tracking-tight text-ink">
              {metrics.pendingApprovalsCount}
            </div>
            <div className="mt-1 text-xs text-muted">Engineering &amp; release</div>
          </div>
        </div>
      </Panel>

      {/* Attention & Exceptions Queue */}
      <Panel className="overflow-hidden bg-surface border-line">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-primary">
              <Icon name="alert" />
            </span>
            <div>
              <h2 className="text-base font-bold text-ink">Needs attention</h2>
              <p className="mt-0.5 text-xs text-muted">
                Exceptions that need an operational review
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium">
            <span className="tabular-nums text-ink">{exceptions.length} open</span>
            {criticalCount > 0 && (
              <span className="text-danger">{criticalCount} critical</span>
            )}
            {warningCount > 0 && (
              <span className="text-warning">{warningCount} warning</span>
            )}
            {infoCount > 0 && (
              <span className="text-muted">{infoCount} info</span>
            )}
          </div>
        </div>

        {exceptions.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-5 py-8 text-sm text-muted">
            <Icon name="check" className="text-success" />
            <span>
              All production lines, quality gates, and deliveries are running
              within nominal thresholds.
            </span>
          </div>
        ) : (
          <div className="divide-y divide-line px-5">
            {visibleExceptions.map((ex) => {
              const variant =
                ex.severity === "CRITICAL"
                  ? "danger"
                  : ex.severity === "WARNING"
                    ? "warning"
                    : "blue";
              return (
                <div
                  key={ex.id}
                  className="grid grid-cols-1 items-center gap-3 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-6"
                >
                  <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2 gap-y-1">
                      <Badge
                        variant={variant}
                        className="row-span-2 mt-0.5 shrink-0 text-xs font-bold uppercase"
                      >
                        {ex.severity}
                      </Badge>
                    <span className="text-sm font-semibold text-ink">
                        {ex.title}
                      </span>
                    <p className="text-xs leading-5 text-muted">
                      {ex.description}
                    </p>
                  </div>
                  <Link
                    href={ex.actionScreen}
                    className="btn soft min-h-9 w-fit shrink-0 text-xs"
                  >
                    Review
                  </Link>
                </div>
              );
            })}
          </div>
        )}
        {exceptions.length > 5 && (
          <div className="border-t border-line px-5 py-3">
            <button
              type="button"
              className="text-sm font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
              onClick={() => setShowAllExceptions((visible) => !visible)}
              aria-expanded={showAllExceptions}
            >
              {showAllExceptions
                ? "Show priority exceptions"
                : `View all ${exceptions.length} exceptions`}
            </button>
          </div>
        )}
      </Panel>

      {/* Active Orders Live Progress */}
      <Panel className="p-4 bg-surface border-line space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-2.5">
          <div>
            <h2 className="text-sm font-bold text-ink">
              Recent Production Orders
            </h2>
            <p className="text-xs text-muted">
              Latest orders from the production pipeline.
            </p>
          </div>
          <Link
            href="/orders"
            className="text-xs text-primary hover:underline font-medium"
          >
            Open Order Hub →
          </Link>
        </div>

        {orders.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted">
            No active manufacturing orders. Start by creating an intake draft
            from RFQ specification.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b bg-surface-muted text-muted font-semibold border-line">
                  <th className="p-2.5">Order #</th>
                  <th className="p-2.5">Customer</th>
                  <th className="p-2.5">Part / Item</th>
                  <th className="p-2.5">Progress</th>
                  <th className="p-2.5">Status</th>
                  <th className="p-2.5">Promised Delivery</th>
                  <th className="p-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {recentOrders.map((ord) => (
                  <tr key={ord.id} className="hover:bg-surface-muted/60">
                    <td className="p-2.5 font-mono font-bold text-primary">
                      <Link
                        href={`/orders/${ord.id}`}
                        className="hover:underline"
                      >
                        {ord.orderNumber}
                      </Link>
                    </td>
                    <td className="p-2.5 font-medium text-ink">
                      {ord.customerName}
                    </td>
                    <td className="p-2.5 text-muted">
                      <span className="text-ink font-medium">
                        {ord.itemName}
                      </span>{" "}
                      <span className="text-xs font-mono">
                        ({ord.itemCode})
                      </span>
                    </td>
                    <td className="p-2.5 min-w-35">
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted">
                            {ord.completedQty} / {ord.orderedQty}
                          </span>
                          <span className="font-semibold text-ink">
                            {ord.progressPct}%
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-surface-muted overflow-hidden border border-line">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{
                              width: `${Math.min(100, Math.max(0, ord.progressPct))}%`,
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="p-2.5">
                      <Badge
                        variant={
                          ord.status === "COMPLETED"
                            ? "success"
                            : ord.status === "RELEASED" ||
                                ord.status === "IN_PRODUCTION"
                              ? "blue"
                              : "default"
                        }
                      >
                        {ord.status}
                      </Badge>
                    </td>
                    <td className="p-2.5 text-muted font-mono">
                      {ord.promisedDate
                        ? new Date(ord.promisedDate).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="p-2.5 text-right">
                      <Link
                        href={`/orders/${ord.id}`}
                        className="btn soft text-xs py-1 px-2.5"
                      >
                        Details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
