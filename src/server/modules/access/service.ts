import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { availablePages } from '@/lib/persona-navigation';
import { hashPassword } from 'better-auth/crypto';
import { Principal } from '@/server/auth/principal';
import { requirePermission } from '@/server/auth/permissions';
import { executeCommand } from '@/server/db/transaction';
import { ensureDefaultFacility } from '@/server/db/default-facility';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '@/domain/errors';

const grants = z.array(z.string().trim().min(1)).min(1).max(200).transform(values => [...new Set(values)]);
const scope = {
  roleCodes: grants,
  facilityId: z.string().min(1).nullable().optional(),
  departmentId: z.string().min(1).nullable().optional(),
  landingPage: z.string().min(1).nullable().optional(),
  newTechnician: z.object({ code: z.string().trim().min(1).max(50), calendarId: z.string().min(1).nullable().optional() }).strict().optional(),
  customerId: z.string().min(1).nullable().default(null),
  technicianId: z.string().min(1).nullable().default(null),
};
export const CreateAccessUserSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().transform(value => value.toLowerCase()),
  password: z.string().min(12).max(128),
  ...scope,
}).strict();
export const UpdateMembershipSchema = z.object({
  ...scope,
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email().transform(value => value.toLowerCase()).optional(),
  expectedIdentityUpdatedAt: z.string().datetime().optional(),
  status: z.enum(['ACTIVE', 'DISABLED']),
  expectedVersion: z.number().int().positive(),
}).strict().refine(input => (input.name === undefined && input.email === undefined) || Boolean(input.expectedIdentityUpdatedAt), {
  path: ['expectedIdentityUpdatedAt'], message: 'Identity version is required when editing account details',
});
export const CreateRoleSchema = z.object({
  code: z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,49}$/),
  name: z.string().trim().min(1).max(100),
  permissions: grants,
}).strict();
export const UpdateRoleSchema = CreateRoleSchema.omit({ code: true }).extend({
  isActive: z.boolean(), expectedVersion: z.number().int().positive(),
}).strict();

type Tx = Prisma.TransactionClient;

export class AccessService {
  constructor(private readonly db: PrismaClient) {}

  // Check live grants inside the command transaction as well as at the HTTP boundary.
  private async authorize(tx: Tx, principal: Principal) {
    requirePermission(principal, 'access.manage');
    const membership = await tx.membership.findFirst({
      where: { id: principal.membershipId, userId: principal.userId, workspaceId: principal.workspaceId, status: 'ACTIVE',
        roles: { some: { role: { isActive: true, permissions: { some: { permissionCode: 'access.manage' } } } } } },
    });
    if (!membership) throw new ForbiddenError('Your access administration grant is no longer active');
  }

  async listUsers(principal: Principal, id?: string) {
    await this.authorize(this.db, principal);
    const manageableWorkspaces = await this.identityWorkspaces(this.db, principal);
    const memberships = await this.db.membership.findMany({
      where: { workspaceId: principal.workspaceId, id },
      include: { user: { select: { id: true, name: true, email: true, updatedAt: true, memberships: { select: { workspaceId: true } } } }, roles: { include: { role: true } }, department: true },
      orderBy: { createdAt: 'desc' },
    });
    return memberships.map(m => ({ id: m.id, userId: m.userId, name: m.user.name, email: m.user.email,
      identityUpdatedAt: m.user.updatedAt.toISOString(), canEditIdentity: m.user.memberships.every(link => manageableWorkspaces.has(link.workspaceId)),
      facilityId: m.facilityId, departmentId: m.departmentId, department: m.department, landingPage: m.landingPage, status: m.status, customerId: m.customerId, technicianId: m.technicianId, version: m.version,
      roles: m.roles.map(grant => grant.role.code), createdAt: m.createdAt.toISOString() }));
  }

  private async identityWorkspaces(tx: Tx, principal: Principal) {
    const memberships = await tx.membership.findMany({ where: { userId: principal.userId, status: 'ACTIVE',
      roles: { some: { role: { isActive: true, permissions: { some: { permissionCode: 'access.manage' } } } } } }, select: { workspaceId: true } });
    return new Set(memberships.map(link => link.workspaceId));
  }

  async listRoles(principal: Principal) {
    await this.authorize(this.db, principal);
    const roles = await this.db.role.findMany({ where: { workspaceId: principal.workspaceId },
      include: { permissions: true, _count: { select: { memberships: true } } }, orderBy: { code: 'asc' } });
    return roles.map(role => ({ id: role.id, code: role.code, name: role.name, isSystem: role.isSystem,
      isActive: role.isActive, version: role.version, memberCount: role._count.memberships,
      permissions: role.permissions.map(p => p.permissionCode).sort() }));
  }

  async listPermissions(principal: Principal) {
    await this.authorize(this.db, principal);
    return this.db.permission.findMany({ select: { code: true, description: true, resource: true, action: true },
      orderBy: [{ resource: 'asc' }, { code: 'asc' }] });
  }

  async scopeOptions(principal: Principal) {
    await this.authorize(this.db, principal);
    const [customers, technicians, departments, calendars, facilities] = await Promise.all([
      this.db.customer.findMany({ where: { workspaceId: principal.workspaceId }, select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } }),
      this.db.technician.findMany({ where: { workspaceId: principal.workspaceId, isActive: true, archivedAt: null, OR: [{ facilityId: null }, { facilityId: { in: principal.facilityIds ?? [] } }] }, select: { id: true, code: true, name: true, membershipId: true }, orderBy: { name: 'asc' } }),
      this.db.department.findMany({ where: { workspaceId: principal.workspaceId, isActive: true, archivedAt: null }, select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } }),
      this.db.workCalendar.findMany({ where: { workspaceId: principal.workspaceId }, select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } }),
      this.db.facility.findMany({ where: { workspaceId: principal.workspaceId, id: { in: principal.facilityIds ?? [] }, status: 'ACTIVE' }, select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } }),
    ]);
    return { customers, technicians, departments, calendars, facilities };
  }

  private async resolveScope(tx: Tx, workspaceId: string, input: z.infer<typeof UpdateMembershipSchema> | z.infer<typeof CreateAccessUserSchema>, existingCodes: string[] = [], membershipId?: string) {
    const roles = await tx.role.findMany({ where: { workspaceId, code: { in: input.roleCodes } } });
    if (roles.length !== input.roleCodes.length || roles.some(r => !r.isActive && !existingCodes.includes(r.code))) {
      throw new BadRequestError('Choose valid active roles in this workspace');
    }
    if (input.newTechnician && (input.technicianId || !input.roleCodes.includes('TECHNICIAN') || input.customerId)) throw new BadRequestError('Create a new technician only for an unlinked Technician account');
    if (input.departmentId && !await tx.department.findFirst({ where: { id: input.departmentId, workspaceId, isActive: true, archivedAt: null } })) throw new BadRequestError('Choose an active department in this workspace');
    if (input.newTechnician?.calendarId && !await tx.workCalendar.findFirst({ where: { id: input.newTechnician.calendarId, workspaceId, archivedAt: null } })) throw new BadRequestError('Calendar does not belong to this workspace');
    const activeRoles = roles.filter(role => role.isActive);
    const rolePermissions = await tx.rolePermission.findMany({ where: { workspaceId, roleId: { in: activeRoles.map(role => role.id) } } });
    if (input.landingPage && !availablePages(rolePermissions.map(p => p.permissionCode), activeRoles.map(role => role.code), input.customerId).some(page => page.href === input.landingPage)) throw new BadRequestError('Starting page must be available to the selected active roles');
    if (input.customerId && !await tx.customer.findFirst({ where: { id: input.customerId, workspaceId } })) throw new BadRequestError('Customer does not belong to this workspace');
    if (input.technicianId && !await tx.technician.findFirst({ where: { id: input.technicianId, workspaceId } })) throw new BadRequestError('Technician does not belong to this workspace');
    if (input.roleCodes.includes('CUSTOMER') && !input.customerId) throw new BadRequestError('Customer role requires a linked customer');
    if (input.roleCodes.includes('TECHNICIAN') && !input.technicianId && !input.newTechnician) throw new BadRequestError('Technician role requires a linked technician');
    if (input.technicianId) {
      const technician = await tx.technician.findFirst({ where: { id: input.technicianId, workspaceId, isActive: true, archivedAt: null } });
      if (!technician) throw new BadRequestError('Choose an active technician');
      const linked = await tx.membership.findFirst({ where: { workspaceId, technicianId: input.technicianId, ...(membershipId ? { id: { not: membershipId } } : {}) } });
      if (linked || (technician?.membershipId && technician.membershipId !== membershipId)) throw new BadRequestError('Technician is already linked to another membership');
    }
    if (input.customerId && input.technicianId) throw new BadRequestError('Choose either customer scope or technician scope');
    // A scoped membership must not inherit unrestricted internal read permissions.
    if (input.customerId && input.roleCodes.some(code => code !== 'CUSTOMER')) {
      throw new BadRequestError('Customer-scoped memberships may only use the CUSTOMER role');
    }
    return roles;
  }

  private async validateFacility(tx: Tx, principal: Principal, facilityId?: string | null) {
    if (!facilityId) return;
    if (!principal.facilityIds?.includes(facilityId) || !await tx.facility.findFirst({ where: { id: facilityId, workspaceId: principal.workspaceId, status: 'ACTIVE' } })) throw new ForbiddenError('Choose an active facility within your granted scope');
  }

  private async createOnboardingTechnician(tx: Tx, principal: Principal, input: z.infer<typeof CreateAccessUserSchema> | z.infer<typeof UpdateMembershipSchema>, name: string) {
    if (!input.newTechnician) {
      if (input.technicianId) { const existing = await tx.technician.findFirst({ where: { id: input.technicianId, workspaceId: principal.workspaceId } });
        await this.validateFacility(tx, principal, existing?.facilityId);
        if (input.facilityId && existing?.facilityId && input.facilityId !== existing.facilityId) throw new BadRequestError('Primary facility must match the linked technician facility');
      }
      return input.technicianId;
    }
    if (await tx.technician.findFirst({ where: { workspaceId: principal.workspaceId, code: input.newTechnician.code } })) throw new ConflictError('Technician code already exists');
    const facility = await ensureDefaultFacility(tx, principal.workspaceId);
    const facilityId = input.facilityId ?? principal.facilityId ?? facility.id;
    await this.validateFacility(tx, principal, facilityId);
    const technician = await tx.technician.create({ data: { workspaceId: principal.workspaceId, code: input.newTechnician.code, name, departmentId: input.departmentId ?? null, calendarId: input.newTechnician.calendarId ?? null, facilityId } });
    return technician.id;
  }

  async createUser(principal: Principal, raw: unknown, key: string) {
    requirePermission(principal, 'access.manage');
    const input = CreateAccessUserSchema.parse(raw);
    return executeCommand({ principal, commandType: 'access.user.create', idempotencyKey: key, payload: input, prismaClient: this.db,
      handler: async (tx: Tx) => {
        await this.authorize(tx, principal);
        await this.validateFacility(tx, principal, input.facilityId);
        const roles = await this.resolveScope(tx, principal.workspaceId, input);
        if (await tx.user.findUnique({ where: { email: input.email } })) throw new ConflictError('An account with this email already exists. Existing account credentials cannot be changed here.');
        const technicianId = await this.createOnboardingTechnician(tx, principal, input, input.name);
        const user = await tx.user.create({ data: { name: input.name, email: input.email } });
        await tx.account.create({ data: { userId: user.id, providerId: 'credential', accountId: user.id, password: await hashPassword(input.password) } });
        const membership = await tx.membership.create({ data: { workspaceId: principal.workspaceId, userId: user.id,
          departmentId: input.departmentId ?? null, landingPage: input.landingPage ?? null, customerId: input.customerId, technicianId, facilityId: input.facilityId ?? (technicianId ? (await tx.technician.findUnique({ where: { id: technicianId } }))?.facilityId : null) ?? principal.facilityId ?? (await ensureDefaultFacility(tx, principal.workspaceId)).id } });
        for (const role of roles) await tx.membershipRole.create({ data: { workspaceId: principal.workspaceId, membershipId: membership.id, roleId: role.id, grantedBy: principal.userId } });
        if (technicianId) await tx.technician.update({ where: { id: technicianId }, data: { membershipId: membership.id } });
        return { data: { membershipId: membership.id, userId: user.id, name: user.name, email: user.email }, aggregateType: 'MEMBERSHIP', aggregateId: membership.id,
          resourceVersion: membership.version, auditDetails: { roleCodes: input.roleCodes, technicianId, departmentId: input.departmentId, landingPage: input.landingPage } };
      } });
  }

  async updateMembership(principal: Principal, id: string, raw: unknown, key: string) {
    requirePermission(principal, 'access.manage');
    const input = UpdateMembershipSchema.parse(raw);
    return executeCommand({ principal, commandType: 'access.membership.update', idempotencyKey: key, payload: { id, ...input },
      expectedVersion: input.expectedVersion, prismaClient: this.db, handler: async (tx: Tx) => {
        await this.authorize(tx, principal);
        const membership = await tx.membership.findFirst({ where: { id, workspaceId: principal.workspaceId }, include: { roles: { include: { role: true } } } });
        if (!membership) throw new NotFoundError('Workspace membership not found');
        const user = await tx.user.findUniqueOrThrow({ where: { id: membership.userId }, include: { memberships: { select: { workspaceId: true } } } });
        const name = input.name ?? user.name;
        const email = input.email ?? user.email;
        const identityChanged = name !== user.name || email !== user.email;
        const emailChanged = email !== user.email;
        if (identityChanged) {
          const manageableWorkspaces = await this.identityWorkspaces(tx, principal);
          if (!user.memberships.every(link => manageableWorkspaces.has(link.workspaceId))) throw new ForbiddenError('Editing this shared account requires access administration in every linked workspace');
          if (input.expectedIdentityUpdatedAt !== user.updatedAt.toISOString()) throw new ConflictError('Account details changed. Reload the user before editing again.', 'STALE_VERSION');
          if (await tx.user.findFirst({ where: { email, id: { not: user.id } } })) throw new ConflictError('This email is already used by another account');
          await tx.user.update({ where: { id: user.id }, data: { name, email, ...(emailChanged ? { emailVerified: false } : {}) } });
          if (emailChanged) {
            // Credential identifiers remain pinned to user.id when the login email changes.
            await tx.session.deleteMany({ where: { userId: user.id } });
          }
        }
        await this.validateFacility(tx, principal, input.facilityId);
        const roles = await this.resolveScope(tx, principal.workspaceId, input, membership.roles.map((r: { role: { code: string } }) => r.role.code), id);
        if (membership.status === 'ACTIVE' && membership.roles.some((r: { role: { code: string; isActive: boolean } }) => r.role.code === 'ACCESS_ADMIN' && r.role.isActive)
          && (input.status !== 'ACTIVE' || !input.roleCodes.includes('ACCESS_ADMIN'))) {
          const remaining = await tx.membershipRole.count({ where: { workspaceId: principal.workspaceId,
            role: { code: 'ACCESS_ADMIN', isActive: true }, membership: { id: { not: id }, status: 'ACTIVE' } } });
          if (!remaining) throw new ForbiddenError('At least one active ACCESS_ADMIN must remain in the workspace');
        }
        const technicianId = await this.createOnboardingTechnician(tx, principal, { ...input, facilityId: input.facilityId ?? membership.facilityId }, name);
        await tx.membershipRole.deleteMany({ where: { workspaceId: principal.workspaceId, membershipId: id } });
        await tx.technician.updateMany({ where: { workspaceId: principal.workspaceId, membershipId: id }, data: { membershipId: null } });
        if (technicianId) await tx.technician.update({ where: { id: technicianId }, data: { membershipId: id } });
        await tx.membership.update({ where: { id }, data: { status: input.status, customerId: input.customerId, technicianId, departmentId: input.departmentId, landingPage: input.landingPage, facilityId: input.facilityId,
          version: { increment: 1 } } });
        for (const role of roles) await tx.membershipRole.create({ data: { workspaceId: principal.workspaceId, membershipId: id, roleId: role.id, grantedBy: principal.userId } });
        return { data: { id, status: input.status, name, email, reauthenticate: emailChanged && user.id === principal.userId }, aggregateType: 'MEMBERSHIP', aggregateId: id,
          resourceVersion: membership.version + 1, previousVersion: membership.version,
          auditDetails: { status: input.status, roleCodes: input.roleCodes, customerId: input.customerId, technicianId: input.technicianId,
            ...(identityChanged ? { identityBefore: { name: user.name, email: user.email }, identityAfter: { name, email } } : {}) } };
      } });
  }

  private async validatePermissions(tx: Tx, codes: string[]) {
    if (await tx.permission.count({ where: { code: { in: codes } } }) !== codes.length) throw new BadRequestError('Unknown permission code');
  }

  async createRole(principal: Principal, raw: unknown, key: string) {
    requirePermission(principal, 'access.manage');
    const input = CreateRoleSchema.parse(raw);
    return executeCommand({ principal, commandType: 'access.role.create', idempotencyKey: key, payload: input, prismaClient: this.db,
      handler: async (tx: Tx) => {
        await this.authorize(tx, principal);
        await this.validatePermissions(tx, input.permissions);
        if (await tx.role.findFirst({ where: { workspaceId: principal.workspaceId, code: input.code } })) throw new ConflictError('Role code already exists');
        const role = await tx.role.create({ data: { workspaceId: principal.workspaceId, code: input.code, name: input.name } });
        for (const permissionCode of input.permissions) await tx.rolePermission.create({ data: { workspaceId: principal.workspaceId, roleId: role.id, permissionCode } });
        return { data: { id: role.id }, aggregateType: 'ROLE', aggregateId: role.id, resourceVersion: role.version,
          auditDetails: { code: input.code, permissions: input.permissions } };
      } });
  }

  async updateRole(principal: Principal, id: string, raw: unknown, key: string) {
    requirePermission(principal, 'access.manage');
    const input = UpdateRoleSchema.parse(raw);
    return executeCommand({ principal, commandType: 'access.role.update', idempotencyKey: key, payload: { id, ...input },
      expectedVersion: input.expectedVersion, prismaClient: this.db, handler: async (tx: Tx) => {
        await this.authorize(tx, principal);
        const role = await tx.role.findFirst({ where: { id, workspaceId: principal.workspaceId } });
        if (!role) throw new NotFoundError('Workspace role not found');
        if (role.isSystem) throw new ForbiddenError('System role definitions are protected. Create a custom role to change grants.');
        await this.validatePermissions(tx, input.permissions);
        await tx.rolePermission.deleteMany({ where: { workspaceId: principal.workspaceId, roleId: id } });
        await tx.role.update({ where: { id }, data: { name: input.name, isActive: input.isActive, version: { increment: 1 } } });
        for (const permissionCode of input.permissions) await tx.rolePermission.create({ data: { workspaceId: principal.workspaceId, roleId: id, permissionCode } });
        return { data: { id }, aggregateType: 'ROLE', aggregateId: id, previousVersion: role.version, resourceVersion: role.version + 1,
          auditDetails: { permissions: input.permissions, isActive: input.isActive } };
      } });
  }
}
