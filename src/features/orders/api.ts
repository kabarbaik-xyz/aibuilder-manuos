import { apiRequest } from '@/lib/api/client';
import { CreateOrderDraftInput } from '@/server/modules/orders/contracts';

export interface OrderDto {
  id: string;
  workspaceId: string;
  orderNumber: string;
  facility?: { id: string; code: string; name: string } | null;
  customerId: string;
  orderTypeId: string;
  lifecycleWorkflowVersionId?: string | null;
  itemId: string;
  orderedAtoms: string | number | bigint;
  requestedDate: string;
  promisedDate: string | null;
  deliveryAddress?: string | null;
  confirmedAt?: string | null;
  status: string;
  customerAcknowledged?: boolean;
  customerAcknowledgedAt?: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  customer?: { id: string; code: string; name: string };
  orderType?: { id: string; code: string; name: string };
  item?: { id: string; code: string; name: string; baseUom?: { code: string; name: string } };
  lines?: Array<{
    id: string;
    lineNumber: number;
    itemId: string;
    orderedAtoms: string | number | bigint;
    allocatedAtoms: string | number | bigint;
    shippedAtoms: string | number | bigint;
    item?: { id: string; code: string; name: string; baseUom?: { code: string; name: string } };
    manufacturingOrders?: Array<{ id: string; moNumber: string; engineeringRevisionId?: string | null; targetAtoms: string | number | bigint; status: string }>;
  }>;
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
    orderLineId?: string | null;
    outputBasisAtoms?: string | number | bigint;
    workflowVersionId: string | null;
    bomLines?: any[];
  }>;
  instances?: Array<{
    id: string;
    engineeringRevisionId?: string;
    status: string;
    tasks?: any[];
  }>;
  lifecycleInstances?: Array<{
    id: string;
    status: string;
    workflowVersion: { versionNumber: number; template: { name: string } };
    stages: Array<{
      id: string;
      stageKey: string;
      name: string;
      action: string;
      state: string;
      dueAt: string | null;
      department: { name: string };
      assignedMembership?: { user: { name: string } } | null;
      formPinsJson: string;
    }>;
    events: Array<{
      id: string;
      stageId: string | null;
      eventType: string;
      fromState: string | null;
      toState: string | null;
      detailJson: string;
      occurredAt: string;
      actorName?: string;
    }>;
  }>;
  demands?: Array<{
    id: string;
    itemId: string;
    requiredAtoms: string | number | bigint;
    needByDate: string | null;
    status: string;
    item?: { id: string; code: string; name: string; baseUom?: { code: string; name: string } };
  }>;
  shipments?: Array<{
    id: string;
    shipmentNumber: string;
    status: string;
    carrierName: string | null;
    trackingNumber: string | null;
    destinationAddress: string | null;
    proofOfDelivery: string | null;
    receivedBy: string | null;
    allocatedAt: string | null;
    dispatchedAt: string | null;
    deliveredAt: string | null;
    notes: string | null;
    lines?: any[];
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

  confirmOrder: async (orderId: string) => {
    return apiRequest<{ data: OrderDto }>(`/api/orders/${orderId}/confirm`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  createChangeRequest: async (orderId: string, input: { changeType: string; reason: string; requestedChanges: Record<string, unknown> }) => {
    return apiRequest<{ data: { id: string } }>(`/api/orders/${orderId}/change-requests`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
};

export interface OrderCostSummary {
  orderId: string;
  currency: string | null;
  hasEntries: boolean;
  hasStandard: boolean;
  hasActual: boolean;
  totalStandardCents: string | null;
  totalActualCents: string | null;
  totalVarianceCents: string | null;
  isFavorable: boolean | null;
  categories: Array<{
    category: "MATERIAL" | "LABOR" | "MACHINE" | "OUTSOURCED" | "SCRAP";
    standardCents: string | null;
    actualCents: string | null;
    varianceCents: string | null;
    hasStandard: boolean;
    hasActual: boolean;
    isFavorable: boolean | null;
    entries: Array<{ id: string; taskId: string | null; costType: 'STANDARD' | 'ACTUAL'; amountCents: string; notes: string | null; createdAt: string }>;
  }>;
}

export const orderCostingApi = {
  getCostSummary: async (orderId: string): Promise<OrderCostSummary> => {
    const res = await apiRequest<{ data: OrderCostSummary }>("/api/orders/" + orderId + "/costing");
    return res.data;
  },
  recordCost: async (orderId: string, input: { costCategory: string; costType: string; amountCents: string; currency: string; notes?: string }) => {
    return apiRequest("/api/orders/" + orderId + "/costing", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
};
