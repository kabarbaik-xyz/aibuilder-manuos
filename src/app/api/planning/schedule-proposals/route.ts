import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse } from '@/server/http/route-handler';
import { db } from '@/server/db/client';
import { ScheduleProposalService } from '@/server/modules/planning/schedule-proposals';

const service = new ScheduleProposalService(db);

export async function POST(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const body = await req.json().catch(() => ({}));
    return jsonResponse({ data: await service.propose(principal, body) });
  } catch (error) {
    return formatErrorResponse(error);
  }
}
