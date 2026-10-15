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
