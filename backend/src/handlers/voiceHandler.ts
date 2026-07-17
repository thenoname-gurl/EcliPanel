import { AppDataSource } from '../config/typeorm';
import { VoiceRoom } from '../models/voiceRoom.entity';
import { optionalAuth } from '../middleware/auth';
import * as crypto from 'crypto';

interface PeerState {
  ws: any;
  peerId: string;
  slug: string;
  isMuted: boolean;
  isDeafened: boolean;
  hasVideo: boolean;
  isScreenSharing: boolean;
  lastSeen: number;
}

const rooms = new Map<string, Map<string, PeerState>>();

function randomSlug(): string {
  return crypto.randomBytes(4).toString('hex');
}

function getRoomPeers(slug: string): object[] {
  const room = rooms.get(slug);
  if (!room) return [];
  return Array.from(room.values()).map(p => ({
    peerId: p.peerId,
    isMuted: p.isMuted,
    isDeafened: p.isDeafened,
    hasVideo: p.hasVideo,
    isScreenSharing: p.isScreenSharing,
  }));
}

function safeSend(ws: any, payload: string): boolean {
  try {
    ws.send(payload);
    return true;
  } catch {
    return false;
  }
}

function broadcastRoomState(slug: string): void {
  const room = rooms.get(slug);
  if (!room) return;

  const peers = getRoomPeers(slug);
  const msg = JSON.stringify({ type: 'voice_state', peers });

  console.log(
    `[voice] broadcast state room="${slug}" peers=[${peers.map((p: any) => p.peerId).join(', ')}]`,
  );

  for (const [peerId, p] of room) {
    if (!safeSend(p.ws, msg)) {
      console.warn(`[voice] failed to send state to ${peerId}`);
    }
  }
}

function broadcastToOthers(slug: string, senderWs: any, payload: string): void {
  const room = rooms.get(slug);
  if (!room) return;
  for (const [, p] of room) {
    if (p.ws !== senderWs) safeSend(p.ws, payload);
  }
}

function addPeer(ws: any, slug: string): void {
  removePeerByWs(ws, { silent: false });

  if (!rooms.has(slug)) rooms.set(slug, new Map());
  const room = rooms.get(slug)!;

  const peerId: string = ws.data.peerId;
  room.set(peerId, {
    ws,
    peerId,
    slug,
    isMuted: false,
    isDeafened: false,
    hasVideo: false,
    isScreenSharing: false,
    lastSeen: Date.now(),
  });

  console.log(`[voice] peer joined peerId=${peerId} room="${slug}" total=${room.size}`);

  broadcastRoomState(slug);

  const initReq = JSON.stringify({ type: 'voice_request_init', peerId });
  for (const [id, p] of room) {
    if (id !== peerId) safeSend(p.ws, initReq);
  }
}

function removePeerByWs(ws: any, opts = { silent: false }): void {
  const peerId: string | undefined = ws.data?.peerId;
  if (!peerId) return;
  removePeerById(peerId, opts);
}

function removePeerById(peerId: string, opts = { silent: false }): void {
  for (const [slug, room] of rooms) {
    if (!room.has(peerId)) continue;

    room.delete(peerId);
    console.log(`[voice] peer left peerId=${peerId} room="${slug}" remaining=${room.size}`);

    if (room.size === 0) {
      rooms.delete(slug);
      console.log(`[voice] room empty, deleted slug="${slug}"`);
    } else if (!opts.silent) {
      broadcastRoomState(slug);
    }
    return;
  }
}

function updatePeerState(
  ws: any,
  slug: string,
  patch: Partial<Pick<PeerState, 'isMuted' | 'isDeafened' | 'hasVideo' | 'isScreenSharing'>>,
): void {
  const room = rooms.get(slug);
  if (!room) return;
  const peer = room.get(ws.data?.peerId);
  if (!peer) return;
  Object.assign(peer, patch);
  broadcastRoomState(slug);
}

const HEARTBEAT_MS = 15_000;
const STALE_MS = 45_000;

setInterval(() => {
  const now = Date.now();

  for (const [slug, room] of rooms) {
    const stalePeers: string[] = [];

    for (const [peerId, p] of room) {
      safeSend(p.ws, JSON.stringify({ type: 'voice_ping' }));

      if (now - p.lastSeen > STALE_MS) {
        console.log(`[voice] stale peer=${peerId} room="${slug}" age=${Math.round((now - p.lastSeen) / 1000)}s`);
        stalePeers.push(peerId);
      }
    }

    for (const peerId of stalePeers) {
      room.delete(peerId);
    }

    if (room.size === 0) {
      rooms.delete(slug);
    } else if (stalePeers.length > 0) {
      broadcastRoomState(slug);
    }
  }
}, HEARTBEAT_MS);


function handleMessage(ws: any, raw: any): void {
  let data: any;
  try {
    data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return;
  }

  if (!data || typeof data !== 'object' || typeof data.type !== 'string') return;

  const slug: string | undefined = data.roomSlug;

  if (slug) {
    const peer = rooms.get(slug)?.get(ws.data?.peerId);
    if (peer) peer.lastSeen = Date.now();
  }

  switch (data.type) {
    case 'voice_join': {
      if (!slug) return;
      addPeer(ws, slug);
      break;
    }
    case 'voice_leave': {
      removePeerByWs(ws);
      break;
    }
    case 'voice_mute': { if (slug) updatePeerState(ws, slug, { isMuted: true }); break; }
    case 'voice_unmute': { if (slug) updatePeerState(ws, slug, { isMuted: false }); break; }
    case 'voice_deafen': { if (slug) updatePeerState(ws, slug, { isDeafened: true }); break; }
    case 'voice_undeafen': { if (slug) updatePeerState(ws, slug, { isDeafened: false }); break; }
    case 'voice_video_on': { if (slug) updatePeerState(ws, slug, { hasVideo: true }); break; }
    case 'voice_video_off': { if (slug) updatePeerState(ws, slug, { hasVideo: false }); break; }
    case 'voice_screen_start': { if (slug) updatePeerState(ws, slug, { isScreenSharing: true }); break; }
    case 'voice_screen_stop': { if (slug) updatePeerState(ws, slug, { isScreenSharing: false }); break; }
    case 'voice_pong': { break; }
    case 'voice_media': {
      if (!slug) return;
      const room = rooms.get(slug);
      if (!room) return;

      if (typeof data.kind !== 'string' || typeof data.chunk !== 'string') return;

      const payload = JSON.stringify({
        type: 'voice_media',
        peerId: ws.data.peerId,
        kind: data.kind,
        chunk: data.chunk,
      });

      let sent = 0;
      for (const [, p] of room) {
        if (p.ws !== ws && safeSend(p.ws, payload)) sent++;
      }
      break;
    }
    case 'voice_request_init': {
      if (!slug) return;
      const payload = JSON.stringify({
        type: 'voice_request_init',
        peerId: ws.data.peerId,
      });
      broadcastToOthers(slug, ws, payload);
      break;
    }
    default:
      break;
  }
}

export async function voiceRoutes(app: any, prefix = ''): Promise<void> {
  const roomRepo = () => AppDataSource.getRepository(VoiceRoom);

  app.post(
    prefix + '/voice/rooms',
    async (ctx: any) => {
      const body = (await ctx.body) as any;
      const channelId = body?.channelId ? Number(body.channelId) : null;
      const isPrivate = body?.isPrivate === true;
      const slug = randomSlug();

      const room = roomRepo().create({
        slug,
        channelId,
        createdById: ctx.user?.id ?? null,
        isPrivate,
      });
      await roomRepo().save(room);

      return {
        id: room.id,
        slug: room.slug,
        channelId: room.channelId,
        isPrivate: room.isPrivate,
        createdAt: room.createdAt,
      };
    },
    {
      beforeHandle: [optionalAuth],
      detail: { tags: ['Voice'], summary: 'Create a voice room' },
    },
  );

  app.get(
    prefix + '/voice/rooms/:slug',
    async (ctx: any) => {
      const room = await roomRepo().findOneBy({ slug: ctx.params?.slug });
      if (!room) {
        ctx.set.status = 404;
        return { error: 'Room not found' };
      }
      return {
        id: room.id,
        slug: room.slug,
        channelId: room.channelId,
        createdById: room.createdById,
        isPrivate: room.isPrivate,
        createdAt: room.createdAt,
        participantCount: rooms.get(room.slug)?.size ?? 0,
      };
    },
    { detail: { tags: ['Voice'], summary: 'Get voice room info' } },
  );

  app.get(
    prefix + '/voice/channels/:channelId/rooms',
    async (ctx: any) => {
      const channelId = Number(ctx.params?.channelId);
      const list = await roomRepo().find({
        where: { channelId },
        order: { createdAt: 'DESC' },
        take: 20,
      });
      return list.map(r => ({
        id: r.id,
        slug: r.slug,
        channelId: r.channelId,
        createdById: r.createdById,
        isPrivate: r.isPrivate,
        createdAt: r.createdAt,
        participantCount: rooms.get(r.slug)?.size ?? 0,
      }));
    },
    { detail: { tags: ['Voice'], summary: 'List voice rooms for a channel' } },
  );

  app.get(
    prefix + '/voice/rooms',
    async (_ctx: any) => {
      const active: object[] = [];
      for (const [slug, room] of rooms) {
        active.push({
          slug,
          participantCount: room.size,
          peers: Array.from(room.values()).map(p => ({
            peerId: p.peerId,
            isMuted: p.isMuted,
            isDeafened: p.isDeafened,
            hasVideo: p.hasVideo,
            isScreenSharing: p.isScreenSharing,
            idleSec: Math.round((Date.now() - p.lastSeen) / 1000),
          })),
        });
      }
      return active;
    },
    { detail: { tags: ['Voice'], summary: 'List all active in-memory rooms (debug)' } },
  );

  app.ws(prefix + '/ws/voice', {
    open(ws: any): void {
      ws.data ??= {};
      ws.data.peerId = crypto.randomBytes(5).toString('hex');
      console.log(`[voice] WS open  peerId=${ws.data.peerId}`);
      safeSend(ws, JSON.stringify({ type: 'voice_connected', peerId: ws.data.peerId }));
    },

    message(ws: any, message: any): void {
      try {
        handleMessage(ws, message);
      } catch (err) {
        console.error('[voice] unhandled error in message handler:', err);
      }
    },

    close(ws: any): void {
      console.log(`[voice] WS close peerId=${ws.data?.peerId}`);
      removePeerByWs(ws);
    },

    error(ws: any, err: any): void {
      console.error(`[voice] WS error peerId=${ws.data?.peerId}:`, err);
      removePeerByWs(ws);
    },
  });
}