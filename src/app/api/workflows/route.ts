import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { workflowService } from '@/server/modules/workflow/service';
import { createWorkflowTemplateSchema } from '@/server/modules/workflow/contracts';
import { parseIdempotencyKey, parseJsonBody } from '@/server/http/route-handler';

export async function GET(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const templates = await workflowService.listTemplates(principal);
    return NextResponse.json({ data: templates });
  } catch (err) {
    return formatErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const idempotencyKey = parseIdempotencyKey(req);
    const body = await parseJsonBody(req, createWorkflowTemplateSchema);
    const result = await workflowService.createTemplate(principal, body, idempotencyKey);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
