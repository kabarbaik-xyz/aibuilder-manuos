import { NextResponse } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { requireAnyPermission } from '@/server/auth/permissions';
import { formatErrorResponse } from '@/server/http/errors';

export async function POST(req: Request) {
  try {
    const principal = await requirePrincipal(req);
    requireAnyPermission(principal, ['planning.write', 'order.release', 'order.read']);

    return NextResponse.json({ data: {
      state: 'NOT_CONNECTED',
      reason: 'Recovery narration is unavailable until a server-side schedule and shipment evaluation supplies validated options. Caller-provided constraints are not used as feasibility evidence.',
    } }, { status: 503 });
  } catch (err: any) {
    return formatErrorResponse(err);
  }
}
