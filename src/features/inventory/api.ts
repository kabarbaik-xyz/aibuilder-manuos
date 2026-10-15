import { apiRequest } from '@/lib/api/client';
import {
  StockBalanceDTO,
  StockMovementDTO,
  StockReservationDTO,
  TaskMaterialReadinessDTO,
  StockCountDTO,
  CreateStockCountInput,
  StockTransferInput,
  IssueToProductionInput,
  ReturnUnusedMaterialInput,
  ConsumeIssuedMaterialInput,
  ReverseMovementInput,
} from '@/server/modules/inventory/contracts';
import { Committed } from '@/domain/commands';

export async function fetchStockBalances(
  filters: { itemId?: string; locationId?: string; lotId?: string; isPositiveOnly?: boolean } = {}
): Promise<StockBalanceDTO[]> {
  const params = new URLSearchParams();
  if (filters.itemId) params.set('itemId', filters.itemId);
  if (filters.locationId) params.set('locationId', filters.locationId);
  if (filters.lotId) params.set('lotId', filters.lotId);
  if (filters.isPositiveOnly !== undefined) params.set('isPositiveOnly', String(filters.isPositiveOnly));

  const query = params.toString() ? `?${params.toString()}` : '';
  const res = await apiRequest<{ data: StockBalanceDTO[] }>(`/api/inventory/balances${query}`);
  return res.data;
}

export async function fetchStockMovements(
  filters: { itemId?: string; locationId?: string; lotId?: string; movementType?: string } = {}
): Promise<StockMovementDTO[]> {
  const params = new URLSearchParams();
  if (filters.itemId) params.set('itemId', filters.itemId);
  if (filters.locationId) params.set('locationId', filters.locationId);
  if (filters.lotId) params.set('lotId', filters.lotId);
  if (filters.movementType) params.set('movementType', filters.movementType);

  const query = params.toString() ? `?${params.toString()}` : '';
  const res = await apiRequest<{ data: StockMovementDTO[] }>(`/api/inventory/movements${query}`);
  return res.data;
}

export async function fetchStockCounts(): Promise<StockCountDTO[]> {
  const res = await apiRequest<{ data: StockCountDTO[] }>('/api/inventory/counts');
  return res.data;
}

export async function fetchStockCount(id: string): Promise<StockCountDTO> {
  const res = await apiRequest<{ data: StockCountDTO }>(`/api/inventory/counts/${id}`);
  return res.data;
}

export async function createStockCount(
  input: CreateStockCountInput,
  idempotencyKey?: string
): Promise<Committed<StockCountDTO>> {
  return apiRequest<Committed<StockCountDTO>>('/api/inventory/counts', {
    method: 'POST',
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
    body: JSON.stringify(input),
  });
}

export async function approveStockCount(
  id: string,
  idempotencyKey?: string
): Promise<Committed<StockCountDTO>> {
  return apiRequest<Committed<StockCountDTO>>(`/api/inventory/counts/${id}/approve`, {
    method: 'POST',
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
  });
}

export async function transferStock(
  input: StockTransferInput,
  idempotencyKey?: string
): Promise<Committed<StockMovementDTO>> {
  return apiRequest<Committed<StockMovementDTO>>('/api/inventory/transfers', {
    method: 'POST',
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
    body: JSON.stringify(input),
  });
}

export async function issueToProduction(
  input: IssueToProductionInput,
  idempotencyKey?: string
): Promise<Committed<StockMovementDTO>> {
  return apiRequest<Committed<StockMovementDTO>>('/api/inventory/issues', {
    method: 'POST',
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
    body: JSON.stringify(input),
  });
}

export async function returnUnusedMaterial(
  input: ReturnUnusedMaterialInput,
  idempotencyKey?: string
): Promise<Committed<StockMovementDTO>> {
  return apiRequest<Committed<StockMovementDTO>>('/api/inventory/returns', {
    method: 'POST',
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
    body: JSON.stringify(input),
  });
}

export async function reverseMovement(
  input: ReverseMovementInput,
  idempotencyKey?: string
): Promise<Committed<StockMovementDTO>> {
  return apiRequest<Committed<StockMovementDTO>>('/api/inventory/reversals', {
    method: 'POST',
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
    body: JSON.stringify(input),
  });
}

export async function fetchStockReservations(
  filters: { demandId?: string; orderId?: string; taskId?: string } = {}
): Promise<StockReservationDTO[]> {
  const params = new URLSearchParams();
  if (filters.demandId) params.set('demandId', filters.demandId);
  if (filters.orderId) params.set('orderId', filters.orderId);
  if (filters.taskId) params.set('taskId', filters.taskId);

  const query = params.toString() ? `?${params.toString()}` : '';
  const res = await apiRequest<{ data: StockReservationDTO[] }>(`/api/inventory/reservations${query}`);
  return res.data;
}

export async function fetchTaskMaterialReadiness(taskId: string): Promise<TaskMaterialReadinessDTO> {
  const res = await apiRequest<{ data: TaskMaterialReadinessDTO }>(`/api/inventory/readiness/${taskId}`);
  return res.data;
}
