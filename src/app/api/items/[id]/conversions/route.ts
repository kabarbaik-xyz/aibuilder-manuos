import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { mastersService } from '@/server/modules/masters/service';
import { createItemConversionSchema } from '@/server/modules/masters/contracts';
import { parseIdempotencyKey, parseJsonBody } from '@/server/http/route-handler';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const principal = await requirePrincipal(req);
    const { id } = await params;
    const idempotencyKey = parseIdempotencyKey(req);
    const body = await parseJsonBody(req, createItemConversionSchema);
    const result = await mastersService.addConversion(principal, id, body, idempotencyKey);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
