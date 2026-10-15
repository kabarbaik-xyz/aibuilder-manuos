import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { planningService } from '@/server/modules/planning/service';
import { jsonResponse } from '@/server/http/route-handler';

export async function POST(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const body = await req.json();
    const result = await planningService.evaluateAssignment(principal, body);
    return jsonResponse({ data: result });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
