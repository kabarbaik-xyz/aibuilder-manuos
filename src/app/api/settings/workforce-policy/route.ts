import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse, parseJsonBody, parseIdempotencyKey } from '@/server/http/route-handler';
import { mastersService } from '@/server/modules/masters/service';
import { updateOvertimePolicySchema } from '@/server/modules/masters/contracts';

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePrincipal(request);
    return jsonResponse({ data: await mastersService.getOvertimePolicy(principal) });
  } catch (error) { return formatErrorResponse(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const principal = await requirePrincipal(request);
    const body = await parseJsonBody(request, updateOvertimePolicySchema);
    return jsonResponse(await mastersService.updateOvertimePolicy(principal, body, parseIdempotencyKey(request)));
  } catch (error) { return formatErrorResponse(error); }
}
