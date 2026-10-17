import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse, parseIdempotencyKey } from '@/server/http/route-handler';
import { RecoveryService } from '@/server/modules/intelligence/recovery';
import { db } from '@/server/db/client';

const service = new RecoveryService(db);
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const principal = await requirePrincipal(request); const { id } = await params; return jsonResponse(await service.approveSubcontractPlan(principal, id, parseIdempotencyKey(request))); }
  catch (error) { return formatErrorResponse(error); }
}
