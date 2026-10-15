import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { requirePermission } from '@/server/auth/permissions';
import { formatErrorResponse } from '@/server/http/errors';
import { db } from '@/server/db/client';
import { provisionUser } from '@/server/auth/provisioning';
import { z } from 'zod';

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  roleCodes: z.array(z.string()).min(1),
  customerId: z.string().nullable().optional(),
  technicianId: z.string().nullable().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    requirePermission(principal, 'access.manage');

    const memberships = await db.membership.findMany({
      where: { workspaceId: principal.workspaceId },
      include: {
        user: true,
        roles: {
          include: { role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const data = memberships.map((m) => ({
      id: m.id,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      status: m.status,
      customerId: m.customerId,
      technicianId: m.technicianId,
      roles: m.roles.map((r) => r.role.code),
      createdAt: m.createdAt.toISOString(),
    }));

    return NextResponse.json({ data });
  } catch (err) {
    return formatErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    requirePermission(principal, 'access.manage');

    const body = await req.json();
    const input = createUserSchema.parse(body);

    const result = await provisionUser({
      ...input,
      workspaceId: principal.workspaceId,
      grantedBy: principal.userId,
    });

    return NextResponse.json(
      {
        data: {
          userId: result.user.id,
          membershipId: result.membership.id,
          email: result.user.email,
          name: result.user.name,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    return formatErrorResponse(err);
  }
}
