import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { requirePermission } from '@/server/auth/permissions';
import { db } from '@/server/db/client';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse, parseJsonBody, parseIdempotencyKey } from '@/server/http/route-handler';
import { AccessService, CreateRoleSchema } from '@/server/modules/access/service';

export async function GET(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    requirePermission(principal, 'access.manage');
    return jsonResponse({ data: await new AccessService(db).listRoles(principal) });
  } catch (error) { return formatErrorResponse(error); }
}

export async function POST(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    requirePermission(principal, 'access.manage');
    const body = await parseJsonBody(req, CreateRoleSchema);
    return jsonResponse(await new AccessService(db).createRole(principal, body, parseIdempotencyKey(req)), { status: 201 });
  } catch (error) { return formatErrorResponse(error); }
}
