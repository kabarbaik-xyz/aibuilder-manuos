import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { releaseOrder } from '@/server/modules/orders/release';
import { parseIdempotencyKey, jsonResponse } from '@/server/http/route-handler';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const principal = await requirePrincipal(req);
    const idempotencyKey = parseIdempotencyKey(req);
    const result = await releaseOrder(principal, id, idempotencyKey);
    return jsonResponse(result);
  } catch (err) {
    return formatErrorResponse(err);
  }
}
