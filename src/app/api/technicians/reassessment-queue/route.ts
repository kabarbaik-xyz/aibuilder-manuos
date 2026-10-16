import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse } from '@/server/http/route-handler';
import { mastersService } from '@/server/modules/masters/service';

export async function GET(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const { searchParams } = new URL(req.url);

    const daysAheadParam = searchParams.get('daysAhead');
    const daysAhead = daysAheadParam ? parseInt(daysAheadParam, 10) : undefined;
    const facilityId = searchParams.get('facilityId') || undefined;
    const technicianId = searchParams.get('technicianId') || undefined;

    const queue = await mastersService.getReassessmentQueue(principal, {
      daysAhead,
      facilityId,
      technicianId,
    });

    return jsonResponse({
      data: queue,
      total: queue.length,
    });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
