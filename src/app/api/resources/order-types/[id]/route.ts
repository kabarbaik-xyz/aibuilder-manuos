import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { mastersService } from '@/server/modules/masters/service';
import { updateOrderTypeSchema } from '@/server/modules/masters/contracts';
import { parseIdempotencyKey, parseJsonBody } from '@/server/http/route-handler';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const principal = await requirePrincipal(req);
    const { id } = await params;
    const body = await parseJsonBody(req, updateOrderTypeSchema);
    const result = await mastersService.updateOrderType(
      principal,
      id,
      body,
      parseIdempotencyKey(req)
    );
    return NextResponse.json(result);
  } catch (err) {
    return formatErrorResponse(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const principal = await requirePrincipal(req);
    const { id } = await params;
    const result = await mastersService.archiveOrderType(
      principal,
      id,
      parseIdempotencyKey(req)
    );
    return NextResponse.json(result);
  } catch (err) {
    return formatErrorResponse(err);
  }
}
