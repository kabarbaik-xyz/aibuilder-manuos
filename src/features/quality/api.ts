import { apiRequest as request } from '@/lib/api/client';
import { hydrateAtomFields, stringifyQuantities } from '@/lib/api/quantities';

async function apiRequest<T>(url: string, options?: RequestInit): Promise<T> {
  return hydrateAtomFields(await request<T>(url, options));
}

export interface InspectionDTO {
  serialNumber?: string | null;
  passport?: { published: boolean; shared: boolean } | null;
  id: string;
  workspaceId: string;
  sourceType: 'PRODUCTION_OUTPUT' | 'GOODS_RECEIPT';
  productionOutputId?: string | null;
  supplyReceiptId?: string | null;
  qcChecklistId?: string | null;
  checklistRevision: number;
  inspectedAtoms: bigint;
  passedAtoms: bigint;
  reworkAtoms: bigint;
  scrappedAtoms: bigint;
  status: 'DRAFT' | 'FINALIZED';
  disposition?: 'PASSED' | 'REWORK' | 'SCRAPPED' | 'PARTIAL' | null;
  inspectorUserId: string;
  reinspectionOfId?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  productionOutput?: {
    id: string;
    outputAtoms: bigint;
    lotId?: string | null;
    destinationLocationId: string;
    item?: { id: string; code: string; name: string };
    lot?: { id: string; lotNumber: string } | null;
    task?: {
      id: string;
      nodeKey: string;
      instance?: {
        order?: { id: string; orderNumber: string };
      };
    } | null;
    destinationLocation?: { id: string; name: string; kind: string };
  } | null;
  qcChecklist?: {
    id: string;
    code: string;
    name: string;
    checks: Array<{
      id: string;
      code: string;
      description: string;
      method: string;
      unit?: string | null;
      isRequired: boolean;
    }>;
  } | null;
  inspectorUser?: { id: string; name: string };
  results?: Array<{
    id: string;
    checkCode: string;
    checkDescription: string;
    checkMethod: string;
    measuredValue?: string | null;
    isPassed: boolean;
    defectReason?: string | null;
    notes?: string | null;
  }>;
  reworkAttempts?: Array<{
    id: string;
    targetAtoms: bigint;
    instruction: string;
    status: string;
    authorizedAt: string;
    authorizedBy?: { id: string; name: string };
  }>;
}

export async function fetchInspections(filters?: {
  status?: string;
  sourceType?: string;
}): Promise<InspectionDTO[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.sourceType) params.set('sourceType', filters.sourceType);
  const q = params.toString() ? `?${params.toString()}` : '';
  const res = await apiRequest<{ data: InspectionDTO[] }>(`/api/quality/inspections${q}`);
  return res.data;
}

export async function fetchInspectionById(id: string): Promise<InspectionDTO> {
  const res = await apiRequest<{ data: InspectionDTO }>(`/api/quality/inspections/${id}`);
  return res.data;
}

export interface CreateInspectionInput {
  sourceType?: 'PRODUCTION_OUTPUT' | 'GOODS_RECEIPT';
  productionOutputId?: string;
  supplyReceiptId?: string;
  qcChecklistId?: string;
  inspectedAtoms?: bigint | string | number;
  notes?: string;
}

export async function createInspection(input: CreateInspectionInput) {
  return apiRequest('/api/quality/inspections', {
    method: 'POST',
    body: JSON.stringify(stringifyQuantities(input)),
  });
}

export interface FinalizeInspectionInput {
  inspectionId: string;
  passedAtoms: bigint | string | number;
  reworkAtoms?: bigint | string | number;
  scrappedAtoms?: bigint | string | number;
  destinationFgLocationId?: string;
  destinationScrapLocationId?: string;
  results?: Array<{
    checkCode: string;
    checkDescription: string;
    checkMethod?: string;
    measuredValue?: string;
    isPassed: boolean;
    defectReason?: string;
    notes?: string;
  }>;
  notes?: string;
}

export async function finalizeInspection(input: FinalizeInspectionInput) {
  const { inspectionId, ...body } = input;
  return apiRequest(`/api/quality/inspections/${inspectionId}/finalize`, {
    method: 'POST',
    body: JSON.stringify(stringifyQuantities(body)),
  });
}

export interface AuthorizeReworkInput {
  inspectionId: string;
  targetAtoms: bigint | string | number;
  instruction: string;
}

export async function authorizeRework(input: AuthorizeReworkInput) {
  return apiRequest('/api/quality/rework', {
    method: 'POST',
    body: JSON.stringify(stringifyQuantities(input)),
  });
}

export interface RecordReinspectionInput {
  originalInspectionId: string;
  reworkAttemptId?: string;
  passedAtoms: bigint | string | number;
  scrappedAtoms?: bigint | string | number;
  destinationFgLocationId?: string;
  destinationScrapLocationId?: string;
  results?: Array<{
    checkCode: string;
    checkDescription: string;
    checkMethod?: string;
    measuredValue?: string;
    isPassed: boolean;
    defectReason?: string;
    notes?: string;
  }>;
  notes?: string;
}

export async function recordReinspection(input: RecordReinspectionInput) {
  return apiRequest('/api/quality/reinspection', {
    method: 'POST',
    body: JSON.stringify(stringifyQuantities(input)),
  });
}
