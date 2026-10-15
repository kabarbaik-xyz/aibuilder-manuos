import { FormDefinition } from '@/domain/forms/types';

export interface CreateFormTemplateInput {
  code: string;
  name: string;
  purpose: 'ORDER_SPEC' | 'TASK_EVIDENCE' | 'QC_EVIDENCE';
  description?: string;
}

export interface CreateFormVersionInput {
  templateId: string;
  definition?: FormDefinition;
  fromVersionId?: string;
}

export interface UpdateFormVersionDraftInput {
  expectedVersion: number;
  definition: FormDefinition;
}

export interface FormVersionActionInput {
  expectedVersion: number;
}

export interface BindFormVersionInput {
  formVersionId: string;
  context: 'ORDER_TYPE' | 'WORKFLOW_NODE' | 'QC_CHECKLIST';
  orderTypeId?: string;
  workflowNodeKey?: string;
  workflowVersionId?: string;
  qcChecklistId?: string;
  required?: boolean;
}

export interface CreateFormInstanceInput {
  workspaceId: string;
  formVersionId: string;
  formBindingId?: string;
  subjectType: 'ORDER' | 'TASK' | 'INSPECTION';
  subjectId: string;
}

export interface FormTemplateDTO {
  id: string;
  code: string;
  name: string;
  purpose: string;
  description: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  versionsCount: number;
  publishedVersion?: {
    id: string;
    versionNumber: number;
    contentHash: string;
  };
}

export interface FormVersionDTO {
  id: string;
  templateId: string;
  versionNumber: number;
  status: 'DRAFT' | 'REVIEW' | 'PUBLISHED' | 'RETIRED';
  schemaVersion: number;
  definition: FormDefinition;
  contentHash: string;
  publishedAt: string | null;
  publishedBy: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}
