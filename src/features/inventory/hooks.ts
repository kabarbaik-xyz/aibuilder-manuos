import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from './api';
import {
  CreateStockCountInput,
  StockTransferInput,
  IssueToProductionInput,
  ReturnUnusedMaterialInput,
  ReverseMovementInput,
} from '@/server/modules/inventory/contracts';

export function useStockBalances(
  filters: { itemId?: string; locationId?: string; lotId?: string; isPositiveOnly?: boolean } = {}
) {
  return useQuery({
    queryKey: ['stock-balances', filters],
    queryFn: () => api.fetchStockBalances(filters),
  });
}

export function useStockMovements(
  filters: { itemId?: string; locationId?: string; lotId?: string; movementType?: string } = {}
) {
  return useQuery({
    queryKey: ['stock-movements', filters],
    queryFn: () => api.fetchStockMovements(filters),
  });
}

export function useStockCounts() {
  return useQuery({
    queryKey: ['stock-counts'],
    queryFn: () => api.fetchStockCounts(),
  });
}

export function useStockCount(id: string) {
  return useQuery({
    queryKey: ['stock-count', id],
    queryFn: () => api.fetchStockCount(id),
    enabled: Boolean(id),
  });
}

export function useCreateStockCount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ input, idempotencyKey }: { input: CreateStockCountInput; idempotencyKey?: string }) =>
      api.createStockCount(input, idempotencyKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-counts'] });
    },
  });
}

export function useApproveStockCount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, idempotencyKey }: { id: string; idempotencyKey?: string }) =>
      api.approveStockCount(id, idempotencyKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-counts'] });
      queryClient.invalidateQueries({ queryKey: ['stock-balances'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
    },
  });
}

export function useStockTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ input, idempotencyKey }: { input: StockTransferInput; idempotencyKey?: string }) =>
      api.transferStock(input, idempotencyKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-balances'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
    },
  });
}

export function useIssueToProduction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ input, idempotencyKey }: { input: IssueToProductionInput; idempotencyKey?: string }) =>
      api.issueToProduction(input, idempotencyKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-balances'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      queryClient.invalidateQueries({ queryKey: ['task-readiness'] });
    },
  });
}

export function useReturnUnusedMaterial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ input, idempotencyKey }: { input: ReturnUnusedMaterialInput; idempotencyKey?: string }) =>
      api.returnUnusedMaterial(input, idempotencyKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-balances'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
    },
  });
}

export function useReverseMovement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ input, idempotencyKey }: { input: ReverseMovementInput; idempotencyKey?: string }) =>
      api.reverseMovement(input, idempotencyKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-balances'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
    },
  });
}

export function useStockReservations(filters: { demandId?: string; orderId?: string; taskId?: string } = {}) {
  return useQuery({
    queryKey: ['stock-reservations', filters],
    queryFn: () => api.fetchStockReservations(filters),
  });
}

export function useTaskMaterialReadiness(taskId: string) {
  return useQuery({
    queryKey: ['task-readiness', taskId],
    queryFn: () => api.fetchTaskMaterialReadiness(taskId),
    enabled: Boolean(taskId),
  });
}
