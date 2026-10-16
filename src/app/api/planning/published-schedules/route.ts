import { NextRequest } from "next/server";
import { requirePrincipal } from "@/server/auth/auth";
import { formatErrorResponse } from "@/server/http/errors";
import { publishedScheduleService } from "@/server/modules/planning/published-schedules";
import { parseIdempotencyKey, parseJsonBody, jsonResponse } from "@/server/http/route-handler";
import { PublishScheduleSchema } from "@/server/modules/engineering/change-contracts";

export async function GET(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const schedules = await publishedScheduleService.getPublishedSchedules(principal);
    return jsonResponse({ data: schedules });
  } catch (err) {
    return formatErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const idempotencyKey = parseIdempotencyKey(req);
    const body = await parseJsonBody(req, PublishScheduleSchema);
    const result = await publishedScheduleService.publishSchedule(principal, body, idempotencyKey);
    return jsonResponse(result, { status: 201 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
