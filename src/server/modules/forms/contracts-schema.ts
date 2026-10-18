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

export const formTemplateCreateRequestSchema = z.object({
  code: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(160),
  purpose: z.enum(['ORDER_SPEC', 'TASK_EVIDENCE', 'QC_EVIDENCE']),
  description: z.string().trim().max(2000).optional(),
}).strict();

export const formVersionForkRequestSchema = z.object({
  fromVersionId: z.string().uuid(),
}).strict();

export type FormDraftRequest = z.infer<typeof formDraftRequestSchema>;
export type FormFinalizationRequest = z.infer<typeof formFinalizationRequestSchema>;
export type FormCorrectionRequest = z.infer<typeof formCorrectionRequestSchema>;
export type FormVersionActionRequest = z.infer<typeof formVersionActionRequestSchema>;
