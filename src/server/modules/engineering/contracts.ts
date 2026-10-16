import { z } from 'zod';

const positiveQuantitySchema = z.union([
  z.number().positive(),
  z.string().max(80).regex(/^\d+(\.\d+)?$/).refine((value) => /[1-9]/.test(value), 'Quantity must be greater than zero'),
]);

export const bomLineDraftSchema = z.object({
  operationNodeKey: z.string().min(1).max(50),
  itemId: z.string().min(1),
  inputUomId: z.string().min(1),
  requirementQuantity: positiveQuantitySchema,
  outputBasis: positiveQuantitySchema.default(1),
  allowancePercent: z.union([z.number().min(0).max(100), z.string().regex(/^\d+(\.\d+)?$/)]).default(0),
  allowanceBps: z.number().int().min(0).max(10_000).optional(),
});

export const saveEngineeringDraftSchema = z.object({
  expectedVersion: z.number().int().min(1).optional(),
  orderLineId: z.string().optional(),
  drawingRevisionId: z.string().optional(),
  workflowVersionId: z.string().min(1).optional(),
  specs: z.record(z.any()).default({}),
  outputBasis: positiveQuantitySchema.default(1),
  bomLines: z.array(bomLineDraftSchema).default([]),
});

export const engineeringActionSchema = z.object({
  action: z.enum(['submit_review', 'approve']),
  notes: z.string().max(500).optional(),
});

export const releaseDrawingRevisionSchema = z.object({
  documentId: z.string().min(1),
  itemId: z.string().min(1),
  drawingNumber: z.string().min(1).max(100),
  revisionCode: z.string().min(1).max(20),
  notes: z.string().max(500).optional(),
});

export type BomLineDraftInput = z.input<typeof bomLineDraftSchema>;
export type SaveEngineeringDraftInput = z.input<typeof saveEngineeringDraftSchema>;
export type EngineeringActionInput = z.input<typeof engineeringActionSchema>;
export type ReleaseDrawingRevisionInput = z.input<typeof releaseDrawingRevisionSchema>;
