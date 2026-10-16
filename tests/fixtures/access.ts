import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { hashPassword } from 'better-auth/crypto';
import { Principal } from '@/server/auth/principal';
import { seedPermissionsAndRoles } from '../../prisma/seed';

export interface SeedTestAccessOptions {
  workspaceCode?: string;
  workspaceName?: string;
  email?: string;
  name?: string;
  password?: string;
  roles?: string[];
  customerId?: string | null;
  technicianId?: string | null;
  status?: 'ACTIVE' | 'DISABLED';
  banned?: boolean;
}

export interface TestAccessResult {
  principal: Principal;
  userId: string;
  workspaceId: string;
  membershipId: string;
  sessionToken: string;
  cookie: string;
  headers: Headers;
}

export async function seedTestAccess(
  db: PrismaClient,
  options: SeedTestAccessOptions = {}
): Promise<TestAccessResult> {
  const wsCode = options.workspaceCode || `WS-${randomUUID().slice(0, 8).toUpperCase()}`;
  const email = options.email || `user-${randomUUID().slice(0, 8)}@example.test`;
  const name = options.name || 'Test User';
  const password = options.password || 'password123';
  const roleCodes = options.roles || ['OWNER'];
  const status = options.status || 'ACTIVE';
  const banned = options.banned || false;

  // 1. Workspace
  const workspace = await db.workspace.upsert({
    where: { code: wsCode },
    update: {},
    create: {
      code: wsCode,
      name: options.workspaceName || `${wsCode} Facility`,
      timezone: 'Asia/Jakarta',
      currency: 'IDR',
    },
  });

  // 2. Ensure permissions and roles exist
  await seedPermissionsAndRoles(db, workspace.id);

  // 3. User & Credential Account
  const hashedPassword = await hashPassword(password);
  const user = await db.user.create({
    data: {
      name,
      email,
      emailVerified: true,
      banned,
      accounts: {
        create: {
          providerId: 'credential',
          accountId: email,
          password: hashedPassword,
        },
      },
    },
  });

  // 4. If customerId is provided, ensure customer master exists for this workspace
  let customerId = options.customerId || null;
  if (customerId) {
    const existingCust = await db.customer.findUnique({
      where: { id: customerId },
    });
    if (!existingCust) {
      const cust = await db.customer.create({
        data: {
          id: customerId,
          workspaceId: workspace.id,
          code: `CUST-${customerId}`,
          name: `Customer ${customerId}`,
        },
      });
      customerId = cust.id;
    }
  }

  // Use the same default-facility ownership that the upgrade migration assigns.
  const facility = await db.facility.upsert({
    where: { workspaceId_code: { workspaceId: workspace.id, code: 'FAC-DEFAULT' } },
    update: {},
    create: { workspaceId: workspace.id, code: 'FAC-DEFAULT', name: 'Default Operating Site', isDefault: true },
  });

  // 5. Membership
  const membership = await db.membership.create({
    data: {
      workspaceId: workspace.id,
      userId: user.id,
      status,
      customerId,
      technicianId: options.technicianId || null,
      facilityId: facility.id,
    },
  });

  // 5. Assign roles
  const permissions = new Set<string>();
  for (const roleCode of roleCodes) {
    const role = await db.role.findUnique({
      where: {
        workspaceId_code: {
          workspaceId: workspace.id,
          code: roleCode,
        },
      },
      include: { permissions: true },
    });

    if (role) {
      await db.membershipRole.create({
        data: {
          workspaceId: workspace.id,
          membershipId: membership.id,
          roleId: role.id,
        },
      });

      for (const p of role.permissions) {
        permissions.add(p.permissionCode);
      }
    }
  }

  // 6. Create valid session in database
  const sessionToken = randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await db.session.create({
    data: {
      userId: user.id,
      token: sessionToken,
      expiresAt,
    },
  });

  const cookie = `better-auth.session_token=${sessionToken}`;
  const headers = new Headers();
  headers.set('cookie', cookie);
  headers.set('x-workspace-id', workspace.id);

  const principal: Principal = {
    userId: user.id,
    email: user.email,
    name: user.name,
    workspaceId: workspace.id,
    membershipId: membership.id,
    permissions,
    roles: roleCodes,
    customerId: membership.customerId,
    technicianId: membership.technicianId,
    facilityId: membership.facilityId,
    facilityIds: membership.facilityId ? [membership.facilityId] : [],
  };

  return {
    principal,
    userId: user.id,
    workspaceId: workspace.id,
    membershipId: membership.id,
    sessionToken,
    cookie,
    headers,
  };
}
