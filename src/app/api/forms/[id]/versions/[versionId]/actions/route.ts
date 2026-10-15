import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse } from '@/server/http/route-handler';
import { FormService } from '@/server/modules/forms/service';
import { db } from '@/server/db/client';
import { BadRequestError } from '@/domain/errors';

const service = new FormService(db);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { id: templateId, versionId } = await params;
    const principal = await requirePrincipal(request);
    const body = await request.json();
    const action = body.action;
    const expectedVersion = body.expectedVersion;

    if (action === 'submit_review') {
      const res = await service.submitReview(principal, templateId, versionId, { expectedVersion });
      return jsonResponse({ data: res });
    }

    if (action === 'publish') {
      const res = await service.publishFormVersion(principal, { templateId, versionId, expectedVersion });
      return jsonResponse({ data: res });
    }

    if (action === 'retire') {
      const res = await service.retireFormVersion(principal, { templateId, versionId, expectedVersion });
      return jsonResponse({ data: res });
    }

    throw new BadRequestError(`Unknown action: '${action}'`);
  } catch (error) {
    return formatErrorResponse(error);
  }
}
