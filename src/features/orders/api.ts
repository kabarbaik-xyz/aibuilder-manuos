import { apiRequest } from '@/lib/api/client';
import { CreateOrderDraftInput } from '@/server/modules/orders/contracts';

export interface OrderDto {
  id: string;
  workspaceId: string;
  orderNumber: string;
  customerId: string;
  orderTypeId: string;
  itemId: string;
  orderedAtoms: string | number | bigint;
  requestedDate: string;
  promisedDate: string | null;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  customer?: { id: string; code: string; name: string };
  orderType?: { id: string; code: string; name: string };
  item?: { id: string; code: string; name: string; baseUom?: { code: string; name: string } };
  questions?: Array<{
    id: string;
    question: string;
    answer: string | null;
    status: string;
    createdAt: string;
  }>;
  rfqDrafts?: Array<{
    id: string;
    rawText: string;
    sourceType: string;
    createdAt: string;
  }>;
  engineeringRevisions?: Array<{
    id: string;
    revisionNumber: number;
    status: string;
    workflowVersionId: string | null;
    bomLines?: any[];
  }>;
  instances?: Array<{
    id: string;
    status: string;
    tasks?: any[];
  }>;
}

export const ordersApi = {
  listOrders: async (filters?: { customerId?: string; status?: string }) => {
    const params = new URLSearchParams();
    if (filters?.customerId) params.set('customerId', filters.customerId);
    if (filters?.status) params.set('status', filters.status);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await apiRequest<{ data: OrderDto[] }>(`/api/orders${qs}`);
    return res.data;
  },

  getOrder: async (id: string) => {
    const res = await apiRequest<{ data: OrderDto }>(`/api/orders/${id}`);
    return res.data;
  },

  createOrderDraft: async (data: CreateOrderDraftInput) => {
    return apiRequest<{ data: OrderDto }>('/api/orders', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  addCustomerQuestion: async (orderId: string, question: string) => {
    return apiRequest<{ data: any }>(`/api/orders/${orderId}/questions`, {
      method: 'POST',
      body: JSON.stringify({ question }),
    });
  },

  releaseOrder: async (orderId: string) => {
    return apiRequest<{ data: any }>(`/api/orders/${orderId}/release`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },
};
