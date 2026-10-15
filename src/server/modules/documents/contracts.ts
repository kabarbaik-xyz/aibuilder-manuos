export type DocumentParentType = 'ORDER' | 'TASK' | 'INSPECTION' | 'SHIPMENT' | 'PASSPORT';

export const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'text/csv',
  'text/plain',
  'image/png',
  'image/jpeg',
  'application/json',
  'application/zip',
]);

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export interface CreateDocumentInput {
  fileName: string;
  mimeType: string;
  content: Buffer;
  description?: string;
  link?: {
    parentType: DocumentParentType;
    parentId: string;
    customerVisible?: boolean;
  };
}

export interface LinkDocumentInput {
  documentId: string;
  parentType: DocumentParentType;
  parentId: string;
  customerVisible?: boolean;
}

export interface DocumentLinkDTO {
  id: string;
  workspaceId: string;
  documentId: string;
  parentType: string;
  parentId: string;
  customerVisible: boolean;
  createdAt: Date;
}

export interface DocumentDTO {
  id: string;
  workspaceId: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  uploadedById: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  links?: DocumentLinkDTO[];
}
