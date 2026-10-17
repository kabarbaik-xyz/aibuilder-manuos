import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse } from '@/server/http/route-handler';
import { RecoveryService } from '@/server/modules/intelligence/recovery';
import { db } from '@/server/db/client';

const service = new RecoveryService(db);

export async function GET(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const params = req.nextUrl.searchParams;
    const page = Number(params.get('page') ?? 1);
    const pageSize = Number(params.get('pageSize') ?? 20);
    const status = params.get('status') ?? undefined;
    const search = params.get('search') ?? undefined;
    return jsonResponse({ data: await service.listProposals(principal, { page, pageSize, status, search }) });
  } catch (error) {
    return formatErrorResponse(error);
  }
}
