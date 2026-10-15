import { z } from 'zod';

export const workflowNodeTypeSchema = z.enum(['OPERATION', 'INSPECTION', 'APPROVAL']);

export const workflowNodeRequirementsSchema = z.object({
  machineClassId: z.string().optional(),
  requiredSkills: z
    .array(
      z.object({
        skillId: z.string().min(1),
        minLevel: z.number().int().min(1),
      })
    )
    .optional(),
  requiredCertIds: z.array(z.string().min(1)).optional(),
});

export const workflowNodeFormGuardSchema = z.object({
  qcChecklistId: z.string().optional(),
  requireSignOff: z.boolean().optional(),
});

export const workflowNodeDefinitionSchema = z.object({
  key: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  type: workflowNodeTypeSchema.default('OPERATION'),
  departmentId: z.string().optional(),
  requiredPermission: z.string().optional(),
  plannedDurationMinutes: z.number().int().min(0).default(60),
  requirements: workflowNodeRequirementsSchema.optional(),
  formGuard: workflowNodeFormGuardSchema.optional(),
});

export const workflowEdgeDefinitionSchema = z.object({
  fromNodeKey: z.string().min(1).max(50),
  toNodeKey: z.string().min(1).max(50),
  joinPolicy: z.literal('AND').default('AND'),
  conditionCode: z.string().max(50).optional(),
  conditionParams: z.record(z.any()).optional(),
});

export const workflowDefinitionSchema = z.object({
  schemaVersion: z.number().int().default(1),
  name: z.string().min(1).max(200).optional(),
  nodes: z.array(workflowNodeDefinitionSchema).min(1),
  edges: z.array(workflowEdgeDefinitionSchema).default([]),
});

export const createWorkflowTemplateSchema = z.object({
  orderTypeId: z.string().min(1),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).nullable().optional(),
});

export const createWorkflowVersionDraftSchema = z.object({
  definition: workflowDefinitionSchema,
});

export const saveWorkflowVersionDraftSchema = z.object({
  expectedVersion: z.number().int().min(1).optional(),
  definition: workflowDefinitionSchema,
});

export const workflowVersionActionSchema = z.object({
  action: z.enum(['submit_review', 'publish', 'retire', 'fork']),
  notes: z.string().max(500).optional(),
});

export type CreateWorkflowTemplateInput = z.input<typeof createWorkflowTemplateSchema>;
export type CreateWorkflowVersionDraftInput = z.input<typeof createWorkflowVersionDraftSchema>;
export type SaveWorkflowVersionDraftInput = z.input<typeof saveWorkflowVersionDraftSchema>;
export type WorkflowVersionActionInput = z.input<typeof workflowVersionActionSchema>;
export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;
