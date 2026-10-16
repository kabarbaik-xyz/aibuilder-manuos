import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { executionService } from '@/server/modules/execution/service';
import { parseIdempotencyKey, parseJsonBody, jsonResponse } from '@/server/http/route-handler';
import { CreateTaskIssueSchema } from '@/server/modules/execution/contracts';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const principal = await requirePrincipal(req);
    const issues = await executionService.listTaskIssues(principal, id);
    return jsonResponse({ data: issues }, { status: 200 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const principal = await requirePrincipal(req);
    const idempotencyKey = parseIdempotencyKey(req);
    const body = await parseJsonBody(req, CreateTaskIssueSchema.omit({ taskId: true }));
    const result = await executionService.createTaskIssue(
      principal,
      { taskId: id, ...body },
      idempotencyKey
    );
    return jsonResponse(result, { status: 201 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
