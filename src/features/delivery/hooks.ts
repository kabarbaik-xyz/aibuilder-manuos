import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchShipments,
  fetchShipmentById,
  allocateShipment,
  dispatchShipment,
  confirmDelivery,
  AllocateShipmentInput,
  DispatchShipmentInput,
  ConfirmDeliveryInput,
} from './api';

export function useShipments(filters?: { orderId?: string; customerId?: string; status?: string }) {
  return useQuery({
    queryKey: ['delivery', 'shipments', filters],
    queryFn: () => fetchShipments(filters),
    refetchInterval: 5000,
  });
}

export function useShipment(id: string) {
  return useQuery({
    queryKey: ['delivery', 'shipment', id],
    queryFn: () => fetchShipmentById(id),
    enabled: Boolean(id),
  });
}

export function useAllocateShipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AllocateShipmentInput) => allocateShipment(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

export function useDispatchShipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DispatchShipmentInput) => dispatchShipment(input),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['delivery'] });
      queryClient.invalidateQueries({ queryKey: ['delivery', 'shipment', vars.shipmentId] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

export function useConfirmDelivery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ConfirmDeliveryInput) => confirmDelivery(input),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['delivery'] });
      queryClient.invalidateQueries({ queryKey: ['delivery', 'shipment', vars.shipmentId] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
