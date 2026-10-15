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

export default function DashboardPage() {
  const openModal = useGraphStore((s) => s.openModal);

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

  const metrics = overview?.metrics ?? {
    activeOrdersCount: 0,
    ordersDueThisWeekCount: 0,
    atRiskOrdersCount: 0,
    qcPassedUnits: 0,
    reworkUnits: 0,
    machineUtilizationPct: 0,
    activeMachinesCount: 0,
    materialShortagesCount: 0,
    pendingApprovalsCount: 0,
  };

  const exceptions = overview?.exceptions ?? [];
  const orders = overview?.orders ?? [];

  const totalInspected = metrics.qcPassedUnits + metrics.reworkUnits;
  const yieldPct =
    totalInspected > 0
      ? Math.round((metrics.qcPassedUnits / totalInspected) * 100)
      : 100;

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

      {/* Top Operational Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Panel className="p-3.5 bg-surface border-line">
          <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">
            Active Orders
          </div>
          <div className="mt-1 text-2xl font-bold text-ink">
            {metrics.activeOrdersCount}
          </div>
          <div className="mt-1 text-[11px] text-muted">
            <span className="font-medium text-ink">
              {metrics.ordersDueThisWeekCount}
            </span>{" "}
            due this week
          </div>
        </Panel>

        <Panel className="p-3.5 bg-surface border-line">
          <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">
            At-Risk Orders
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold ${metrics.atRiskOrdersCount > 0 ? "text-danger" : "text-ink"}`}
            >
              {metrics.atRiskOrdersCount}
            </span>
            {metrics.atRiskOrdersCount > 0 && (
              <Badge variant="danger" className="text-[10px]">
                Attention
              </Badge>
            )}
          </div>
          <div className="mt-1 text-[11px] text-muted">
            Lead time or shortages
          </div>
        </Panel>

        <Panel className="p-3.5 bg-surface border-line">
          <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">
            First-Pass Yield
          </div>
          <div className="mt-1 text-2xl font-bold text-ink">{yieldPct}%</div>
          <div className="mt-1 text-[11px] text-muted">
            <span className="text-ink font-medium">
              {metrics.qcPassedUnits}
            </span>{" "}
            passed ·{" "}
            <span className="text-muted">{metrics.reworkUnits} rework</span>
          </div>
        </Panel>

        <Panel className="p-3.5 bg-surface border-line">
          <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">
            Machine Utilization
          </div>
          <div className="mt-1 text-2xl font-bold text-ink">
            {metrics.machineUtilizationPct}%
          </div>
          <div className="mt-1 text-[11px] text-muted">
            <span className="text-ink font-medium">
              {metrics.activeMachinesCount}
            </span>{" "}
            active units
          </div>
        </Panel>

        <Panel className="p-3.5 bg-surface border-line">
          <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">
            Material Shortages
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold ${metrics.materialShortagesCount > 0 ? "text-warning" : "text-ink"}`}
            >
              {metrics.materialShortagesCount}
            </span>
            {metrics.materialShortagesCount > 0 && (
              <Badge variant="warning" className="text-[10px]">
                Supply Gaps
              </Badge>
            )}
          </div>
          <div className="mt-1 text-[11px] text-muted">Awaiting PO arrival</div>
        </Panel>

        <Panel className="p-3.5 bg-surface border-line">
          <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">
            Pending Approvals
          </div>
          <div className="mt-1 text-2xl font-bold text-ink">
            {metrics.pendingApprovalsCount}
          </div>
          <div className="mt-1 text-[11px] text-muted">
            Engineering & release
          </div>
        </Panel>
      </div>

      {/* Attention & Exceptions Queue */}
      <Panel className="p-4 bg-surface border-line space-y-3">
        <div className="flex items-center justify-between border-b border-line pb-2.5">
          <div className="flex items-center gap-2">
            <Icon name="alert" className="text-primary" />
            <h2 className="text-sm font-bold text-ink">
              Operational Attention & Exceptions Queue
            </h2>
          </div>
          <span className="text-xs font-mono text-muted">
            {exceptions.length === 0
              ? "0 active alerts"
              : `${exceptions.length} require action`}
          </span>
        </div>

        {exceptions.length === 0 ? (
          <div className="py-4 text-center text-xs text-muted flex items-center justify-center gap-2">
            <Icon name="check" className="text-success" />
            <span>
              All production lines, quality gates, and deliveries are running
              within nominal thresholds.
            </span>
          </div>
        ) : (
          <div className="divide-y divide-line">
            {exceptions.map((ex) => {
              const variant =
                ex.severity === "CRITICAL"
                  ? "danger"
                  : ex.severity === "WARNING"
                    ? "warning"
                    : "blue";
              return (
                <div
                  key={ex.id}
                  className="py-2.5 flex items-center justify-between gap-4"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={variant}
                        className="text-[10px] font-bold uppercase"
                      >
                        {ex.severity}
                      </Badge>
                      <span className="text-xs font-semibold text-ink">
                        {ex.title}
                      </span>
                    </div>
                    <p className="text-xs text-muted">{ex.description}</p>
                  </div>
                  <Link
                    href={ex.actionScreen}
                    className="btn soft text-xs shrink-0"
                  >
                    Resolve
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* Active Orders Live Progress */}
      <Panel className="p-4 bg-surface border-line space-y-3">
        <div className="flex items-center justify-between border-b border-line pb-2.5">
          <div>
            <h2 className="text-sm font-bold text-ink">
              Active Production Orders
            </h2>
            <p className="text-xs text-muted">
              Real-time status across released jobsheets and shop floor work.
            </p>
          </div>
          <Link
            href="/orders"
            className="text-xs text-primary hover:underline font-medium"
          >
            View all orders →
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
                {orders.map((ord) => (
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
                      <span className="text-[11px] font-mono">
                        ({ord.itemCode})
                      </span>
                    </td>
                    <td className="p-2.5 min-w-35">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px]">
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
