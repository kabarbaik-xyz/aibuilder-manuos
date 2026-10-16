import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { engineeringService } from '@/server/modules/engineering/service';
import { engineeringActionSchema } from '@/server/modules/engineering/contracts';
import { parseIdempotencyKey, parseJsonBody, jsonResponse } from '@/server/http/route-handler';
import { BadRequestError } from '@/domain/errors';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; revId: string }> }
) {
  try {
    const { id, revId } = await params;
    const principal = await requirePrincipal(req);
    const revision = await engineeringService.getEngineeringRevision(principal, revId);
    if (revision.orderId !== id) return jsonResponse({ error: 'Engineering revision does not belong to this order' }, { status: 404 });
    const idempotencyKey = parseIdempotencyKey(req);
    const body = await parseJsonBody(req, engineeringActionSchema);

    let result;
    switch (body.action) {
      case 'submit_review':
        result = await engineeringService.submitEngineeringReview(principal, revId, idempotencyKey);
        break;
      case 'approve':
        result = await engineeringService.approveEngineeringRevision(principal, revId, idempotencyKey);
        break;
      default:
        throw new BadRequestError(`Unknown engineering action: ${(body as any).action}`);
    }

    return jsonResponse(result);
  } catch (err) {
    return formatErrorResponse(err);
  }
}
