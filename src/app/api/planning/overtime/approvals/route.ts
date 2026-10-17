import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse } from '@/server/http/route-handler';
import { mastersService } from '@/server/modules/masters/service';

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePrincipal(request);
    return jsonResponse({ data: await mastersService.listOvertimeApprovals(principal) });
  } catch (error) { return formatErrorResponse(error); }
}
