import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { requirePermission } from '@/server/auth/permissions';
import { db } from '@/server/db/client';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse, parseJsonBody, parseIdempotencyKey } from '@/server/http/route-handler';
import { AccessService, UpdateRoleSchema } from '@/server/modules/access/service';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requirePrincipal(req);
    requirePermission(principal, 'access.manage');
    const { id } = await params;
    const body = await parseJsonBody(req, UpdateRoleSchema);
    return jsonResponse(await new AccessService(db).updateRole(principal, id, body, parseIdempotencyKey(req)));
  } catch (error) { return formatErrorResponse(error); }
}
