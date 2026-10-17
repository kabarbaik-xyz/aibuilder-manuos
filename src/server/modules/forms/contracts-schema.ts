import { z } from 'zod';

const answersSchema = z.record(z.unknown());

export const formDraftRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  answers: answersSchema,
}).strict();

export const formFinalizationRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  answers: answersSchema,
}).strict();

export const formCorrectionRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(1).max(1000),
  answers: answersSchema,
}).strict();

export type FormDraftRequest = z.infer<typeof formDraftRequestSchema>;
export type FormFinalizationRequest = z.infer<typeof formFinalizationRequestSchema>;
export type FormCorrectionRequest = z.infer<typeof formCorrectionRequestSchema>;
