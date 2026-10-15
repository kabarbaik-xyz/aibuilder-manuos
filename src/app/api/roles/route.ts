import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { db } from '@/server/db/client';

export async function GET(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);

    const roles = await db.role.findMany({
      where: { workspaceId: principal.workspaceId, isActive: true },
      include: {
        permissions: true,
      },
      orderBy: { code: 'asc' },
    });

    const data = roles.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      isSystem: r.isSystem,
      permissions: r.permissions.map((p) => p.permissionCode),
    }));

    return NextResponse.json({ data });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
