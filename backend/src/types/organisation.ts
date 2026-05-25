import type { AuthenticatedHandlerContext } from './handler';

export interface DnsRecordBody {
  name: string;
  type: string;
  ttl: number;
  content: string;
  proxied: boolean;
}

export interface OrgUpdateBody extends Record<string, unknown> {
  name?: string;
  portalTier?: string;
}

export interface AddUserBody extends Record<string, unknown> {
  userId?: number;
  email?: string;
  orgRole?: string;
}

export interface CloudflareRecord {
  id?: string;
  name?: string;
  type?: string;
  content?: string;
  ttl?: number;
  proxied?: boolean;
}

export interface SanitizedUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  orgRole: string;
}

export interface SanitizedInvite {
  id: number;
  email: string;
  accepted: boolean;
}

type OrganisationRouteHandler = (ctx: AuthenticatedHandlerContext) => unknown;

export type OrganisationApp = {
  get: (path: string, handler: OrganisationRouteHandler, opts?: unknown) => void;
  post: (path: string, handler: OrganisationRouteHandler, opts?: unknown) => void;
  put: (path: string, handler: OrganisationRouteHandler, opts?: unknown) => void;
  delete: (path: string, handler: OrganisationRouteHandler, opts?: unknown) => void;
  log?: { error: (...args: unknown[]) => void };
};