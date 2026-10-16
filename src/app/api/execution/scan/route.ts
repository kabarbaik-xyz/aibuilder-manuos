import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { executionService } from '@/server/modules/execution/service';
import { parseJsonBody, jsonResponse } from '@/server/http/route-handler';
import { ScanCodeSchema } from '@/server/modules/execution/contracts';

export async function POST(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const body = await parseJsonBody(req, ScanCodeSchema);
    const result = await executionService.scanCode(principal, body);
    return jsonResponse({ data: result }, { status: 200 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
