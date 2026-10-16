import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse, parseIdempotencyKey, parseJsonBody } from '@/server/http/route-handler';
import { PortalService } from '@/server/modules/portal/service';
import { z } from 'zod';

const portalService = new PortalService();

const drawingApprovalSchema = z.object({
  drawingRevisionId: z.string().min(1),
  notes: z.string().max(500).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const principal = await requirePrincipal(req);
    const { id: orderId } = await params;
    const idempotencyKey = parseIdempotencyKey(req);
    const body = await parseJsonBody(req, drawingApprovalSchema);

    const result = await portalService.approveCustomerDrawing(
      principal,
      orderId,
      body.drawingRevisionId,
      idempotencyKey
    );
    return jsonResponse(result, { status: 200 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
