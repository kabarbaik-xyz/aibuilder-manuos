import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { executionService } from '@/server/modules/execution/service';
import { parseIdempotencyKey, parseJsonBody, jsonResponse } from '@/server/http/route-handler';
import { ResolveTaskIssueSchema } from '@/server/modules/execution/contracts';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const principal = await requirePrincipal(req);
    const idempotencyKey = parseIdempotencyKey(req);
    let body = {};
    try {
      body = await parseJsonBody(req, ResolveTaskIssueSchema);
    } catch {
      // Body is optional
    }
    const result = await executionService.resolveTaskIssue(principal, id, body, idempotencyKey);
    return jsonResponse(result, { status: 200 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
