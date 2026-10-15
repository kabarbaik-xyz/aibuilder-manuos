import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { mastersService } from '@/server/modules/masters/service';
import { parseIdempotencyKey } from '@/server/http/route-handler';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const principal = await requirePrincipal(req);
    const { id } = await params;
    const location = await mastersService.getLocation(principal, id);
    return NextResponse.json({ data: location });
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
    const idempotencyKey = parseIdempotencyKey(req);
    const result = await mastersService.archiveLocation(principal, id, idempotencyKey);
    return NextResponse.json(result);
  } catch (err) {
    return formatErrorResponse(err);
  }
}
