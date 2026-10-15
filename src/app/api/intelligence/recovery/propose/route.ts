import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse } from '@/server/http/route-handler';
import { RecoveryService } from '@/server/modules/intelligence/recovery';
import { db } from '@/server/db/client';

const recoveryService = new RecoveryService(db);

export async function POST(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const body = await req.json();
    const proposal = await recoveryService.proposeRecovery(principal, body);
    return jsonResponse({ data: proposal }, { status: 200 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
