import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchSupplyOrders,
  fetchSupplyOrder,
  createSupplyOrder,
  approveSupplyOrder,
  changeSupplyEta,
  receiveSupply,
  fetchSupplyReceipts,
  fetchMaterialDemandAllocationContext,
  setMaterialDemandAllocations,
} from './api';
import {
  CreateSupplyOrderInput,
  ChangeSupplyEtaInput,
  ReceiveSupplyInput,
  SetMaterialSupplyAllocationsInput,
} from '@/server/modules/supply/contracts';

export const supplyKeys = {
  all: ['supply'] as const,
  orders: (filters?: { supplierId?: string; status?: string }) =>
    [...supplyKeys.all, 'orders', filters] as const,
  order: (id: string) => [...supplyKeys.all, 'order', id] as const,
  receipts: (filters?: { supplyOrderId?: string }) =>
    [...supplyKeys.all, 'receipts', filters] as const,
  allocationContext: (id: string) => [...supplyKeys.all, 'allocation-context', id] as const,
};

export function useSupplyOrders(filters?: { supplierId?: string; status?: string }) {
  return useQuery({
    queryKey: supplyKeys.orders(filters),
    queryFn: () => fetchSupplyOrders(filters),
  });
}

export function useSupplyOrder(id: string) {
  return useQuery({
    queryKey: supplyKeys.order(id),
    queryFn: () => fetchSupplyOrder(id),
    enabled: Boolean(id),
  });
}

export function useSupplyReceipts(filters?: { supplyOrderId?: string }) {
  return useQuery({
    queryKey: supplyKeys.receipts(filters),
    queryFn: () => fetchSupplyReceipts(filters),
  });
}

export function useMaterialDemandAllocationContext(id: string, enabled = true) {
  return useQuery({
    queryKey: supplyKeys.allocationContext(id),
    queryFn: () => fetchMaterialDemandAllocationContext(id),
    enabled: Boolean(id) && enabled,
  });
}

export function useSetMaterialDemandAllocations() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input, idempotencyKey }: { id: string; input: SetMaterialSupplyAllocationsInput; idempotencyKey?: string }) =>
      setMaterialDemandAllocations(id, input, idempotencyKey),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: supplyKeys.order(vars.id) });
      queryClient.invalidateQueries({ queryKey: supplyKeys.allocationContext(vars.id) });
      queryClient.invalidateQueries({ queryKey: supplyKeys.all });
    },
  });
}

export function useCreateSupplyOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      input,
      idempotencyKey,
    }: {
      input: CreateSupplyOrderInput;
      idempotencyKey?: string;
    }) => createSupplyOrder(input, idempotencyKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: supplyKeys.all });
    },
  });
}

export function useApproveSupplyOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      idempotencyKey,
    }: {
      id: string;
      idempotencyKey?: string;
    }) => approveSupplyOrder(id, idempotencyKey),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: supplyKeys.order(vars.id) });
      queryClient.invalidateQueries({ queryKey: supplyKeys.all });
    },
  });
}

export function useChangeSupplyEta() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
      idempotencyKey,
    }: {
      id: string;
      input: ChangeSupplyEtaInput;
      idempotencyKey?: string;
    }) => changeSupplyEta(id, input, idempotencyKey),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: supplyKeys.order(vars.id) });
      queryClient.invalidateQueries({ queryKey: supplyKeys.all });
    },
  });
}

export function useReceiveSupply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      input,
      idempotencyKey,
    }: {
      input: ReceiveSupplyInput;
      idempotencyKey?: string;
    }) => receiveSupply(input, idempotencyKey),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: supplyKeys.order(vars.input.supplyOrderId) });
      queryClient.invalidateQueries({ queryKey: supplyKeys.all });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}
