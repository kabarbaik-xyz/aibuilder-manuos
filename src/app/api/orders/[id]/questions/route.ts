import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { orderService } from '@/server/modules/orders/service';
import { addCustomerQuestionSchema } from '@/server/modules/orders/contracts';
import { parseIdempotencyKey, parseJsonBody, jsonResponse } from '@/server/http/route-handler';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const principal = await requirePrincipal(req);
    const idempotencyKey = parseIdempotencyKey(req);
    const body = await parseJsonBody(req, addCustomerQuestionSchema);
    const result = await orderService.addCustomerQuestion(principal, id, body, idempotencyKey);
    return jsonResponse(result, { status: 201 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
