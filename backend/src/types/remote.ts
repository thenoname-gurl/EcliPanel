import type { Node } from '../models/node.entity';
import type { AppLikeFor, RequestContext } from './request';

export type WingsHeadersLike = Record<string, string | string[] | undefined> & {
  get?: (name: string) => string | null;
};

export type WingsContext = RequestContext & {
  wingNode?: Node | null;
  query?: Record<string, unknown>;
  body?: unknown;
  params?: Record<string, string>;
  app?: { log?: { warn?: (...args: unknown[]) => void; error?: (...args: unknown[]) => void; info?: (...args: unknown[]) => void } };
  request?: { headers?: WingsHeadersLike };
  raw?: BodyInit | null;
  method?: string;
  headers?: Record<string, string>;
};

export type WingsApp = AppLikeFor<WingsContext> & {
  log?: {
    warn?: (...args: unknown[]) => void;
    error?: (...args: unknown[]) => void;
    info?: (...args: unknown[]) => void;
  };
};

export type AllocationLike = {
  mappings?: Record<string, Array<number | string>>;
  dedicatedIps?: Array<{ ip?: string }>;
  fqdns?: Record<string, string>;
  default?: { ip?: string; port?: number | string };
  force_outgoing_ip?: boolean;
};

export type RemoteNodeOverrides = { portRangeEnd?: number; ipv6ExcludedPorts?: string };