import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse } from '@/server/http/route-handler';
import { FormService } from '@/server/modules/forms/service';
import { db } from '@/server/db/client';

const service = new FormService(db);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { id: templateId, versionId } = await params;
    const principal = await requirePrincipal(request);
    const body = await request.json();
    const result = await service.updateDraftVersion(principal, templateId, versionId, body);
    return jsonResponse({ data: result });
  } catch (error) {
    return formatErrorResponse(error);
  }
}
