import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse } from '@/server/http/route-handler';
import { FormService } from '@/server/modules/forms/service';
import { db } from '@/server/db/client';

const service = new FormService(db);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const principal = await requirePrincipal(request);
    const result = await service.getTemplate(principal, id);
    return jsonResponse({ data: result });
  } catch (error) {
    return formatErrorResponse(error);
  }
}
