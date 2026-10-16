import { apiRequest as request } from '@/lib/api/client';
import {
  CustomerOrderSummaryDTO,
  CustomerOrderDetailDTO,
} from '@/server/modules/portal/contracts';

export type { CustomerOrderSummaryDTO, CustomerOrderDetailDTO };

export async function fetchPortalOrders(): Promise<CustomerOrderSummaryDTO[]> {
  const res = await request<{ data: CustomerOrderSummaryDTO[] }>('/api/portal/orders');
  return res.data;
}

export async function fetchPortalOrder(id: string): Promise<CustomerOrderDetailDTO> {
  const res = await request<{ data: CustomerOrderDetailDTO }>(`/api/portal/orders/${id}`);
  return res.data;
}

export async function acknowledgeOrderPromise(
  id: string
): Promise<CustomerOrderDetailDTO> {
  const res = await request<{ data: CustomerOrderDetailDTO }>(
    `/api/portal/orders/${id}/acknowledge`,
    {
      method: 'POST',
    }
  );
  return res.data;
}

export async function downloadPortalDocument(
  documentId: string,
  fileName: string
): Promise<void> {
  const res = await fetch(`/api/documents/${documentId}/download`);
  if (!res.ok) {
    throw new Error(`Failed to download document: ${res.statusText}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}


export async function approveCustomerDrawing(
  orderId: string,
  drawingRevisionId: string,
  notes?: string
): Promise<{ data: any }> {
  return request(`/api/portal/orders/${orderId}/drawing-approval`, {
    method: 'POST',
    body: JSON.stringify({ drawingRevisionId, notes }),
  });
}

export async function submitCustomerChangeRequest(input: {
  orderId: string;
  changeType: 'QUANTITY' | 'DATE' | 'BOM' | 'SPECIFICATION' | 'CANCEL';
  reason: string;
  requestedChanges: Record<string, unknown>;
}): Promise<{ data: any }> {
  return request('/api/portal/change-requests', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function approveCustomerChangeRequest(changeRequestId: string): Promise<{ data: any }> {
  return request(`/api/portal/change-requests/${changeRequestId}/approve`, {
    method: 'POST',
  });
}
