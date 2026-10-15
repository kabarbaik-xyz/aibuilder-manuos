import { GraphStoreState } from './graph-store';
import { Order } from '../domain/types';

export function selectRealProgress(state: GraphStoreState, orderId = '1042'): {
  orderedQty: number;
  completedQty: number;
  qcPassedQty: number;
  progressPct: number;
  awaitingQC: number;
} {
  const order = state.orders.find((o) => o.id === orderId) || state.orders[0];
  const progressPct = order.orderedQty > 0
    ? Math.round((order.qcPassedQty / order.orderedQty) * 1000) / 10
    : 0;

  return {
    orderedQty: order.orderedQty,
    completedQty: order.completedQty,
    qcPassedQty: order.qcPassedQty,
    progressPct,
    awaitingQC: Math.max(0, order.completedQty - order.qcPassedQty),
  };
}

export function selectFactoryMetrics(state: GraphStoreState): {
  activeOrdersCount: number;
  ordersToWatchCount: number;
  pendingDecisionsCount: number;
  qcPassedPct: number;
} {
  const activeOrders = state.orders.filter((o) => o.status !== 'DELIVERED');
  const atRisk = state.orders.filter((o) => o.status === 'AT_RISK' || o.status === 'WATCH');
  const decisions = state.activeRecovery && state.activeRecovery.status === 'PROPOSED' ? 1 : 0;
  const progress = selectRealProgress(state, '1042');

  return {
    activeOrdersCount: activeOrders.length,
    ordersToWatchCount: state.disruption.isDelayed ? atRisk.length : 0,
    pendingDecisionsCount: decisions,
    qcPassedPct: progress.progressPct,
  };
}

export function selectCustomerSafeOrders(state: GraphStoreState): Order[] {
  // Sarah Chen (Meridian Energy) is only permitted to see order #1042
  return state.orders.filter((o) => o.id === '1042');
}
