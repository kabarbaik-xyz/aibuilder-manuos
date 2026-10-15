import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse } from '@/server/http/route-handler';
import { PortalService } from '@/server/modules/portal/service';

const portalService = new PortalService();

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const principal = await requirePrincipal(req);
    const { id } = await params;

    const order = await portalService.getCustomerOrder(principal, id);
    return jsonResponse(order, { status: 200 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
