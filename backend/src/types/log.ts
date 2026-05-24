import type { User } from '../models/user.entity';
import type { AppLikeFor, RequestContext } from './request';

export type LogContext = RequestContext & {
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  user?: User | null;
};

export type LogApp = AppLikeFor<LogContext> & {
  patch: (path: string, handler: (ctx: LogContext) => unknown, opts?: unknown) => void;
};