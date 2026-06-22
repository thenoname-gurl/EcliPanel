import type { BaseHandlerContext } from './handler';

export type ServerSftpInfo = {
  host: string;
  port: number;
  proxied: boolean;
  username?: string;
};

export type ServerAllocationLike = {
  default?: { ip?: string; port?: number | string };
  mappings?: Record<string, Array<number | string>>;
  owners?: Record<string, string | number | undefined>;
  ipv6Address?: string;
  ipv6Ports?: Array<number | string>;
};

export type ServerProcessConfigLike = Record<string, unknown> & {
  startup?: {
    done?: unknown;
    strip_ansi?: boolean;
  };
  stop?: {
    type?: string;
    value?: string;
  };
};

export type ServerAllocationOwners = Record<string, string | number | undefined>;

export type MetricsData = Record<string, unknown>;

export type MetricsRow = {
  timestamp: string;
  metrics: MetricsData;
};

export interface BoostInfo {
  active: boolean;
  percent: number;
  expiresAt: string | null;
  reason: string | null;
}

export interface VirtualResources {
  memory: number;
  disk: number;
  cpu: number;
}

export interface ServerBoostPayload {
  boost: BoostInfo;
  virtualResources: VirtualResources;
}

export interface PlanBoostBody {
  percent: number;
  expiresAt?: string;
  reason?: string | null;
}

export type ServerApp = {
  get: (path: string, handler: (ctx: BaseHandlerContext) => unknown, opts?: unknown) => void;
  post: (path: string, handler: (ctx: BaseHandlerContext) => unknown, opts?: unknown) => void;
  put: (path: string, handler: (ctx: BaseHandlerContext) => unknown, opts?: unknown) => void;
  delete: (path: string, handler: (ctx: BaseHandlerContext) => unknown, opts?: unknown) => void;
  log?: {
    info?: (...args: unknown[]) => void;
    warn?: (...args: unknown[]) => void;
    error?: (...args: unknown[]) => void;
  };
};
