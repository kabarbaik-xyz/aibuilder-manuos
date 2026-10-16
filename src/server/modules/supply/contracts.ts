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
});

export const ReceiveSupplySchema = z.object({
  supplyOrderId: z.string().uuid(),
  receiptNumber: z.string().trim().min(1).optional(),
  receivedDate: z.string().datetime().optional(),
  notes: z.string().optional(),
  lines: z.array(ReceiveSupplyLineSchema).min(1, 'At least one receipt line is required'),
});

export type ReceiveSupplyInput = z.infer<typeof ReceiveSupplySchema>;

export interface SupplyOrderLineDTO {
  id: string;
  supplyOrderId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  tracking: string;
  orderedAtoms: bigint;
  receivedAtoms: bigint;
  openAtoms: bigint;
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
  lotId: string | null;
  lotNumber: string | null;
  receivedAtoms: bigint;
  movementId: string | null;
  notes: string | null;
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
