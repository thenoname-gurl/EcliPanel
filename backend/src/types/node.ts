import type { BaseHandlerContext } from './handler';
import type { Organisation } from '../models/organisation.entity';

export type NodeApp = {
  get: (path: string, handler: (ctx: BaseHandlerContext) => unknown, opts?: unknown) => void;
  post: (path: string, handler: (ctx: BaseHandlerContext) => unknown, opts?: unknown) => void;
  put: (path: string, handler: (ctx: BaseHandlerContext) => unknown, opts?: unknown) => void;
  delete: (path: string, handler: (ctx: BaseHandlerContext) => unknown, opts?: unknown) => void;
  log?: {
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
};

export interface CreateNodeBody {
  name?: string;
  url?: string;
  token?: string;
  nodeId?: string;
  nodeType?: string;
  useSSL?: unknown;
  allowedOrigin?: string;
  sftpPort?: unknown;
  sftpProxyPort?: unknown;
  fqdn?: string;
  ipv6Subnet?: string;
  ipv6ExcludedPorts?: unknown;
  ipv6ReservedCount?: unknown;
  backendWingsUrl?: string;
  portRangeStart?: unknown;
  portRangeEnd?: unknown;
  deploymentsDisabled?: unknown;
  deploymentNotice?: string;
}

export interface UpdateNodeBody {
  nodeId?: string;
  url?: string;
  nodeType?: string;
  orgId?: unknown;
  name?: string;
  portRangeStart?: unknown;
  portRangeEnd?: unknown;
  defaultIp?: string;
  ipv6Subnet?: string;
  ipv6ExcludedPorts?: unknown;
  ipv6ReservedCount?: unknown;
  fqdn?: string;
  cost?: unknown;
  memory?: unknown;
  disk?: unknown;
  cpu?: unknown;
  serverLimit?: unknown;
  useSSL?: unknown;
  allowedOrigin?: string;
  sftpPort?: unknown;
  sftpProxyPort?: unknown;
  backendWingsUrl?: string;
  deploymentsDisabled?: unknown;
  deploymentNotice?: string;
}

export type RebootOperation = {
  id: string;
  nodeId: number;
  nodeName: string;
  status: string;
  progress: number;
  message: string;
  totalServers: number;
  onlineCount: number;
  servers: Array<{
    uuid: string;
    name: string;
    stop: string;
    kill?: string;
    start: string;
  }>;
  killedCount: number;
  createdAt: number;
};
