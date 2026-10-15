import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { workflowService } from '@/server/modules/workflow/service';
import { saveWorkflowVersionDraftSchema } from '@/server/modules/workflow/contracts';
import { parseIdempotencyKey, parseJsonBody } from '@/server/http/route-handler';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { versionId } = await params;
    const principal = await requirePrincipal(req);
    const version = await workflowService.getVersion(principal, versionId);
    return NextResponse.json({ data: version });
  } catch (err) {
    return formatErrorResponse(err);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { versionId } = await params;
    const principal = await requirePrincipal(req);
    const idempotencyKey = parseIdempotencyKey(req);
    const body = await parseJsonBody(req, saveWorkflowVersionDraftSchema);
    const result = await workflowService.saveVersionDraft(principal, versionId, body, idempotencyKey);
    return NextResponse.json(result);
  } catch (err) {
    return formatErrorResponse(err);
  }
}
