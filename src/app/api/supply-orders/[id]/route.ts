import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { supplyService } from '@/server/modules/supply/service';
import { jsonResponse } from '@/server/http/route-handler';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const principal = await requirePrincipal(req);
    const { id } = await params;
    const order = await supplyService.getOrderById(principal, id);
    return jsonResponse({ data: order });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
