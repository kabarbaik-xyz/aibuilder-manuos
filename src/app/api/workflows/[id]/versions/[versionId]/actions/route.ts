import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { workflowService } from '@/server/modules/workflow/service';
import { workflowVersionActionSchema } from '@/server/modules/workflow/contracts';
import { parseIdempotencyKey, parseJsonBody } from '@/server/http/route-handler';
import { BadRequestError } from '@/domain/errors';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { versionId } = await params;
    const principal = await requirePrincipal(req);
    const idempotencyKey = parseIdempotencyKey(req);
    const body = await parseJsonBody(req, workflowVersionActionSchema);

    let result;
    switch (body.action) {
      case 'submit_review':
        result = await workflowService.submitReview(principal, versionId, idempotencyKey);
        break;
      case 'publish':
        result = await workflowService.publishVersion(principal, versionId, idempotencyKey);
        break;
      case 'retire':
        result = await workflowService.retireVersion(principal, versionId, idempotencyKey);
        break;
      case 'fork':
        result = await workflowService.forkVersion(principal, versionId, idempotencyKey);
        break;
      default:
        throw new BadRequestError(`Unknown workflow action: ${(body as any).action}`);
    }

    return NextResponse.json(result);
  } catch (err) {
    return formatErrorResponse(err);
  }
}
