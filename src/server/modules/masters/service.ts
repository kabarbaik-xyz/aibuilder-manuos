import { PrismaClient } from '@prisma/client';
import { db as defaultDb } from '@/server/db/client';
import { Principal } from '@/server/auth/principal';
import { requirePermission, requireAnyPermission } from '@/server/auth/permissions';
import { ConflictError, NotFoundError, BadRequestError, ForbiddenError } from '@/domain/errors';
import { executeCommand } from '@/server/db/transaction';
import * as contracts from './contracts';
import { accumulateOvertimeMinutes } from './overtime-policy';

export type EditableCatalogResource =
  | 'technicians'
  | 'departments'
  | 'calendars'
  | 'machines'
  | 'certifications'
  | 'skills'
  | 'uoms'
  | 'qc-checklists';

export type EditableCatalogInput = {
  expectedVersion?: number;
  name?: string;
  timezone?: string;
  weeklyShiftsJson?: string;
  status?: 'AVAILABLE' | 'MAINTENANCE' | 'OFFLINE';
  departmentId?: string | null;
  calendarId?: string | null;
  facilityId?: string | null;
  scaleMax?: number;
  precision?: number;
  maxWeeklyMinutes?: number;
  hourlyRateCents?: number | null;
  recoveryPriority?: number;
};

export class MastersService {
  constructor(private readonly prisma: PrismaClient = defaultDb) {}

  async getOvertimePolicy(principal: Principal) {
    requireAnyPermission(principal, ['resource.manage', 'planning.read', 'planning.write', 'task.assign', 'workspace.admin', 'owner']);
    const workspace = await this.prisma.workspace.findUnique({ where: { id: principal.workspaceId }, select: {
      revision: true, timezone: true, maxOvertimeMinutesPerDay: true, maxOvertimeMinutesPerWeek: true,
    } });
    if (!workspace) throw new NotFoundError('Workspace not found');
    return { revision: workspace.revision, timezone: workspace.timezone,
      maxOvertimeHoursPerDay: workspace.maxOvertimeMinutesPerDay / 60,
      maxOvertimeHoursPerWeek: workspace.maxOvertimeMinutesPerWeek / 60 };
  }

  async updateOvertimePolicy(principal: Principal, raw: unknown, idempotencyKey: string) {
    requireAnyPermission(principal, ['resource.manage', 'workspace.admin', 'owner']);
    const input = contracts.updateOvertimePolicySchema.parse(raw);
    return executeCommand({ principal, commandType: 'workforce.overtime-policy.update', idempotencyKey,
      expectedVersion: input.expectedRevision, payload: input, prismaClient: this.prisma,
      handler: async tx => {
        const current = await tx.workspace.findUnique({ where: { id: principal.workspaceId } });
        if (!current) throw new NotFoundError('Workspace not found');
        if (current.revision !== input.expectedRevision) throw new ConflictError('Overtime policy changed. Reload the current workspace limits.', 'STALE_VERSION', true);
        const updated = await tx.workspace.update({ where: { id: current.id }, data: {
          maxOvertimeMinutesPerDay: input.maxOvertimeHoursPerDay * 60,
          maxOvertimeMinutesPerWeek: input.maxOvertimeHoursPerWeek * 60,
          revision: { increment: 1 },
        } });
        return { data: { revision: updated.revision, maxOvertimeHoursPerDay: input.maxOvertimeHoursPerDay,
          maxOvertimeHoursPerWeek: input.maxOvertimeHoursPerWeek }, aggregateType: 'WORKSPACE', aggregateId: current.id,
          previousVersion: current.revision, resourceVersion: updated.revision,
          auditDetails: { maxOvertimeHoursPerDay: input.maxOvertimeHoursPerDay, maxOvertimeHoursPerWeek: input.maxOvertimeHoursPerWeek } };
      } });
  }

  async listOvertimeApprovals(principal: Principal) {
    requireAnyPermission(principal, ['planning.read', 'planning.write', 'task.assign', 'resource.manage', 'workspace.admin', 'owner']);
    const intervals = await this.prisma.rosterInterval.findMany({ where: {
      workspaceId: principal.workspaceId, intervalType: 'OVERTIME', status: 'DRAFT', approverMembershipId: principal.membershipId,
    }, include: { technician: { select: { id: true, code: true, name: true } } }, orderBy: { createdAt: 'asc' }, take: 100 });
    return intervals;
  }

  async updateCatalogRecord(
    principal: Principal,
    resource: EditableCatalogResource,
    id: string,
    input: EditableCatalogInput,
    idempotencyKey: string
  ) {
    const permission = resource === 'qc-checklists' ? 'quality.configure' : 'resource.manage';
    requirePermission(principal, permission);

    switch (resource) {
      case 'departments':
        return executeCommand({
          principal, commandType: 'department.update', idempotencyKey,
          expectedVersion: input.expectedVersion, payload: input, prismaClient: this.prisma,
          handler: async (tx) => {
            const current = await tx.department.findFirst({ where: { id, workspaceId: principal.workspaceId } });
            if (!current) throw new NotFoundError(`Department '${id}' not found`);
            const data = await tx.department.update({ where: { id }, data: { name: input.name ?? current.name, version: { increment: 1 } } });
            return { data, aggregateType: 'DEPARTMENT', aggregateId: data.id, resourceVersion: data.version, previousVersion: current.version };
          },
        });
      case 'calendars':
        return executeCommand({
          principal, commandType: 'calendar.update', idempotencyKey,
          expectedVersion: input.expectedVersion, payload: input, prismaClient: this.prisma,
          handler: async (tx) => {
            const current = await tx.workCalendar.findFirst({ where: { id, workspaceId: principal.workspaceId } });
            if (!current) throw new NotFoundError(`Calendar '${id}' not found`);
            const data = await tx.workCalendar.update({ where: { id }, data: {
              name: input.name ?? current.name,
              timezone: input.timezone ?? current.timezone,
              weeklyShiftsJson: input.weeklyShiftsJson ?? current.weeklyShiftsJson,
              version: { increment: 1 },
            } });
            return { data, aggregateType: 'WORK_CALENDAR', aggregateId: data.id, resourceVersion: data.version, previousVersion: current.version };
          },
        });
      case 'machines':
        return executeCommand({
          principal, commandType: 'machine.update', idempotencyKey,
          expectedVersion: input.expectedVersion, payload: input, prismaClient: this.prisma,
          handler: async (tx) => {
            const current = await tx.machine.findFirst({ where: { id, workspaceId: principal.workspaceId } });
            if (!current) throw new NotFoundError(`Machine '${id}' not found`);
            if (input.facilityId) {
              const fac = await tx.facility.findFirst({
                where: { id: input.facilityId, workspaceId: principal.workspaceId, status: 'ACTIVE' },
              });
              if (!fac) throw new NotFoundError(`Facility '${input.facilityId}' not found in workspace`);
            }
            const data = await tx.machine.update({ where: { id }, data: {
              name: input.name ?? current.name,
              status: input.status ?? current.status,
              departmentId: input.departmentId !== undefined ? input.departmentId : current.departmentId,
              calendarId: input.calendarId !== undefined ? input.calendarId : current.calendarId,
              facilityId: input.facilityId !== undefined ? input.facilityId : current.facilityId,
              hourlyRateCents: input.hourlyRateCents !== undefined ? input.hourlyRateCents : current.hourlyRateCents,
              recoveryPriority: input.recoveryPriority ?? current.recoveryPriority,
              version: { increment: 1 },
            } });
            return { data, aggregateType: 'MACHINE', aggregateId: data.id, resourceVersion: data.version, previousVersion: current.version };
          },
        });
      case 'technicians':
        return executeCommand({
          principal, commandType: 'technician.update', idempotencyKey,
          expectedVersion: input.expectedVersion, payload: input, prismaClient: this.prisma,
          handler: async (tx) => {
            const current = await tx.technician.findFirst({ where: { id, workspaceId: principal.workspaceId, archivedAt: null } });
            if (!current) throw new NotFoundError(`Technician '${id}' not found`);
            if (input.facilityId) {
              const fac = await tx.facility.findFirst({
                where: { id: input.facilityId, workspaceId: principal.workspaceId, status: 'ACTIVE' },
              });
              if (!fac) throw new NotFoundError(`Facility '${input.facilityId}' not found in workspace`);
            }
            const data = await tx.technician.update({ where: { id }, data: {
              departmentId: input.departmentId !== undefined ? input.departmentId : current.departmentId,
              calendarId: input.calendarId !== undefined ? input.calendarId : current.calendarId,
              facilityId: input.facilityId !== undefined ? input.facilityId : current.facilityId,
              maxWeeklyMinutes: input.maxWeeklyMinutes ?? current.maxWeeklyMinutes,
              version: { increment: 1 },
            } });
            return { data, aggregateType: 'TECHNICIAN', aggregateId: data.id, resourceVersion: data.version, previousVersion: current.version };
          },
        });
      case 'certifications':
        return executeCommand({ principal, commandType: 'certification.update', idempotencyKey, payload: input, prismaClient: this.prisma, handler: async (tx) => {
          const current = await tx.certification.findFirst({ where: { id, workspaceId: principal.workspaceId, isActive: true } });
          if (!current) throw new NotFoundError('Active certification not found');
          const data = await tx.certification.update({ where: { id }, data: { name: input.name ?? current.name } });
          return { data, aggregateType: 'CERTIFICATION', aggregateId: id, resourceVersion: 1 };
        } });
      case 'skills':
        return executeCommand({
          principal, commandType: 'skill.update', idempotencyKey, payload: input, prismaClient: this.prisma,
          handler: async (tx) => {
            const current = await tx.skill.findFirst({ where: { id, workspaceId: principal.workspaceId } });
            if (!current) throw new NotFoundError(`Skill '${id}' not found`);
            const data = await tx.skill.update({ where: { id }, data: {
              name: input.name ?? current.name,
              scaleMax: input.scaleMax ?? current.scaleMax,
            } });
            return { data, aggregateType: 'SKILL', aggregateId: data.id, resourceVersion: 1 };
          },
        });
      case 'uoms':
        return executeCommand({
          principal, commandType: 'uom.update', idempotencyKey, payload: input, prismaClient: this.prisma,
          handler: async (tx) => {
            const current = await tx.uom.findFirst({ where: { id, workspaceId: principal.workspaceId } });
            if (!current) throw new NotFoundError(`Unit of measure '${id}' not found`);
            const data = await tx.uom.update({ where: { id }, data: {
              name: input.name ?? current.name,
              precision: input.precision ?? current.precision,
            } });
            return { data, aggregateType: 'UOM', aggregateId: data.id, resourceVersion: 1 };
          },
        });
      case 'qc-checklists':
        return executeCommand({
          principal, commandType: 'qc_checklist.update', idempotencyKey,
          expectedVersion: input.expectedVersion, payload: input, prismaClient: this.prisma,
          handler: async (tx) => {
            const current = await tx.qcChecklist.findFirst({ where: { id, workspaceId: principal.workspaceId } });
            if (!current) throw new NotFoundError(`QC checklist '${id}' not found`);
            if (current.isPublished) throw new BadRequestError('Published checklists cannot be edited. Create a new revision instead.');
            const data = await tx.qcChecklist.update({ where: { id }, data: { name: input.name ?? current.name, version: { increment: 1 } } });
            return { data, aggregateType: 'QC_CHECKLIST', aggregateId: data.id, resourceVersion: data.version, previousVersion: current.version };
          },
        });
    }
  }

  async archiveCatalogRecord(
    principal: Principal,
    resource: EditableCatalogResource,
    id: string,
    idempotencyKey: string
  ) {
    const permission = resource === 'qc-checklists' ? 'quality.configure' : 'resource.manage';
    requirePermission(principal, permission);

    switch (resource) {
      case 'departments':
        return executeCommand({ principal, commandType: 'department.archive', idempotencyKey, payload: { id }, prismaClient: this.prisma, handler: async (tx) => {
          const current = await tx.department.findFirst({ where: { id, workspaceId: principal.workspaceId } });
          if (!current) throw new NotFoundError(`Department '${id}' not found`);
          const data = await tx.department.update({ where: { id }, data: { archivedAt: new Date(), isActive: false, version: { increment: 1 } } });
          return { data, aggregateType: 'DEPARTMENT', aggregateId: data.id, resourceVersion: data.version };
        } });
      case 'calendars':
        return executeCommand({ principal, commandType: 'calendar.archive', idempotencyKey, payload: { id }, prismaClient: this.prisma, handler: async (tx) => {
          const current = await tx.workCalendar.findFirst({ where: { id, workspaceId: principal.workspaceId } });
          if (!current) throw new NotFoundError(`Calendar '${id}' not found`);
          const data = await tx.workCalendar.update({ where: { id }, data: { archivedAt: new Date(), version: { increment: 1 } } });
          return { data, aggregateType: 'WORK_CALENDAR', aggregateId: data.id, resourceVersion: data.version };
        } });
      case 'machines':
        return executeCommand({ principal, commandType: 'machine.archive', idempotencyKey, payload: { id }, prismaClient: this.prisma, handler: async (tx) => {
          const current = await tx.machine.findFirst({ where: { id, workspaceId: principal.workspaceId } });
          if (!current) throw new NotFoundError(`Machine '${id}' not found`);
          const data = await tx.machine.update({ where: { id }, data: { archivedAt: new Date(), version: { increment: 1 } } });
          return { data, aggregateType: 'MACHINE', aggregateId: data.id, resourceVersion: data.version };
        } });
      case 'technicians':
        return executeCommand({ principal, commandType: 'technician.archive', idempotencyKey, payload: { id }, prismaClient: this.prisma, handler: async (tx) => {
          const current = await tx.technician.findFirst({ where: { id, workspaceId: principal.workspaceId, archivedAt: null } });
          if (!current) throw new NotFoundError(`Technician '${id}' not found`);
          const data = await tx.technician.update({ where: { id }, data: { archivedAt: new Date(), isActive: false, version: { increment: 1 } } });
          return { data, aggregateType: 'TECHNICIAN', aggregateId: data.id, resourceVersion: data.version };
        } });
      case 'certifications':
        return executeCommand({ principal, commandType: 'certification.archive', idempotencyKey, payload: { id }, prismaClient: this.prisma, handler: async (tx) => {
          const current = await tx.certification.findFirst({ where: { id, workspaceId: principal.workspaceId } });
          if (!current) throw new NotFoundError('Certification not found');
          const data = await tx.certification.update({ where: { id }, data: { isActive: false } });
          return { data, aggregateType: 'CERTIFICATION', aggregateId: id, resourceVersion: 1 };
        } });
      case 'skills':
        return executeCommand({ principal, commandType: 'skill.archive', idempotencyKey, payload: { id }, prismaClient: this.prisma, handler: async (tx) => {
          const current = await tx.skill.findFirst({ where: { id, workspaceId: principal.workspaceId } });
          if (!current) throw new NotFoundError(`Skill '${id}' not found`);
          const data = await tx.skill.update({ where: { id }, data: { isActive: false } });
          return { data, aggregateType: 'SKILL', aggregateId: data.id, resourceVersion: 1 };
        } });
      case 'uoms':
        return executeCommand({ principal, commandType: 'uom.archive', idempotencyKey, payload: { id }, prismaClient: this.prisma, handler: async (tx) => {
          const current = await tx.uom.findFirst({ where: { id, workspaceId: principal.workspaceId } });
          if (!current) throw new NotFoundError(`Unit of measure '${id}' not found`);
          const data = await tx.uom.update({ where: { id }, data: { isActive: false } });
          return { data, aggregateType: 'UOM', aggregateId: data.id, resourceVersion: 1 };
        } });
      case 'qc-checklists':
        return executeCommand({ principal, commandType: 'qc_checklist.archive', idempotencyKey, payload: { id }, prismaClient: this.prisma, handler: async (tx) => {
          const current = await tx.qcChecklist.findFirst({ where: { id, workspaceId: principal.workspaceId } });
          if (!current) throw new NotFoundError(`QC checklist '${id}' not found`);
          const data = await tx.qcChecklist.update({ where: { id }, data: { archivedAt: new Date(), version: { increment: 1 } } });
          return { data, aggregateType: 'QC_CHECKLIST', aggregateId: data.id, resourceVersion: data.version };
        } });
    }
  }

  // -----------------------------------------------------------
  // Customers (M01, M02)
  // -----------------------------------------------------------
  async listCustomers(principal: Principal, query?: string) {
    return this.prisma.customer.findMany({
      where: {
        workspaceId: principal.workspaceId,
        archivedAt: null,
        ...(query
          ? {
              OR: [
                { name: { contains: query } },
                { code: { contains: query } },
              ],
            }
          : {}),
      },
      include: { contacts: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getCustomer(principal: Principal, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, workspaceId: principal.workspaceId },
      include: { contacts: true, memberships: { include: { user: true } } },
    });
    if (!customer) throw new NotFoundError(`Customer '${id}' not found`);
    return customer;
  }

  async createCustomer(
    principal: Principal,
    input: contracts.createCustomerSchema['_type'],
    idempotencyKey: string
  ) {
    requirePermission(principal, 'customer.manage');

    return executeCommand({
      principal,
      commandType: 'customer.create',
      idempotencyKey,
      payload: input,
      prismaClient: this.prisma,
      handler: async (tx) => {
        // Check duplicate code
        const existing = await tx.customer.findUnique({
          where: {
            workspaceId_code: {
              workspaceId: principal.workspaceId,
              code: input.code,
            },
          },
        });
        if (existing) {
          throw new ConflictError(
            `Customer with code '${input.code}' already exists`,
            'DUPLICATE_CODE'
          );
        }

        const customer = await tx.customer.create({
          data: {
            workspaceId: principal.workspaceId,
            ...input,
          },
        });

        return {
          data: customer,
          aggregateType: 'CUSTOMER',
          aggregateId: customer.id,
          resourceVersion: customer.version,
        };
      },
    });
  }

  async updateCustomer(
    principal: Principal,
    id: string,
    input: contracts.updateCustomerSchema['_type'],
    idempotencyKey: string
  ) {
    requirePermission(principal, 'customer.manage');

    return executeCommand({
      principal,
      commandType: 'customer.update',
      idempotencyKey,
      expectedVersion: input.expectedVersion,
      payload: input,
      prismaClient: this.prisma,
      handler: async (tx) => {
        const customer = await tx.customer.findFirst({
          where: { id, workspaceId: principal.workspaceId },
        });
        if (!customer) throw new NotFoundError(`Customer '${id}' not found`);

        const updated = await tx.customer.update({
          where: { id },
          data: {
            name: input.name ?? customer.name,
            email: input.email !== undefined ? input.email : customer.email,
            phone: input.phone !== undefined ? input.phone : customer.phone,
            address: input.address !== undefined ? input.address : customer.address,
            isActive: input.isActive ?? customer.isActive,
            version: { increment: 1 },
          },
        });

        return {
          data: updated,
          aggregateType: 'CUSTOMER',
          aggregateId: updated.id,
          resourceVersion: updated.version,
          previousVersion: customer.version,
        };
      },
    });
  }

  async archiveCustomer(principal: Principal, id: string, idempotencyKey: string) {
    requirePermission(principal, 'customer.manage');

    return executeCommand({
      principal,
      commandType: 'customer.archive',
      idempotencyKey,
      payload: { id },
      prismaClient: this.prisma,
      handler: async (tx) => {
        const customer = await tx.customer.findFirst({
          where: { id, workspaceId: principal.workspaceId },
        });
        if (!customer) throw new NotFoundError(`Customer '${id}' not found`);

        const archived = await tx.customer.update({
          where: { id },
          data: {
            archivedAt: new Date(),
            isActive: false,
            version: { increment: 1 },
          },
        });

        return {
          data: archived,
          aggregateType: 'CUSTOMER',
          aggregateId: archived.id,
          resourceVersion: archived.version,
        };
      },
    });
  }

  // -----------------------------------------------------------
  // Suppliers (M03, M04)
  // -----------------------------------------------------------
  async listSuppliers(principal: Principal, query?: string) {
    return this.prisma.supplier.findMany({
      where: {
        workspaceId: principal.workspaceId,
        archivedAt: null,
        ...(query
          ? {
              OR: [
                { name: { contains: query } },
                { code: { contains: query } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getSupplier(principal: Principal, id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, workspaceId: principal.workspaceId },
    });
    if (!supplier) throw new NotFoundError(`Supplier '${id}' not found`);
    return supplier;
  }

  async createSupplier(
    principal: Principal,
    input: contracts.createSupplierSchema['_type'],
    idempotencyKey: string
  ) {
    requirePermission(principal, 'supplier.manage');

    return executeCommand({
      principal,
      commandType: 'supplier.create',
      idempotencyKey,
      payload: input,
      prismaClient: this.prisma,
      handler: async (tx) => {
        const existing = await tx.supplier.findUnique({
          where: {
            workspaceId_code: {
              workspaceId: principal.workspaceId,
              code: input.code,
            },
          },
        });
        if (existing) {
          throw new ConflictError(
            `Supplier with code '${input.code}' already exists`,
            'DUPLICATE_CODE'
          );
        }

        const supplier = await tx.supplier.create({
          data: {
            workspaceId: principal.workspaceId,
            ...input,
          },
        });

        return {
          data: supplier,
          aggregateType: 'SUPPLIER',
          aggregateId: supplier.id,
          resourceVersion: supplier.version,
        };
      },
    });
  }

  async updateSupplier(
    principal: Principal,
    id: string,
    input: contracts.updateSupplierSchema['_type'],
    idempotencyKey: string
  ) {
    requirePermission(principal, 'supplier.manage');

    return executeCommand({
      principal,
      commandType: 'supplier.update',
      idempotencyKey,
      expectedVersion: input.expectedVersion,
      payload: input,
      prismaClient: this.prisma,
      handler: async (tx) => {
        const supplier = await tx.supplier.findFirst({
          where: { id, workspaceId: principal.workspaceId },
        });
        if (!supplier) throw new NotFoundError(`Supplier '${id}' not found`);

        const updated = await tx.supplier.update({
          where: { id },
          data: {
            name: input.name ?? supplier.name,
            contactName: input.contactName !== undefined ? input.contactName : supplier.contactName,
            contactEmail: input.contactEmail !== undefined ? input.contactEmail : supplier.contactEmail,
            contactPhone: input.contactPhone !== undefined ? input.contactPhone : supplier.contactPhone,
            address: input.address !== undefined ? input.address : supplier.address,
            leadTimeDays: input.leadTimeDays ?? supplier.leadTimeDays,
            isActive: input.isActive ?? supplier.isActive,
            version: { increment: 1 },
          },
        });

        return {
          data: updated,
          aggregateType: 'SUPPLIER',
          aggregateId: updated.id,
          resourceVersion: updated.version,
          previousVersion: supplier.version,
        };
      },
    });
  }

  async archiveSupplier(principal: Principal, id: string, idempotencyKey: string) {
    requirePermission(principal, 'supplier.manage');

    return executeCommand({
      principal,
      commandType: 'supplier.archive',
      idempotencyKey,
      payload: { id },
      prismaClient: this.prisma,
      handler: async (tx) => {
        const supplier = await tx.supplier.findFirst({
          where: { id, workspaceId: principal.workspaceId },
        });
        if (!supplier) throw new NotFoundError(`Supplier '${id}' not found`);

        const archived = await tx.supplier.update({
          where: { id },
          data: {
            archivedAt: new Date(),
            isActive: false,
            version: { increment: 1 },
          },
        });

        return {
          data: archived,
          aggregateType: 'SUPPLIER',
          aggregateId: archived.id,
          resourceVersion: archived.version,
        };
      },
    });
  }

  // -----------------------------------------------------------
  // Units of Measure (UOMs, M08)
  // -----------------------------------------------------------
  async listUoms(principal: Principal) {
    return this.prisma.uom.findMany({
      where: { workspaceId: principal.workspaceId, isActive: true },
      orderBy: { code: 'asc' },
    });
  }

  async createUom(
    principal: Principal,
    input: contracts.createUomSchema['_type'],
    idempotencyKey: string
  ) {
    requirePermission(principal, 'item.manage');

    return executeCommand({
      principal,
      commandType: 'uom.create',
      idempotencyKey,
      payload: input,
      prismaClient: this.prisma,
      handler: async (tx) => {
        const existing = await tx.uom.findUnique({
          where: {
            workspaceId_code: {
              workspaceId: principal.workspaceId,
              code: input.code,
            },
          },
        });
        if (existing) {
          throw new ConflictError(`UOM '${input.code}' already exists`, 'DUPLICATE_CODE');
        }

        const uom = await tx.uom.create({
          data: {
            workspaceId: principal.workspaceId,
            ...input,
          },
        });

        return {
          data: uom,
          aggregateType: 'UOM',
          aggregateId: uom.id,
          resourceVersion: 1,
        };
      },
    });
  }

  // -----------------------------------------------------------
  // Items & Conversions (M05, M06)
  // -----------------------------------------------------------
  async listItems(principal: Principal, query?: string, itemType?: string) {
    return this.prisma.item.findMany({
      where: {
        workspaceId: principal.workspaceId,
        archivedAt: null,
        ...(itemType ? { itemType } : {}),
        ...(query
          ? {
              OR: [
                { name: { contains: query } },
                { code: { contains: query } },
              ],
            }
          : {}),
      },
      include: { baseUom: true, conversions: { include: { inputUom: true } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getItem(principal: Principal, id: string) {
    const item = await this.prisma.item.findFirst({
      where: { id, workspaceId: principal.workspaceId },
      include: { baseUom: true, conversions: { include: { inputUom: true } } },
    });
    if (!item) throw new NotFoundError(`Item '${id}' not found`);
    return item;
  }

  async createItem(
    principal: Principal,
    input: contracts.createItemSchema['_type'],
    idempotencyKey: string
  ) {
    requirePermission(principal, 'item.manage');

    return executeCommand({
      principal,
      commandType: 'item.create',
      idempotencyKey,
      payload: input,
      prismaClient: this.prisma,
      handler: async (tx) => {
        // Validate base UOM exists in same workspace
        const uom = await tx.uom.findFirst({
          where: { id: input.baseUomId, workspaceId: principal.workspaceId },
        });
        if (!uom) throw new BadRequestError(`Base UOM '${input.baseUomId}' does not exist in workspace`);

        const existing = await tx.item.findUnique({
          where: {
            workspaceId_code: {
              workspaceId: principal.workspaceId,
              code: input.code,
            },
          },
        });
        if (existing) {
          throw new ConflictError(`Item with code '${input.code}' already exists`, 'DUPLICATE_CODE');
        }

        const item = await tx.item.create({
          data: {
            workspaceId: principal.workspaceId,
            ...input,
          },
          include: { baseUom: true },
        });

        return {
          data: item,
          aggregateType: 'ITEM',
          aggregateId: item.id,
          resourceVersion: item.version,
        };
      },
    });
  }

  async updateItem(
    principal: Principal,
    id: string,
    input: contracts.updateItemSchema['_type'],
    idempotencyKey: string
  ) {
    requirePermission(principal, 'item.manage');

    return executeCommand({
      principal,
      commandType: 'item.update',
      idempotencyKey,
      expectedVersion: input.expectedVersion,
      payload: input,
      prismaClient: this.prisma,
      handler: async (tx) => {
        const item = await tx.item.findFirst({
          where: { id, workspaceId: principal.workspaceId },
        });
        if (!item) throw new NotFoundError(`Item '${id}' not found`);

        const updated = await tx.item.update({
          where: { id },
          data: {
            name: input.name ?? item.name,
            description: input.description !== undefined ? input.description : item.description,
            isActive: input.isActive ?? item.isActive,
            version: { increment: 1 },
          },
          include: { baseUom: true },
        });

        return {
          data: updated,
          aggregateType: 'ITEM',
          aggregateId: updated.id,
          resourceVersion: updated.version,
          previousVersion: item.version,
        };
      },
    });
  }

  async archiveItem(principal: Principal, id: string, idempotencyKey: string) {
    requirePermission(principal, 'item.manage');

    return executeCommand({
      principal,
      commandType: 'item.archive',
      idempotencyKey,
      payload: { id },
      prismaClient: this.prisma,
      handler: async (tx) => {
        const item = await tx.item.findFirst({
          where: { id, workspaceId: principal.workspaceId },
        });
        if (!item) throw new NotFoundError(`Item '${id}' not found`);

        const archived = await tx.item.update({
          where: { id },
          data: {
            archivedAt: new Date(),
            isActive: false,
            version: { increment: 1 },
          },
        });

        return {
          data: archived,
          aggregateType: 'ITEM',
          aggregateId: archived.id,
          resourceVersion: archived.version,
        };
      },
    });
  }

  async addConversion(
    principal: Principal,
    itemId: string,
    input: contracts.createItemConversionSchema['_type'],
    idempotencyKey: string
  ) {
    requirePermission(principal, 'item.manage');

    return executeCommand({
      principal,
      commandType: 'item.add_conversion',
      idempotencyKey,
      payload: { itemId, ...input },
      prismaClient: this.prisma,
      handler: async (tx) => {
        const item = await tx.item.findFirst({
          where: { id: itemId, workspaceId: principal.workspaceId },
        });
        if (!item) throw new NotFoundError(`Item '${itemId}' not found`);

        const inputUom = await tx.uom.findFirst({
          where: { id: input.inputUomId, workspaceId: principal.workspaceId },
        });
        if (!inputUom) throw new BadRequestError(`Input UOM not found in workspace`);

        if (input.inputUomId === item.baseUomId) {
          throw new BadRequestError('Cannot create conversion between item and its own base UOM');
        }

        const conversion = await tx.itemUomConversion.upsert({
          where: {
            workspaceId_itemId_inputUomId: {
              workspaceId: principal.workspaceId,
              itemId,
              inputUomId: input.inputUomId,
            },
          },
          update: {
            ratioNumerator: input.ratioNumerator,
            ratioDenominator: input.ratioDenominator,
          },
          create: {
            workspaceId: principal.workspaceId,
            itemId,
            inputUomId: input.inputUomId,
            ratioNumerator: input.ratioNumerator,
            ratioDenominator: input.ratioDenominator,
          },
          include: { inputUom: true },
        });

        return {
          data: conversion,
          aggregateType: 'ITEM',
          aggregateId: itemId,
          resourceVersion: item.version,
        };
      },
    });
  }

  // -----------------------------------------------------------
  // Locations (M07)
  // -----------------------------------------------------------
  async listLocations(principal: Principal) {
    return this.prisma.location.findMany({
      where: { workspaceId: principal.workspaceId, archivedAt: null },
      orderBy: { code: 'asc' },
    });
  }

  async getLocation(principal: Principal, id: string) {
    const loc = await this.prisma.location.findFirst({
      where: { id, workspaceId: principal.workspaceId },
    });
    if (!loc) throw new NotFoundError(`Location '${id}' not found`);
    return loc;
  }

  async createLocation(
    principal: Principal,
    input: contracts.createLocationSchema['_type'],
    idempotencyKey: string
  ) {
    requirePermission(principal, 'location.manage');

    return executeCommand({
      principal,
      commandType: 'location.create',
      idempotencyKey,
      payload: input,
      prismaClient: this.prisma,
      handler: async (tx) => {
        const existing = await tx.location.findUnique({
          where: {
            workspaceId_code: {
              workspaceId: principal.workspaceId,
              code: input.code,
            },
          },
        });
        if (existing) {
          throw new ConflictError(`Location '${input.code}' already exists`, 'DUPLICATE_CODE');
        }

        const location = await tx.location.create({
          data: {
            workspaceId: principal.workspaceId,
            ...input,
          },
        });

        return {
          data: location,
          aggregateType: 'LOCATION',
          aggregateId: location.id,
          resourceVersion: location.version,
        };
      },
    });
  }

  async archiveLocation(principal: Principal, id: string, idempotencyKey: string) {
    requirePermission(principal, 'location.manage');

    return executeCommand({
      principal,
      commandType: 'location.archive',
      idempotencyKey,
      payload: { id },
      prismaClient: this.prisma,
      handler: async (tx) => {
        const location = await tx.location.findFirst({
          where: { id, workspaceId: principal.workspaceId },
        });
        if (!location) throw new NotFoundError(`Location '${id}' not found`);

        const archived = await tx.location.update({
          where: { id },
          data: {
            archivedAt: new Date(),
            isActive: false,
            version: { increment: 1 },
          },
        });

        return {
          data: archived,
          aggregateType: 'LOCATION',
          aggregateId: archived.id,
          resourceVersion: archived.version,
        };
      },
    });
  }

  async updateLocation(
    principal: Principal,
    id: string,
    input: contracts.updateLocationSchema['_type'],
    idempotencyKey: string
  ) {
    requirePermission(principal, 'location.manage');

    return executeCommand({
      principal,
      commandType: 'location.update',
      idempotencyKey,
      expectedVersion: input.expectedVersion,
      payload: input,
      prismaClient: this.prisma,
      handler: async (tx) => {
        const location = await tx.location.findFirst({
          where: { id, workspaceId: principal.workspaceId },
        });
        if (!location) throw new NotFoundError(`Location '${id}' not found`);
        const updated = await tx.location.update({
          where: { id },
          data: {
            name: input.name ?? location.name,
            warehouseGroup: input.warehouseGroup ?? location.warehouseGroup,
            isActive: input.isActive ?? location.isActive,
            version: { increment: 1 },
          },
        });
        return {
          data: updated,
          aggregateType: 'LOCATION',
          aggregateId: updated.id,
          resourceVersion: updated.version,
          previousVersion: location.version,
        };
      },
    });
  }

  // -----------------------------------------------------------
  // Departments, Calendars, Machines, Technicians (M09–M15)
  // -----------------------------------------------------------
  async listDepartments(principal: Principal) {
    return this.prisma.department.findMany({
      where: { workspaceId: principal.workspaceId, archivedAt: null },
      orderBy: { code: 'asc' },
    });
  }

  async createDepartment(
    principal: Principal,
    input: contracts.createDepartmentSchema['_type'],
    idempotencyKey: string
  ) {
    requirePermission(principal, 'resource.manage');

    return executeCommand({
      principal,
      commandType: 'department.create',
      idempotencyKey,
      payload: input,
      prismaClient: this.prisma,
      handler: async (tx) => {
        const existing = await tx.department.findUnique({
          where: {
            workspaceId_code: {
              workspaceId: principal.workspaceId,
              code: input.code,
            },
          },
        });
        if (existing) throw new ConflictError(`Department '${input.code}' already exists`, 'DUPLICATE_CODE');

        const dept = await tx.department.create({
          data: { workspaceId: principal.workspaceId, ...input },
        });

        return {
          data: dept,
          aggregateType: 'DEPARTMENT',
          aggregateId: dept.id,
          resourceVersion: dept.version,
        };
      },
    });
  }

  async listCalendars(principal: Principal) {
    return this.prisma.workCalendar.findMany({
      where: { workspaceId: principal.workspaceId, archivedAt: null },
      include: { exceptions: true },
      orderBy: { code: 'asc' },
    });
  }

  async createCalendar(
    principal: Principal,
    input: contracts.createCalendarSchema['_type'],
    idempotencyKey: string
  ) {
    requirePermission(principal, 'resource.manage');

    return executeCommand({
      principal,
      commandType: 'calendar.create',
      idempotencyKey,
      payload: input,
      prismaClient: this.prisma,
      handler: async (tx) => {
        const existing = await tx.workCalendar.findUnique({
          where: {
            workspaceId_code: {
              workspaceId: principal.workspaceId,
              code: input.code,
            },
          },
        });
        if (existing) throw new ConflictError(`Calendar '${input.code}' already exists`, 'DUPLICATE_CODE');

        const cal = await tx.workCalendar.create({
          data: { workspaceId: principal.workspaceId, ...input },
        });

        return {
          data: cal,
          aggregateType: 'CALENDAR',
          aggregateId: cal.id,
          resourceVersion: cal.version,
        };
      },
    });
  }

  async addCalendarException(
    principal: Principal,
    calendarId: string,
    input: contracts.createCalendarExceptionSchema['_type'],
    idempotencyKey: string
  ) {
    requirePermission(principal, 'resource.manage');

    return executeCommand({
      principal,
      commandType: 'calendar.add_exception',
      idempotencyKey,
      payload: { calendarId, ...input },
      prismaClient: this.prisma,
      handler: async (tx) => {
        const calendar = await tx.workCalendar.findFirst({
          where: { id: calendarId, workspaceId: principal.workspaceId },
        });
        if (!calendar) throw new NotFoundError(`Calendar '${calendarId}' not found`);

        const ex = await tx.calendarException.upsert({
          where: {
            workspaceId_calendarId_date: {
              workspaceId: principal.workspaceId,
              calendarId,
              date: input.date,
            },
          },
          update: {
            workingIntervalsJson: input.workingIntervalsJson,
            reason: input.reason,
          },
          create: {
            workspaceId: principal.workspaceId,
            calendarId,
            date: input.date,
            workingIntervalsJson: input.workingIntervalsJson,
            reason: input.reason,
          },
        });

        return {
          data: ex,
          aggregateType: 'CALENDAR',
          aggregateId: calendar.id,
          resourceVersion: calendar.version,
        };
      },
    });
  }

  async listMachineClasses(principal: Principal) {
    return this.prisma.machineClass.findMany({
      where: { workspaceId: principal.workspaceId, archivedAt: null },
      orderBy: { code: 'asc' },
    });
  }

  async createMachineClass(
    principal: Principal,
    input: contracts.createMachineClassSchema['_type'],
    idempotencyKey: string
  ) {
    requirePermission(principal, 'resource.manage');

    return executeCommand({
      principal,
      commandType: 'machine_class.create',
      idempotencyKey,
      payload: input,
      prismaClient: this.prisma,
      handler: async (tx) => {
        const existing = await tx.machineClass.findUnique({
          where: {
            workspaceId_code: {
              workspaceId: principal.workspaceId,
              code: input.code,
            },
          },
        });
        if (existing) throw new ConflictError(`Machine class '${input.code}' already exists`, 'DUPLICATE_CODE');

        const mc = await tx.machineClass.create({
          data: { workspaceId: principal.workspaceId, ...input },
        });

        return {
          data: mc,
          aggregateType: 'MACHINE_CLASS',
          aggregateId: mc.id,
          resourceVersion: mc.version,
        };
      },
    });
  }

  async listMachines(principal: Principal) {
    return this.prisma.machine.findMany({
      where: { workspaceId: principal.workspaceId, archivedAt: null },
      include: { machineClass: true, department: true, calendar: true },
      orderBy: { code: 'asc' },
    });
  }

  async createMachine(
    principal: Principal,
    input: contracts.createMachineSchema['_type'],
    idempotencyKey: string
  ) {
    requirePermission(principal, 'resource.manage');

    return executeCommand({
      principal,
      commandType: 'machine.create',
      idempotencyKey,
      payload: input,
      prismaClient: this.prisma,
      handler: async (tx) => {
        const existing = await tx.machine.findUnique({
          where: {
            workspaceId_code: {
              workspaceId: principal.workspaceId,
              code: input.code,
            },
          },
        });
        if (existing) throw new ConflictError(`Machine '${input.code}' already exists`, 'DUPLICATE_CODE');

        if (input.facilityId) {
          const fac = await tx.facility.findFirst({
            where: { id: input.facilityId, workspaceId: principal.workspaceId, status: 'ACTIVE' },
          });
          if (!fac) throw new NotFoundError(`Facility '${input.facilityId}' not found in workspace`);
        }

        const machine = await tx.machine.create({
          data: { workspaceId: principal.workspaceId, ...input },
          include: { machineClass: true, department: true, calendar: true },
        });

        return {
          data: machine,
          aggregateType: 'MACHINE',
          aggregateId: machine.id,
          resourceVersion: machine.version,
        };
      },
    });
  }

  async listTechnicians(principal: Principal) {
    return this.prisma.technician.findMany({
      where: { workspaceId: principal.workspaceId, archivedAt: null },
      include: {
        department: true,
        calendar: true,
        skills: { include: { skill: true } },
        certifications: { include: { certification: true } },
      },
      orderBy: { code: 'asc' },
    });
  }

  async createTechnician(
    principal: Principal,
    input: contracts.createTechnicianSchema['_type'],
    idempotencyKey: string
  ) {
    requirePermission(principal, 'resource.manage');

    return executeCommand({
      principal,
      commandType: 'technician.create',
      idempotencyKey,
      payload: input,
      prismaClient: this.prisma,
      handler: async (tx) => {
        const existing = await tx.technician.findUnique({
          where: {
            workspaceId_code: {
              workspaceId: principal.workspaceId,
              code: input.code,
            },
          },
        });
        if (existing) throw new ConflictError(`Technician '${input.code}' already exists`, 'DUPLICATE_CODE');

        if (input.facilityId) {
          const fac = await tx.facility.findFirst({
            where: { id: input.facilityId, workspaceId: principal.workspaceId, status: 'ACTIVE' },
          });
          if (!fac) throw new NotFoundError(`Facility '${input.facilityId}' not found in workspace`);
        }

        if (input.departmentId && !await tx.department.findFirst({ where: { id: input.departmentId, workspaceId: principal.workspaceId, isActive: true, archivedAt: null } })) throw new BadRequestError('Choose an active department in this workspace');
        if (input.calendarId && !await tx.workCalendar.findFirst({ where: { id: input.calendarId, workspaceId: principal.workspaceId, archivedAt: null } })) throw new BadRequestError('Choose a working calendar in this workspace');
        if (input.membershipId) throw new BadRequestError('Link accounts through People & Access to keep both sides consistent');
        if (input.facilityId && !principal.facilityIds?.includes(input.facilityId)) throw new ForbiddenError('Facility is outside your granted facilities');
        const tech = await tx.technician.create({
          data: { workspaceId: principal.workspaceId, ...input },
          include: { department: true, calendar: true },
        });

        return {
          data: tech,
          aggregateType: 'TECHNICIAN',
          aggregateId: tech.id,
          resourceVersion: tech.version,
        };
      },
    });
  }

  async assignSkill(
    principal: Principal,
    technicianId: string,
    input: contracts.assignTechnicianSkillSchema['_type'],
    idempotencyKey: string
  ) {
    requirePermission(principal, 'resource.manage');

    return executeCommand({
      principal,
      commandType: 'technician.assign_skill',
      idempotencyKey,
      payload: { technicianId, ...input },
      prismaClient: this.prisma,
      handler: async (tx) => {
        const tech = await tx.technician.findFirst({
          where: { id: technicianId, workspaceId: principal.workspaceId },
        });
        if (!tech) throw new NotFoundError(`Technician '${technicianId}' not found`);

        const skill = await tx.skill.findFirst({
          where: { id: input.skillId, workspaceId: principal.workspaceId },
        });
        if (!skill) throw new NotFoundError(`Skill '${input.skillId}' not found`);

        const effectiveMax = Math.min(skill.scaleMax, 4);
        if (input.level < 0 || input.level > effectiveMax) {
          throw new BadRequestError(`Skill level cannot exceed scale max: must be between 0 and ${effectiveMax}`);
        }

        const validFrom = input.validFrom ? new Date(input.validFrom) : null;
        const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
        const status = input.assessmentStatus || 'VERIFIED';

        // Record immutable assessment history
        await tx.skillAssessmentHistory.create({
          data: {
            workspaceId: principal.workspaceId,
            technicianId,
            skillId: input.skillId,
            level: input.level,
            assessmentStatus: status,
            assessedBy: principal.userId,
            evidence: input.evidence,
            notes: input.notes,
          },
        });

        const ts = await tx.technicianSkill.upsert({
          where: {
            technicianId_skillId: {
              technicianId,
              skillId: input.skillId,
            },
          },
          update: {
            level: input.level,
            assessmentStatus: status,
            validFrom,
            expiresAt,
            evidence: input.evidence,
            notes: input.notes,
            revokedAt: null,
            revokedById: null,
            assessedAt: new Date(),
            assessedBy: principal.userId,
          },
          create: {
            workspaceId: principal.workspaceId,
            technicianId,
            skillId: input.skillId,
            level: input.level,
            assessmentStatus: status,
            validFrom,
            expiresAt,
            evidence: input.evidence,
            notes: input.notes,
            assessedBy: principal.userId,
          },
          include: { skill: true },
        });

        return {
          data: ts,
          aggregateType: 'TECHNICIAN',
          aggregateId: tech.id,
          resourceVersion: tech.version,
        };
      },
    });
  }

  async revokeSkill(
    principal: Principal,
    technicianId: string,
    skillId: string,
    input: { notes?: string },
    idempotencyKey: string
  ) {
    requirePermission(principal, 'resource.manage');

    return executeCommand({
      principal,
      commandType: 'technician.revoke_skill',
      idempotencyKey,
      payload: { technicianId, skillId, ...input },
      prismaClient: this.prisma,
      handler: async (tx) => {
        const ts = await tx.technicianSkill.findFirst({
          where: { technicianId, skillId, workspaceId: principal.workspaceId },
        });
        if (!ts) throw new NotFoundError(`Technician skill assignment for skill '${skillId}' not found`);

        const updated = await tx.technicianSkill.update({
          where: {
            technicianId_skillId: {
              technicianId,
              skillId,
            },
          },
          data: {
            assessmentStatus: 'REVOKED',
            revokedAt: new Date(),
            revokedById: principal.userId,
            notes: input.notes,
          },
          include: { skill: true },
        });

        // Record revocation in assessment history
        await tx.skillAssessmentHistory.create({
          data: {
            workspaceId: principal.workspaceId,
            technicianId,
            skillId,
            level: 0,
            assessmentStatus: 'REVOKED',
            assessedBy: principal.userId,
            notes: input.notes,
          },
        });

        return {
          data: updated,
          aggregateType: 'TECHNICIAN',
          aggregateId: technicianId,
          resourceVersion: 1,
        };
      },
    });
  }

  async assignCert(
    principal: Principal,
    technicianId: string,
    input: contracts.assignTechnicianCertSchema['_type'],
    idempotencyKey: string
  ) {
    requirePermission(principal, 'resource.manage');

    return executeCommand({
      principal,
      commandType: 'technician.assign_cert',
      idempotencyKey,
      payload: { technicianId, ...input },
      prismaClient: this.prisma,
      handler: async (tx) => {
        const tech = await tx.technician.findFirst({
          where: { id: technicianId, workspaceId: principal.workspaceId },
        });
        if (!tech) throw new NotFoundError(`Technician '${technicianId}' not found`);

        const cert = await tx.certification.findFirst({
          where: { id: input.certificationId, workspaceId: principal.workspaceId, isActive: true },
        });
        if (!cert) throw new NotFoundError(`Certification '${input.certificationId}' not found`);

        if (input.validUntil < input.issuedDate) {
          throw new BadRequestError('validUntil date cannot precede issuedDate');
        }

        const validFromDate = new Date(`${input.issuedDate}T00:00:00.000Z`);
        const expiresAtDate = new Date(`${input.validUntil}T23:59:59.999Z`);

        const tc = await tx.technicianCertification.upsert({
          where: {
            technicianId_certificationId: {
              technicianId,
              certificationId: input.certificationId,
            },
          },
          update: {
            certificateNumber: input.certificateNumber,
            issuedDate: input.issuedDate,
            validUntil: input.validUntil,
            validFromDate,
            expiresAtDate,
            scope: input.scope,
            evidence: input.evidence,
            notes: input.notes,
            status: 'ACTIVE',
            revokedAt: null,
            revokedById: null,
          },
          create: {
            workspaceId: principal.workspaceId,
            technicianId,
            certificationId: input.certificationId,
            certificateNumber: input.certificateNumber,
            issuedDate: input.issuedDate,
            validUntil: input.validUntil,
            validFromDate,
            expiresAtDate,
            scope: input.scope,
            evidence: input.evidence,
            notes: input.notes,
            status: 'ACTIVE',
          },
          include: { certification: true },
        });

        return {
          data: tc,
          aggregateType: 'TECHNICIAN',
          aggregateId: tech.id,
          resourceVersion: tech.version,
        };
      },
    });
  }

  async revokeCert(
    principal: Principal,
    technicianId: string,
    certificationId: string,
    input: { notes?: string },
    idempotencyKey: string
  ) {
    requirePermission(principal, 'resource.manage');

    return executeCommand({
      principal,
      commandType: 'technician.revoke_cert',
      idempotencyKey,
      payload: { technicianId, certificationId, ...input },
      prismaClient: this.prisma,
      handler: async (tx) => {
        const tc = await tx.technicianCertification.findFirst({
          where: { technicianId, certificationId, workspaceId: principal.workspaceId },
        });
        if (!tc) throw new NotFoundError(`Technician certificate not found`);

        const updated = await tx.technicianCertification.update({
          where: {
            technicianId_certificationId: {
              technicianId,
              certificationId,
            },
          },
          data: {
            status: 'REVOKED',
            revokedAt: new Date(),
            revokedById: principal.userId,
            notes: input.notes,
          },
          include: { certification: true },
        });

        return {
          data: updated,
          aggregateType: 'TECHNICIAN',
          aggregateId: technicianId,
          resourceVersion: 1,
        };
      },
    });
  }

  // -----------------------------------------------------------
  // Machine Downtime Management
  // -----------------------------------------------------------
  async createMachineDowntime(
    principal: Principal,
    input: contracts.CreateMachineDowntimeInput,
    idempotencyKey: string
  ) {
    requirePermission(principal, 'resource.manage');

    return executeCommand({
      principal,
      commandType: 'machine.downtime.create',
      idempotencyKey,
      payload: input,
      prismaClient: this.prisma,
      handler: async (tx) => {
        const machine = await tx.machine.findFirst({
          where: { id: input.machineId, workspaceId: principal.workspaceId },
        });
        if (!machine) throw new NotFoundError(`Machine '${input.machineId}' not found`);

        const startAt = new Date(input.startAt);
        const endAt = new Date(input.endAt);
        if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime()) || startAt >= endAt) {
          throw new BadRequestError('startAt must be strictly before endAt');
        }

        const dt = await tx.machineDowntime.create({
          data: {
            workspaceId: principal.workspaceId,
            machineId: input.machineId,
            reason: input.reason,
            startAt,
            endAt,
            notes: input.notes,
            status: 'SCHEDULED',
          },
          include: { machine: true },
        });

        return {
          data: dt,
          aggregateType: 'MACHINE_DOWNTIME',
          aggregateId: dt.id,
          resourceVersion: 1,
        };
      },
    });
  }

  async listMachineDowntimes(principal: Principal, machineId: string) {
    requireAnyPermission(principal, ['resource.manage', 'planning.read']);

    return this.prisma.machineDowntime.findMany({
      where: { machineId, workspaceId: principal.workspaceId },
      orderBy: { startAt: 'desc' },
      include: { machine: true },
    });
  }

  // -----------------------------------------------------------
  // Shift Templates & Roster Intervals
  // -----------------------------------------------------------
  async createShiftTemplate(
    principal: Principal,
    input: contracts.CreateShiftTemplateInput,
    idempotencyKey: string
  ) {
    requirePermission(principal, 'resource.manage');

    return executeCommand({
      principal,
      commandType: 'shift_template.create',
      idempotencyKey,
      payload: input,
      prismaClient: this.prisma,
      handler: async (tx) => {
        const existing = await tx.shiftTemplate.findFirst({
          where: { workspaceId: principal.workspaceId, code: input.code },
        });
        if (existing) throw new ConflictError(`Shift template '${input.code}' already exists`);

        if (input.facilityId) {
          const fac = await tx.facility.findFirst({
            where: { id: input.facilityId, workspaceId: principal.workspaceId, isActive: true },
          });
          if (!fac) throw new BadRequestError(`Facility '${input.facilityId}' not found or inactive`);
        }

        const st = await tx.shiftTemplate.create({
          data: {
            workspaceId: principal.workspaceId,
            facilityId: input.facilityId,
            code: input.code,
            name: input.name,
            startTime: input.startTime,
            endTime: input.endTime,
            breakMinutes: input.breakMinutes ?? 60,
            isOvernight: input.isOvernight ?? false,
          },
        });

        return {
          data: st,
          aggregateType: 'SHIFT_TEMPLATE',
          aggregateId: st.id,
          resourceVersion: 1,
        };
      },
    });
  }

  async listShiftTemplates(principal: Principal, facilityId?: string) {
    requireAnyPermission(principal, ['resource.manage', 'planning.read']);

    return this.prisma.shiftTemplate.findMany({
      where: {
        workspaceId: principal.workspaceId,
        isActive: true,
        ...(facilityId ? { facilityId } : {}),
      },
      orderBy: { code: 'asc' },
    });
  }

  async publishRosterIntervals(
    principal: Principal,
    input: contracts.PublishRosterBatchInput,
    idempotencyKey: string
  ) {
    requireAnyPermission(principal, ['resource.manage', 'planning.write']);

    return executeCommand({
      principal,
      commandType: 'roster.publish',
      idempotencyKey,
      payload: input,
      prismaClient: this.prisma,
      handler: async (tx) => {
        const createdIntervals = [];

        for (const item of input.intervals) {
          const startAt = new Date(item.startAt);
          const endAt = new Date(item.endAt);
          if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime()) || startAt >= endAt) {
            throw new BadRequestError(`Invalid interval: startAt (${item.startAt}) must precede endAt (${item.endAt})`);
          }

          if (Boolean(item.technicianId) === Boolean(item.machineId)) throw new BadRequestError('Choose exactly one technician or machine for each roster interval');
          if (item.facilityId && !principal.facilityIds?.includes(item.facilityId)) throw new ForbiddenError('Roster facility is outside your granted facilities');
          if (item.technicianId) {
            const tech = await tx.technician.findFirst({
              where: { id: item.technicianId, workspaceId: principal.workspaceId, isActive: true },
            });
            if (!tech) throw new BadRequestError(`Technician '${item.technicianId}' not found or inactive`);
            if (tech.facilityId && !principal.facilityIds?.includes(tech.facilityId)) throw new ForbiddenError('Technician is outside your granted facilities');
            if (item.facilityId && tech.facilityId && tech.facilityId !== item.facilityId) throw new BadRequestError('Roster facility must match the technician facility');
          }

          if (item.machineId) {
            const mach = await tx.machine.findFirst({
              where: { id: item.machineId, workspaceId: principal.workspaceId },
            });
            if (!mach) throw new BadRequestError(`Machine '${item.machineId}' not found`);
          }

          const record = await tx.rosterInterval.create({
            data: {
              workspaceId: principal.workspaceId,
              facilityId: item.facilityId,
              technicianId: item.technicianId,
              machineId: item.machineId,
              shiftTemplateId: item.shiftTemplateId,
              intervalType: item.intervalType || 'SHIFT',
              startAt,
              endAt,
              status: 'PUBLISHED',
              breakIntervalsJson: JSON.stringify(item.breakIntervals || []),
              notes: item.notes,
            },
          });

          createdIntervals.push(record);
        }

        return {
          data: createdIntervals,
          aggregateType: 'ROSTER_INTERVAL',
          aggregateId: principal.workspaceId,
          resourceVersion: 1,
        };
      },
    });
  }

  async listRosterIntervals(
    principal: Principal,
    filter: {
      technicianId?: string;
      machineId?: string;
      facilityId?: string;
      startAt?: string;
      endAt?: string;
      status?: string;
    }
  ) {
    requireAnyPermission(principal, ['resource.manage', 'planning.read']);

    return this.prisma.rosterInterval.findMany({
      where: {
        workspaceId: principal.workspaceId,
        ...(filter.technicianId ? { technicianId: filter.technicianId } : {}),
        ...(filter.machineId ? { machineId: filter.machineId } : {}),
        ...(filter.facilityId ? { facilityId: filter.facilityId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.startAt && filter.endAt
          ? {
              startAt: { lte: new Date(filter.endAt) },
              endAt: { gte: new Date(filter.startAt) },
            }
          : {}),
      },
      orderBy: { startAt: 'asc' },
    });
  }

  async listSkills(principal: Principal) {
    return this.prisma.skill.findMany({
      where: { workspaceId: principal.workspaceId, isActive: true },
      orderBy: { code: 'asc' },
    });
  }

  async createSkill(
    principal: Principal,
    input: contracts.createSkillSchema['_type'],
    idempotencyKey: string
  ) {
    requirePermission(principal, 'resource.manage');

    return executeCommand({
      principal,
      commandType: 'skill.create',
      idempotencyKey,
      payload: input,
      prismaClient: this.prisma,
      handler: async (tx) => {
        const existing = await tx.skill.findUnique({
          where: {
            workspaceId_code: {
              workspaceId: principal.workspaceId,
              code: input.code,
            },
          },
        });
        if (existing) throw new ConflictError(`Skill '${input.code}' already exists`, 'DUPLICATE_CODE');

        const scaleMax = Math.min(input.scaleMax ?? 4, 4);
        const skill = await tx.skill.create({
          data: { workspaceId: principal.workspaceId, ...input, scaleMax },
        });

        return {
          data: skill,
          aggregateType: 'SKILL',
          aggregateId: skill.id,
          resourceVersion: 1,
        };
      },
    });
  }

  async listCertifications(principal: Principal) {
    return this.prisma.certification.findMany({
      where: { workspaceId: principal.workspaceId, isActive: true },
      orderBy: { code: 'asc' },
    });
  }

  async createCertification(
    principal: Principal,
    input: contracts.createCertSchema['_type'],
    idempotencyKey: string
  ) {
    requirePermission(principal, 'resource.manage');

    return executeCommand({
      principal,
      commandType: 'certification.create',
      idempotencyKey,
      payload: input,
      prismaClient: this.prisma,
      handler: async (tx) => {
        const existing = await tx.certification.findUnique({
          where: {
            workspaceId_code: {
              workspaceId: principal.workspaceId,
              code: input.code,
            },
          },
        });
        if (existing) throw new ConflictError(`Certification '${input.code}' already exists`, 'DUPLICATE_CODE');

        const cert = await tx.certification.create({
          data: { workspaceId: principal.workspaceId, ...input },
        });

        return {
          data: cert,
          aggregateType: 'CERTIFICATION',
          aggregateId: cert.id,
          resourceVersion: 1,
        };
      },
    });
  }

  async listOrderTypes(principal: Principal) {
    return this.prisma.orderType.findMany({
      where: { workspaceId: principal.workspaceId, archivedAt: null },
      orderBy: { code: 'asc' },
    });
  }

  async createOrderType(
    principal: Principal,
    input: contracts.createOrderTypeSchema['_type'],
    idempotencyKey: string
  ) {
    requirePermission(principal, 'workflow.author');

    return executeCommand({
      principal,
      commandType: 'order_type.create',
      idempotencyKey,
      payload: input,
      prismaClient: this.prisma,
      handler: async (tx) => {
        const existing = await tx.orderType.findUnique({
          where: {
            workspaceId_code: {
              workspaceId: principal.workspaceId,
              code: input.code,
            },
          },
        });
        if (existing) throw new ConflictError(`Order type '${input.code}' already exists`, 'DUPLICATE_CODE');

        const ot = await tx.orderType.create({
          data: { workspaceId: principal.workspaceId, ...input },
        });

        return {
          data: ot,
          aggregateType: 'ORDER_TYPE',
          aggregateId: ot.id,
          resourceVersion: ot.version,
        };
      },
    });
  }

  async updateOrderType(
    principal: Principal,
    id: string,
    input: contracts.updateOrderTypeSchema['_type'],
    idempotencyKey: string
  ) {
    requirePermission(principal, 'workflow.author');

    return executeCommand({
      principal,
      commandType: 'order_type.update',
      idempotencyKey,
      expectedVersion: input.expectedVersion,
      payload: input,
      prismaClient: this.prisma,
      handler: async (tx) => {
        const orderType = await tx.orderType.findFirst({
          where: { id, workspaceId: principal.workspaceId },
        });
        if (!orderType) throw new NotFoundError(`Order type '${id}' not found`);

        const updated = await tx.orderType.update({
          where: { id },
          data: {
            name: input.name ?? orderType.name,
            description: input.description !== undefined ? input.description : orderType.description,
            defaultTemplateId: input.defaultTemplateId !== undefined ? input.defaultTemplateId : orderType.defaultTemplateId,
            isActive: input.isActive ?? orderType.isActive,
            version: { increment: 1 },
          },
        });

        return {
          data: updated,
          aggregateType: 'ORDER_TYPE',
          aggregateId: updated.id,
          resourceVersion: updated.version,
          previousVersion: orderType.version,
        };
      },
    });
  }

  async archiveOrderType(principal: Principal, id: string, idempotencyKey: string) {
    requirePermission(principal, 'workflow.author');

    return executeCommand({
      principal,
      commandType: 'order_type.archive',
      idempotencyKey,
      payload: { id },
      prismaClient: this.prisma,
      handler: async (tx) => {
        const orderType = await tx.orderType.findFirst({
          where: { id, workspaceId: principal.workspaceId },
        });
        if (!orderType) throw new NotFoundError(`Order type '${id}' not found`);

        const archived = await tx.orderType.update({
          where: { id },
          data: {
            archivedAt: new Date(),
            isActive: false,
            version: { increment: 1 },
          },
        });

        return {
          data: archived,
          aggregateType: 'ORDER_TYPE',
          aggregateId: archived.id,
          resourceVersion: archived.version,
        };
      },
    });
  }

  async listQcChecklists(principal: Principal) {
    return this.prisma.qcChecklist.findMany({
      where: { workspaceId: principal.workspaceId, archivedAt: null },
      include: { checks: true },
      orderBy: [{ code: 'asc' }, { revision: 'desc' }],
    });
  }

  async createQcChecklist(
    principal: Principal,
    input: contracts.createQcChecklistSchema['_type'],
    idempotencyKey: string
  ) {
    requirePermission(principal, 'quality.configure');

    return executeCommand({
      principal,
      commandType: 'qc_checklist.create',
      idempotencyKey,
      payload: input,
      prismaClient: this.prisma,
      handler: async (tx) => {
        const rev = input.revision ?? 1;
        const existing = await tx.qcChecklist.findUnique({
          where: {
            workspaceId_code_revision: {
              workspaceId: principal.workspaceId,
              code: input.code,
              revision: rev,
            },
          },
        });
        if (existing) throw new ConflictError(`Checklist '${input.code}' rev ${rev} exists`, 'DUPLICATE_CODE');

        const checklist = await tx.qcChecklist.create({
          data: {
            workspaceId: principal.workspaceId,
            code: input.code,
            name: input.name,
            revision: rev,
            checks: {
              create: (input.checks || []).map((c: any) => ({
                code: c.code,
                description: c.description,
                method: c.method,
                unit: c.unit || null,
                limitsJson: c.limitsJson,
                isRequired: c.isRequired,
                requiresEvidence: c.requiresEvidence,
              })),
            },
          },
          include: { checks: true },
        });

        return {
          data: checklist,
          aggregateType: 'QC_CHECKLIST',
          aggregateId: checklist.id,
          resourceVersion: checklist.version,
        };
      },
    });
  }

  // -----------------------------------------------------------
  // Resource Context Query (F06 requirement)
  // -----------------------------------------------------------
  async getResourceContext(
    principal: Principal,
    resourceIds: { machineIds?: string[]; technicianIds?: string[] },
    atDate = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  ) {
    const machines = resourceIds.machineIds?.length
      ? await this.prisma.machine.findMany({
          where: {
            workspaceId: principal.workspaceId,
            id: { in: resourceIds.machineIds },
            archivedAt: null,
          },
          include: {
            machineClass: true,
            department: true,
            calendar: {
              include: {
                exceptions: { where: { date: atDate } },
              },
            },
          },
        })
      : [];

    const technicians = resourceIds.technicianIds?.length
      ? await this.prisma.technician.findMany({
          where: {
            workspaceId: principal.workspaceId,
            id: { in: resourceIds.technicianIds },
            archivedAt: null,
          },
          include: {
            department: true,
            calendar: {
              include: {
                exceptions: { where: { date: atDate } },
              },
            },
            skills: { include: { skill: true } },
            certifications: { include: { certification: true } },
          },
        })
      : [];

    return {
      date: atDate,
      machines: machines.map((m) => ({
        id: m.id,
        code: m.code,
        name: m.name,
        status: m.status,
        calendarName: m.calendar?.name,
        isAvailable: m.status === 'AVAILABLE',
        exceptionToday: m.calendar?.exceptions[0] || null,
      })),
      technicians: technicians.map((t) => ({
        id: t.id,
        code: t.code,
        name: t.name,
        isActive: t.isActive,
        calendarName: t.calendar?.name,
        skills: t.skills.map((s) => ({ code: s.skill.code, level: s.level })),
        certifications: t.certifications.map((c) => ({
          code: c.certification.code,
          validUntil: c.validUntil,
          isExpired: c.validUntil < atDate,
        })),
        exceptionToday: t.calendar?.exceptions[0] || null,
      })),
    };
  }

  // -------------------------------------------------------------
  // Facility & Facility Grants (Phase 2)
  // -------------------------------------------------------------
  async listFacilities(principal: Principal) {
    return await this.prisma.facility.findMany({
      where: { workspaceId: principal.workspaceId },
      orderBy: [{ isDefault: 'desc' }, { code: 'asc' }],
    });
  }

  async getFacility(principal: Principal, id: string) {
    const facility = await this.prisma.facility.findFirst({
      where: { id, workspaceId: principal.workspaceId },
    });
    if (!facility) {
      throw new NotFoundError(`Facility '${id}' not found`);
    }
    return facility;
  }

  async createFacility(
    principal: Principal,
    input: contracts.CreateFacilityInput,
    idempotencyKey: string
  ) {
    requireAnyPermission(principal, ['resource.manage', 'workspace.admin', 'owner']);
    const validated = contracts.createFacilitySchema.parse(input);

    return executeCommand({
      principal,
      commandType: 'facility.create',
      idempotencyKey,
      payload: validated,
      prismaClient: this.prisma,
      handler: async (tx) => {
        const existing = await tx.facility.findUnique({
          where: {
            workspaceId_code: {
              workspaceId: principal.workspaceId,
              code: validated.code,
            },
          },
        });
        if (existing) {
          throw new ConflictError(`Facility with code '${validated.code}' already exists`);
        }

        if (validated.isDefault) {
          await tx.facility.updateMany({
            where: { workspaceId: principal.workspaceId, isDefault: true },
            data: { isDefault: false },
          });
        }

        const data = await tx.facility.create({
          data: {
            workspaceId: principal.workspaceId,
            code: validated.code,
            name: validated.name,
            timezone: validated.timezone,
            address: validated.address ?? null,
            isDefault: validated.isDefault,
            status: 'ACTIVE',
          },
        });

        return {
          data,
          aggregateType: 'FACILITY',
          aggregateId: data.id,
          resourceVersion: 1,
        };
      },
    });
  }

  async updateFacility(
    principal: Principal,
    id: string,
    input: contracts.UpdateFacilityInput,
    idempotencyKey: string
  ) {
    requireAnyPermission(principal, ['resource.manage', 'workspace.admin', 'owner']);
    const validated = contracts.updateFacilitySchema.parse(input);

    return executeCommand({
      principal,
      commandType: 'facility.update',
      idempotencyKey,
      payload: { id, ...validated },
      prismaClient: this.prisma,
      handler: async (tx) => {
        const current = await tx.facility.findFirst({
          where: { id, workspaceId: principal.workspaceId },
        });
        if (!current) {
          throw new NotFoundError(`Facility '${id}' not found`);
        }

        if (validated.isDefault && !current.isDefault) {
          await tx.facility.updateMany({
            where: { workspaceId: principal.workspaceId, isDefault: true },
            data: { isDefault: false },
          });
        }

        const data = await tx.facility.update({
          where: { id },
          data: {
            name: validated.name ?? current.name,
            timezone: validated.timezone ?? current.timezone,
            address: validated.address !== undefined ? validated.address : current.address,
            status: validated.status ?? current.status,
            isDefault: validated.isDefault !== undefined ? validated.isDefault : current.isDefault,
          },
        });

        return {
          data,
          aggregateType: 'FACILITY',
          aggregateId: data.id,
          resourceVersion: 1,
        };
      },
    });
  }

  async grantFacilityAccess(
    principal: Principal,
    membershipId: string,
    facilityId: string,
    idempotencyKey: string
  ) {
    requireAnyPermission(principal, ['access.manage', 'workspace.admin', 'owner']);

    return executeCommand({
      principal,
      commandType: 'facility.grant_access',
      idempotencyKey,
      payload: { membershipId, facilityId },
      prismaClient: this.prisma,
      handler: async (tx) => {
        const mem = await tx.membership.findFirst({
          where: { id: membershipId, workspaceId: principal.workspaceId },
        });
        if (!mem) throw new NotFoundError(`Membership '${membershipId}' not found`);

        const fac = await tx.facility.findFirst({
          where: { id: facilityId, workspaceId: principal.workspaceId },
        });
        if (!fac) throw new NotFoundError(`Facility '${facilityId}' not found`);

        const grant = await tx.membershipFacilityGrant.upsert({
          where: {
            membershipId_facilityId: {
              membershipId,
              facilityId,
            },
          },
          create: {
            workspaceId: principal.workspaceId,
            membershipId,
            facilityId,
          },
          update: {},
        });

        return {
          data: grant,
          aggregateType: 'MEMBERSHIP_FACILITY_GRANT',
          aggregateId: grant.id,
          resourceVersion: 1,
        };
      },
    });
  }

  async revokeFacilityAccess(
    principal: Principal,
    membershipId: string,
    facilityId: string,
    idempotencyKey: string
  ) {
    requireAnyPermission(principal, ['access.manage', 'workspace.admin', 'owner']);

    return executeCommand({
      principal,
      commandType: 'facility.revoke_access',
      idempotencyKey,
      payload: { membershipId, facilityId },
      prismaClient: this.prisma,
      handler: async (tx) => {
        await tx.membershipFacilityGrant.deleteMany({
          where: {
            membershipId,
            facilityId,
            workspaceId: principal.workspaceId,
          },
        });

        return {
          data: { revoked: true, membershipId, facilityId },
          aggregateType: 'MEMBERSHIP_FACILITY_GRANT',
          aggregateId: `${membershipId}-${facilityId}`,
          resourceVersion: 1,
        };
      },
    });
  }

  // -------------------------------------------------------------
  // Issue Reasons (Phase 2)
  // -------------------------------------------------------------
  async listIssueReasons(principal: Principal, category?: string) {
    const where: any = { workspaceId: principal.workspaceId };
    if (category) where.category = category;
    return await this.prisma.issueReason.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
  }

  async createIssueReason(
    principal: Principal,
    input: contracts.CreateIssueReasonInput,
    idempotencyKey: string
  ) {
    requireAnyPermission(principal, ['resource.manage', 'planning.write', 'workspace.admin', 'owner']);
    const validated = contracts.createIssueReasonSchema.parse(input);

    return executeCommand({
      principal,
      commandType: 'issue_reason.create',
      idempotencyKey,
      payload: validated,
      prismaClient: this.prisma,
      handler: async (tx) => {
        const existing = await tx.issueReason.findUnique({
          where: {
            workspaceId_category_code: {
              workspaceId: principal.workspaceId,
              category: validated.category,
              code: validated.code,
            },
          },
        });
        if (existing) {
          throw new ConflictError(
            `Issue reason with code '${validated.code}' already exists in category '${validated.category}'`
          );
        }

        const data = await tx.issueReason.create({
          data: {
            workspaceId: principal.workspaceId,
            category: validated.category,
            code: validated.code,
            label: validated.label,
            sortOrder: validated.sortOrder,
            isActive: true,
          },
        });

        return {
          data,
          aggregateType: 'ISSUE_REASON',
          aggregateId: data.id,
          resourceVersion: 1,
        };
      },
    });
  }

  async updateIssueReason(
    principal: Principal,
    id: string,
    input: contracts.UpdateIssueReasonInput,
    idempotencyKey: string
  ) {
    requireAnyPermission(principal, ['resource.manage', 'planning.write', 'workspace.admin', 'owner']);
    const validated = contracts.updateIssueReasonSchema.parse(input);

    return executeCommand({
      principal,
      commandType: 'issue_reason.update',
      idempotencyKey,
      payload: { id, ...validated },
      prismaClient: this.prisma,
      handler: async (tx) => {
        const current = await tx.issueReason.findFirst({
          where: { id, workspaceId: principal.workspaceId },
        });
        if (!current) {
          throw new NotFoundError(`Issue reason '${id}' not found`);
        }

        const data = await tx.issueReason.update({
          where: { id },
          data: {
            label: validated.label ?? current.label,
            isActive: validated.isActive !== undefined ? validated.isActive : current.isActive,
            sortOrder: validated.sortOrder !== undefined ? validated.sortOrder : current.sortOrder,
          },
        });

        return {
          data,
          aggregateType: 'ISSUE_REASON',
          aggregateId: data.id,
          resourceVersion: 1,
        };
      },
    });
  }

  async getReassessmentQueue(
    principal: Principal,
    query?: { daysAhead?: number; facilityId?: string; technicianId?: string }
  ): Promise<contracts.ReassessmentQueueItem[]> {
    requireAnyPermission(principal, ['resource.manage', 'planning.read', 'planning.write', 'admin.access', 'owner']);

    const daysAhead = query?.daysAhead ?? 30;
    const now = new Date();
    const threshold = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

    const queue: contracts.ReassessmentQueueItem[] = [];

    // 1. Fetch technician skills that are expiring, expired, or unverified/revoked
    const techSkills = await this.prisma.technicianSkill.findMany({
      where: {
        workspaceId: principal.workspaceId,
        ...(query?.technicianId ? { technicianId: query.technicianId } : {}),
        technician: {
          ...(query?.facilityId ? { facilityId: query.facilityId } : {}),
          isActive: true,
        },
      },
      include: {
        skill: true,
        technician: true,
      },
    });

    for (const ts of techSkills) {
      const isRevoked = ts.assessmentStatus === 'REVOKED';
      const isUnverified = ts.assessmentStatus === 'CLAIMED' || ts.assessmentStatus === 'OBSERVED';
      const hasExpiry = Boolean(ts.expiresAt);
      const isExpired = hasExpiry && ts.expiresAt! <= now;
      const isExpiringSoon = hasExpiry && !isExpired && ts.expiresAt! <= threshold;

      if (isRevoked || isUnverified || isExpired || isExpiringSoon) {
        let urgency: 'EXPIRED' | 'EXPIRING_SOON' | 'UNVERIFIED' | 'REVOKED' = 'EXPIRING_SOON';
        if (isRevoked) urgency = 'REVOKED';
        else if (isExpired) urgency = 'EXPIRED';
        else if (isExpiringSoon) urgency = 'EXPIRING_SOON';
        else if (isUnverified) urgency = 'UNVERIFIED';

        const daysUntilExpiry = ts.expiresAt
          ? Math.ceil((ts.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          : null;

        queue.push({
          id: ts.id,
          itemType: 'SKILL',
          technicianId: ts.technicianId,
          technicianCode: ts.technician.code,
          technicianName: ts.technician.name,
          facilityId: ts.technician.facilityId,
          referenceId: ts.skillId,
          name: ts.skill.name,
          code: ts.skill.code,
          level: ts.level,
          assessmentStatus: ts.assessmentStatus,
          validFrom: ts.validFrom?.toISOString() || null,
          expiresAt: ts.expiresAt?.toISOString() || null,
          isExpired,
          daysUntilExpiry,
          urgency,
          evidence: ts.evidence,
          notes: ts.notes,
          assessedAt: ts.assessedAt?.toISOString() || null,
          assessedBy: ts.assessedBy,
        });
      }
    }

    // 2. Fetch technician certifications that are expiring, expired, or REVOKED
    const techCerts = await this.prisma.technicianCertification.findMany({
      where: {
        workspaceId: principal.workspaceId,
        ...(query?.technicianId ? { technicianId: query.technicianId } : {}),
        technician: {
          ...(query?.facilityId ? { facilityId: query.facilityId } : {}),
          isActive: true,
        },
      },
      include: {
        certification: true,
        technician: true,
      },
    });

    const thresholdDateStr = threshold.toISOString().slice(0, 10);
    const nowDateStr = now.toISOString().slice(0, 10);

    for (const tc of techCerts) {
      const isRevoked = tc.status === 'REVOKED';
      const isExpired = tc.status === 'EXPIRED' || tc.validUntil < nowDateStr;
      const isExpiringSoon = !isExpired && tc.validUntil <= thresholdDateStr;

      if (isRevoked || isExpired || isExpiringSoon) {
        let urgency: 'EXPIRED' | 'EXPIRING_SOON' | 'UNVERIFIED' | 'REVOKED' = 'EXPIRING_SOON';
        if (isRevoked) urgency = 'REVOKED';
        else if (isExpired) urgency = 'EXPIRED';
        else if (isExpiringSoon) urgency = 'EXPIRING_SOON';

        const certExpDate = new Date(`${tc.validUntil}T23:59:59.999Z`);
        const daysUntilExpiry = Math.ceil((certExpDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        queue.push({
          id: tc.id,
          itemType: 'CERTIFICATION',
          technicianId: tc.technicianId,
          technicianCode: tc.technician.code,
          technicianName: tc.technician.name,
          facilityId: tc.technician.facilityId,
          referenceId: tc.certificationId,
          name: tc.certification.name,
          code: tc.certification.code,
          level: null,
          assessmentStatus: tc.status,
          validFrom: tc.issuedDate,
          expiresAt: tc.validUntil,
          isExpired,
          daysUntilExpiry,
          urgency,
          evidence: tc.evidence,
          notes: tc.notes,
          assessedAt: tc.createdAt?.toISOString() || null,
          assessedBy: null,
        });
      }
    }

    const urgencyOrder = { EXPIRED: 0, REVOKED: 1, EXPIRING_SOON: 2, UNVERIFIED: 3 };
    queue.sort((a, b) => {
      const diff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      if (diff !== 0) return diff;
      if (a.daysUntilExpiry !== null && b.daysUntilExpiry !== null) {
        return a.daysUntilExpiry - b.daysUntilExpiry;
      }
      return a.technicianName.localeCompare(b.technicianName);
    });

    return queue;
  }

  async requestOvertime(
    principal: Principal,
    input: contracts.RequestOvertimeInput,
    idempotencyKey: string
  ) {
    requireAnyPermission(principal, ['resource.manage', 'planning.write', 'task.assign', 'task.execute', 'admin.access', 'owner']);
    const validated = contracts.requestOvertimeSchema.parse(input);

    return executeCommand({
      principal,
      commandType: 'overtime.request',
      idempotencyKey,
      payload: validated,
      prismaClient: this.prisma,
      handler: async (tx) => {
        const startAt = new Date(validated.startAt);
        const endAt = new Date(validated.endAt);
        if (startAt >= endAt) {
          throw new BadRequestError(`Invalid interval: startAt (${validated.startAt}) must precede endAt (${validated.endAt})`);
        }

        if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime())) throw new BadRequestError('Overtime start and end must be valid dates');
        if (endAt.getTime() - startAt.getTime() > 24 * 60 * 60 * 1000) throw new BadRequestError('An overtime request cannot span more than 24 hours');

        const tech = await tx.technician.findFirst({
          where: { id: validated.technicianId, workspaceId: principal.workspaceId, isActive: true },
        });
        if (!tech) {
          throw new NotFoundError(`Technician '${validated.technicianId}' not found or inactive`);
        }
        const technicianMembership = await tx.membership.findFirst({ where: { workspaceId: principal.workspaceId, technicianId: tech.id, status: 'ACTIVE' }, select: { id: true, supervisorMembershipId: true } });
        if (!technicianMembership?.supervisorMembershipId) throw new BadRequestError(`Assign an active direct supervisor to ${tech.name} before requesting overtime`);
        const approver = await tx.membership.findFirst({ where: { id: technicianMembership.supervisorMembershipId, workspaceId: principal.workspaceId, status: 'ACTIVE' } });
        if (!approver) throw new BadRequestError('The technician’s direct supervisor is inactive or outside this workspace');
        const workspace = await tx.workspace.findUniqueOrThrow({ where: { id: principal.workspaceId }, select: { timezone: true, maxOvertimeMinutesPerDay: true, maxOvertimeMinutesPerWeek: true } });
        const existingOvertime = await tx.rosterInterval.findMany({ where: {
          workspaceId: principal.workspaceId, technicianId: tech.id, intervalType: 'OVERTIME', status: { in: ['DRAFT', 'PUBLISHED'] },
          startAt: { lt: new Date(endAt.getTime() + 7 * 86400000) }, endAt: { gt: new Date(startAt.getTime() - 7 * 86400000) },
        }, select: { startAt: true, endAt: true } });
        const totals = accumulateOvertimeMinutes([...existingOvertime, { startAt, endAt }], workspace.timezone);
        for (const [day, minutes] of totals.byDay) if (minutes > workspace.maxOvertimeMinutesPerDay) {
          throw new BadRequestError(`Overtime on ${day} exceeds the workspace daily limit of ${workspace.maxOvertimeMinutesPerDay / 60} hours`);
        }
        for (const [week, minutes] of totals.byWeek) if (minutes > workspace.maxOvertimeMinutesPerWeek) {
          throw new BadRequestError(`Overtime in the week of ${week} exceeds the workspace weekly limit of ${workspace.maxOvertimeMinutesPerWeek / 60} hours`);
        }

        // Create DRAFT overtime interval - unapproved overtime is NOT published and not available
        const record = await tx.rosterInterval.create({
          data: {
            workspaceId: principal.workspaceId,
            facilityId: validated.facilityId || tech.facilityId,
            technicianId: validated.technicianId,
            intervalType: 'OVERTIME',
            startAt,
            endAt,
            status: 'DRAFT',
            notes: `Reason: ${validated.reason}${validated.notes ? ` | ${validated.notes}` : ''}`,
            approverMembershipId: approver.id,
          },
        });

        return {
          data: record,
          aggregateType: 'ROSTER_INTERVAL',
          aggregateId: record.id,
          resourceVersion: record.version,
        };
      },
    });
  }

  async approveOvertime(
    principal: Principal,
    intervalId: string,
    idempotencyKey: string
  ) {
    requireAnyPermission(principal, ['resource.manage', 'planning.write', 'task.assign', 'workspace.admin', 'owner']);

    return executeCommand({
      principal,
      commandType: 'overtime.approve',
      idempotencyKey,
      payload: { intervalId },
      prismaClient: this.prisma,
      handler: async (tx) => {
        const interval = await tx.rosterInterval.findFirst({
          where: { id: intervalId, workspaceId: principal.workspaceId, approverMembershipId: principal.membershipId },
        });
        if (!interval) {
          throw new NotFoundError(`Roster interval '${intervalId}' not found`);
        }

        if (interval.intervalType !== 'OVERTIME') {
          throw new BadRequestError(`Cannot approve interval of type '${interval.intervalType}'. Must be 'OVERTIME'.`);
        }

        if (interval.status === 'PUBLISHED') {
          return {
            data: interval,
            aggregateType: 'ROSTER_INTERVAL',
            aggregateId: interval.id,
            resourceVersion: interval.version,
          };
        }

        if (interval.status === 'CANCELLED') {
          throw new BadRequestError(`Cannot approve CANCELLED overtime interval '${intervalId}'.`);
        }

        if (interval.status !== 'DRAFT') throw new BadRequestError(`Cannot approve overtime interval in status '${interval.status}'.`);

        const updated = await tx.rosterInterval.update({
          where: { id: intervalId },
          data: {
            status: 'PUBLISHED',
            version: { increment: 1 },
          },
        });

        return {
          data: updated,
          aggregateType: 'ROSTER_INTERVAL',
          aggregateId: updated.id,
          resourceVersion: updated.version,
        };
      },
    });
  }

}
export const mastersService = new MastersService();
