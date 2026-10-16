import { NextRequest } from "next/server";
import { requirePrincipal } from "@/server/auth/auth";
import { formatErrorResponse } from "@/server/http/errors";
import { jsonResponse } from "@/server/http/route-handler";
import { changeOrderService } from "@/server/modules/engineering/change-orders";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const principal = await requirePrincipal(req);
    const body = await req.json().catch(() => ({}));
    const result = await changeOrderService.approveAndApplyECO(principal, id, body);
    return jsonResponse({ data: result });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
