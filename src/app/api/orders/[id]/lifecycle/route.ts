import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { orderService } from '@/server/modules/orders/service';
import { attachOrderLifecycleSchema } from '@/server/modules/orders/contracts';
import { jsonResponse, parseIdempotencyKey, parseJsonBody } from '@/server/http/route-handler';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const principal = await requirePrincipal(req);
    const { id } = await params;
    const input = await parseJsonBody(req, attachOrderLifecycleSchema);
    const result = await orderService.attachLifecycle(principal, id, input, parseIdempotencyKey(req));
    return jsonResponse(result);
  } catch (error) {
    return formatErrorResponse(error);
  }
}
