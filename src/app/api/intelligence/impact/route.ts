import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse } from '@/server/http/route-handler';
import { ImpactAnalysisService } from '@/server/modules/planning/impact';
import { db } from '@/server/db/client';

const impactService = new ImpactAnalysisService(db);

export async function POST(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const body = await req.json();
    const result = await impactService.analyzeImpact(principal, body);
    return jsonResponse({ data: result }, { status: 200 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
