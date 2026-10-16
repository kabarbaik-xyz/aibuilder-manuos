import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { mastersService } from '@/server/modules/masters/service';
import { publishRosterBatchSchema } from '@/server/modules/masters/contracts';
import { parseIdempotencyKey, parseJsonBody, jsonResponse } from '@/server/http/route-handler';

export async function GET(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const searchParams = req.nextUrl.searchParams;
    const technicianId = searchParams.get('technicianId') || undefined;
    const machineId = searchParams.get('machineId') || undefined;
    const facilityId = searchParams.get('facilityId') || undefined;
    const startAt = searchParams.get('startAt') || undefined;
    const endAt = searchParams.get('endAt') || undefined;
    const status = searchParams.get('status') || undefined;

    const list = await mastersService.listRosterIntervals(principal, {
      technicianId,
      machineId,
      facilityId,
      startAt,
      endAt,
      status,
    });
    return jsonResponse({ data: list });
  } catch (err) {
    return formatErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const idempotencyKey = parseIdempotencyKey(req);
    const body = await parseJsonBody(req, publishRosterBatchSchema);
    const result = await mastersService.publishRosterIntervals(principal, body, idempotencyKey);
    return jsonResponse(result, { status: 201 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
