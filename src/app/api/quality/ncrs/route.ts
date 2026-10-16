import { NextRequest } from "next/server";
import { requirePrincipal } from "@/server/auth/auth";
import { formatErrorResponse } from "@/server/http/errors";
import { jsonResponse } from "@/server/http/route-handler";
import { ncrService } from "@/server/modules/quality/ncr";

export async function GET(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const ncrs = await ncrService.listNcrs(principal);
    return jsonResponse({ data: ncrs });
  } catch (err) {
    return formatErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const body = await req.json();
    const ncr = await ncrService.createNcr(principal, body);
    return jsonResponse({ data: ncr }, { status: 201 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
