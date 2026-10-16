import { NextRequest } from "next/server";
import { requirePrincipal } from "@/server/auth/auth";
import { formatErrorResponse } from "@/server/http/errors";
import { executionService } from "@/server/modules/execution/service";
import { jsonResponse } from "@/server/http/route-handler";

export async function GET(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const profile = await executionService.getTechnicianProfile(principal);
    return jsonResponse({ data: profile });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
