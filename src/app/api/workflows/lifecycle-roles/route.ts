import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse } from '@/server/http/route-handler';
import { listLifecycleAssignableRoles } from '@/server/modules/order-lifecycle/queries';
import { db } from '@/server/db/client';

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePrincipal(request);
    return jsonResponse({ data: await listLifecycleAssignableRoles(db, principal) });
  } catch (error) {
    return formatErrorResponse(error);
  }
}
