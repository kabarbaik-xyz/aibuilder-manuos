import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse, parseIdempotencyKey } from '@/server/http/route-handler';
import { supplyService } from '@/server/modules/supply/service';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requirePrincipal(request);
    const { id } = await params;
    return jsonResponse(await supplyService.getMaterialDemandAllocationContext(principal, id));
  } catch (error) {
    return formatErrorResponse(error);
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requirePrincipal(request);
    const { id } = await params;
    const result = await supplyService.allocateMaterialDemand(principal, id, await request.json(), parseIdempotencyKey(request));
    return jsonResponse(result);
  } catch (error) {
    return formatErrorResponse(error);
  }
}
