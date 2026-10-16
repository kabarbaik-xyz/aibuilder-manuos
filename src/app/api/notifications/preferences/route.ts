import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { handleMutationRoute } from '@/server/http/route-handler';
import { NotificationService } from '@/server/modules/notifications/service';
import { UpdateNotificationPreferencesSchema } from '@/server/modules/notifications/contracts';

export async function GET(req: NextRequest) {
  try {
    return NextResponse.json({ data: await new NotificationService().getPreferences(await requirePrincipal(req)) });
  } catch (error) { return formatErrorResponse(error); }
}

export async function PUT(req: NextRequest) {
  return handleMutationRoute(req, UpdateNotificationPreferencesSchema, (input, { principal, idempotencyKey }) =>
    new NotificationService().updatePreferences(principal, input, idempotencyKey));
}
