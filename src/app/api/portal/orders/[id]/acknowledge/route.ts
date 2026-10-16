import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse, parseIdempotencyKey } from '@/server/http/route-handler';
import { PortalService } from '@/server/modules/portal/service';

const portalService = new PortalService();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const principal = await requirePrincipal(req);
    const { id } = await params;

    const updatedOrder = await portalService.acknowledgePromise(principal, id, parseIdempotencyKey(req));
    return jsonResponse({ data: updatedOrder }, { status: 200 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
