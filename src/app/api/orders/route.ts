import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { orderService } from '@/server/modules/orders/service';
import { createOrderDraftSchema } from '@/server/modules/orders/contracts';
import { parseIdempotencyKey, parseJsonBody, jsonResponse } from '@/server/http/route-handler';

export async function GET(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const searchParams = req.nextUrl.searchParams;
    const customerId = searchParams.get('customerId') || undefined;
    const status = searchParams.get('status') || undefined;
    const orders = await orderService.listOrders(principal, { customerId, status });
    return jsonResponse({ data: orders });
  } catch (err) {
    return formatErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const idempotencyKey = parseIdempotencyKey(req);
    const body = await parseJsonBody(req, createOrderDraftSchema);
    const result = await orderService.createOrderDraft(principal, body, idempotencyKey);
    return jsonResponse(result, { status: 201 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
