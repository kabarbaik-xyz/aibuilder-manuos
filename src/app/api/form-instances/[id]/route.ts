import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse } from '@/server/http/route-handler';
import { FormSubmissionService } from '@/server/modules/forms/submissions';
import { db } from '@/server/db/client';

const service = new FormSubmissionService(db);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: instanceId } = await params;
    const principal = await requirePrincipal(request);
    const result = await service.getInstance(principal, instanceId);
    return jsonResponse({ data: result });
  } catch (error) {
    return formatErrorResponse(error);
  }
}
