import type { JsonObject, JsonValue } from './common';
import type { User } from '../models/user.entity';
import type { ApiKey } from '../models/apiKey.entity';
import type { OAuthToken } from '../models/oauthToken.entity';
import type { JwtPayload } from './context';
import type { RequestContextLike } from '../utils/url';

export interface HandlerSetContext {
  status: number;
  headers?: Record<string, string>;
  cookie?: Record<string, {
    value: string;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'lax' | 'strict' | 'none';
    path?: string;
    maxAge?: number;
    domain?: string;
    expires?: Date;
  }>;
  header?: (name: string, value: string) => void;
}

export interface HandlerLogContext {
  info?: (msg: string | JsonObject, ...args: unknown[]) => void;
  warn?: (msg: string | JsonObject, ...args: unknown[]) => void;
  error?: (msg: string | JsonObject, ...args: unknown[]) => void;
  debug?: (msg: string | JsonObject, ...args: unknown[]) => void;
}

export interface HandlerJwtContext {
  sign?: (payload: JsonObject, options?: { expiresIn?: string | number }) => string;
  verify?: (token: string) => JwtPayload | Promise<JwtPayload>;
}

export interface HandlerAppContext {
  jwt?: HandlerJwtContext;
  log?: HandlerLogContext;
}

export interface HandlerCookieContext {
  [name: string]: {
    value: string;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'lax' | 'strict' | 'none';
    path?: string;
    maxAge?: number;
    domain?: string;
  };
}

export interface HandlerHeadersContext {
  [key: string]: string | undefined;
  'x-forwarded-proto'?: string;
  'X-Forwarded-Proto'?: string;
  'x-forwarded-for'?: string;
  origin?: string;
  host?: string;
  cookie?: string;
  authorization?: string;
  'x-api-key'?: string;
}

export interface BaseHandlerContext extends RequestContextLike {
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
  params?: Record<string, string | undefined>;
  set: HandlerSetContext;
  ip?: string;
  clientIP?: string;
  t: (key: string, vars?: Record<string, string | number>) => string;
  cookie?: HandlerCookieContext;
  log?: HandlerLogContext;
  app?: HandlerAppContext;
  jwt?: HandlerJwtContext;
  store?: Record<string, unknown>;
  path?: string;
  setCookie?: (name: string, value: string, options?: Record<string, unknown>) => void;
  locale?: string;
}

export interface AuthenticatedHandlerContext extends BaseHandlerContext {
  user: User;
  userPermissions?: string[];
  jwtPayload?: JwtPayload;
}

export interface ApiKeyHandlerContext extends BaseHandlerContext {
  apiKey: ApiKey;
  user?: User;
}

export interface OAuthHandlerContext extends BaseHandlerContext {
  oauthToken?: OAuthToken;
  user?: User;
}

export type HandlerContext =
  | BaseHandlerContext
  | AuthenticatedHandlerContext
  | ApiKeyHandlerContext
  | OAuthHandlerContext;

export function isAuthenticatedContext(
  ctx: HandlerContext
): ctx is AuthenticatedHandlerContext {
  return 'user' in ctx && !!(ctx as AuthenticatedHandlerContext).user;
}

export function hasApiKey(ctx: HandlerContext): ctx is ApiKeyHandlerContext {
  return 'apiKey' in ctx && !!(ctx as ApiKeyHandlerContext).apiKey;
}

export function safeBody<T extends Record<string, unknown>>(
  body: unknown,
  defaults?: Partial<T>
): T {
  if (typeof body === 'object' && body !== null) {
    return { ...(defaults as object), ...body } as T;
  }
  return { ...(defaults as object) } as T;
}

export function getStringParam(
  params: Record<string, string | undefined> | undefined,
  key: string,
  defaultValue?: string
): string | undefined {
  if (!params) return defaultValue;
  const value = params[key];
  return value !== undefined ? value : defaultValue;
}

export function getNumberParam(
  params: Record<string, string | undefined> | undefined,
  key: string,
  defaultValue?: number
): number | undefined {
  if (!params) return defaultValue;
  const value = params[key];
  if (value === undefined) return defaultValue;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}
