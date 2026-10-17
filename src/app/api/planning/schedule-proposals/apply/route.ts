import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse, parseIdempotencyKey } from '@/server/http/route-handler';
import { db } from '@/server/db/client';
import { ScheduleProposalService } from '@/server/modules/planning/schedule-proposals';

const service = new ScheduleProposalService(db);

export async function POST(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const body = await req.json();
    const result = await service.applyReviewedProposal(principal, body, parseIdempotencyKey(req));
    return jsonResponse(result);
  } catch (error) {
    return formatErrorResponse(error);
  }
}
