import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { supplyService } from '@/server/modules/supply/service';
import { parseIdempotencyKey, jsonResponse } from '@/server/http/route-handler';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const principal = await requirePrincipal(req);
    const { id } = await params;
    const idempotencyKey = parseIdempotencyKey(req);
    const body = await req.json();

    const result = await supplyService.changeSupplyEta(principal, id, body, idempotencyKey);
    return jsonResponse(result);
  } catch (err) {
    return formatErrorResponse(err);
  }
}
