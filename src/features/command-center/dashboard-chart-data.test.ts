import { describe, expect, it } from 'vitest';
import { buildDashboardChartData } from './dashboard-chart-data';

describe('buildDashboardChartData', () => {
  it('limits order bars to the five latest records and clamps progress', () => {
    const orders = Array.from({ length: 6 }, (_, index) => ({
      id: `order-${index}`,
      orderNumber: `ORD-${index}`,
      customerName: 'Customer',
      itemCode: 'ITEM',
      itemName: 'Item',
      orderedQty: '10',
      completedQty: '1',
      progressPct: index === 0 ? 140 : index === 1 ? -5 : 50,
      status: 'IN_PRODUCTION',
      promisedDate: null,
      priority: 'NORMAL',
    }));

    const chart = buildDashboardChartData(orders, []);

    expect(chart.orderProgress).toHaveLength(5);
    expect(chart.orderProgress[0].progressPct).toBe(100);
    expect(chart.orderProgress[1].progressPct).toBe(0);
  });

  it('counts current exceptions by severity without inventing a time series', () => {
    const chart = buildDashboardChartData([], [
      { severity: 'CRITICAL' },
      { severity: 'CRITICAL' },
      { severity: 'WARNING' },
      { severity: 'INFO' },
    ] as const);

    expect(chart.exceptionMix).toEqual([
      { severity: 'CRITICAL', count: 2, percent: 50 },
      { severity: 'WARNING', count: 1, percent: 25 },
      { severity: 'INFO', count: 1, percent: 25 },
    ]);
  });

  it('returns a zeroed severity mix for an empty inbox', () => {
    const chart = buildDashboardChartData([], []);
    expect(chart.exceptionMix.map(({ count, percent }) => ({ count, percent }))).toEqual([
      { count: 0, percent: 0 },
      { count: 0, percent: 0 },
      { count: 0, percent: 0 },
    ]);
  });
});
