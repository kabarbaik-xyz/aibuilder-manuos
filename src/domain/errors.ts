export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
    public readonly fieldErrors?: Record<string, string>,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = 'Authentication required') {
    super('UNAUTHORIZED', message, 401);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = 'Access denied') {
    super('FORBIDDEN', message, 403);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends DomainError {
  constructor(message = 'Resource not found') {
    super('NOT_FOUND', message, 404);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends DomainError {
  constructor(message = 'Conflict / stale version detected', code = 'CONFLICT', retryable = true) {
    super(code, message, 409, undefined, retryable);
    this.name = 'ConflictError';
  }
}

export class ValidationError extends DomainError {
  constructor(message = 'Validation error', fieldErrors?: Record<string, string>) {
    super('VALIDATION_ERROR', message, 422, fieldErrors);
    this.name = 'ValidationError';
  }
}

export class BadRequestError extends DomainError {
  constructor(message = 'Bad request', fieldErrors?: Record<string, string>) {
    super('BAD_REQUEST', message, 400, fieldErrors);
    this.name = 'BadRequestError';
  }
}
