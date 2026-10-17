import { z } from 'zod';
import { formDefinitionSchema } from '@/domain/forms/schema';

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

export const formVersionActionRequestSchema = z.object({
  action: z.enum(['submit_review', 'publish', 'retire']),
  expectedVersion: z.number().int().positive(),
}).strict();

export const formDraftVersionRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  definition: formDefinitionSchema,
}).strict();

export type FormDraftRequest = z.infer<typeof formDraftRequestSchema>;
export type FormFinalizationRequest = z.infer<typeof formFinalizationRequestSchema>;
export type FormCorrectionRequest = z.infer<typeof formCorrectionRequestSchema>;
export type FormVersionActionRequest = z.infer<typeof formVersionActionRequestSchema>;
