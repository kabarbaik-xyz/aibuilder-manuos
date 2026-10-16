import { parseAtomInput } from '@/domain/quantity';
import { z } from 'zod';

export const MovementType = {
  OPENING_BALANCE: 'OPENING_BALANCE',
  PURCHASE_RECEIPT: 'PURCHASE_RECEIPT',
  TRANSFER: 'TRANSFER',
  ISSUE_TO_WIP: 'ISSUE_TO_WIP',
  RETURN_FROM_WIP: 'RETURN_FROM_WIP',
  PRODUCTION_CONSUME: 'PRODUCTION_CONSUME',
  PRODUCTION_OUTPUT: 'PRODUCTION_OUTPUT',
  QC_DISPOSITION: 'QC_DISPOSITION',
  SHIPMENT: 'SHIPMENT',
  ADJUSTMENT: 'ADJUSTMENT',
} as const;
export type MovementType = (typeof MovementType)[keyof typeof MovementType];

export const MovementReferenceType = {
  OPENING: 'OPENING',
  SUPPLY_ORDER: 'SUPPLY_ORDER',
  ORDER: 'ORDER',
  TASK: 'TASK',
  QC_INSPECTION: 'QC_INSPECTION',
  SHIPMENT: 'SHIPMENT',
  COUNT: 'COUNT',
  MANUAL: 'MANUAL',
} as const;
export type MovementReferenceType =
  (typeof MovementReferenceType)[keyof typeof MovementReferenceType];

export function getBucketKey(
  itemId: string,
  locationId: string,
  lotId?: string | null
): string {
  return `${itemId}:${locationId}:${lotId || '__NO_LOT__'}`;
}

export const PostMovementSchema = z
  .object({
    movementType: z.enum([
      MovementType.OPENING_BALANCE,
      MovementType.PURCHASE_RECEIPT,
      MovementType.TRANSFER,
      MovementType.ISSUE_TO_WIP,
      MovementType.RETURN_FROM_WIP,
      MovementType.PRODUCTION_CONSUME,
      MovementType.PRODUCTION_OUTPUT,
      MovementType.QC_DISPOSITION,
      MovementType.SHIPMENT,
      MovementType.ADJUSTMENT,
    ]),
    itemId: z.string().uuid(),
    sourceLocationId: z.string().uuid().nullable().optional(),
    destinationLocationId: z.string().uuid().nullable().optional(),
    sourceLotId: z.string().uuid().nullable().optional(),
    destinationLotId: z.string().uuid().nullable().optional(),
    atoms: z
      .union([z.bigint(), z.string(), z.number()])
      .transform(parseAtomInput)
      .refine((val) => val > 0n, {
        message: 'Movement atoms must be strictly positive (> 0)',
      }),
    referenceType: z.string().optional(),
    referenceId: z.string().optional(),
    notes: z.string().optional(),
  })
  .refine(
    (data) => Boolean(data.sourceLocationId || data.destinationLocationId),
    {
      message: 'Movement must specify at least one location (source or destination)',
      path: ['destinationLocationId'],
    }
  )
  .refine(
    (data) => {
      if (data.movementType === MovementType.TRANSFER) {
        return (
          Boolean(data.sourceLocationId) &&
          Boolean(data.destinationLocationId) &&
          data.sourceLocationId !== data.destinationLocationId
        );
      }
      return true;
    },
    {
      message: 'Transfers require distinct source and destination locations',
      path: ['destinationLocationId'],
    }
  );

export type PostMovementInput = z.infer<typeof PostMovementSchema>;

export const PostOpeningBalanceSchema = z.object({
  itemId: z.string().uuid(),
  locationId: z.string().uuid(),
  lotNumber: z.string().trim().min(1).optional(),
  supplierLotNumber: z.string().trim().optional(),
  expirationDate: z.string().datetime().optional(),
  atoms: z
    .union([z.bigint(), z.string(), z.number()])
    .transform(parseAtomInput)
    .refine((val) => val > 0n, {
      message: 'Opening balance atoms must be strictly positive (> 0)',
    }),
  notes: z.string().optional(),
});

export type PostOpeningBalanceInput = z.infer<typeof PostOpeningBalanceSchema>;

export const StockFilterSchema = z.object({
  itemId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  lotId: z.string().uuid().optional(),
  includeZero: z.boolean().default(false),
});

export type StockFilters = z.infer<typeof StockFilterSchema>;

export interface StockBalanceDTO {
  id: string;
  workspaceId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  locationId: string;
  locationCode: string;
  locationName: string;
  locationKind: string;
  lotId: string | null;
  lotNumber: string | null;
  bucketKey: string;
  onHandAtoms: bigint;
  reservedAtoms: bigint;
  availableAtoms: bigint;
  version: number;
}

export interface StockMovementDTO {
  id: string;
  workspaceId: string;
  movementType: MovementType | string;
  itemId: string;
  itemCode?: string;
  itemName?: string;
  sourceLocationId: string | null;
  sourceLocationCode?: string | null;
  destinationLocationId: string | null;
  destinationLocationCode?: string | null;
  sourceLotId: string | null;
  sourceLotNumber?: string | null;
  destinationLotId: string | null;
  destinationLotNumber?: string | null;
  atoms: bigint;
  referenceType: string | null;
  referenceId: string | null;
  actorUserId: string;
  actorName?: string;
  notes: string | null;
  occurredAt: Date | string;
}

export interface StockReconciliationResult {
  workspaceId: string;
  balanced: boolean;
  totalMovements: number;
  totalBuckets: number;
  mismatches: Array<{
    bucketKey: string;
    itemId: string;
    locationId: string;
    lotId: string | null;
    projectedOnHand: bigint;
    calculatedOnHand: bigint;
    delta: bigint;
  }>;
}

// -------------------------------------------------------------
// O03 Reservations, Issues, Returns & Consumption Contracts
// -------------------------------------------------------------

export const ReserveStockSchema = z.object({
  demandId: z.string().uuid(),
  locationId: z.string().uuid(),
  lotId: z.string().uuid().nullable().optional(),
  atoms: z
    .union([z.bigint(), z.string(), z.number()])
    .transform(parseAtomInput)
    .refine((val) => val > 0n, {
      message: 'Reservation atoms must be strictly positive (> 0)',
    }),
  notes: z.string().optional(),
});
export type ReserveStockInput = z.infer<typeof ReserveStockSchema>;

export const ReleaseReservationSchema = z.object({
  reservationId: z.string().uuid(),
  notes: z.string().optional(),
});
export type ReleaseReservationInput = z.infer<typeof ReleaseReservationSchema>;

export const IssueToProductionSchema = z.object({
  demandId: z.string().uuid(),
  sourceLocationId: z.string().uuid(),
  sourceLotId: z.string().uuid().nullable().optional(),
  wipLocationId: z.string().uuid(),
  atoms: z
    .union([z.bigint(), z.string(), z.number()])
    .transform(parseAtomInput)
    .refine((val) => val > 0n, {
      message: 'Issue atoms must be strictly positive (> 0)',
    }),
  reservationId: z.string().uuid().nullable().optional(),
  notes: z.string().optional(),
});
export type IssueToProductionInput = z.infer<typeof IssueToProductionSchema>;

export const ReturnUnusedMaterialSchema = z.object({
  demandId: z.string().uuid(),
  wipLocationId: z.string().uuid(),
  destinationLocationId: z.string().uuid(),
  lotId: z.string().uuid().nullable().optional(),
  atoms: z
    .union([z.bigint(), z.string(), z.number()])
    .transform(parseAtomInput)
    .refine((val) => val > 0n, {
      message: 'Return atoms must be strictly positive (> 0)',
    }),
  notes: z.string().optional(),
});
export type ReturnUnusedMaterialInput = z.infer<typeof ReturnUnusedMaterialSchema>;

export const ConsumeIssuedMaterialSchema = z.object({
  demandId: z.string().uuid(),
  wipLocationId: z.string().uuid(),
  lotId: z.string().uuid().nullable().optional(),
  atoms: z
    .union([z.bigint(), z.string(), z.number()])
    .transform(parseAtomInput)
    .refine((val) => val > 0n, {
      message: 'Consume atoms must be strictly positive (> 0)',
    }),
  taskId: z.string().uuid().nullable().optional(),
  notes: z.string().optional(),
});
export type ConsumeIssuedMaterialInput = z.infer<typeof ConsumeIssuedMaterialSchema>;

export interface StockReservationDTO {
  id: string;
  workspaceId: string;
  demandId: string | null;
  orderId: string | null;
  taskId: string | null;
  itemId: string;
  itemCode: string;
  itemName: string;
  locationId: string;
  locationCode: string;
  locationName: string;
  lotId: string | null;
  lotNumber: string | null;
  reservedAtoms: bigint;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaskMaterialReadinessDTO {
  taskId: string;
  orderId: string;
  isFullyAllocated: boolean;
  isFullyIssued: boolean;
  isFullyConsumed: boolean;
  demands: Array<{
    demandId: string;
    itemId: string;
    itemCode: string;
    itemName: string;
    itemTracking: string;
    requiredAtoms: bigint;
    reservedAtoms: bigint;
    issuedAtoms: bigint;
    consumedAtoms: bigint;
    availableInWarehouseAtoms: bigint;
    status: string;
  }>;
}

// -------------------------------------------------------------
// Stock Counts & Line Schemas (Milestone M3 - O04)
// -------------------------------------------------------------

export const StockCountStatus = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
} as const;
export type StockCountStatus = (typeof StockCountStatus)[keyof typeof StockCountStatus];

export const CreateStockCountLineSchema = z.object({
  itemId: z.string().uuid(),
  locationId: z.string().uuid(),
  lotId: z.string().uuid().nullable().optional(),
  countedAtoms: z
    .union([z.bigint(), z.string(), z.number()])
    .transform(parseAtomInput)
    .refine((val) => val >= 0n, {
      message: 'Counted atoms cannot be negative',
    }),
  notes: z.string().optional(),
});

export const CreateStockCountSchema = z.object({
  locationId: z.string().uuid().nullable().optional(),
  reason: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(CreateStockCountLineSchema).min(1, 'At least one line is required for a count'),
});
export type CreateStockCountInput = z.infer<typeof CreateStockCountSchema>;

export const StockTransferSchema = z
  .object({
    itemId: z.string().uuid(),
    sourceLocationId: z.string().uuid(),
    destinationLocationId: z.string().uuid(),
    sourceLotId: z.string().uuid().nullable().optional(),
    destinationLotId: z.string().uuid().nullable().optional(),
    atoms: z
      .union([z.bigint(), z.string(), z.number()])
      .transform(parseAtomInput)
      .refine((val) => val > 0n, {
        message: 'Transfer atoms must be strictly positive (> 0)',
      }),
    notes: z.string().optional(),
  })
  .refine((data) => data.sourceLocationId !== data.destinationLocationId, {
    message: 'Source and destination locations must be distinct',
    path: ['destinationLocationId'],
  });
export type StockTransferInput = z.infer<typeof StockTransferSchema>;

export const ReverseMovementSchema = z.object({
  movementId: z.string().uuid(),
  reason: z.string().trim().min(3, 'A reason with at least 3 characters is required for reversal'),
});
export type ReverseMovementInput = z.infer<typeof ReverseMovementSchema>;

export interface StockCountLineDTO {
  id: string;
  countId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  locationId: string;
  locationCode: string;
  locationName: string;
  lotId: string | null;
  lotNumber: string | null;
  snapshotAtoms: bigint;
  countedAtoms: bigint;
  discrepancyAtoms: bigint;
  movementId: string | null;
  notes: string | null;
  version: number;
}

export interface StockCountDTO {
  id: string;
  workspaceId: string;
  countNumber: string;
  status: StockCountStatus;
  locationId: string | null;
  locationCode?: string | null;
  locationName?: string | null;
  reason: string | null;
  notes: string | null;
  countedById: string;
  countedByName: string;
  approvedById: string | null;
  approvedByName?: string | null;
  approvedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  lines: StockCountLineDTO[];
}

