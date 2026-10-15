import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { inventoryService } from '@/server/modules/inventory/service';
import { jsonResponse } from '@/server/http/route-handler';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const principal = await requirePrincipal(req);
    const { taskId } = await params;

    const readiness = await inventoryService.getTaskMaterialReadiness(principal, taskId);
    return jsonResponse({ data: readiness });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
