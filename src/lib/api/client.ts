export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
    public readonly fieldErrors?: Record<string, string>,
    public readonly requestId?: string,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiRequest<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  // Generate an idempotency key for mutations if not provided
  if (
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(options.method?.toUpperCase() || '') &&
    !headers.has('idempotency-key') &&
    !headers.has('x-idempotency-key')
  ) {
    headers.set('idempotency-key', crypto.randomUUID());
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    if (isJson && payload?.error) {
      throw new ApiError(
        payload.error.code || 'API_ERROR',
        payload.error.message || 'Request failed',
        res.status,
        payload.error.fieldErrors,
        payload.requestId,
        payload.retryable ?? false
      );
    }
    throw new ApiError(
      `HTTP_${res.status}`,
      typeof payload === 'string' && payload ? payload : `Request failed with status ${res.status}`,
      res.status
    );
  }

  return payload as T;
}
