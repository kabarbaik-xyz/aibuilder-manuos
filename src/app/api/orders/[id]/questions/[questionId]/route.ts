import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { orderService } from '@/server/modules/orders/service';
import { resolveCustomerQuestionSchema } from '@/server/modules/orders/contracts';
import { parseIdempotencyKey, parseJsonBody, jsonResponse } from '@/server/http/route-handler';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; questionId: string }> }
) {
  try {
    const { questionId } = await params;
    const principal = await requirePrincipal(req);
    const idempotencyKey = parseIdempotencyKey(req);
    const body = await parseJsonBody(req, resolveCustomerQuestionSchema);
    const result = await orderService.resolveCustomerQuestion(principal, questionId, body, idempotencyKey);
    return jsonResponse(result);
  } catch (err) {
    return formatErrorResponse(err);
  }
}
