import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { orderService } from '@/server/modules/orders/service';
import { jsonResponse } from '@/server/http/route-handler';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const principal = await requirePrincipal(req);
    const order = await orderService.getOrder(principal, id);
    return jsonResponse({ data: order });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
