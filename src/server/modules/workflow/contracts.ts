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

export const lifecycleActionSchema = z.enum([
  'ORDER_CONFIRM', 'ENGINEERING_APPROVE', 'PLAN_PRODUCTION', 'EXECUTE_PRODUCTION',
  'FINALIZE_QC', 'CONFIRM_DELIVERY', 'REVIEW_EVIDENCE',
]);
const formAnswerBranchConditionSchema = z.object({
  kind: z.literal('FORM_ANSWER').optional(),
  sourceStageKey: z.string().min(1).max(50),
  formVersionId: z.string().min(1),
  fieldKey: z.string().min(1).max(100),
  operator: z.enum(['EQUALS', 'NOT_EQUALS', 'IN']),
  value: z.union([z.string(), z.array(z.string()).min(1)]),
}).superRefine((condition, context) => {
  if (condition.operator === 'IN' && typeof condition.value === 'string') {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "The 'in' operator requires a list of values.", path: ['value'] });
  }
  if (condition.operator !== 'IN' && Array.isArray(condition.value)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Equality operators require one text value.', path: ['value'] });
  }
});
const explicitFormAnswerBranchConditionSchema = z.object({
  kind: z.literal('FORM_ANSWER'),
  sourceStageKey: z.string().min(1).max(50),
  formVersionId: z.string().min(1),
  fieldKey: z.string().min(1).max(100),
  operator: z.enum(['EQUALS', 'NOT_EQUALS', 'IN']),
  value: z.union([z.string(), z.array(z.string()).min(1)]),
}).superRefine((condition, context) => {
    if (condition.operator === 'IN' && typeof condition.value === 'string') context.addIssue({ code: z.ZodIssueCode.custom, message: "The 'in' operator requires a list of values.", path: ['value'] });
    if (condition.operator !== 'IN' && Array.isArray(condition.value)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Equality operators require one text value.', path: ['value'] });
});
const qcOutcomeBranchConditionSchema = z.object({
    kind: z.literal('QC_OUTCOME'),
    sourceStageKey: z.string().min(1).max(50),
    operator: z.enum(['EQUALS', 'IN']),
    value: z.union([
      z.enum(['PASSED', 'PASSED_AFTER_REWORK', 'PARTIAL', 'REJECTED']),
      z.array(z.enum(['PASSED', 'PASSED_AFTER_REWORK', 'PARTIAL', 'REJECTED'])).min(1),
    ]),
  });
export const lifecycleBranchConditionSchema = z.union([
  explicitFormAnswerBranchConditionSchema,
  qcOutcomeBranchConditionSchema,
  formAnswerBranchConditionSchema.transform((condition) => ({ ...condition, kind: 'FORM_ANSWER' as const })),
]);
export const orderLifecycleDefinitionSchema = z.object({
  schemaVersion: z.literal(1),
  name: z.string().trim().min(1).max(200),
  stages: z.array(z.object({
    key: z.string().trim().min(1).max(50),
    name: z.string().trim().min(1).max(200),
    action: lifecycleActionSchema,
    departmentId: z.string().min(1),
    assignment: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('MEMBER'), membershipId: z.string().min(1), departmentId: z.string().optional() }),
      z.object({ kind: z.literal('DEPARTMENT_QUEUE'), departmentId: z.string().min(1), eligibleRoleCodes: z.array(z.string().min(1)).min(1) }),
    ]),
    schedule: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('DEADLINE'), dueAfterMinutes: z.number().int().positive() }),
      z.object({ kind: z.literal('RESOURCE_CAPACITY'), routingSource: z.literal('APPROVED_ENGINEERING') }),
    ]),
    predecessors: z.array(z.string().min(1)),
    activationCondition: lifecycleBranchConditionSchema.optional(),
    forms: z.array(z.object({
      formVersionId: z.string().min(1),
      contentHash: z.string().min(1),
      required: z.boolean(),
      completionPoint: z.enum(['BEFORE_ACTION', 'BEFORE_STAGE_COMPLETION']),
    })),
  })).min(1),
});

export const createWorkflowTemplateSchema = z.object({
  orderTypeId: z.string().min(1),
  kind: z.enum(['PRODUCTION_ROUTING', 'ORDER_LIFECYCLE']).default('PRODUCTION_ROUTING'),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).nullable().optional(),
});

export const createWorkflowVersionDraftSchema = z.object({
  definition: workflowDefinitionSchema,
});

export const saveWorkflowVersionDraftSchema = z.object({
  expectedVersion: z.number().int().min(1).optional(),
  definition: z.union([workflowDefinitionSchema, orderLifecycleDefinitionSchema]),
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
