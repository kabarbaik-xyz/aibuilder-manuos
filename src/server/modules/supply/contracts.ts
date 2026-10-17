import { parseAtomInput } from '@/domain/quantity';
import { z } from 'zod';

export const SupplyOrderStatus = {
  DRAFT: 'DRAFT',
  APPROVED: 'APPROVED',
  PARTIALLY_RECEIVED: 'PARTIALLY_RECEIVED',
  RECEIVED: 'RECEIVED',
  CANCELLED: 'CANCELLED',
} as const;
export type SupplyOrderStatus =
  (typeof SupplyOrderStatus)[keyof typeof SupplyOrderStatus];

export const CreateSupplyOrderLineSchema = z.object({
  itemId: z.string().uuid(),
  orderedAtoms: z
    .union([z.bigint(), z.string(), z.number()])
    .transform(parseAtomInput)
    .refine((val) => val > 0n, {
      message: 'Ordered atoms must be strictly positive (> 0)',
    }),
  unitPriceCents: z.number().int().nonnegative().optional(),
  notes: z.string().optional(),
});

export const CreateSupplyOrderSchema = z.object({
  supplierId: z.string().uuid(),
  expectedDate: z.string().datetime(),
  notes: z.string().optional(),
  lines: z.array(CreateSupplyOrderLineSchema).min(1, 'At least one line item is required'),
});

export type CreateSupplyOrderInput = z.infer<typeof CreateSupplyOrderSchema>;

export const ChangeSupplyEtaSchema = z.object({
  expectedDate: z.string().datetime(),
  reason: z.string().optional(),
});

export type ChangeSupplyEtaInput = z.infer<typeof ChangeSupplyEtaSchema>;

const SetMaterialSupplyAllocationLineSchema = z.object({
  supplyOrderLineId: z.string().uuid(),
  demandId: z.string().uuid(),
  allocatedAtoms: z.union([z.bigint(), z.string(), z.number()])
    .transform(parseAtomInput)
    .refine((value) => value > 0n, { message: 'Allocated atoms must be strictly positive (> 0)' }),
}).strict();

export const SetMaterialSupplyAllocationsSchema = z.object({
  allocations: z.array(SetMaterialSupplyAllocationLineSchema).max(200),
}).strict().superRefine(({ allocations }, context) => {
  const seen = new Set<string>();
  for (const [index, allocation] of allocations.entries()) {
    const key = `${allocation.supplyOrderLineId}:${allocation.demandId}`;
    if (seen.has(key)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['allocations', index], message: 'Each PO line and material demand pair can be allocated only once.' });
    seen.add(key);
  }
});

export type SetMaterialSupplyAllocationsInput = z.infer<typeof SetMaterialSupplyAllocationsSchema>;

export interface MaterialSupplyAllocationDTO {
  id: string;
  supplyOrderLineId: string;
  demandId: string;
  orderId: string;
  orderNumber: string;
  itemId: string;
  allocatedAtoms: bigint;
  receivedAtoms: bigint;
  reservedAtoms: bigint;
  version: number;
}

export interface MaterialDemandAllocationCandidateDTO {
  supplyOrderLineId: string;
  supplyOrderLineItemCode: string;
  supplyOrderLineItemName: string;
  id: string;
  orderId: string;
  orderNumber: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  uomCode: string;
  quantityPrecision: number;
  requiredAtoms: bigint;
  reservedAtoms: bigint;
  alreadyAllocatedAtoms: bigint;
  availableToAllocateAtoms: bigint;
  currentAllocatedAtoms: bigint;
}

export interface MaterialDemandAllocationContextDTO {
  supplyOrderId: string;
  orderNumber: string;
  status: string;
  lines: Array<{ id: string; itemCode: string; itemName: string; uomCode: string; quantityPrecision: number; openAtoms: bigint; allocatedAtoms: bigint }>;
  candidates: MaterialDemandAllocationCandidateDTO[];
}

export const ReceiveSupplyLineSchema = z.object({
  supplyOrderLineId: z.string().uuid(),
  locationId: z.string().uuid(),
  receivedAtoms: z
    .union([z.bigint(), z.string(), z.number()])
    .transform(parseAtomInput)
    .refine((val) => val > 0n, {
      message: 'Received atoms must be strictly positive (> 0)',
    }),
  lotNumber: z.string().trim().min(1).optional(),
  supplierLotNumber: z.string().trim().optional(),
  expirationDate: z.string().datetime().optional(),
  notes: z.string().optional(),
  demandAllocations: z.array(z.object({
    demandId: z.string().uuid(),
    receivedAtoms: z.union([z.bigint(), z.string(), z.number()])
      .transform(parseAtomInput)
      .refine((val) => val > 0n, { message: 'Demand receipt allocation must be strictly positive (> 0)' }),
  }).strict()).max(200).default([]),
}).strict();

export const ReceiveSupplySchema = z.object({
  supplyOrderId: z.string().uuid(),
  receiptNumber: z.string().trim().min(1).optional(),
  receivedDate: z.string().datetime().optional(),
  notes: z.string().optional(),
  lines: z.array(ReceiveSupplyLineSchema).min(1, 'At least one receipt line is required'),
}).strict().superRefine(({ lines }, context) => {
  const seenOrderLines = new Set<string>();
  for (const [lineIndex, line] of lines.entries()) {
    if (seenOrderLines.has(line.supplyOrderLineId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['lines', lineIndex, 'supplyOrderLineId'], message: 'Each supply order line may appear only once per receipt.' });
    seenOrderLines.add(line.supplyOrderLineId);
    const totalAllocated = line.demandAllocations.reduce((sum, allocation) => sum + allocation.receivedAtoms, 0n);
    if (totalAllocated > line.receivedAtoms) context.addIssue({ code: z.ZodIssueCode.custom, path: ['lines', lineIndex, 'demandAllocations'], message: 'Demand allocations cannot exceed received quantity.' });
    const seen = new Set<string>();
    for (const [allocationIndex, allocation] of line.demandAllocations.entries()) {
      if (seen.has(allocation.demandId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['lines', lineIndex, 'demandAllocations', allocationIndex], message: 'Each material demand may appear only once per receipt line.' });
      seen.add(allocation.demandId);
    }
  }
});

export type ReceiveSupplyInput = z.infer<typeof ReceiveSupplySchema>;

export interface SupplyOrderLineDTO {
  id: string;
  supplyOrderId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  tracking: string;
  uomCode: string;
  quantityPrecision: number;
  orderedAtoms: bigint;
  receivedAtoms: bigint;
  openAtoms: bigint;
  materialAllocations: MaterialSupplyAllocationDTO[];
  unitPriceCents: number | null;
  notes: string | null;
  version: number;
}

export interface SupplyOrderDTO {
  id: string;
  workspaceId: string;
  orderNumber: string;
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  status: string;
  expectedDate: string;
  notes: string | null;
  version: number;
  approvedById: string | null;
  approvedAt: string | null;
  createdAt: string;
  lines: SupplyOrderLineDTO[];
}

export interface SupplyReceiptLineDTO {
  id: string;
  receiptId: string;
  supplyOrderLineId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  locationId: string;
  locationCode: string;
  locationKind: string;
  lotId: string | null;
  lotNumber: string | null;
  receivedAtoms: bigint;
  movementId: string | null;
  notes: string | null;
  inspectionId: string | null;
  inspectionStatus: string | null;
  demandAllocations: Array<{ demandId: string; orderNumber: string; receivedAtoms: bigint; reservedAtoms: bigint; stockReservationId: string | null }>;
}

export interface SupplyReceiptDTO {
  id: string;
  workspaceId: string;
  receiptNumber: string;
  supplyOrderId: string;
  orderNumber: string;
  supplierId: string;
  supplierName: string;
  receivedDate: string;
  notes: string | null;
  receivedById: string;
  receivedByName: string;
  createdAt: string;
  lines: SupplyReceiptLineDTO[];
}
