import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse, parseIdempotencyKey } from '@/server/http/route-handler';
import { BadRequestError } from '@/domain/errors';
import { db } from '@/server/db/client';
import { claimLifecycleStage } from '@/server/modules/order-lifecycle/assignments';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requirePrincipal(request);
    const { id: stageId } = await params;
    const body = await request.json();
    if (!Number.isInteger(body.expectedVersion) || body.expectedVersion < 1) {
      throw new BadRequestError('A positive expectedVersion is required.');
    }
    const result = await claimLifecycleStage(db, principal, { stageId, expectedVersion: body.expectedVersion }, parseIdempotencyKey(request));
    return jsonResponse({ data: result.data, meta: result.meta });
  } catch (error) {
    return formatErrorResponse(error);
  }
}
