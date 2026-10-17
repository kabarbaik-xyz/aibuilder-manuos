import type { DashboardExceptionDTO, DashboardOrderRowDTO } from '@/server/modules/intelligence/dashboard';

const severities = ['CRITICAL', 'WARNING', 'INFO'] as const;

export function buildDashboardChartData(
  orders: ReadonlyArray<Pick<DashboardOrderRowDTO, 'id' | 'orderNumber' | 'itemName' | 'completedQty' | 'orderedQty' | 'progressPct'>>,
  exceptions: ReadonlyArray<Pick<DashboardExceptionDTO, 'severity'>>,
) {
  const orderProgress = orders.slice(0, 5).map((order) => ({
    ...order,
    progressPct: Number.isFinite(order.progressPct)
      ? Math.min(100, Math.max(0, order.progressPct))
      : 0,
  }));

  const exceptionMix = severities.map((severity) => {
    const count = exceptions.filter((exception) => exception.severity === severity).length;
    return { severity, count, percent: exceptions.length ? Math.round((count / exceptions.length) * 100) : 0 };
  });

  return { orderProgress, exceptionMix };
}
