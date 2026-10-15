import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse } from '@/server/http/route-handler';
import { DashboardService } from '@/server/modules/intelligence/dashboard';
import { db } from '@/server/db/client';

const dashboardService = new DashboardService(db);

export async function GET(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const overview = await dashboardService.getDashboardOverview(principal);
    return jsonResponse({ data: overview }, { status: 200 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
