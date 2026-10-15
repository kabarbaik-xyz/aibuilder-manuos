import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { requirePermission } from '@/server/auth/permissions';
import { db } from '@/server/db/client';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse } from '@/server/http/route-handler';
import { AccessService } from '@/server/modules/access/service';

export async function GET(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    requirePermission(principal, 'access.manage');
    return jsonResponse({ data: await new AccessService(db).scopeOptions(principal) });
  } catch (error) { return formatErrorResponse(error); }
}
