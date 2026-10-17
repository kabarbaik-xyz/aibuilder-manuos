import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse, parseIdempotencyKey, parseJsonBody } from '@/server/http/route-handler';
import { db } from '@/server/db/client';
import { EngineeringIntakeService, IntakeExtractionSchema } from '@/server/modules/engineering/intake';

const service = new EngineeringIntakeService(db);

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requirePrincipal(req);
    const { id } = await params;
    return jsonResponse({ data: await service.getReview(principal, id) });
  } catch (error) {
    return formatErrorResponse(error);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requirePrincipal(req);
    const { id } = await params;
    const { extraction } = await parseJsonBody(req, z.object({ extraction: IntakeExtractionSchema }).strict());
    return jsonResponse(await service.saveReview(principal, id, extraction, parseIdempotencyKey(req)));
  } catch (error) {
    return formatErrorResponse(error);
  }
}
