import { NextRequest } from "next/server";
import { requirePrincipal } from "@/server/auth/auth";
import { formatErrorResponse } from "@/server/http/errors";
import { jsonResponse, parseIdempotencyKey } from "@/server/http/route-handler";
import { jobCostingService } from "@/server/modules/costing/service";
import { z } from 'zod';

const RecordCostSchema = z.object({
  taskId: z.string().min(1).max(100).optional(),
  costCategory: z.enum(['MATERIAL', 'LABOR', 'MACHINE', 'OUTSOURCED', 'SCRAP']),
  costType: z.enum(['STANDARD', 'ACTUAL']),
  amountCents: z.string().regex(/^\d+$/, 'amountCents must be integer minor units encoded as a string'),
  currency: z.string().regex(/^[A-Za-z]{3}$/).optional(),
  notes: z.string().max(1000).optional(),
}).strict();

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const principal = await requirePrincipal(req);
    const summary = await jobCostingService.getOrderCostSummary(principal, id);
    return jsonResponse({ data: summary });
  } catch (err) {
    return formatErrorResponse(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const principal = await requirePrincipal(req);
    const body = RecordCostSchema.parse(await req.json());
    const entry = await jobCostingService.recordCostEntry(principal, { ...body, orderId: id }, parseIdempotencyKey(req));
    return jsonResponse(entry, { status: 201 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
