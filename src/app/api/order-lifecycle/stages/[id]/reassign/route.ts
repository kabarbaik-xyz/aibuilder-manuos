import { NextRequest } from 'next/server';
import { BadRequestError } from '@/domain/errors';
import { requirePrincipal } from '@/server/auth/auth';
import { db } from '@/server/db/client';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse, parseIdempotencyKey } from '@/server/http/route-handler';
import { reassignLifecycleStage } from '@/server/modules/order-lifecycle/assignments';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requirePrincipal(request);
    const { id: stageId } = await params;
    const body = await request.json();
    if (!Number.isInteger(body.expectedVersion) || body.expectedVersion < 1) throw new BadRequestError('A positive expectedVersion is required.');
    if (typeof body.membershipId !== 'string' || !body.membershipId.trim()) throw new BadRequestError('An active membershipId is required.');
    if (typeof body.reason !== 'string') throw new BadRequestError('A reassignment reason is required.');
    const result = await reassignLifecycleStage(db, principal, {
      stageId,
      expectedVersion: body.expectedVersion,
      membershipId: body.membershipId,
      reason: body.reason,
    }, parseIdempotencyKey(request));
    return jsonResponse({ data: result.data, meta: result.meta });
  } catch (error) {
    return formatErrorResponse(error);
  }
}
