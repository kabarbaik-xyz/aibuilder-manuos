import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse, parseIdempotencyKey, parseJsonBody } from '@/server/http/route-handler';
import { FormSubmissionService } from '@/server/modules/forms/submissions';
import { formCorrectionRequestSchema } from '@/server/modules/forms/contracts-schema';
import { db } from '@/server/db/client';

const service = new FormSubmissionService(db);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: instanceId } = await params;
    const principal = await requirePrincipal(request);
    const body = await parseJsonBody(request, formCorrectionRequestSchema);
    const result = await service.createCorrection(principal, {
      instanceId,
      expectedVersion: body.expectedVersion,
      reason: body.reason,
      answers: body.answers,
    }, parseIdempotencyKey(request));
    return jsonResponse({ data: result }, { status: 201 });
  } catch (error) {
    return formatErrorResponse(error);
  }
}
