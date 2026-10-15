import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { mastersService } from '@/server/modules/masters/service';
import { updateItemSchema } from '@/server/modules/masters/contracts';
import { parseIdempotencyKey, parseJsonBody } from '@/server/http/route-handler';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const principal = await requirePrincipal(req);
    const { id } = await params;
    const item = await mastersService.getItem(principal, id);
    return NextResponse.json({ data: item });
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
    const body = await parseJsonBody(req, updateItemSchema);
    const result = await mastersService.updateItem(principal, id, body, idempotencyKey);
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
    const result = await mastersService.archiveItem(principal, id, idempotencyKey);
    return NextResponse.json(result);
  } catch (err) {
    return formatErrorResponse(err);
  }
}
