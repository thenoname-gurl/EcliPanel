import type { User } from '../models/user.entity';
import type { ApiKey } from '../models/apiKey.entity';
import type { OAuthToken } from '../models/oauthToken.entity';
import type { JsonObject } from './common';

export interface AuthContext {
  user?: User;
  apiKey?: ApiKey;
  oauthToken?: OAuthToken;
  jwtPayload?: JwtPayload;
  userPermissions?: string[];
}

export interface JwtPayload {
  userId: number;
  sessionId: string;
  iat?: number;
  exp?: number;
  [key: string]: unknown;
}

export interface RequestContext extends AuthContext {
  ip?: string;
  clientIP?: string;
  t: (key: string, vars?: Record<string, string | number>) => string;
  set: {
    status: number;
    headers?: Record<string, string>;
  };
  params: Record<string, string>;
  query: Record<string, string | string[]>;
  request: Request;
  path?: string;
  store?: {
    clientIP?: string;
    [key: string]: unknown;
  };
  cookie?: Record<string, { value: string }>;
  headers?: Record<string, string>;
}

export interface ErrorResponse {
  error: string;
  details?: JsonObject;
  code?: string;
}

export type VerifyTempTokenResult = JwtPayload | { error: string };

export interface SuccessResponse<T = JsonObject> {
  data: T;
  message?: string;
}

export type ApiResponse<T = JsonObject> = SuccessResponse<T> | ErrorResponse;

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}

export interface AuthenticatedRequestContext extends RequestContext {
  user: User;
}

export interface AdminRequestContext extends AuthenticatedRequestContext {
  userPermissions: string[];
}

export function isErrorResponse(response: unknown): response is ErrorResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'error' in response &&
    typeof (response as ErrorResponse).error === 'string'
  );
}

export function isSuccessResponse<T = JsonObject>(
  response: unknown
): response is SuccessResponse<T> {
  return (
    typeof response === 'object' &&
    response !== null &&
    'data' in response &&
    !('error' in response)
  );
}
