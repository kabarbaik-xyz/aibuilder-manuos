import { z } from 'zod';

export const createOrderDraftSchema = z.object({
  customerId: z.string().min(1),
  orderTypeId: z.string().min(1),
  itemId: z.string().min(1),
  orderedQuantity: z.number().positive(),
  requestedDate: z.string(),
  promisedDate: z.string().nullable().optional(),
  rfqText: z.string().optional(),
  rfqSourceType: z.enum(['MANUAL', 'EMAIL', 'UPLOAD']).default('MANUAL'),
});

export const updateOrderDraftSchema = z.object({
  expectedVersion: z.number().int().min(1).optional(),
  customerId: z.string().min(1).optional(),
  orderTypeId: z.string().min(1).optional(),
  itemId: z.string().min(1).optional(),
  orderedQuantity: z.number().positive().optional(),
  requestedDate: z.string().optional(),
  promisedDate: z.string().nullable().optional(),
  status: z.enum(['DRAFT', 'REVIEW', 'READY', 'CANCELLED']).optional(),
});

export const addCustomerQuestionSchema = z.object({
  question: z.string().min(1).max(1000),
});

export const resolveCustomerQuestionSchema = z.object({
  answer: z.string().max(1000).optional(),
  status: z.enum(['ANSWERED', 'WAIVED']),
});

export type CreateOrderDraftInput = z.input<typeof createOrderDraftSchema>;
export type UpdateOrderDraftInput = z.input<typeof updateOrderDraftSchema>;
export type AddCustomerQuestionInput = z.input<typeof addCustomerQuestionSchema>;
export type ResolveCustomerQuestionInput = z.input<typeof resolveCustomerQuestionSchema>;
