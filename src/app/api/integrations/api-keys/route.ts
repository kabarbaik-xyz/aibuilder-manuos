import { NextRequest } from "next/server";
import { requirePrincipal } from "@/server/auth/auth";
import { formatErrorResponse } from "@/server/http/errors";
import { jsonResponse } from "@/server/http/route-handler";
import { apiKeyService } from "@/server/modules/integrations/api-keys";

export async function GET(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const keys = await apiKeyService.listApiKeys(principal);
    return jsonResponse({ data: keys });
  } catch (err) {
    return formatErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const body = await req.json();
    const result = await apiKeyService.createApiKey(principal, body);
    return jsonResponse({ data: result }, { status: 201 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
