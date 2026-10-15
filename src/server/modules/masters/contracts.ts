import { z } from 'zod';

// -------------------------------------------------------------
// F05 Commercial & Item Masters
// -------------------------------------------------------------

export const createCustomerSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
});

export const updateCustomerSchema = z.object({
  expectedVersion: z.number().int().min(1).optional(),
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const createSupplierSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  contactName: z.string().max(100).nullable().optional(),
  contactEmail: z.string().email().nullable().optional(),
  contactPhone: z.string().max(50).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  leadTimeDays: z.number().int().min(0).default(7),
});

export const updateSupplierSchema = z.object({
  expectedVersion: z.number().int().min(1).optional(),
  name: z.string().min(1).max(200).optional(),
  contactName: z.string().max(100).nullable().optional(),
  contactEmail: z.string().email().nullable().optional(),
  contactPhone: z.string().max(50).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  leadTimeDays: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export const createUomSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  dimension: z.enum(['PIECE', 'WEIGHT', 'VOLUME', 'LENGTH', 'AREA']).default('PIECE'),
  precision: z.number().int().min(0).max(6).default(0),
});

export const createItemSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).nullable().optional(),
  itemType: z.enum(['RAW', 'COMPONENT', 'WIP', 'FINISHED']),
  baseUomId: z.string().min(1),
  tracking: z.enum(['NONE', 'LOT', 'SERIAL']).default('NONE'),
});

export const updateItemSchema = z.object({
  expectedVersion: z.number().int().min(1).optional(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const createItemConversionSchema = z.object({
  inputUomId: z.string().min(1),
  ratioNumerator: z.number().int().positive(),
  ratioDenominator: z.number().int().positive(),
});

export const createLocationSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  warehouseGroup: z.string().min(1).default('DEFAULT'),
  kind: z.enum(['RAW', 'WIP', 'QUARANTINE', 'FG', 'EXTERNAL', 'CONSUMED', 'SCRAP', 'CUSTOMER']),
});

export const updateLocationSchema = z.object({
  expectedVersion: z.number().int().min(1).optional(),
  name: z.string().min(1).max(100).optional(),
  warehouseGroup: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

// -------------------------------------------------------------
// F06 Organization & Resource Masters
// -------------------------------------------------------------

export const createDepartmentSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
});

export const updateDepartmentSchema = z.object({
  expectedVersion: z.number().int().min(1).optional(),
  name: z.string().min(1).max(100).optional(),
});

export const createCalendarSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  timezone: z.string().default('Asia/Jakarta'),
  weeklyShiftsJson: z.string().default('[]'),
});

export const updateCalendarSchema = z.object({
  expectedVersion: z.number().int().min(1).optional(),
  name: z.string().min(1).max(100).optional(),
  timezone: z.string().min(1).optional(),
  weeklyShiftsJson: z.string().optional(),
});

export const createCalendarExceptionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  workingIntervalsJson: z.string().default('[]'),
  reason: z.string().max(200).nullable().optional(),
});

export const createMachineClassSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  capabilitiesJson: z.string().default('[]'),
});

export const createMachineSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  machineClassId: z.string().min(1),
  departmentId: z.string().nullable().optional(),
  calendarId: z.string().nullable().optional(),
  status: z.enum(['AVAILABLE', 'MAINTENANCE', 'OFFLINE']).default('AVAILABLE'),
});

export const updateMachineSchema = z.object({
  expectedVersion: z.number().int().min(1).optional(),
  name: z.string().min(1).max(100).optional(),
  status: z.enum(['AVAILABLE', 'MAINTENANCE', 'OFFLINE']).optional(),
  departmentId: z.string().nullable().optional(),
  calendarId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const createTechnicianSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  membershipId: z.string().nullable().optional(),
  departmentId: z.string().nullable().optional(),
  calendarId: z.string().nullable().optional(),
  maxWeeklyMinutes: z.number().int().min(0).default(2400),
});

export const updateTechnicianSchema = z.object({
  expectedVersion: z.number().int().min(1).optional(),
  departmentId: z.string().nullable().optional(),
  calendarId: z.string().nullable().optional(),
  maxWeeklyMinutes: z.number().int().min(0).optional(),
});

export const createSkillSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  scaleMax: z.number().int().min(1).max(10).default(5),
});

export const updateSkillSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  scaleMax: z.number().int().min(1).max(10).optional(),
});

export const updateUomSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  precision: z.number().int().min(0).max(6).optional(),
});

export const updateQcChecklistSchema = z.object({
  expectedVersion: z.number().int().min(1).optional(),
  name: z.string().min(1).max(100).optional(),
});

export const assignTechnicianSkillSchema = z.object({
  skillId: z.string().min(1),
  level: z.number().int().min(1),
});

export const createCertSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  issuer: z.string().max(100).nullable().optional(),
});

export const assignTechnicianCertSchema = z.object({
  certificationId: z.string().min(1),
  certificateNumber: z.string().nullable().optional(),
  issuedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const createOrderTypeSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
  defaultTemplateId: z.string().nullable().optional(),
});

export const updateOrderTypeSchema = z.object({
  expectedVersion: z.number().int().min(1).optional(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  defaultTemplateId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const createQcChecklistSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  revision: z.number().int().min(1).default(1),
  checks: z.array(
    z.object({
      code: z.string().min(1),
      description: z.string().min(1),
      method: z.enum(['VISUAL', 'MEASUREMENT', 'FUNCTIONAL', 'GAUGE']),
      unit: z.string().nullable().optional(),
      limitsJson: z.string().default('{}'),
      isRequired: z.boolean().default(true),
    })
  ).default([]),
});

// Type definitions matching schema names
export type createCustomerSchema = { _type: z.input<typeof createCustomerSchema> };
export type updateCustomerSchema = { _type: z.input<typeof updateCustomerSchema> };
export type createSupplierSchema = { _type: z.input<typeof createSupplierSchema> };
export type updateSupplierSchema = { _type: z.input<typeof updateSupplierSchema> };
export type createUomSchema = { _type: z.input<typeof createUomSchema> };
export type createItemSchema = { _type: z.input<typeof createItemSchema> };
export type updateItemSchema = { _type: z.input<typeof updateItemSchema> };
export type createItemConversionSchema = { _type: z.input<typeof createItemConversionSchema> };
export type createLocationSchema = { _type: z.input<typeof createLocationSchema> };
export type updateLocationSchema = { _type: z.input<typeof updateLocationSchema> };

export type createDepartmentSchema = { _type: z.input<typeof createDepartmentSchema> };
export type updateDepartmentSchema = { _type: z.input<typeof updateDepartmentSchema> };
export type createCalendarSchema = { _type: z.input<typeof createCalendarSchema> };
export type updateCalendarSchema = { _type: z.input<typeof updateCalendarSchema> };
export type createCalendarExceptionSchema = { _type: z.input<typeof createCalendarExceptionSchema> };
export type createMachineClassSchema = { _type: z.input<typeof createMachineClassSchema> };
export type createMachineSchema = { _type: z.input<typeof createMachineSchema> };
export type updateMachineSchema = { _type: z.input<typeof updateMachineSchema> };
export type createTechnicianSchema = { _type: z.input<typeof createTechnicianSchema> };
export type updateTechnicianSchema = { _type: z.input<typeof updateTechnicianSchema> };
export type createSkillSchema = { _type: z.input<typeof createSkillSchema> };
export type updateSkillSchema = { _type: z.input<typeof updateSkillSchema> };
export type updateUomSchema = { _type: z.input<typeof updateUomSchema> };
export type updateQcChecklistSchema = { _type: z.input<typeof updateQcChecklistSchema> };
export type assignTechnicianSkillSchema = { _type: z.input<typeof assignTechnicianSkillSchema> };
export type createCertSchema = { _type: z.input<typeof createCertSchema> };
export type assignTechnicianCertSchema = { _type: z.input<typeof assignTechnicianCertSchema> };
export type createOrderTypeSchema = { _type: z.input<typeof createOrderTypeSchema> };
export type updateOrderTypeSchema = { _type: z.input<typeof updateOrderTypeSchema> };
export type createQcChecklistSchema = { _type: z.input<typeof createQcChecklistSchema> };

