import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse } from '@/server/http/route-handler';
import { risksService } from '@/server/modules/intelligence/risks';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requirePrincipal(request);
    const { id } = await params;
    return jsonResponse({ data: await risksService.get(principal, id) });
  } catch (error) {
    return formatErrorResponse(error);
  }
}
