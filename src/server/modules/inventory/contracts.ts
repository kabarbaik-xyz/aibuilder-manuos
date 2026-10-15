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
      .transform((val) => {
        if (typeof val === 'bigint') return val;
        if (typeof val === 'number') return BigInt(Math.floor(val));
        return BigInt(val);
      })
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
    .transform((val) => {
      if (typeof val === 'bigint') return val;
      if (typeof val === 'number') return BigInt(Math.floor(val));
      return BigInt(val);
    })
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
