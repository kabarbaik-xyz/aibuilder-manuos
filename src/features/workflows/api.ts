import { apiRequest } from '@/lib/api/client';
import { WorkflowDefinition } from '@/domain/workflow-definition';

export interface WorkflowVersionDto {
  id: string;
  templateId: string;
  versionNumber: number;
  status: 'DRAFT' | 'REVIEW' | 'PUBLISHED' | 'RETIRED';
  schemaVersion: number;
  definitionJson: string;
  definitionHash: string | null;
  publishedById: string | null;
  publishedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  nodes?: any[];
  edges?: any[];
}

export interface WorkflowTemplateDto {
  id: string;
  orderTypeId: string;
  code: string;
  name: string;
  description: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  orderType?: {
    id: string;
    code: string;
    name: string;
  };
  versions?: WorkflowVersionDto[];
}

export const workflowsApi = {
  listTemplates: async () => {
    const res = await apiRequest<{ data: WorkflowTemplateDto[] }>('/api/workflows');
    return res.data;
  },

  getTemplate: async (id: string) => {
    const res = await apiRequest<{ data: WorkflowTemplateDto }>(`/api/workflows/${id}`);
    return res.data;
  },

  createTemplate: async (data: { orderTypeId: string; code: string; name: string; description?: string }) => {
    return apiRequest<{ data: WorkflowTemplateDto & { initialVersionId: string } }>('/api/workflows', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getVersion: async (templateId: string, versionId: string) => {
    const res = await apiRequest<{ data: WorkflowVersionDto }>(`/api/workflows/${templateId}/versions/${versionId}`);
    return res.data;
  },

  saveVersionDraft: async (
    templateId: string,
    versionId: string,
    data: { expectedVersion?: number; definition: WorkflowDefinition }
  ) => {
    return apiRequest<{ data: WorkflowVersionDto }>(`/api/workflows/${templateId}/versions/${versionId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  submitReview: async (templateId: string, versionId: string) => {
    return apiRequest<{ data: WorkflowVersionDto }>(`/api/workflows/${templateId}/versions/${versionId}/actions`, {
      method: 'POST',
      body: JSON.stringify({ action: 'submit_review' }),
    });
  },

  publishVersion: async (templateId: string, versionId: string) => {
    return apiRequest<{ data: WorkflowVersionDto }>(`/api/workflows/${templateId}/versions/${versionId}/actions`, {
      method: 'POST',
      body: JSON.stringify({ action: 'publish' }),
    });
  },

  retireVersion: async (templateId: string, versionId: string) => {
    return apiRequest<{ data: WorkflowVersionDto }>(`/api/workflows/${templateId}/versions/${versionId}/actions`, {
      method: 'POST',
      body: JSON.stringify({ action: 'retire' }),
    });
  },

  forkVersion: async (templateId: string, versionId: string) => {
    return apiRequest<{ data: WorkflowVersionDto }>(`/api/workflows/${templateId}/versions/${versionId}/actions`, {
      method: 'POST',
      body: JSON.stringify({ action: 'fork' }),
    });
  },
};
