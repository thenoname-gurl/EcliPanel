import type { Ticket } from '../models/ticket.entity';
import type { User } from '../models/user.entity';
import type { AppLikeFor, RequestContext } from './request';

export type TicketContext = RequestContext & {
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  user?: (User & { orgs?: Array<{ name?: string | null }> }) | null;
  apiKey?: { type?: string };
};

export type TicketApp = AppLikeFor<TicketContext>;

export type TicketMessage = NonNullable<Ticket['messages']>[number];
export type TicketLike = Ticket & { messages?: unknown };

export type EndpointInfo = { base: string; apiKey?: string; id?: string };

export type ModelLike = {
  id?: number | string;
  name?: string;
  endpoint?: string;
  apiKey?: string;
  endpoints?: Array<Record<string, unknown>>;
  config?: Record<string, unknown>;
};
