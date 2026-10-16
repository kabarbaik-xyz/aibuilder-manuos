import { z } from 'zod';

export const CreateOrderChangeRequestSchema = z.object({
  orderId: z.string().uuid(),
  changeType: z.enum(['QUANTITY', 'DATE', 'SPECIFICATION', 'CANCEL']),
  reason: z.string().min(3),
  requestedChanges: z.record(z.any()),
});
export type CreateOrderChangeRequestInput = z.infer<typeof CreateOrderChangeRequestSchema>;

export const ApproveOrderChangeRequestSchema = z.object({
  notes: z.string().optional(),
});
export type ApproveOrderChangeRequestInput = z.infer<typeof ApproveOrderChangeRequestSchema>;

export const CreateEngineeringChangeOrderSchema = z.object({
  code: z.string().min(2),
  title: z.string().min(3),
  description: z.string().optional(),
  sourceRevisionId: z.string().uuid(),
  targetRevisionId: z.string().uuid().optional(),
  migrationPolicy: z.enum(['RUNNING_JOBS_MIGRATE', 'NEW_JOBS_ONLY']).default('RUNNING_JOBS_MIGRATE'),
});
export type CreateEngineeringChangeOrderInput = z.infer<typeof CreateEngineeringChangeOrderSchema>;

export const ApproveEngineeringChangeOrderSchema = z.object({
  effectiveDate: z.string().optional(),
  notes: z.string().optional(),
});
export type ApproveEngineeringChangeOrderInput = z.infer<typeof ApproveEngineeringChangeOrderSchema>;

export const CreateNcrSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(5),
  severity: z.enum(['MINOR', 'MAJOR', 'CRITICAL']).default('MAJOR'),
  taskId: z.string().uuid().optional(),
  inspectionId: z.string().uuid().optional(),
  ownerUserId: z.string().uuid().optional(),
});
export type CreateNcrInput = z.infer<typeof CreateNcrSchema>;

export const ResolveNcrSchema = z.object({
  rootCause: z.string().min(5),
  containmentAction: z.string().min(5),
  correctiveAction: z.string().min(5),
});
export type ResolveNcrInput = z.infer<typeof ResolveNcrSchema>;

export const CreateMaterialSubstituteSchema = z.object({
  originalItemId: z.string().uuid(),
  substituteItemId: z.string().uuid(),
  conversionRatioAtoms: z.bigint().optional().default(1000000n),
  scope: z.enum(['GLOBAL', 'ORDER_SPECIFIC']).default('GLOBAL'),
  orderId: z.string().uuid().optional(),
  reason: z.string().min(3),
});
export type CreateMaterialSubstituteInput = z.infer<typeof CreateMaterialSubstituteSchema>;

export const PublishScheduleSchema = z.object({
  title: z.string().min(3),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
});
export type PublishScheduleInput = z.infer<typeof PublishScheduleSchema>;
