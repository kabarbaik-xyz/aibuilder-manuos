import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse, parseIdempotencyKey, parseJsonBody } from '@/server/http/route-handler';
import { FormService } from '@/server/modules/forms/service';
import { formDraftVersionRequestSchema } from '@/server/modules/forms/contracts-schema';
import { db } from '@/server/db/client';

const service = new FormService(db);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { id: templateId, versionId } = await params;
    const principal = await requirePrincipal(request);
    const body = await parseJsonBody(request, formDraftVersionRequestSchema);
    const result = await service.updateDraftVersion(principal, templateId, versionId, body, parseIdempotencyKey(request));
    return jsonResponse({ data: result });
  } catch (error) {
    return formatErrorResponse(error);
  }
}
