import { PrismaClient } from '@prisma/client';
import { hashPassword } from 'better-auth/crypto';
import { db as defaultDb } from '@/server/db/client';
import { BadRequestError, NotFoundError } from '@/domain/errors';
import { assertNotLastAccessAdmin } from './policy';

export interface ProvisionUserInput {
  name: string;
  email: string;
  password: string;
  workspaceId: string;
  roleCodes: string[];
  customerId?: string | null;
  technicianId?: string | null;
  grantedBy?: string;
}

export async function provisionUser(
  input: ProvisionUserInput,
  prismaClient?: PrismaClient
) {
  const client = prismaClient || defaultDb;
  const normalizedEmail = input.email.trim().toLowerCase();

  const workspace = await client.workspace.findUnique({
    where: { id: input.workspaceId },
  });
  if (!workspace) {
    throw new NotFoundError(`Workspace '${input.workspaceId}' not found`);
  }

  // Check if user exists or create
  let user = await client.user.findUnique({
    where: { email: normalizedEmail },
  });

  const hashedPassword = await hashPassword(input.password);

  if (!user) {
    user = await client.user.create({
      data: {
        name: input.name,
        email: normalizedEmail,
        emailVerified: true,
      },
    });

    await client.account.create({
      data: {
        userId: user.id,
        providerId: 'credential',
        accountId: user.id,
        password: hashedPassword,
      },
    });
  } else {
    // If account doesn't exist, create it
    const account = await client.account.findFirst({
      where: { userId: user.id, providerId: 'credential' },
    });
    if (!account) {
      await client.account.create({
        data: {
          userId: user.id,
          providerId: 'credential',
          accountId: user.id,
          password: hashedPassword,
        },
      });
    }
  }

  // Check existing membership
  let membership = await client.membership.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: user.id,
      },
    },
  });

  if (!membership) {
    membership = await client.membership.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        status: 'ACTIVE',
        customerId: input.customerId || null,
        technicianId: input.technicianId || null,
      },
    });
  } else {
    // Activate membership if it was disabled
    membership = await client.membership.update({
      where: { id: membership.id },
      data: {
        status: 'ACTIVE',
        customerId: input.customerId !== undefined ? input.customerId : membership.customerId,
        technicianId: input.technicianId !== undefined ? input.technicianId : membership.technicianId,
      },
    });
  }

  // Assign roles
  for (const roleCode of input.roleCodes) {
    const role = await client.role.findUnique({
      where: {
        workspaceId_code: {
          workspaceId: workspace.id,
          code: roleCode,
        },
      },
    });

    if (!role) {
      throw new BadRequestError(`Role '${roleCode}' does not exist in workspace`);
    }

    await client.membershipRole.upsert({
      where: {
        membershipId_roleId: {
          membershipId: membership.id,
          roleId: role.id,
        },
      },
      update: {},
      create: {
        workspaceId: workspace.id,
        membershipId: membership.id,
        roleId: role.id,
        grantedBy: input.grantedBy,
      },
    });
  }

  return {
    user,
    membership,
  };
}

export async function disableMembership(
  workspaceId: string,
  membershipId: string,
  prismaClient?: PrismaClient
) {
  const client = prismaClient || defaultDb;

  // Protect final access admin
  await assertNotLastAccessAdmin(client, workspaceId, membershipId);

  const membership = await client.membership.update({
    where: {
      id: membershipId,
    },
    data: {
      status: 'DISABLED',
    },
  });

  // Revoke all active sessions for this user
  await client.session.deleteMany({
    where: {
      userId: membership.userId,
    },
  });

  return membership;
}
