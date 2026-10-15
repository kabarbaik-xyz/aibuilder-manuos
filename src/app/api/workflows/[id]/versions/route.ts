import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { workflowService } from '@/server/modules/workflow/service';
import { createWorkflowVersionDraftSchema } from '@/server/modules/workflow/contracts';
import { parseIdempotencyKey, parseJsonBody } from '@/server/http/route-handler';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const principal = await requirePrincipal(req);
    const template = await workflowService.getTemplate(principal, id);
    return NextResponse.json({ data: template.versions });
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
    const body = await parseJsonBody(req, createWorkflowVersionDraftSchema);
    
    // Fork or new draft from input definition
    const result = await workflowService.saveVersionDraft(
      principal,
      id,
      body,
      idempotencyKey
    );
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
