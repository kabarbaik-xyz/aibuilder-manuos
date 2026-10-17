import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse, parseIdempotencyKey, parseJsonBody } from '@/server/http/route-handler';
import { FormService } from '@/server/modules/forms/service';
import { formTemplateCreateRequestSchema } from '@/server/modules/forms/contracts-schema';
import { db } from '@/server/db/client';

const service = new FormService(db);

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePrincipal(request);
    const templates = await service.listTemplates(principal);
    return jsonResponse({ data: templates });
  } catch (error) {
    return formatErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePrincipal(request);
    const body = await parseJsonBody(request, formTemplateCreateRequestSchema);
    const result = await service.createTemplate(principal, body, parseIdempotencyKey(request));
    return jsonResponse({ data: result }, { status: 201 });
  } catch (error) {
    return formatErrorResponse(error);
  }
}
