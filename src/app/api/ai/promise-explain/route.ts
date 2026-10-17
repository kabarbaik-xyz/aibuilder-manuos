import { NextResponse } from 'next/server';
import { formatErrorResponse } from '@/server/http/errors';
import { requirePrincipal } from '@/server/auth/auth';
import { requireAnyPermission } from '@/server/auth/permissions';

export async function POST(req: Request) {
  try {
    const principal = await requirePrincipal(req);
    requireAnyPermission(principal, ['order.create', 'order.read', 'planning.read']);

    return NextResponse.json({ data: {
      state: 'NOT_CONNECTED',
      reason: 'A narrative cannot be generated from client-supplied feasibility claims. The validated finite-capacity promise result is not connected yet.',
    } }, { status: 503 });
  } catch (err: any) {
    return formatErrorResponse(err);
  }
}
