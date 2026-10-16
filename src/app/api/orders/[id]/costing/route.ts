import { NextRequest } from "next/server";
import { requirePrincipal } from "@/server/auth/auth";
import { formatErrorResponse } from "@/server/http/errors";
import { jsonResponse, parseJsonBody } from "@/server/http/route-handler";
import { jobCostingService } from "@/server/modules/costing/service";

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
    const body = await req.json();
    const entry = await jobCostingService.recordCostEntry(principal, {
      orderId: id,
      ...body,
    });
    return jsonResponse({ data: entry }, { status: 201 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
