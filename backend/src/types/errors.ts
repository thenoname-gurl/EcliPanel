export type HttpResult<T = unknown> = {
  data: T;
  status: number;
  headers: Record<string, string>;
};

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code?: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number = 500,
    code?: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Not found', code?: string, details?: Record<string, unknown>) {
    super(message, 404, code, details);
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized', code?: string, details?: Record<string, unknown>) {
    super(message, 401, code, details);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden', code?: string, details?: Record<string, unknown>) {
    super(message, 403, code, details);
    this.name = 'ForbiddenError';
  }
}

export class BadRequestError extends AppError {
  constructor(message: string = 'Bad request', code?: string, details?: Record<string, unknown>) {
    super(message, 400, code, details);
    this.name = 'BadRequestError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Conflict', code?: string, details?: Record<string, unknown>) {
    super(message, 409, code, details);
    this.name = 'ConflictError';
  }
}

export class ValidationError extends AppError {
  public readonly field?: string;

  constructor(
    message: string = 'Validation error',
    field?: string,
    code?: string,
    details?: Record<string, unknown>
  ) {
    super(message, 422, code, details);
    this.name = 'ValidationError';
    this.field = field;
  }
}

export class TooManyRequestsError extends AppError {
  public readonly retryAfter?: number;

  constructor(
    message: string = 'Too many requests',
    retryAfter?: number,
    code?: string,
    details?: Record<string, unknown>
  ) {
    super(message, 429, code, details);
    this.name = 'TooManyRequestsError';
    this.retryAfter = retryAfter;
  }
}

export class InternalServerError extends AppError {
  constructor(
    message: string = 'Internal server error',
    code?: string,
    details?: Record<string, unknown>
  ) {
    super(message, 500, code, details);
    this.name = 'InternalServerError';
  }
}

export class HttpError extends Error {
  public response?: HttpResult<unknown>;

  constructor(message: string, response?: HttpResult<unknown>) {
    super(message);
    this.name = 'HttpError';
    this.response = response;
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

export function isNotFoundError(err: unknown): err is NotFoundError {
  return err instanceof NotFoundError;
}

export function isUnauthorizedError(err: unknown): err is UnauthorizedError {
  return err instanceof UnauthorizedError;
}

export function isForbiddenError(err: unknown): err is ForbiddenError {
  return err instanceof ForbiddenError;
}

export function isHttpError(err: unknown): err is HttpError {
  return err instanceof HttpError;
}

export function getErrorStatusCode(err: unknown): number {
  if (isAppError(err)) {
    return err.statusCode;
  }
  return 500;
}

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'string') {
    return err;
  }
  return 'An unknown error occurred';
}
