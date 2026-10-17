import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse } from '@/server/http/route-handler';
import { jobCostingService } from '@/server/modules/costing/service';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const principal = await requirePrincipal(req);
    const explanation = await jobCostingService.getOrderCostExplanation(principal, id);
    return jsonResponse({ data: explanation });
  } catch (error) {
    return formatErrorResponse(error);
  }
}
