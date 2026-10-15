import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { mastersService } from '@/server/modules/masters/service';
import { updateSupplierSchema } from '@/server/modules/masters/contracts';
import { parseIdempotencyKey, parseJsonBody } from '@/server/http/route-handler';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const principal = await requirePrincipal(req);
    const { id } = await params;
    const supplier = await mastersService.getSupplier(principal, id);
    return NextResponse.json({ data: supplier });
  } catch (err) {
    return formatErrorResponse(err);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const principal = await requirePrincipal(req);
    const { id } = await params;
    const idempotencyKey = parseIdempotencyKey(req);
    const body = await parseJsonBody(req, updateSupplierSchema);
    const result = await mastersService.updateSupplier(principal, id, body, idempotencyKey);
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
    const idempotencyKey = parseIdempotencyKey(req);
    const result = await mastersService.archiveSupplier(principal, id, idempotencyKey);
    return NextResponse.json(result);
  } catch (err) {
    return formatErrorResponse(err);
  }
}
