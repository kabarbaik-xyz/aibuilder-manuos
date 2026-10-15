import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { requirePermission } from '@/server/auth/permissions';
import { db } from '@/server/db/client';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse, parseJsonBody, parseIdempotencyKey } from '@/server/http/route-handler';
import { NotFoundError } from '@/domain/errors';
import { AccessService, UpdateMembershipSchema } from '@/server/modules/access/service';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requirePrincipal(req);
    requirePermission(principal, 'access.manage');
    const { id } = await params;
    const body = await parseJsonBody(req, UpdateMembershipSchema);
    return jsonResponse(await new AccessService(db).updateMembership(principal, id, body, parseIdempotencyKey(req)));
  } catch (error) { return formatErrorResponse(error); }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requirePrincipal(req);
    requirePermission(principal, 'access.manage');
    const { id } = await params;
    const membership = (await new AccessService(db).listUsers(principal, id))[0];
    if (!membership) throw new NotFoundError('Workspace membership not found');
    return jsonResponse({ data: membership });
  } catch (error) { return formatErrorResponse(error); }
}
