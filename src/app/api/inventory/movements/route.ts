import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { inventoryService } from '@/server/modules/inventory/service';
import { parseIdempotencyKey, jsonResponse } from '@/server/http/route-handler';

export async function GET(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const searchParams = req.nextUrl.searchParams;
    const itemId = searchParams.get('itemId') || undefined;
    const locationId = searchParams.get('locationId') || undefined;
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined;

    const movements = await inventoryService.getMovements(principal, {
      itemId,
      locationId,
      limit,
    });

    return jsonResponse({ data: movements });
  } catch (err) {
    return formatErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const idempotencyKey = parseIdempotencyKey(req);
    const body = await req.json();

    const result = await inventoryService.postMovement(principal, body, idempotencyKey);
    return jsonResponse(result, { status: 201 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
