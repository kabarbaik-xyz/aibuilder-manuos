import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { inventoryService } from '@/server/modules/inventory/service';
import { parseIdempotencyKey, jsonResponse } from '@/server/http/route-handler';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const principal = await requirePrincipal(req);
    const { id } = await params;
    const idempotencyKey = parseIdempotencyKey(req);

    const result = await inventoryService.approveStockCount(principal, id, idempotencyKey);
    return jsonResponse(result);
  } catch (err) {
    return formatErrorResponse(err);
  }
}
