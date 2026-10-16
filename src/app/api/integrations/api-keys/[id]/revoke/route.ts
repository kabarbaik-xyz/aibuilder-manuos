import { NextRequest } from "next/server";
import { requirePrincipal } from "@/server/auth/auth";
import { formatErrorResponse } from "@/server/http/errors";
import { jsonResponse } from "@/server/http/route-handler";
import { apiKeyService } from "@/server/modules/integrations/api-keys";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const principal = await requirePrincipal(req);
    await apiKeyService.revokeApiKey(principal, id);
    return jsonResponse({ success: true });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
