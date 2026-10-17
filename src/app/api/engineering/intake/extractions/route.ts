import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse, parseIdempotencyKey, parseJsonBody } from '@/server/http/route-handler';
import { db } from '@/server/db/client';
import { EngineeringIntakeService } from '@/server/modules/engineering/intake';

const service = new EngineeringIntakeService(db);
const RequestSchema = z.object({ text: z.string().trim().min(1).max(20_000) }).strict();

export async function POST(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const { text } = await parseJsonBody(req, RequestSchema);
    const result = await service.extractAndSave(principal, text, parseIdempotencyKey(req));
    return jsonResponse(result, { status: result.data ? 201 : 503 });
  } catch (error) {
    return formatErrorResponse(error);
  }
}
