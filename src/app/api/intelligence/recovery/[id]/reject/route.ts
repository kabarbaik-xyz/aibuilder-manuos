import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse, parseIdempotencyKey, parseJsonBody } from '@/server/http/route-handler';
import { RecoveryService } from '@/server/modules/intelligence/recovery';
import { db } from '@/server/db/client';
import { z } from 'zod';

const service = new RecoveryService(db);
const RejectSchema = z.object({ note: z.string().trim().min(1).max(1000) }).strict();

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requirePrincipal(req);
    const { id } = await params;
    const idempotencyKey = parseIdempotencyKey(req);
    const { note } = await parseJsonBody(req, RejectSchema);
    return jsonResponse(await service.rejectProposal(principal, { proposalId: id, note }, idempotencyKey));
  } catch (error) {
    return formatErrorResponse(error);
  }
}
