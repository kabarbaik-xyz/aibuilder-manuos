import { NextRequest } from "next/server";
import { requirePrincipal } from "@/server/auth/auth";
import { formatErrorResponse } from "@/server/http/errors";
import { jsonResponse } from "@/server/http/route-handler";
import { ncrService } from "@/server/modules/quality/ncr";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const principal = await requirePrincipal(req);
    const ncr = await ncrService.closeNcr(principal, id);
    return jsonResponse({ data: ncr });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
