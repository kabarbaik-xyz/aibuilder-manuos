import { apiRequest } from '@/lib/api/client';
import { SaveEngineeringDraftInput } from '@/server/modules/engineering/contracts';

export interface EngineeringRevisionDto {
  id: string;
  orderId: string;
  revisionNumber: number;
  status: 'DRAFT' | 'REVIEW' | 'APPROVED' | 'SUPERSEDED';
  specsJson: string;
  workflowVersionId: string | null;
  outputBasisAtoms: string | number | bigint;
  approvedById: string | null;
  approvedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  order?: any;
  bomLines?: any[];
}

export const engineeringApi = {
  getRevision: async (orderId: string, revId: string) => {
    const res = await apiRequest<{ data: EngineeringRevisionDto }>(
      `/api/orders/${orderId}/engineering/${revId}`
    );
    return res.data;
  },

  saveDraft: async (orderId: string, revId: string, data: SaveEngineeringDraftInput) => {
    return apiRequest<{ data: EngineeringRevisionDto }>(
      `/api/orders/${orderId}/engineering/${revId}`,
      {
        method: 'PUT',
        body: JSON.stringify(data),
      }
    );
  },

  submitReview: async (orderId: string, revId: string) => {
    return apiRequest<{ data: EngineeringRevisionDto }>(
      `/api/orders/${orderId}/engineering/${revId}/actions`,
      {
        method: 'POST',
        body: JSON.stringify({ action: 'submit_review' }),
      }
    );
  },

  approveRevision: async (orderId: string, revId: string) => {
    return apiRequest<{ data: EngineeringRevisionDto }>(
      `/api/orders/${orderId}/engineering/${revId}/actions`,
      {
        method: 'POST',
        body: JSON.stringify({ action: 'approve' }),
      }
    );
  },
};
