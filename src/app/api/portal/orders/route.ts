import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse } from '@/server/http/route-handler';
import { PortalService } from '@/server/modules/portal/service';

const portalService = new PortalService();

export async function GET(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const orders = await portalService.listCustomerOrders(principal);
    return jsonResponse(orders, { status: 200 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
