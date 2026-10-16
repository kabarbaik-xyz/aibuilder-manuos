import { NextRequest } from "next/server";
import { requirePrincipal } from "@/server/auth/auth";
import { formatErrorResponse } from "@/server/http/errors";
import { jsonResponse } from "@/server/http/route-handler";
import { changeOrderService } from "@/server/modules/engineering/change-orders";
import { db } from "@/server/db/client";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const principal = await requirePrincipal(req);
    const requests = await db.orderChangeRequest.findMany({
      where: { workspaceId: principal.workspaceId, orderId: id },
      orderBy: { createdAt: "desc" },
    });
    return jsonResponse({ data: requests });
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
    const result = await changeOrderService.createOrderChangeRequest(principal, {
      orderId: id,
      ...body,
    });
    return jsonResponse({ data: result }, { status: 201 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
