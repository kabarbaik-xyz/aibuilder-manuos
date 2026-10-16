import { NextRequest } from "next/server";
import { requirePrincipal } from "@/server/auth/auth";
import { formatErrorResponse } from "@/server/http/errors";
import { jsonResponse } from "@/server/http/route-handler";
import { materialSubstituteService } from "@/server/modules/engineering/substitutes";

export async function GET(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const itemId = req.nextUrl.searchParams.get("itemId") || undefined;
    const subs = await materialSubstituteService.listMaterialSubstitutes(principal, itemId);
    return jsonResponse({ data: subs });
  } catch (err) {
    return formatErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const body = await req.json();
    const sub = await materialSubstituteService.registerMaterialSubstitute(principal, body);
    return jsonResponse({ data: sub }, { status: 201 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
