import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { inventoryService } from '@/server/modules/inventory/service';
import { parseIdempotencyKey, jsonResponse } from '@/server/http/route-handler';

export async function GET(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const searchParams = req.nextUrl.searchParams;
    const demandId = searchParams.get('demandId') || undefined;
    const orderId = searchParams.get('orderId') || undefined;
    const taskId = searchParams.get('taskId') || undefined;
    const status = searchParams.get('status') || undefined;

    const reservations = await inventoryService.listReservations(principal, {
      demandId,
      orderId,
      taskId,
      status,
    });
    return jsonResponse({ data: reservations });
  } catch (err) {
    return formatErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const idempotencyKey = parseIdempotencyKey(req);
    const body = await req.json();

    const result = await inventoryService.reserveStock(principal, body, idempotencyKey);
    return jsonResponse(result, { status: 201 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
