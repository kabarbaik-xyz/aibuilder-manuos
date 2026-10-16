import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { NotificationService } from '@/server/modules/notifications/service';
import { parseJsonBody } from '@/server/http/route-handler';

const notificationActionSchema = z.object({
  action: z.enum(['MARK_READ', 'MARK_ALL_READ']),
  notificationId: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const service = new NotificationService();
    const url = new URL(req.url);
    const unreadOnly = url.searchParams.get('unread') === 'true';
    const parsedLimit = z.coerce.number().int().min(1).max(100).safeParse(url.searchParams.get('limit') ?? '50');
    if (!parsedLimit.success) {
      return NextResponse.json({ error: 'limit must be an integer from 1 to 100' }, { status: 400 });
    }
    const limit = parsedLimit.data;

    const [items, unreadCount, delivery] = await Promise.all([
      service.listNotifications(principal, { unreadOnly, limit }),
      service.getUnreadCount(principal),
      service.getDeliverySummary(principal),
    ]);

    return NextResponse.json({
      data: items,
      meta: { unreadCount, delivery },
    });
  } catch (err) {
    return formatErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const service = new NotificationService();
    const body = await parseJsonBody(req, notificationActionSchema);

    if (body.action === 'MARK_ALL_READ') {
      await service.markAllAsRead(principal);
      return NextResponse.json({ success: true });
    } else {
      if (!body.notificationId) {
        return NextResponse.json({ error: 'notificationId required for MARK_READ' }, { status: 400 });
      }
      const updated = await service.markAsRead(principal, body.notificationId);
      return NextResponse.json({ data: updated });
    }
  } catch (err) {
    return formatErrorResponse(err);
  }
}
