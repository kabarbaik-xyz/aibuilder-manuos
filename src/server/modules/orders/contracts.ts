import { z } from 'zod';

export const createOrderLineSchema = z.object({
  itemId: z.string().min(1),
  uomId: z.string().optional(),
  orderedQuantity: z.number().positive(),
  unitPriceCents: z.number().int().nonnegative().optional(),
  requestedDate: z.string().optional(),
  promisedDate: z.string().nullable().optional(),
  notes: z.string().max(1000).optional(),
});

export const createOrderDraftSchema = z.object({
  customerId: z.string().min(1),
  orderTypeId: z.string().min(1),
  itemId: z.string().optional(),
  orderedQuantity: z.number().positive().optional(),
  requestedDate: z.string(),
  promisedDate: z.string().nullable().optional(),
  facilityId: z.string().optional(),
  deliveryAddress: z.string().max(500).optional(),
  contractReference: z.string().max(100).optional(),
  rfqText: z.string().optional(),
  rfqSourceType: z.enum(['MANUAL', 'EMAIL', 'UPLOAD']).default('MANUAL'),
  lines: z.array(createOrderLineSchema).optional(),
});

export const updateOrderDraftSchema = z.object({
  expectedVersion: z.number().int().min(1).optional(),
  customerId: z.string().min(1).optional(),
  orderTypeId: z.string().min(1).optional(),
  itemId: z.string().min(1).optional(),
  orderedQuantity: z.number().positive().optional(),
  requestedDate: z.string().optional(),
  promisedDate: z.string().nullable().optional(),
  facilityId: z.string().optional(),
  deliveryAddress: z.string().max(500).optional(),
  contractReference: z.string().max(100).optional(),
  status: z.enum(['DRAFT', 'REVIEW', 'READY', 'CANCELLED']).optional(),
});

export const addOrderLineSchema = z.object({
  itemId: z.string().min(1),
  uomId: z.string().optional(),
  orderedQuantity: z.number().positive(),
  unitPriceCents: z.number().int().nonnegative().optional(),
  requestedDate: z.string().optional(),
  promisedDate: z.string().nullable().optional(),
  notes: z.string().max(1000).optional(),
});

export const confirmOrderSchema = z.object({
  notes: z.string().max(500).optional(),
});

export const allocateJobSchema = z.object({
  orderLineId: z.string().min(1),
  targetQuantity: z.number().positive(),
  moNumber: z.string().optional(),
  departmentId: z.string().optional(),
  workflowVersionId: z.string().optional(),
  engineeringRevisionId: z.string().optional(),
});

export const addCustomerQuestionSchema = z.object({
  question: z.string().min(1).max(1000),
});

export const resolveCustomerQuestionSchema = z.object({
  answer: z.string().max(1000).optional(),
  status: z.enum(['ANSWERED', 'WAIVED']),
});

export type CreateOrderLineInput = z.input<typeof createOrderLineSchema>;
export type CreateOrderDraftInput = z.input<typeof createOrderDraftSchema>;
export type UpdateOrderDraftInput = z.input<typeof updateOrderDraftSchema>;
export type AddOrderLineInput = z.input<typeof addOrderLineSchema>;
export type ConfirmOrderInput = z.input<typeof confirmOrderSchema>;
export type AllocateJobInput = z.input<typeof allocateJobSchema>;
export type AddCustomerQuestionInput = z.input<typeof addCustomerQuestionSchema>;
export type ResolveCustomerQuestionInput = z.input<typeof resolveCustomerQuestionSchema>;
