import type { User } from '../models/user.entity';

export type RequestHeaderLike = { get?: (name: string) => string | null } & Record<string, unknown>;

export type RequestContext = {
  headers?: RequestHeaderLike | Record<string, string>;
  params?: Record<string, string>;
  body?: unknown;
  user?: User | null;
  set?: { status?: number; headers?: Record<string, string> };
  request?: { ip?: string; headers?: RequestHeaderLike | Record<string, string> };
  ip?: string;
  t?: (s: string) => string;
  locale?: string;
};

export type RouteMethodFor<Ctx extends RequestContext = RequestContext> = (
  path: string,
  handler: (ctx: Ctx) => unknown,
  opts?: unknown
) => void;

export type AppLikeFor<Ctx extends RequestContext = RequestContext> = {
  log?: { error?: (...args: unknown[]) => void };
  get: RouteMethodFor<Ctx>;
  post: RouteMethodFor<Ctx>;
  put: RouteMethodFor<Ctx>;
  delete: RouteMethodFor<Ctx>;
} & Record<string, unknown>;

export type RouteMethod = RouteMethodFor<RequestContext>;

export type AppLike = AppLikeFor<RequestContext>;
