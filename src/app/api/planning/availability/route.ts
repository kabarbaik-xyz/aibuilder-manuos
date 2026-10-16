import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { availabilityService } from '@/server/modules/planning/availability';
import { jsonResponse } from '@/server/http/route-handler';
import { BadRequestError } from '@/domain/errors';

export async function GET(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const searchParams = req.nextUrl.searchParams;
    const resourceType = searchParams.get('resourceType') as 'TECHNICIAN' | 'MACHINE' | null;
    const resourceId = searchParams.get('resourceId');
    const startAt = searchParams.get('startAt');
    const endAt = searchParams.get('endAt');

    if (!resourceType || !['TECHNICIAN', 'MACHINE'].includes(resourceType)) {
      throw new BadRequestError("Query parameter 'resourceType' must be 'TECHNICIAN' or 'MACHINE'");
    }
    if (!resourceId) {
      throw new BadRequestError("Query parameter 'resourceId' is required");
    }
    if (!startAt || !endAt) {
      throw new BadRequestError("Query parameters 'startAt' and 'endAt' are required");
    }

    const intervals = await availabilityService.getAvailableIntervals(principal, {
      resourceType,
      resourceId,
      startAt: new Date(startAt),
      endAt: new Date(endAt),
    });

    return jsonResponse({ data: intervals });
  } catch (err) {
    return formatErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const body = await req.json();
    const result = await availabilityService.verifyTechnicianEligibility(principal, {
      technicianId: body.technicianId,
      minSkillLevels: body.minSkillLevels,
      requiredCertifications: body.requiredCertifications,
      requiredFacilityId: body.requiredFacilityId,
      slotStart: new Date(body.slotStart),
      slotEnd: new Date(body.slotEnd),
    });

    return jsonResponse({ data: result });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
