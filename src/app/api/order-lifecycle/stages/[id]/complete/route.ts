import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse, parseIdempotencyKey, parseJsonBody } from '@/server/http/route-handler';
import { db } from '@/server/db/client';
import { completeEvidenceReviewStage } from '@/server/modules/order-lifecycle/assignments';

const requestSchema = z.object({ expectedVersion: z.number().int().positive() }).strict();

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requirePrincipal(request);
    const { id: stageId } = await params;
    const body = await parseJsonBody(request, requestSchema);
    const result = await completeEvidenceReviewStage(db, principal, { stageId, expectedVersion: body.expectedVersion }, parseIdempotencyKey(request));
    return jsonResponse({ data: result.data, meta: result.meta });
  } catch (error) {
    return formatErrorResponse(error);
  }
}
