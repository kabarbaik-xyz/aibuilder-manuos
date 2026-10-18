import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { Principal } from '../src/server/auth/principal';
import { provisionUser } from '../src/server/auth/provisioning';
import { AccessService } from '../src/server/modules/access/service';

export interface DemoSeedAccount {
  code: string;
  name: string;
  email: string;
  roleCodes: string[];
  departmentId?: string | null;
  jobTitle?: string | null;
  landingPage?: string | null;
  customerId?: string | null;
  technicianId?: string | null;
}

export async function syncDemoAccessAccount(
  db: PrismaClient,
  access: AccessService,
  principal: Principal,
  account: DemoSeedAccount,
  options: { password: string; resetExistingPassword: boolean; idempotencyKey: string },
) {
  const email = account.email.trim().toLowerCase();
  let user = await db.user.findUnique({ where: { email } });
  if (!user) {
    return access.createUser(principal, {
      name: account.name,
      email,
      password: options.password,
      roleCodes: account.roleCodes,
      departmentId: account.departmentId ?? null,
      jobTitle: account.jobTitle ?? null,
      landingPage: account.landingPage ?? null,
      customerId: account.customerId ?? null,
      technicianId: account.technicianId ?? null,
      facilityId: principal.facilityId ?? null,
    }, options.idempotencyKey);
  }

  let membership = await db.membership.findUnique({
    where: { workspaceId_userId: { workspaceId: principal.workspaceId, userId: user.id } },
    include: { roles: { include: { role: { select: { code: true } } } } },
  });
  if (!membership || options.resetExistingPassword) {
    await provisionUser({
      name: account.name,
      email,
      password: options.password,
      workspaceId: principal.workspaceId,
      roleCodes: account.roleCodes,
      customerId: account.customerId,
      technicianId: account.technicianId,
      grantedBy: principal.userId,
    }, db);
    user = await db.user.findUniqueOrThrow({ where: { email } });
    membership = await db.membership.findUnique({
      where: { workspaceId_userId: { workspaceId: principal.workspaceId, userId: user.id } },
      include: { roles: { include: { role: { select: { code: true } } } } },
    });
    if (options.resetExistingPassword) {
      await db.session.deleteMany({ where: { userId: user.id } });
    }
  }
  if (!membership) throw new Error(`Could not provision demo account '${email}' in its workspace`);

  const actualRoles = membership.roles.map((grant) => grant.role.code).sort();
  const expectedRoles = [...account.roleCodes].sort();
  const needsAccessSync = membership.status !== 'ACTIVE'
    || JSON.stringify(actualRoles) !== JSON.stringify(expectedRoles)
    || membership.departmentId !== (account.departmentId ?? null)
    || membership.jobTitle !== (account.jobTitle ?? null)
    || membership.landingPage !== (account.landingPage ?? null)
    || membership.customerId !== (account.customerId ?? null)
    || membership.technicianId !== (account.technicianId ?? null)
    || (membership.facilityId == null && principal.facilityId != null);

  if (needsAccessSync) {
    const keySuffix = createHash('sha256').update(`${email}:${membership.version}`).digest('hex').slice(0, 16);
    await access.updateMembership(principal, membership.id, {
      roleCodes: account.roleCodes,
      status: 'ACTIVE',
      expectedVersion: membership.version,
      departmentId: account.departmentId ?? null,
      jobTitle: account.jobTitle ?? null,
      landingPage: account.landingPage ?? null,
      customerId: account.customerId ?? null,
      technicianId: account.technicianId ?? null,
      facilityId: membership.facilityId ?? principal.facilityId ?? null,
    }, `${options.idempotencyKey}:${keySuffix}`);
  }

  return { data: { membershipId: membership.id, userId: user.id, name: user.name, email: user.email } };
}
