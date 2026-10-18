import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse, parseIdempotencyKey, parseJsonBody } from '@/server/http/route-handler';
import { FormService } from '@/server/modules/forms/service';
import { formVersionForkRequestSchema } from '@/server/modules/forms/contracts-schema';
import { db } from '@/server/db/client';

const service = new FormService(db);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: templateId } = await params;
    const principal = await requirePrincipal(request);
    const body = await parseJsonBody(request, formVersionForkRequestSchema);
    const result = await service.forkVersion(principal, templateId, body.fromVersionId, parseIdempotencyKey(request));
    return jsonResponse({ data: result }, { status: 201 });
  } catch (error) {
    return formatErrorResponse(error);
  }
}
