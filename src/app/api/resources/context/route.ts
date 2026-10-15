import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { mastersService } from '@/server/modules/masters/service';

export async function GET(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const searchParams = req.nextUrl.searchParams;
    const machineIdsParam = searchParams.get('machineIds');
    const technicianIdsParam = searchParams.get('technicianIds');
    const atDate = searchParams.get('at') || undefined;

    const machineIds = machineIdsParam ? machineIdsParam.split(',') : undefined;
    const technicianIds = technicianIdsParam ? technicianIdsParam.split(',') : undefined;

    const context = await mastersService.getResourceContext(
      principal,
      { machineIds, technicianIds },
      atDate
    );

    return NextResponse.json({ data: context });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
