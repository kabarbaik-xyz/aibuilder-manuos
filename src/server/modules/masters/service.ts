import { PrismaClient } from '@prisma/client';
import { db as defaultDb } from '@/server/db/client';
import { Principal } from '@/server/auth/principal';
import { requirePermission } from '@/server/auth/permissions';
import { ConflictError, NotFoundError, BadRequestError } from '@/domain/errors';
import { executeCommand } from '@/server/db/transaction';
import * as contracts from './contracts';

export class MastersService {
  constructor(private readonly prisma: PrismaClient = defaultDb) {}

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
      where: { workspaceId: principal.workspaceId },
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

        if (input.level > skill.scaleMax) {
          throw new BadRequestError(`Skill level cannot exceed scale max of ${skill.scaleMax}`);
        }

        const ts = await tx.technicianSkill.upsert({
          where: {
            technicianId_skillId: {
              technicianId,
              skillId: input.skillId,
            },
          },
          update: {
            level: input.level,
            assessedAt: new Date(),
            assessedBy: principal.userId,
          },
          create: {
            workspaceId: principal.workspaceId,
            technicianId,
            skillId: input.skillId,
            level: input.level,
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
          where: { id: input.certificationId, workspaceId: principal.workspaceId },
        });
        if (!cert) throw new NotFoundError(`Certification '${input.certificationId}' not found`);

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
          },
          create: {
            workspaceId: principal.workspaceId,
            technicianId,
            certificationId: input.certificationId,
            certificateNumber: input.certificateNumber,
            issuedDate: input.issuedDate,
            validUntil: input.validUntil,
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

  async listSkills(principal: Principal) {
    return this.prisma.skill.findMany({
      where: { workspaceId: principal.workspaceId },
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

        const skill = await tx.skill.create({
          data: { workspaceId: principal.workspaceId, ...input },
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
      where: { workspaceId: principal.workspaceId },
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
        const existing = await tx.qcChecklist.findUnique({
          where: {
            workspaceId_code_revision: {
              workspaceId: principal.workspaceId,
              code: input.code,
              revision: input.revision,
            },
          },
        });
        if (existing) throw new ConflictError(`Checklist '${input.code}' rev ${input.revision} exists`, 'DUPLICATE_CODE');

        const checklist = await tx.qcChecklist.create({
          data: {
            workspaceId: principal.workspaceId,
            code: input.code,
            name: input.name,
            revision: input.revision,
            checks: {
              create: (input.checks || []).map((c: any) => ({
                code: c.code,
                description: c.description,
                method: c.method,
                unit: c.unit || null,
                limitsJson: c.limitsJson,
                isRequired: c.isRequired,
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
}

export const mastersService = new MastersService();
