import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse } from '@/server/http/route-handler';
import { capabilityRegistryService } from '@/server/modules/intelligence/capabilities';

export async function GET(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const data = capabilityRegistryService.getCapabilities(principal);
    return jsonResponse({ data }, { status: 200 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
