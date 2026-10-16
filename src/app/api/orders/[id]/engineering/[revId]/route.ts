import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { engineeringService } from '@/server/modules/engineering/service';
import { saveEngineeringDraftSchema } from '@/server/modules/engineering/contracts';
import { parseIdempotencyKey, parseJsonBody, jsonResponse } from '@/server/http/route-handler';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; revId: string }> }
) {
  try {
    const { id, revId } = await params;
    const principal = await requirePrincipal(req);
    const revision = await engineeringService.getEngineeringRevision(principal, revId);
    if (revision.orderId !== id) return jsonResponse({ error: 'Engineering revision does not belong to this order' }, { status: 404 });
    return jsonResponse({ data: revision });
  } catch (err) {
    return formatErrorResponse(err);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; revId: string }> }
) {
  try {
    const { id, revId } = await params;
    const principal = await requirePrincipal(req);
    const revision = await engineeringService.getEngineeringRevision(principal, revId);
    if (revision.orderId !== id) return jsonResponse({ error: 'Engineering revision does not belong to this order' }, { status: 404 });
    const idempotencyKey = parseIdempotencyKey(req);
    const body = await parseJsonBody(req, saveEngineeringDraftSchema);
    const result = await engineeringService.saveEngineeringDraft(principal, revId, body, idempotencyKey);
    return jsonResponse(result);
  } catch (err) {
    return formatErrorResponse(err);
  }
}
