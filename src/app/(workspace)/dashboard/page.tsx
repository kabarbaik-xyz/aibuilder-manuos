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
import { useUiStore } from "@/store/ui-store";
import type { DashboardOverviewDTO } from "@/server/modules/intelligence/dashboard";
import { parseQuantity } from "@/domain/quantity";
import { DashboardCharts } from "@/features/command-center/dashboard-charts";
import "@/features/command-center/command-center.css";

export default function DashboardPage() {
  const openModal = useUiStore((s) => s.openModal);
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
    : prioritizedExceptions.slice(0, 4);
  const criticalCount = exceptions.filter(
    (item) => item.severity === "CRITICAL",
  ).length;
  const warningCount = exceptions.filter(
    (item) => item.severity === "WARNING",
  ).length;
  const recentOrders = orders.slice(0, 5);

  const inspectedAtoms = parseQuantity(metrics.qcInspectedUnits);
  const passedAtoms = parseQuantity(metrics.qcPassedUnits);
  const yieldPct =
    inspectedAtoms > 0n
      ? Math.round(Number((passedAtoms * 10000n) / inspectedAtoms) / 100)
      : null;

  return (
    <div className="command-center">
      <PageHeader
        title="Command Center"
        description="Production, commitments, and the decisions that keep work moving."
        actions={<>
          <Button variant="soft" icon="spark" onClick={() => openModal("brain")}>Ask AI</Button>
          <Link href="/orders/new" className="btn primary"><Icon name="plus" />New order intake</Link>
        </>}
      />

      <div className="cc-toolbar">
        <div className="cc-snapshot"><Icon name="clock" /><span>Updated {new Date(overview.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><span className="cc-toolbar-divider" /><span>Refreshes every 15s</span></div>
        <Button variant="text" iconRight="reset" onClick={() => refetch()}>Refresh snapshot</Button>
      </div>

      <Panel className="cc-brief">
        <div className={`cc-brief-symbol ${criticalCount > 0 ? 'is-critical' : ''}`}><Icon name={criticalCount > 0 ? 'alert' : 'shield'} /></div>
        <div className="cc-brief-copy">
          <h2>{criticalCount > 0 ? `${criticalCount} critical exceptions require a decision` : exceptions.length > 0 ? `${exceptions.length} exceptions ready for review` : 'No exceptions in this snapshot'}</h2>
          <p>{metrics.atRiskOrdersCount} orders at risk <span>·</span> {metrics.materialShortagesCount} material shortages <span>·</span> {metrics.pendingApprovalsCount} pending approvals</p>
        </div>
        <div className="cc-brief-actions"><Link href="/ai/risks" className="btn soft">Open risk inbox<Icon name="arrow" /></Link><Link href="/planning" className="cc-link">Open planning<Icon name="arrow" /></Link></div>
      </Panel>

      <section className="cc-metrics" aria-label="Factory snapshot">
        {[
          { label: 'Active orders', value: metrics.activeOrdersCount, detail: `${metrics.ordersDueThisWeekCount} due / overdue`, icon: 'order' as const },
          { label: 'Orders at risk', value: metrics.atRiskOrdersCount, detail: 'Commitment exceptions', icon: 'flag' as const },
          { label: 'First-pass yield', value: yieldPct === null ? '—' : `${yieldPct}%`, detail: inspectedAtoms === 0n ? 'No finalized inspections' : `${metrics.qcPassedUnits} passed · ${metrics.reworkUnits} rework`, icon: 'shield' as const },
          { label: 'Scheduled machine load', value: metrics.machineUtilizationPct === null ? '—' : `${metrics.machineUtilizationPct}%`, detail: `${metrics.activeMachinesCount} machines available`, icon: 'machine' as const },
          { label: 'Material shortages', value: metrics.materialShortagesCount, detail: 'Open replenishment needs', icon: 'inventory' as const },
          { label: 'Pending approvals', value: metrics.pendingApprovalsCount, detail: 'Engineering & release', icon: 'engineering' as const },
        ].map((metric) => <div className="cc-metric" key={metric.label}>
          <div className="cc-metric-label"><span>{metric.label}</span><Icon name={metric.icon} /></div>
          <strong>{metric.value}</strong><p>{metric.detail}</p>
        </div>)}
      </section>

      <div className="cc-control-grid">
        <DashboardCharts orders={orders} />
        <Panel className="cc-decisions">
          <div className="cc-section-head"><div><h2>Decision queue</h2><p>Highest severity first</p></div><span className="cc-count">{exceptions.length} open</span></div>
          <div className="cc-severity-summary"><span><i className="cc-dot critical" />{criticalCount} critical</span><span><i className="cc-dot warning" />{warningCount} warning</span></div>
          {exceptions.length === 0 ? <div className="cc-empty"><Icon name="check" /><p>No exceptions surfaced. Review the production view for current work.</p></div> : <div className="cc-decision-list">
            {visibleExceptions.map((ex) => <Link key={ex.id} href={`/ai/risks/${encodeURIComponent(ex.id)}`} className="cc-decision">
              <div className="cc-decision-top"><Badge variant={ex.severity === 'CRITICAL' ? 'danger' : ex.severity === 'WARNING' ? 'warning' : 'default'}>{ex.severity.charAt(0) + ex.severity.slice(1).toLowerCase()}</Badge><Icon name="arrow" /></div>
              <h3>{ex.title}</h3><p>{ex.description}</p>
            </Link>)}
          </div>}
          {exceptions.length > 4 && <button type="button" className="cc-queue-toggle" onClick={() => setShowAllExceptions((value) => !value)} aria-expanded={showAllExceptions}>{showAllExceptions ? 'Show priority exceptions' : `Show all ${exceptions.length} exceptions`}<Icon name={showAllExceptions ? 'reset' : 'down'} /></button>}
        </Panel>
      </div>

      <Panel className="cc-order-panel">
        <div className="cc-section-head"><div><h2>Order watchlist</h2><p>Five latest orders · quantities, commitments, and status</p></div><Link href="/orders" className="cc-link">Order Hub<Icon name="arrow" /></Link></div>
        {orders.length === 0 ? <div className="cc-empty"><p>No orders available. Create an order intake to begin.</p></div> : <div className="cc-table-scroll"><table className="cc-orders">
          <thead><tr><th>Order / customer</th><th>Part / item</th><th>QC-passed quantity</th><th>Status</th><th>Promised delivery</th><th><span className="sr-only">Review</span></th></tr></thead>
          <tbody>{recentOrders.map((ord) => <tr key={ord.id}>
            <td><Link href={`/orders/${ord.id}`} className="cc-order-number">{ord.orderNumber}</Link><span className="cc-cell-detail">{ord.customerName}</span></td>
            <td><span className="cc-cell-title">{ord.itemName}</span><span className="cc-cell-detail">{ord.itemCode}</span></td>
            <td><div className="cc-table-progress"><span>{ord.completedQty} / {ord.orderedQty}</span><strong>{ord.progressPct}%</strong></div><div className="cc-mini-track"><span style={{ width: `${Math.min(100, Math.max(0, ord.progressPct))}%` }} /></div></td>
            <td><Badge variant={ord.status === 'DELIVERED' || ord.status === 'COMPLETED' ? 'success' : ord.status === 'RELEASED' || ord.status === 'IN_PRODUCTION' ? 'blue' : 'default'}>{ord.status.replaceAll('_', ' ').toLowerCase().replace(/^./, (letter) => letter.toUpperCase())}</Badge></td>
            <td className="cc-date">{ord.promisedDate ? new Date(ord.promisedDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
            <td><Link href={`/orders/${ord.id}`} className="icon-btn" aria-label={`Review ${ord.orderNumber}`}><Icon name="arrow" /></Link></td>
          </tr>)}</tbody>
        </table></div>}
      </Panel>
      <p className="cc-scope-note"><Icon name="info" />Order metrics cover the 50 most recently created orders. Material shortages reflect open material demands.</p>
    </div>
  );
}
