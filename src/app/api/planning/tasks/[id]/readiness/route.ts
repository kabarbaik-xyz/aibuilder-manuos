import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { planningService } from '@/server/modules/planning/service';
import { jsonResponse } from '@/server/http/route-handler';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const principal = await requirePrincipal(req);
    const result = await planningService.getTaskDispatchReadiness(principal, id);
    return jsonResponse({ data: result });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
