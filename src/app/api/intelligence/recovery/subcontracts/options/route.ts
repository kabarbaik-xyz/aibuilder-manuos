import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse } from '@/server/http/route-handler';
import { RecoveryService } from '@/server/modules/intelligence/recovery';
import { db } from '@/server/db/client';

const service = new RecoveryService(db);
export async function GET(request: NextRequest) {
  try { return jsonResponse({ data: await service.getSubcontractChoices(await requirePrincipal(request)) }); }
  catch (error) { return formatErrorResponse(error); }
}
