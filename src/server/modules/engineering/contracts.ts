import { z } from 'zod';

export const bomLineDraftSchema = z.object({
  operationNodeKey: z.string().min(1).max(50),
  itemId: z.string().min(1),
  inputUomId: z.string().min(1),
  requirementQuantity: z.number().positive(),
  outputBasis: z.number().positive().default(1),
  allowancePercent: z.number().min(0).max(100).default(0.0),
});

export const saveEngineeringDraftSchema = z.object({
  expectedVersion: z.number().int().min(1).optional(),
  workflowVersionId: z.string().min(1).optional(),
  specs: z.record(z.any()).default({}),
  outputBasis: z.number().positive().default(1),
  bomLines: z.array(bomLineDraftSchema).default([]),
});

export const engineeringActionSchema = z.object({
  action: z.enum(['submit_review', 'approve']),
  notes: z.string().max(500).optional(),
});

export type BomLineDraftInput = z.input<typeof bomLineDraftSchema>;
export type SaveEngineeringDraftInput = z.input<typeof saveEngineeringDraftSchema>;
export type EngineeringActionInput = z.input<typeof engineeringActionSchema>;
