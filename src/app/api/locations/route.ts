import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { mastersService } from '@/server/modules/masters/service';
import { createLocationSchema } from '@/server/modules/masters/contracts';
import { parseIdempotencyKey, parseJsonBody } from '@/server/http/route-handler';

export async function GET(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const locations = await mastersService.listLocations(principal);
    return NextResponse.json({ data: locations });
  } catch (err) {
    return formatErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const idempotencyKey = parseIdempotencyKey(req);
    const body = await parseJsonBody(req, createLocationSchema);
    const result = await mastersService.createLocation(principal, body, idempotencyKey);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
