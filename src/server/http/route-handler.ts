import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { BadRequestError } from '@/domain/errors';
import { formatErrorResponse } from './errors';
import { Principal } from '../auth/principal';
import { requirePrincipal } from '../auth/auth';

const MAX_BODY_BYTES = 1024 * 1024; // 1MB limit

export interface MutationContext {
  principal: Principal;
  requestId: string;
  idempotencyKey: string;
  expectedVersion?: number;
}

export function parseIdempotencyKey(req: NextRequest): string {
  const headerKey = req.headers.get('idempotency-key') || req.headers.get('x-idempotency-key');
  if (headerKey && headerKey.trim().length > 0) {
    return headerKey.trim();
  }
  return randomUUID();
}

export async function parseJsonBody<T = any>(req: NextRequest, schema: z.ZodType<any, any, any>): Promise<T> {
  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) {
    throw new BadRequestError('Request body exceeds maximum size limit of 1MB');
  }

  let raw: any;
  try {
    raw = await req.json();
  } catch {
    throw new BadRequestError('Malformed JSON payload');
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join('.') || 'root';
      fieldErrors[path] = issue.message;
    }
    throw new BadRequestError('Validation failed for request payload', fieldErrors);
  }

  return result.data as T;
}

export function jsonResponse(data: any, init?: ResponseInit): NextResponse {
  const body = JSON.stringify(data, (_, v) => (typeof v === 'bigint' ? v.toString() : v));
  return new NextResponse(body, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...init?.headers,
    },
  });
}

export async function handleMutationRoute<TInput, TOutput>(
  req: NextRequest,
  schema: z.ZodType<TInput>,
  handler: (input: TInput, ctx: MutationContext) => Promise<TOutput>
): Promise<NextResponse> {
  const requestId = randomUUID();

  try {
    // 1. Authenticate principal
    const principal = await requirePrincipal(req);

    // 2. Parse idempotency key & optional expected version
    const idempotencyKey = parseIdempotencyKey(req);

    // 3. Parse input
    const input = await parseJsonBody(req, schema);

    // 4. Extract expected version if present on input
    const expectedVersion =
      typeof (input as any)?.expectedVersion === 'number'
        ? (input as any).expectedVersion
        : undefined;

    // 5. Execute handler
    const result = await handler(input, {
      principal,
      requestId,
      idempotencyKey,
      expectedVersion,
    });

    return jsonResponse(result, {
      status: 200,
      headers: {
        'x-request-id': requestId,
      },
    });
  } catch (err) {
    return formatErrorResponse(err, requestId);
  }
}
