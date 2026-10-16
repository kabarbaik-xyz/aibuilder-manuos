import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse, parseIdempotencyKey, parseJsonBody } from '@/server/http/route-handler';
import { PassportService } from '@/server/modules/quality/passport';
import { PublishPassportSchema } from '@/server/modules/quality/passport-publication';
import type { z } from 'zod';

const passportService = new PassportService();

export async function POST(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const body = await parseJsonBody<z.infer<typeof PublishPassportSchema>>(req, PublishPassportSchema);
    const result = await passportService.publishPassport(principal, body, parseIdempotencyKey(req));

    return jsonResponse(result, { status: 201 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
