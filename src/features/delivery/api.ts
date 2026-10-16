import { apiRequest as request } from '@/lib/api/client';
import { hydrateAtomFields, stringifyQuantities } from '@/lib/api/quantities';

async function apiRequest<T>(url: string, options?: RequestInit): Promise<T> {
  return hydrateAtomFields(await request<T>(url, options));
}

export interface ShipmentDTO {
  id: string;
  workspaceId: string;
  shipmentNumber: string;
  orderId: string;
  customerId: string;
  status: 'ALLOCATED' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED';
  allocatedAt: string;
  dispatchedAt?: string | null;
  deliveredAt?: string | null;
  carrierName?: string | null;
  trackingNumber?: string | null;
  destinationAddress?: string | null;
  proofOfDelivery?: string | null;
  receivedBy?: string | null;
  notes?: string | null;
  order?: {
    id: string;
    orderNumber: string;
    orderedAtoms: bigint;
    status: string;
    item?: { id: string; code: string; name: string };
  };
  customer?: {
    id: string;
    code: string;
    name: string;
  };
  lines: Array<{
    id: string;
    orderLineId?: string | null;
    itemId: string;
    lotId?: string | null;
    sourceLocationId: string;
    allocatedAtoms: bigint;
    dispatchedAtoms: bigint;
    deliveredAtoms: bigint;
    item?: { id: string; code: string; name: string };
    lot?: { id: string; lotNumber: string } | null;
    sourceLocation?: { id: string; name: string; kind: string };
  }>;
}

export async function fetchShipments(filters?: {
  orderId?: string;
  customerId?: string;
  status?: string;
}): Promise<ShipmentDTO[]> {
  const params = new URLSearchParams();
  if (filters?.orderId) params.set('orderId', filters.orderId);
  if (filters?.customerId) params.set('customerId', filters.customerId);
  if (filters?.status) params.set('status', filters.status);
  const q = params.toString() ? `?${params.toString()}` : '';
  const res = await apiRequest<{ data: ShipmentDTO[] }>(`/api/delivery/shipments${q}`);
  return res.data;
}

export async function fetchShipmentById(id: string): Promise<ShipmentDTO> {
  const res = await apiRequest<{ data: ShipmentDTO }>(`/api/delivery/shipments/${id}`);
  return res.data;
}

export interface AllocateShipmentInput {
  orderId: string;
  lines: Array<{
    orderLineId?: string;
    itemId: string;
    lotId?: string;
    sourceLocationId: string;
    allocatedAtoms: bigint | string | number;
  }>;
  carrierName?: string;
  trackingNumber?: string;
  destinationAddress?: string;
  notes?: string;
}

export async function allocateShipment(input: AllocateShipmentInput) {
  return apiRequest('/api/delivery/shipments', {
    method: 'POST',
    body: JSON.stringify(stringifyQuantities(input)),
  });
}

export interface DispatchShipmentInput {
  shipmentId: string;
  carrierName?: string;
  trackingNumber?: string;
  notes?: string;
}

export async function dispatchShipment(input: DispatchShipmentInput) {
  const { shipmentId, ...body } = input;
  return apiRequest(`/api/delivery/shipments/${shipmentId}/dispatch`, {
    method: 'POST',
    body: JSON.stringify(stringifyQuantities(body)),
  });
}

export interface ConfirmDeliveryInput {
  shipmentId: string;
  proofOfDelivery?: string;
  receivedBy?: string;
  deliveredAt?: string;
  notes?: string;
}

export async function confirmDelivery(input: ConfirmDeliveryInput) {
  const { shipmentId, ...body } = input;
  return apiRequest(`/api/delivery/shipments/${shipmentId}/confirm`, {
    method: 'POST',
    body: JSON.stringify(stringifyQuantities(body)),
  });
}
