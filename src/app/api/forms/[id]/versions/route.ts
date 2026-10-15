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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: templateId } = await params;
    const principal = await requirePrincipal(request);
    const body = await request.json();

    if (body.fromVersionId) {
      const result = await service.forkVersion(principal, templateId, body.fromVersionId);
      return jsonResponse({ data: result }, { status: 201 });
    }

    throw new BadRequestError('fromVersionId is required to fork version');
  } catch (error) {
    return formatErrorResponse(error);
  }
}
