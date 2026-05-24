import type { User } from '../models/user.entity';
import type { AppLikeFor, RequestContext } from './request';

export type EndpointInfo = { base: string; apiKey?: string; id?: string };

export type ModelLike = {
  id?: number | string;
  name?: string;
  endpoint?: string;
  apiKey?: string;
  endpoints?: Array<Record<string, unknown>>;
  config?: Record<string, unknown>;
};

export type AIContext = RequestContext & {
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  user?: User | null;
  method?: string;
  raw?: BodyInit | null;
};

export type AIApp = AppLikeFor<AIContext> & {
  all: (path: string, handler: (ctx: AIContext) => unknown, opts?: unknown) => void;
};