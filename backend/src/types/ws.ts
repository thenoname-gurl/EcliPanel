import type { RequestContext } from './request';
import type WebSocket from 'ws';
import type { ApiKey } from '../models/apiKey.entity';
import type { User } from '../models/user.entity';
import type { RequestHeaderLike } from './request';

export interface RawRequest {
  params?: Record<string, string | undefined>;
  query?: Record<string, unknown>;
  headers?: RequestHeaderLike | Record<string, string | undefined>;
  url?: string;
  user?: User | null;
  apiKey?: ApiKey | null;
  set?: { status?: number };
  cookie?: Record<string, { value?: string }>;
  log?: { info?: (...args: unknown[]) => void };
  t?: (key: string) => string;
}

export type WsSocket = {
  send: (data: string) => void;
  close: () => void;
  on: (event: 'close' | 'error' | 'message', listener: (...args: unknown[]) => void) => void;
};

export type SocUpdatePayload = Record<string, unknown> & { serverId?: string };

export type AiUsagePayload = Record<string, unknown> & { userId?: number; organisationId?: number | string };

export type AuthRequest = RequestContext & RawRequest;

export function wsRawDataToText(data: WebSocket.RawData): string {
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) return Buffer.concat(data).toString();
  if (data instanceof Buffer) return data.toString();
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString();
  return Buffer.from(data).toString();
}

export default {};
