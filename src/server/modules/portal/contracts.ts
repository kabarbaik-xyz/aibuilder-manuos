export interface CustomerOrderSummaryDTO {
  id: string;
  orderNumber: string;
  itemName: string;
  itemCode: string;
  orderedQuantity: string;
  orderedAtoms: string;
  requestedDate: string;
  promisedDate: string | null;
  status: string;
  progressPct: number;
  qcPassedQuantity: string;
  qcPassedAtoms: string;
  customerAcknowledged: boolean;
  customerAcknowledgedAt: string | null;
  customerAcknowledgedBy: string | null;
}

export interface CustomerShipmentLineDTO {
  itemCode: string;
  itemName: string;
  allocatedQuantity: string;
  dispatchedQuantity: string;
  deliveredQuantity: string;
}

export interface CustomerShipmentDTO {
  id: string;
  shipmentNumber: string;
  status: string;
  carrierName: string | null;
  trackingNumber: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  destinationAddress: string | null;
  receivedBy: string | null;
  proofOfDelivery: string | null;
  lines: CustomerShipmentLineDTO[];
}

export interface CustomerDocumentDTO {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  description: string | null;
}

export interface CustomerPassportSummaryDTO {
  serialNumber: string;
  status: string;
  publishedAt: string;
  digestSha256: string;
}

export interface CustomerMilestoneDTO {
  key: string;
  title: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  completedAt?: string | null;
}


export interface CustomerDrawingDTO {
  id: string;
  drawingNumber: string;
  revisionCode: string;
  status: string;
  documentId: string;
  documentFileName?: string;
  customerApproved: boolean;
  customerApprovedAt: string | null;
  customerApprovedBy: string | null;
}

export interface CustomerChangeRequestDTO {
  id: string;
  requestNumber: string;
  changeType: string;
  status: string;
  reason: string;
  requestedChanges: Record<string, unknown>;
  submittedAt: string | null;
  approvedAt: string | null;
}

export interface CustomerOrderDetailDTO extends CustomerOrderSummaryDTO {
  shipments: CustomerShipmentDTO[];
  documents: CustomerDocumentDTO[];
  passports: CustomerPassportSummaryDTO[];
  milestones: CustomerMilestoneDTO[];
  drawings?: CustomerDrawingDTO[];
  changeRequests?: CustomerChangeRequestDTO[];
}

export interface AcknowledgePromiseInput {
  orderId: string;
  notes?: string;
}
