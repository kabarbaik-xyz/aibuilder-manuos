import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse } from '@/server/http/route-handler';
import { workflowService } from '@/server/modules/workflow/service';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const principal = await requirePrincipal(req);
    const template = await workflowService.getTemplate(principal, id);
    return jsonResponse({ data: template });
  } catch (error) {
    return formatErrorResponse(error);
  }
}
