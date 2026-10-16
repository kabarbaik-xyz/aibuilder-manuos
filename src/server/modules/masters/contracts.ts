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
  facilityId: z.string().nullable().optional(),
  status: z.enum(['AVAILABLE', 'MAINTENANCE', 'OFFLINE']).default('AVAILABLE'),
});

export const updateMachineSchema = z.object({
  expectedVersion: z.number().int().min(1).optional(),
  name: z.string().min(1).max(100).optional(),
  status: z.enum(['AVAILABLE', 'MAINTENANCE', 'OFFLINE']).optional(),
  departmentId: z.string().nullable().optional(),
  calendarId: z.string().nullable().optional(),
  facilityId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const createTechnicianSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  membershipId: z.string().nullable().optional(),
  departmentId: z.string().nullable().optional(),
  calendarId: z.string().nullable().optional(),
  facilityId: z.string().nullable().optional(),
  maxWeeklyMinutes: z.number().int().min(0).default(2400),
});

export const updateTechnicianSchema = z.object({
  expectedVersion: z.number().int().min(1).optional(),
  departmentId: z.string().nullable().optional(),
  calendarId: z.string().nullable().optional(),
  facilityId: z.string().nullable().optional(),
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
  level: z.number().int().min(0).max(4),
  assessmentStatus: z.enum(['CLAIMED', 'OBSERVED', 'VERIFIED', 'REVOKED']).default('VERIFIED'),
  validFrom: z.string().optional(),
  expiresAt: z.string().optional(),
  evidence: z.string().optional(),
  notes: z.string().max(500).optional(),
});

export const revokeTechnicianSkillSchema = z.object({
  notes: z.string().max(500).optional(),
});

export const createCertSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  issuer: z.string().max(100).nullable().optional(),
});

export const assignTechnicianCertSchema = z.object({
  certificationId: z.string().min(1),
  certificateNumber: z.string().nullable().optional(),
  scope: z.string().max(200).optional(),
  evidence: z.string().max(500).optional(),
  issuedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(500).optional(),
});

export const revokeTechnicianCertSchema = z.object({
  notes: z.string().max(500).optional(),
});

export const createMachineDowntimeSchema = z.object({
  machineId: z.string().min(1),
  reason: z.string().min(1).max(200),
  startAt: z.string(),
  endAt: z.string(),
  notes: z.string().max(500).optional(),
});

export const createShiftTemplateSchema = z.object({
  facilityId: z.string().optional(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  breakMinutes: z.number().int().min(0).default(60),
  isOvernight: z.boolean().default(false),
});

export const publishRosterIntervalSchema = z.object({
  facilityId: z.string().optional(),
  technicianId: z.string().optional(),
  machineId: z.string().optional(),
  shiftTemplateId: z.string().optional(),
  intervalType: z.enum(['SHIFT', 'OVERTIME', 'TRAINING', 'LEAVE', 'MAINTENANCE', 'HOLIDAY']).default('SHIFT'),
  startAt: z.string(),
  endAt: z.string(),
  breakIntervals: z.array(z.object({ start: z.string(), end: z.string() })).default([]),
  notes: z.string().max(500).optional(),
});

export const publishRosterBatchSchema = z.object({
  intervals: z.array(publishRosterIntervalSchema).min(1),
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


// -------------------------------------------------------------
// Facility & Issue Reasons (Phase 2)
// -------------------------------------------------------------

export const createFacilitySchema = z.object({
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(200),
  timezone: z.string().trim().min(1).default('Asia/Jakarta'),
  address: z.string().max(500).optional(),
  isDefault: z.boolean().default(false),
});
export type CreateFacilityInput = z.input<typeof createFacilitySchema>;

export const updateFacilitySchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  timezone: z.string().trim().min(1).optional(),
  address: z.string().max(500).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  isDefault: z.boolean().optional(),
});
export type UpdateFacilityInput = z.infer<typeof updateFacilitySchema>;

export const createIssueReasonSchema = z.object({
  category: z.enum(['PAUSE', 'SCRAP', 'REWORK', 'BLOCKER']),
  code: z.string().trim().min(1).max(50),
  label: z.string().trim().min(1).max(200),
  sortOrder: z.number().int().min(0).default(0),
});
export type CreateIssueReasonInput = z.input<typeof createIssueReasonSchema>;

export const updateIssueReasonSchema = z.object({
  label: z.string().trim().min(1).max(200).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});
export type UpdateIssueReasonInput = z.infer<typeof updateIssueReasonSchema>;

export type CreateMachineDowntimeInput = z.input<typeof createMachineDowntimeSchema>;
export type CreateShiftTemplateInput = z.input<typeof createShiftTemplateSchema>;
export type PublishRosterBatchInput = z.input<typeof publishRosterBatchSchema>;
export type PublishRosterIntervalInput = z.input<typeof publishRosterIntervalSchema>;

export const requestOvertimeSchema = z.object({
  technicianId: z.string().min(1),
  facilityId: z.string().optional(),
  startAt: z.string(),
  endAt: z.string(),
  reason: z.string().min(1).max(500),
  notes: z.string().max(500).optional(),
});
export type RequestOvertimeInput = z.infer<typeof requestOvertimeSchema>;

export interface ReassessmentQueueQuery {
  daysAhead?: number;
  facilityId?: string;
  technicianId?: string;
}

export interface ReassessmentQueueItem {
  id: string;
  itemType: 'SKILL' | 'CERTIFICATION';
  technicianId: string;
  technicianCode: string;
  technicianName: string;
  facilityId: string | null;
  referenceId: string;
  name: string;
  code: string;
  level?: number | null;
  assessmentStatus: string;
  validFrom: string | null;
  expiresAt: string | null;
  isExpired: boolean;
  daysUntilExpiry: number | null;
  urgency: 'EXPIRED' | 'EXPIRING_SOON' | 'UNVERIFIED' | 'REVOKED';
  evidence?: string | null;
  notes?: string | null;
  assessedAt?: string | null;
  assessedBy?: string | null;
}
