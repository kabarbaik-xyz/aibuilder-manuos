import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { executionService } from '@/server/modules/execution/service';
import { parseIdempotencyKey, jsonResponse } from '@/server/http/route-handler';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const principal = await requirePrincipal(req);
    const idempotencyKey = parseIdempotencyKey(req);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const result = await executionService.pauseTask(
      principal,
      {
        taskId: id,
        reason: body.reason || 'BREAK',
        notes: body.notes,
      },
      idempotencyKey
    );
    return jsonResponse(result, { status: 200 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
