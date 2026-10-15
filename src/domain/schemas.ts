import { z } from 'zod';

export const TaskSchema = z.object({
  id: z.string().min(1),
  jobsheetId: z.string().min(1),
  orderId: z.string().min(1),
  name: z.string().min(1),
  operationType: z.string().min(1),
  machineClass: z.string().min(1),
  department: z.string().min(1),
  assignedTechnicianId: z.string().optional(),
  plannedHours: z.number().positive(),
  actualHours: z.number().nonnegative().optional(),
  status: z.enum([
    'PENDING',
    'READY',
    'ASSIGNED',
    'RUNNING',
    'PAUSED',
    'BLOCKED',
    'IN_TRANSIT',
    'COMPLETED',
    'CANCELLED',
  ]),
  dependsOn: z.array(z.string()),
  requiresMaterialIds: z.array(z.string()).optional(),
  requiredCert: z.string().optional(),
  requiredSkill: z
    .object({
      name: z.string(),
      level: z.number().int().min(1).max(5),
    })
    .optional(),
  totalSlack: z.number().optional(),
  freeSlack: z.number().optional(),
  isCritical: z.boolean().optional(),
});

export const OrderSchema = z.object({
  id: z.string().min(1),
  number: z.string().min(1),
  customerName: z.string().min(1),
  partName: z.string().min(1),
  orderedQty: z.number().int().positive(),
  completedQty: z.number().int().nonnegative(),
  qcPassedQty: z.number().int().nonnegative(),
  promisedDate: z.string().min(1),
  expectedDate: z.string().min(1),
  status: z.enum([
    'PLANNED',
    'IN_PRODUCTION',
    'AT_RISK',
    'WATCH',
    'PARTIAL_DELIVERY',
    'READY',
    'DELIVERED',
  ]),
  riskLevel: z.enum(['HEALTHY', 'WATCH', 'CRITICAL']),
  moIds: z.array(z.string()),
  customerAcknowledged: z.boolean().optional(),
  splitDelivery: z
    .object({
      tranche1Qty: z.number().int().positive(),
      tranche1Date: z.string(),
      tranche2Qty: z.number().int().positive(),
      tranche2Date: z.string(),
    })
    .optional(),
}).refine(
  (data) => data.qcPassedQty <= data.completedQty,
  {
    message: 'qcPassedQty cannot exceed completedQty',
    path: ['qcPassedQty'],
  }
).refine(
  (data) => data.completedQty <= data.orderedQty,
  {
    message: 'completedQty cannot exceed orderedQty',
    path: ['completedQty'],
  }
);

export const DisruptionEventSchema = z.object({
  id: z.string(),
  type: z.enum(['MATERIAL_DELAY', 'MACHINE_DOWN', 'TASK_OVERRUN']),
  entityId: z.string(),
  delayDays: z.number().nonnegative().optional(),
  delayHours: z.number().nonnegative().optional(),
  newEtaDate: z.string().optional(),
  description: z.string(),
});

export const RecoveryOptionSchema = z.object({
  id: z.string(),
  type: z.enum(['SPLIT_BATCH', 'ADD_SHIFT', 'REROUTE', 'REASSIGN', 'SUBCONTRACT']),
  title: z.string(),
  description: z.string(),
  timeRecoveredDays: z.number(),
  costImpactPct: z.number(),
  capacityImpact: z.string(),
  risks: z.array(z.string()),
  feasible: z.boolean(),
  infeasibleReason: z.string().optional(),
  isRecommended: z.boolean(),
  allocation: z
    .object({
      tranche1Qty: z.number().int().positive(),
      tranche1Date: z.string(),
      tranche2Qty: z.number().int().positive(),
      tranche2Date: z.string(),
    })
    .optional(),
});
