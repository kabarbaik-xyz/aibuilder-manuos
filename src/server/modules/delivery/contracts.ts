import { parseAtomInput } from '@/domain/quantity';
import { z } from 'zod';

export const ShipmentStatus = {
  ALLOCATED: 'ALLOCATED',
  DISPATCHED: 'DISPATCHED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
} as const;
export type ShipmentStatus = (typeof ShipmentStatus)[keyof typeof ShipmentStatus];

export const ShipmentLineInputSchema = z.object({
  itemId: z.string().uuid(),
  lotId: z.string().uuid().optional(),
  sourceLocationId: z.string().uuid(),
  allocatedAtoms: z
    .union([z.bigint(), z.string(), z.number()])
    .transform(parseAtomInput)
    .refine((val) => val > 0n, {
      message: 'Allocated atoms must be strictly positive (> 0)',
    }),
});
export type ShipmentLineInput = z.infer<typeof ShipmentLineInputSchema>;

export const AllocateShipmentSchema = z.object({
  orderId: z.string().uuid(),
  lines: z.array(ShipmentLineInputSchema).min(1),
  carrierName: z.string().max(100).optional(),
  trackingNumber: z.string().max(100).optional(),
  destinationAddress: z.string().max(500).optional(),
  notes: z.string().max(500).optional(),
});
export type AllocateShipmentInput = z.infer<typeof AllocateShipmentSchema>;

export const DispatchShipmentSchema = z.object({
  shipmentId: z.string().uuid(),
  carrierName: z.string().max(100).optional(),
  trackingNumber: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
});
export type DispatchShipmentInput = z.infer<typeof DispatchShipmentSchema>;

export const ConfirmDeliverySchema = z.object({
  shipmentId: z.string().uuid(),
  proofOfDelivery: z.string().max(500).optional(),
  receivedBy: z.string().max(100).optional(),
  deliveredAt: z.string().datetime().optional(),
  notes: z.string().max(500).optional(),
});
export type ConfirmDeliveryInput = z.infer<typeof ConfirmDeliverySchema>;
