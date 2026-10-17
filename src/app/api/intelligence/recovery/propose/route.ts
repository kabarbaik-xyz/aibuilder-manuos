import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse, parseIdempotencyKey, parseJsonBody } from '@/server/http/route-handler';
import { RecoveryService } from '@/server/modules/intelligence/recovery';
import { ScheduleRecoveryReviewSchema } from '@/server/modules/intelligence/recovery-contracts';
import { db } from '@/server/db/client';

const service = new RecoveryService(db);

export async function POST(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const body = await parseJsonBody(req, ScheduleRecoveryReviewSchema);
    const result = await service.proposeScheduleReview(principal, body, parseIdempotencyKey(req));
    return jsonResponse({ data: result });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
