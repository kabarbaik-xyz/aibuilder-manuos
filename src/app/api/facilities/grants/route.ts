import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { mastersService } from '@/server/modules/masters/service';
import { parseIdempotencyKey, parseJsonBody } from '@/server/http/route-handler';

const facilityGrantSchema = z.object({
  action: z.enum(['GRANT', 'REVOKE']),
  membershipId: z.string().min(1),
  facilityId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const idempotencyKey = parseIdempotencyKey(req);
    const body = await parseJsonBody(req, facilityGrantSchema);

    if (body.action === 'GRANT') {
      const result = await mastersService.grantFacilityAccess(
        principal,
        body.membershipId,
        body.facilityId,
        idempotencyKey
      );
      return NextResponse.json(result, { status: 201 });
    } else {
      const result = await mastersService.revokeFacilityAccess(
        principal,
        body.membershipId,
        body.facilityId,
        idempotencyKey
      );
      return NextResponse.json(result);
    }
  } catch (err) {
    return formatErrorResponse(err);
  }
}
