import { NextResponse } from 'next/server';
import { DomainError } from '@/domain/errors';
import { randomUUID } from 'crypto';

export function formatErrorResponse(err: unknown, requestId?: string): NextResponse {
  const reqId = requestId || randomUUID();

  if (err instanceof DomainError) {
    return NextResponse.json(
      {
        error: {
          code: err.code,
          message: err.message,
          ...(err.fieldErrors ? { fieldErrors: err.fieldErrors } : {}),
        },
        requestId: reqId,
        retryable: err.retryable,
      },
      { status: err.statusCode }
    );
  }

  const message = err instanceof Error ? err.message : 'Internal server error';
  console.error(`[Unhandled Error] RequestID=${reqId}:`, err);

  return NextResponse.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : message,
      },
      requestId: reqId,
      retryable: false,
    },
    { status: 500 }
  );
}
