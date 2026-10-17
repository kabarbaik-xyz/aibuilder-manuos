import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse } from '@/server/http/route-handler';
import { listLifecycleDepartmentMembers } from '@/server/modules/order-lifecycle/queries';
import { db } from '@/server/db/client';
import { BadRequestError } from '@/domain/errors';

export async function GET(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const departmentId = req.nextUrl.searchParams.get('departmentId') ?? '';
    if (!departmentId) throw new BadRequestError('departmentId is required.');
    return jsonResponse({ data: await listLifecycleDepartmentMembers(db, principal, departmentId) });
  } catch (error) {
    return formatErrorResponse(error);
  }
}
