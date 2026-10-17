import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse } from '@/server/http/route-handler';
import { listLifecycleWorkItems } from '@/server/modules/order-lifecycle/queries';
import { db } from '@/server/db/client';
import { BadRequestError } from '@/domain/errors';

export async function GET(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const rawScope = req.nextUrl.searchParams.get('scope') ?? 'mine';
    if (rawScope !== 'mine' && rawScope !== 'department') {
      throw new BadRequestError('Invalid lifecycle work scope.');
    }
    const data = await listLifecycleWorkItems(db, principal, rawScope);
    return jsonResponse({ data });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
