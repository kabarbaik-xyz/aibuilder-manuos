import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { deliveryService } from '@/server/modules/delivery/service';
import { listShipments } from '@/server/modules/delivery/repository';
import { db } from '@/server/db/client';
import { parseIdempotencyKey, jsonResponse } from '@/server/http/route-handler';
import { requireAnyPermission } from '@/server/auth/permissions';

export async function GET(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    requireAnyPermission(principal, ['delivery.read', 'order.read', 'owner']);

    const searchParams = req.nextUrl.searchParams;
    const orderId = searchParams.get('orderId') || undefined;
    const customerId = searchParams.get('customerId') || undefined;
    const status = searchParams.get('status') || undefined;

    const shipments = await listShipments(db, principal.workspaceId, {
      orderId,
      customerId,
      status,
    });

    return jsonResponse({ data: shipments }, { status: 200 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const idempotencyKey = parseIdempotencyKey(req);
    const body = await req.json().catch(() => ({}));

    const result = await deliveryService.allocateShipment(
      principal,
      body,
      idempotencyKey
    );

    return jsonResponse(result, { status: 201 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
