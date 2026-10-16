import { NextRequest } from "next/server";
import { requirePrincipal } from "@/server/auth/auth";
import { formatErrorResponse } from "@/server/http/errors";
import { jsonResponse } from "@/server/http/route-handler";
import { webhookService } from "@/server/modules/integrations/webhooks";
import { db } from "@/server/db/client";

export async function GET(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const endpoints = await db.webhookEndpoint.findMany({
      where: { workspaceId: principal.workspaceId },
      orderBy: { createdAt: "desc" },
    });
    return jsonResponse({ data: endpoints });
  } catch (err) {
    return formatErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const body = await req.json();
    const endpoint = await webhookService.registerEndpoint(principal, body);
    return jsonResponse({ data: endpoint }, { status: 201 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
