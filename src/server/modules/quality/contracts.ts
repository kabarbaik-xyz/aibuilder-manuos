import { parseAtomInput } from '@/domain/quantity';
import { z } from 'zod';

export const InspectionSourceType = {
  PRODUCTION_OUTPUT: 'PRODUCTION_OUTPUT',
  GOODS_RECEIPT: 'GOODS_RECEIPT',
} as const;
export type InspectionSourceType =
  (typeof InspectionSourceType)[keyof typeof InspectionSourceType];

export const InspectionStatus = {
  DRAFT: 'DRAFT',
  FINALIZED: 'FINALIZED',
} as const;
export type InspectionStatus =
  (typeof InspectionStatus)[keyof typeof InspectionStatus];

export const InspectionDisposition = {
  PASSED: 'PASSED',
  REWORK: 'REWORK',
  SCRAPPED: 'SCRAPPED',
  PARTIAL: 'PARTIAL',
} as const;
export type InspectionDisposition =
  (typeof InspectionDisposition)[keyof typeof InspectionDisposition];

export const CreateInspectionSchema = z.object({
  sourceType: z
    .enum([
      InspectionSourceType.PRODUCTION_OUTPUT,
      InspectionSourceType.GOODS_RECEIPT,
    ])
    .default(InspectionSourceType.PRODUCTION_OUTPUT),
  productionOutputId: z.string().uuid().optional(),
  supplyReceiptId: z.string().uuid().optional(),
  qcChecklistId: z.string().uuid().optional(),
  inspectedAtoms: z
    .union([z.bigint(), z.string(), z.number()])
    .transform(parseAtomInput)
    .optional(),
  notes: z.string().max(1000).optional(),
});
export type CreateInspectionInput = z.infer<typeof CreateInspectionSchema>;

export const InspectionCheckResultSchema = z.object({
  checkCode: z.string().min(1),
  checkDescription: z.string().min(1),
  checkMethod: z.string().default('VISUAL'),
  measuredValue: z.string().optional(),
  isPassed: z.boolean(),
  defectReason: z.string().optional(),
  notes: z.string().optional(),
});
export type InspectionCheckResultInput = z.infer<
  typeof InspectionCheckResultSchema
>;

export const FinalizeInspectionSchema = z.object({
  inspectionId: z.string().uuid(),
  passedAtoms: z
    .union([z.bigint(), z.string(), z.number()])
    .transform(parseAtomInput),
  reworkAtoms: z
    .union([z.bigint(), z.string(), z.number()])
    .transform(parseAtomInput)
    .default(0n),
  scrappedAtoms: z
    .union([z.bigint(), z.string(), z.number()])
    .transform(parseAtomInput)
    .default(0n),
  destinationFgLocationId: z.string().uuid().optional(),
  destinationScrapLocationId: z.string().uuid().optional(),
  results: z.array(InspectionCheckResultSchema).default([]),
  notes: z.string().max(1000).optional(),
});
export type FinalizeInspectionInput = z.infer<typeof FinalizeInspectionSchema>;

export const AuthorizeReworkSchema = z.object({
  inspectionId: z.string().uuid(),
  targetAtoms: z
    .union([z.bigint(), z.string(), z.number()])
    .transform(parseAtomInput)
    .refine((val) => val > 0n, {
      message: 'Target rework atoms must be strictly positive (> 0)',
    }),
  instruction: z.string().min(1).max(1000),
});
export type AuthorizeReworkInput = z.infer<typeof AuthorizeReworkSchema>;

export const RecordReinspectionSchema = z.object({
  originalInspectionId: z.string().uuid(),
  reworkAttemptId: z.string().uuid().optional(),
  passedAtoms: z
    .union([z.bigint(), z.string(), z.number()])
    .transform(parseAtomInput),
  scrappedAtoms: z
    .union([z.bigint(), z.string(), z.number()])
    .transform(parseAtomInput)
    .default(0n),
  destinationFgLocationId: z.string().uuid().optional(),
  destinationScrapLocationId: z.string().uuid().optional(),
  results: z.array(InspectionCheckResultSchema).default([]),
  notes: z.string().max(1000).optional(),
});
export type RecordReinspectionInput = z.infer<typeof RecordReinspectionSchema>;
