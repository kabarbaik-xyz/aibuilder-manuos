import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { planningService } from '@/server/modules/planning/service';
import { parseIdempotencyKey, parseJsonBody, jsonResponse } from '@/server/http/route-handler';
import { RescheduleAssignmentSchema } from '@/server/modules/planning/contracts';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const principal = await requirePrincipal(req);
    const idempotencyKey = parseIdempotencyKey(req);
    const body = await parseJsonBody(req, RescheduleAssignmentSchema);
    const result = await planningService.rescheduleTaskAssignment(principal, id, body, idempotencyKey);
    return jsonResponse(result, { status: 200 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
