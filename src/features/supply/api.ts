import { apiRequest } from '@/lib/api/client';
import {
  SupplyOrderDTO,
  SupplyReceiptDTO,
  CreateSupplyOrderInput,
  ChangeSupplyEtaInput,
  ReceiveSupplyInput,
} from '@/server/modules/supply/contracts';
import { Committed } from '@/domain/commands';

export async function fetchSupplyOrders(
  filters: { supplierId?: string; status?: string } = {}
): Promise<SupplyOrderDTO[]> {
  const params = new URLSearchParams();
  if (filters.supplierId) params.set('supplierId', filters.supplierId);
  if (filters.status) params.set('status', filters.status);

  const query = params.toString() ? `?${params.toString()}` : '';
  const res = await apiRequest<{ data: SupplyOrderDTO[] }>(`/api/supply-orders${query}`);
  return res.data;
}

export async function fetchSupplyOrder(id: string): Promise<SupplyOrderDTO> {
  const res = await apiRequest<{ data: SupplyOrderDTO }>(`/api/supply-orders/${id}`);
  return res.data;
}

export async function createSupplyOrder(
  input: CreateSupplyOrderInput,
  idempotencyKey?: string
): Promise<Committed<SupplyOrderDTO>> {
  return apiRequest<Committed<SupplyOrderDTO>>('/api/supply-orders', {
    method: 'POST',
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
    body: JSON.stringify(input),
  });
}

export async function approveSupplyOrder(
  id: string,
  idempotencyKey?: string
): Promise<Committed<SupplyOrderDTO>> {
  return apiRequest<Committed<SupplyOrderDTO>>(`/api/supply-orders/${id}/approve`, {
    method: 'POST',
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
  });
}

export async function changeSupplyEta(
  id: string,
  input: ChangeSupplyEtaInput,
  idempotencyKey?: string
): Promise<Committed<SupplyOrderDTO>> {
  return apiRequest<Committed<SupplyOrderDTO>>(`/api/supply-orders/${id}/eta`, {
    method: 'PUT',
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
    body: JSON.stringify(input),
  });
}

export async function receiveSupply(
  input: ReceiveSupplyInput,
  idempotencyKey?: string
): Promise<Committed<SupplyReceiptDTO>> {
  return apiRequest<Committed<SupplyReceiptDTO>>('/api/inventory/receipts', {
    method: 'POST',
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
    body: JSON.stringify(input),
  });
}

export async function fetchSupplyReceipts(
  filters: { supplyOrderId?: string } = {}
): Promise<SupplyReceiptDTO[]> {
  const params = new URLSearchParams();
  if (filters.supplyOrderId) params.set('supplyOrderId', filters.supplyOrderId);

  const query = params.toString() ? `?${params.toString()}` : '';
  const res = await apiRequest<{ data: SupplyReceiptDTO[] }>(`/api/inventory/receipts${query}`);
  return res.data;
}
