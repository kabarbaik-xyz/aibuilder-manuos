import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { db as defaultDb } from '@/server/db/client';
import { PrismaClient } from '@prisma/client';
import { Principal } from './principal';
import { ForbiddenError, UnauthorizedError } from '@/domain/errors';

export function createBetterAuth(client: PrismaClient = defaultDb) {
  return betterAuth({
    database: prismaAdapter(client, {
      provider: 'sqlite',
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true, // Public signup disabled per specification
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // 1 day
    },
    trustedOrigins: [
      process.env.BETTER_AUTH_URL || 'http://localhost:3000',
      'http://localhost:8080',
    ],
    baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
    secret:
      process.env.BETTER_AUTH_SECRET ||
      'development-secret-minimum-32-chars-long-placeholder',
  });
}

export const auth = createBetterAuth(defaultDb);

export function extractSessionToken(headers: Headers): string | null {
  const authHeader = headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }

  const cookieHeader = headers.get('cookie');
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').map((c) => c.trim());
    for (const cookie of cookies) {
      if (
        cookie.startsWith('better-auth.session_token=') ||
        cookie.startsWith('__Secure-better-auth.session_token=')
      ) {
        const raw = cookie.includes('=') ? cookie.split('=')[1] : '';
        // Better Auth signed tokens are of the format token.signature
        const token = raw.split('.')[0];
        return decodeURIComponent(token);
      }
    }
  }

  return null;
}

export async function resolvePrincipal(
  headers: Headers,
  workspaceCodeOrId?: string,
  prismaClient?: PrismaClient
): Promise<Principal> {
  const client = prismaClient || defaultDb;

  // 1. Extract session token from cookie or Authorization header
  const token = extractSessionToken(headers);
  if (!token) {
    throw new UnauthorizedError('Valid authentication session required');
  }

  // 2. Resolve session directly from database
  const session = await client.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session) {
    throw new UnauthorizedError('Valid authentication session required');
  }

  // 3. Validate expiration and banned status
  if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
    throw new UnauthorizedError('Session has expired. Please sign in again.');
  }

  if (session.user.banned) {
    throw new UnauthorizedError('User account has been disabled or suspended');
  }

  const user = session.user;

  // 4. Determine workspace scope
  const requestedWorkspace =
    workspaceCodeOrId ||
    headers.get('x-workspace-id') ||
    headers.get('x-workspace-code');

  let workspace;
  if (requestedWorkspace) {
    workspace = await client.workspace.findFirst({
      where: {
        OR: [{ id: requestedWorkspace }, { code: requestedWorkspace }],
      },
    });
  } else {
    // Default to the user's first active workspace
    const userMembership = await client.membership.findFirst({
      where: { userId: user.id, status: 'ACTIVE' },
      include: { workspace: true },
    });
    workspace = userMembership?.workspace;
  }

  if (!workspace) {
    throw new ForbiddenError('No authorized workspace found for user');
  }

  // 5. Find membership
  const membership = await client.membership.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: user.id,
      },
    },
    include: {
      facilityGrants: true,
      roles: {
        include: {
          role: {
            include: {
              permissions: true,
            },
          },
        },
      },
    },
  });

  if (!membership || membership.status !== 'ACTIVE') {
    throw new ForbiddenError(
      `User does not hold an active membership in workspace '${workspace.code}'`
    );
  }

  // 6. Aggregate active permissions and role codes
  const permissions = new Set<string>();
  const roleCodes: string[] = [];

  for (const mr of membership.roles) {
    if (!mr.role.isActive) continue;
    roleCodes.push(mr.role.code);
    for (const rp of mr.role.permissions) {
      permissions.add(rp.permissionCode);
    }
  }

  const grantedFacilityIds = new Set<string>();
  if (membership.facilityId) {
    grantedFacilityIds.add(membership.facilityId);
  }
  if (membership.facilityGrants) {
    for (const g of membership.facilityGrants) {
      grantedFacilityIds.add(g.facilityId);
    }
  }

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    membershipId: membership.id,
    permissions,
    roles: roleCodes,
    customerId: membership.customerId,
    technicianId: membership.technicianId,
    facilityId: membership.facilityId,
    facilityIds: Array.from(grantedFacilityIds),
  };
}

export async function requirePrincipal(
  req: Request | Headers,
  workspaceCodeOrId?: string,
  prismaClient?: PrismaClient
): Promise<Principal> {
  const headers = req instanceof Request ? req.headers : req;
  return resolvePrincipal(headers, workspaceCodeOrId, prismaClient);
}
