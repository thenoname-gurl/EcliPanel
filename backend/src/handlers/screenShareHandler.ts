import * as crypto from 'crypto';
import { AppDataSource } from '../config/typeorm';
import { OfficeDocument } from '../models/officeDocument.entity';
import { authenticate } from '../middleware/auth';
import { verifyAnyToken } from '../utils/pqJwt';

interface ScreenViewerRef {
  ws: any;
  name?: string;
  joinedAt: number;
}

interface ScreenSession {
  id: string;
  token: string;
  docId: number | null;
  docName: string;
  docType: string;
  hostId: number;
  hostName: string;
  createdAt: number;
  endedAt: number | null;
  endReason?: string;
  hostWs: any | null;
  viewers: Map<string, ScreenViewerRef>;
}

const sessions = new Map<string, ScreenSession>();
const sessionsByToken = new Map<string, string>();

const SESSION_GRACE_MS = 60 * 1000;
const HOST_CONNECT_TIMEOUT_MS = 10 * 60 * 1000;

function safeSend(ws: any, payload: string): boolean {
  try {
    ws.send(payload);
    return true;
  } catch {
    return false;
  }
}

function sessionState(s: ScreenSession, opts: { includeViewerIds?: boolean } = {}) {
  const state: any = {
    type: 'screen_state',
    token: s.token,
    title: s.docName,
    docType: s.docType,
    hostName: s.hostName,
    startedAt: s.createdAt,
    hostOnline: Boolean(s.hostWs),
    ended: Boolean(s.endedAt),
    participants: s.viewers.size,
  };
  if (opts.includeViewerIds) {
    state.viewerIds = Array.from(s.viewers.keys());
  }
  return state;
}

function broadcastState(s: ScreenSession, includeViewerIds = true): void {
  const viewers: ScreenViewerRef[] = Array.from(s.viewers.values());
  const state = sessionState(s, { includeViewerIds });
  const payload = JSON.stringify(state);

  if (s.hostWs) safeSend(s.hostWs, payload);
  for (const v of viewers) safeSend(v.ws, payload);
}

function getByToken(token: string): ScreenSession | undefined {
  const id = sessionsByToken.get(token);
  if (!id) return undefined;
  return sessions.get(id);
}

function getByWs(ws: any): { session?: ScreenSession; role?: string } {
  const token = ws.data?.token;
  if (!token) return {};
  const session = getByToken(token);
  if (!session) return {};
  return { session, role: ws.data?.role };
}

function endSession(s: ScreenSession, reason: string): void {
  if (s.endedAt) return;
  s.endedAt = Date.now();
  s.endReason = reason;
  s.hostWs = null;

  const msg = JSON.stringify({ type: 'screen_ended', reason });
  for (const v of Array.from(s.viewers.values())) safeSend(v.ws, msg);
  s.viewers.clear();

  broadcastState(s, false);

  const token = s.token;
  const id = s.id;
  setTimeout(() => {
    sessions.delete(id);
    sessionsByToken.delete(token);
  }, SESSION_GRACE_MS);
}

function leavePeer(ws: any): void {
  const token = ws.data?.token;
  if (!token) return;
  const session = getByToken(token);
  if (!session) return;

  const role = ws.data?.role;

  if (role === 'host') {
    if (session.hostWs?.data?.peerId === ws.data?.peerId) {
      session.hostWs = null;
      broadcastState(session, true);
    }
    return;
  }

  const peerId = ws.data?.peerId;
  if (peerId && session.viewers.delete(peerId)) {
    broadcastState(session, true);
  }
}

function cookieUserId(ws: any): number {
  try {
    const cookieName = process.env.JWT_COOKIE_NAME || 'token';
    const cookie = ws.request?.headers?.get?.('cookie') || '';
    const parts = String(cookie)
      .split(';')
      .map((s: string) => s.trim());
    const pair = parts.find((p) => p.startsWith(cookieName + '='));
    if (pair) {
      const decoded = verifyAnyToken(pair.split('=')[1]) as any;
      if (decoded?.userId) return Number(decoded.userId) || 0;
    }
  } catch {}
  return 0;
}

function handleScreenMessage(ws: any, raw: any): void {
  let data: any;
  try {
    data = typeof raw === 'string' ? JSON.parse(raw) : raw instanceof ArrayBuffer ? JSON.parse(Buffer.from(raw).toString('utf8')) : raw;
  } catch {
    return;
  }
  if (!data || typeof data !== 'object' || typeof data.type !== 'string') return;

  const token = ws.data?.token;
  const session = token ? getByToken(token) : undefined;

  switch (data.type) {
    case 'screen_join': {
      if (!session) {
        safeSend(ws, JSON.stringify({ type: 'screen_error', message: 'notFound' }));
        return;
      }
      let role: 'host' | 'viewer' = data.role === 'host' ? 'host' : 'viewer';

      if (role === 'host') {
        const uid = cookieUserId(ws);
        if (!uid || uid !== session.hostId) {
          safeSend(ws, JSON.stringify({ type: 'screen_error', message: 'notHost' }));
          return;
        }
        if (session.hostWs && session.hostWs.data?.peerId !== ws.data.peerId) {
          ws.data.role = 'viewer';
          role = 'viewer';
        }
      }

      ws.data.role = role;
      ws.data.name = data.name ? String(data.name).slice(0, 60) : '';

      if (role === 'host') {
        session.hostWs = ws;
        session.hostName = String(data.name || session.hostName).slice(0, 60);
      } else {
        session.viewers.set(ws.data.peerId, { ws, name: ws.data.name, joinedAt: Date.now() });
      }

      broadcastState(session, true);
      const ack = sessionState(session, { includeViewerIds: true });
      ack.peerId = ws.data.peerId;
      safeSend(ws, JSON.stringify(ack));
      return;
    }

    case 'screen_leave': {
      leavePeer(ws);
      return;
    }

    case 'screen_ping': {
      safeSend(ws, JSON.stringify({ type: 'screen_pong' }));
      return;
    }

    case 'screen_end': {
      if (!session) return;
      if (ws.data?.role !== 'host' || session.hostWs?.data?.peerId !== ws.data?.peerId) return;
      endSession(session, 'host_requested');
      return;
    }

    case 'screen_offer': {
      if (!session) return;
      if (ws.data?.role === 'host') return;
      if (!session.hostWs) return;
      const viewerId = ws.data.peerId;
      safeSend(
        session.hostWs,
        JSON.stringify({ type: 'screen_offer', viewerId, sdp: data.sdp || null })
      );
      return;
    }

case 'screen_answer': {
      if (!session) return;
      if (ws.data?.role !== 'host' || session.hostWs?.data?.peerId !== ws.data?.peerId) return;
      const viewer = session.viewers.get(String(data.viewerId || ''));
      if (viewer) {
        safeSend(viewer.ws, JSON.stringify({ type: 'screen_answer', sdp: data.sdp || null }));
      }
      return;
    }

    case 'screen_ice': {
      if (!session) return;
      if (ws.data?.role === 'host') {
        const viewer = session.viewers.get(String(data.to || ''));
        if (viewer) {
          safeSend(viewer.ws, JSON.stringify({ type: 'screen_ice', candidate: data.candidate || null }));
        }
      } else {
        if (session.hostWs) {
          safeSend(
            session.hostWs,
            JSON.stringify({ type: 'screen_ice', viewerId: ws.data.peerId, candidate: data.candidate || null })
          );
        }
      }
      return;
    }

    default:
      return;
  }
}

setInterval(() => {
  const now = Date.now();
  for (const s of Array.from(sessions.values())) {
    if (s.endedAt) {
      if (now - s.endedAt > SESSION_GRACE_MS) {
        sessions.delete(s.id);
        sessionsByToken.delete(s.token);
      }
      continue;
    }
    if (!s.hostWs && now - s.createdAt > HOST_CONNECT_TIMEOUT_MS) {
      sessions.delete(s.id);
      sessionsByToken.delete(s.token);
    }
  }
}, 60 * 1000);

export function screenShareRoutes(app: any, prefix = ''): void {
  app.post(
    prefix + '/screen-share/sessions',
    async (ctx: any) => {
      const body = (await ctx.body) as any;
      const docId = body?.docId ? Number(body.docId) || null : null;

      let docName = String(body?.title || body?.name || '').trim();
      let docType = String(body?.docType || 'document');
      if (docId) {
        try {
          const doc = await AppDataSource.getRepository(OfficeDocument).findOneBy({ id: docId });
          if (doc) {
            docName = doc.name || docName;
            docType = doc.type || docType;
          }
        } catch {}
      }
      const title = docName || 'Screen share';

      const id = crypto.randomUUID();
      const token = crypto.randomBytes(12).toString('hex');
      const hostName = String(ctx.user?.displayName || ctx.user?.firstName || `User ${ctx.user?.id || '?'}`).slice(0, 60);

      const session: ScreenSession = {
        id,
        token,
        docId,
        docName: title,
        docType,
        hostId: ctx.user.id,
        hostName,
        createdAt: Date.now(),
        endedAt: null,
        hostWs: null,
        viewers: new Map(),
      };
      sessions.set(id, session);
      sessionsByToken.set(token, id);

      const base = (process.env.PANEL_URL || process.env.FRONTEND_URL || 'https://ecli.app')
        .split(',')[0]
        .replace(/\/+$/, '');
      return {
        id,
        token,
        url: `${base}/screen/${token}`,
        title,
        docType,
      };
    },
    {
      beforeHandle: [authenticate],
      detail: { tags: ['Office'], summary: 'Create a screen-share session' },
    }
  );

  app.get(
    prefix + '/screen-share/sessions/mine',
    async (ctx: any) => {
      const mine = Array.from(sessions.values())
        .filter((s) => s.hostId === ctx.user.id)
        .map((s) => ({ id: s.id, token: s.token, title: s.docName, docType: s.docType, hostOnline: Boolean(s.hostWs), ended: Boolean(s.endedAt) }));
      return mine;
    },
    {
      beforeHandle: [authenticate],
      detail: { tags: ['Office'], summary: 'List the caller’s screen-share sessions' },
    }
  );

  app.delete(
    prefix + '/screen-share/sessions/:id',
    async (ctx: any) => {
      const session = sessions.get(String(ctx.params?.id));
      if (!session) {
        ctx.set.status = 404;
        return { error: 'Session not found' };
      }
      if (session.hostId !== ctx.user.id) {
        ctx.set.status = 403;
        return { error: 'Not your session' };
      }
      endSession(session, 'host_requested');
      return { ok: true };
    },
    {
      beforeHandle: [authenticate],
      detail: { tags: ['Office'], summary: 'End a screen-share session' },
    }
  );

  app.get(
    prefix + '/screen-share/public/:token',
    async (ctx: any) => {
      const session = getByToken(String(ctx.params?.token));
      if (!session) {
        ctx.set.status = 404;
        return { error: 'Session not found' };
      }
      const state = sessionState(session);
      delete state.type;
      return state;
    },
    { detail: { tags: ['Office'], summary: 'Public screen-share session state (for viewer page)' } }
  );

  app.ws(prefix + '/screen-share/signal/:token', {
    open(ws: any) {
      ws.data ??= {};
      let token = '';
      try {
        const path = new URL(ws.request?.url || '/').pathname;
        token = decodeURIComponent(path.split('/').pop() || '');
      } catch {}
      ws.data.token = token;
      ws.data.peerId = crypto.randomBytes(5).toString('hex');
      ws.data.role = 'viewer';
    },
    message(ws: any, message: any) {
      try {
        handleScreenMessage(ws, message);
      } catch (err) {
        console.error('[screen-share] unhandled message error:', err);
      }
    },
    close(ws: any) {
      leavePeer(ws);
    },
    error(ws: any, err: any) {
      console.error('[screen-share] WS error:', err?.message || err);
      leavePeer(ws);
    },
  });
}