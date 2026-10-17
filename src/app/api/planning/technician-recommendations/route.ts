import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse } from '@/server/http/route-handler';
import { TechnicianRecommendationService } from '@/server/modules/planning/recommendations';
import { db } from '@/server/db/client';

const service = new TechnicianRecommendationService(db);
const RequestSchema = z.object({
  taskId: z.string().min(1).max(100),
  slotStart: z.string().datetime(),
  slotEnd: z.string().datetime(),
}).refine(value => new Date(value.slotEnd).getTime() > new Date(value.slotStart).getTime(), {
  message: 'slotEnd must be after slotStart',
  path: ['slotEnd'],
});

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePrincipal(request);
    const body = RequestSchema.parse(await request.json());
    const result = await service.recommendTechnicians(principal, {
      taskId: body.taskId,
      slotStart: new Date(body.slotStart),
      slotEnd: new Date(body.slotEnd),
      requiredFacilityId: principal.facilityId ?? undefined,
    });
    return jsonResponse({ data: result });
  } catch (error) {
    return formatErrorResponse(error);
  }
}
