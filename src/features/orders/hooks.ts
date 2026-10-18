import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/api/query-keys';
import { ordersApi } from './api';

export function useOrders(filters?: { customerId?: string; status?: string }) {
  return useQuery({
    queryKey: queryKeys.orders(filters),
    queryFn: () => ordersApi.listOrders(filters),
  });
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: queryKeys.order(id),
    queryFn: () => ordersApi.getOrder(id),
    enabled: !!id,
  });
}

export function useCreateOrderDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ordersApi.createOrderDraft,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useAddCustomerQuestion(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (question: string) => ordersApi.addCustomerQuestion(orderId, question),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.order(orderId) });
    },
  });
}

export function useReleaseOrder(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => ordersApi.releaseOrder(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.order(orderId) });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useConfirmOrder(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => ordersApi.confirmOrder(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.order(orderId) });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

import { orderCostingApi, OrderCostSummary } from "./api";

export function useOrderCosting(orderId: string, enabled = true) {
  return useQuery({
    queryKey: ["orders", orderId, "costing"],
    queryFn: () => orderCostingApi.getCostSummary(orderId),
    enabled: Boolean(orderId) && enabled,
  });
}

export function useRecordOrderCost(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof orderCostingApi.recordCost>[1]) =>
      orderCostingApi.recordCost(orderId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders", orderId, "costing"] });
    },
  });
}

export function useCreateOrderChangeRequest(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof ordersApi.createChangeRequest>[1]) =>
      ordersApi.createChangeRequest(orderId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders", orderId] });
    },
  });
}
