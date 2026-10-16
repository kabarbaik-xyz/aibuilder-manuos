import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse, parseJsonBody } from '@/server/http/route-handler';
import { CustomerChangeRequestService } from '@/server/modules/portal/customer-change-requests';
import { db } from '@/server/db/client';

const service = new CustomerChangeRequestService(db);

export async function GET(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get('orderId') || undefined;

    const list = await service.listCustomerChangeRequests(principal, orderId);
    return jsonResponse({ data: list });
  } catch (err) {
    return formatErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const body = await req.json();

    const result = await service.submitChangeRequest(principal, body);
    return jsonResponse(result, { status: 201 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
