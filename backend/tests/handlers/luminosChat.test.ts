import { describe, expect, it, afterEach, mock } from 'bun:test';
import { Elysia } from 'elysia';
import { websocket } from 'elysia/websocket';

type MockRepo = {
  create: (...args: unknown[]) => unknown;
  save: (...args: unknown[]) => Promise<unknown>;
  find: (...args: unknown[]) => Promise<unknown[]>;
  findOne: (...args: unknown[]) => Promise<unknown>;
  findOneBy: (...args: unknown[]) => Promise<unknown>;
  findBy: (...args: unknown[]) => Promise<unknown[]>;
  remove: (...args: unknown[]) => Promise<unknown>;
  delete: (...args: unknown[]) => Promise<{ affected: number }>;
  count: (...args: unknown[]) => Promise<number>;
  countBy: (...args: unknown[]) => Promise<number>;
  createQueryBuilder: () => Record<string, unknown>;
  [key: string]: unknown;
};

const dataStore: Record<string, unknown[]> = {};
const idCounters: Record<string, number> = {};

function nextId(_name: string, data: unknown[]): number {
  return data.reduce<number>((max, d) => Math.max(max, (d as any).id || 0), 0) + 1;
}

function initStore(name: string, data: unknown[] = []): void {
  dataStore[name] = [...data];
  idCounters[name] = nextId(name, data);
}

function seedRepo(name: string, data: unknown[]): void {
  const existing = dataStore[name];
  if (existing) {
    existing.length = 0;
    existing.push(...data);
  } else {
    dataStore[name] = [...data];
  }
  idCounters[name] = nextId(name, data);
}

function matches(where: Record<string, unknown>, item: any): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v === undefined) return true;
    if (typeof v === 'object' && v !== null && '_value' in v) return v._value.includes(item[k]); // In(...)
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) return item[k] == null; // IsNull() etc
    if (Array.isArray(v)) return v.includes(item[k]);
    return item[k] === v;
  });
}

let activeUser: any = {
  id: 1,
  email: 'member@test.com',
  luminosMember: true,
  settings: {},
  sessions: ['s1'],
};
let activeIsMod = false;

const CLUB_CHANNEL = { id: 1, slug: 'luminos', name: 'Luminos Club', type: 'club', isListed: true, isArchived: false, isMature: false, createdAt: new Date() };
const COMMUNITY_CHANNEL = { id: 2, slug: 'general', name: 'General', type: 'community', isListed: true, isArchived: false, isMature: false, createdAt: new Date() };
const PUBLIC_CHANNEL = { id: 3, slug: 'anon', name: 'Anon', type: 'public_anonymous', isListed: true, isArchived: false, isMature: false, createdAt: new Date() };

mock.module('../../src/config/typeorm', () => ({
    AppDataSource: {
      isInitialized: true,
      initialize: async () => {},
      destroy: async () => {},
      getRepository: (entity: unknown) => {
        const name = typeof entity === 'function' ? entity.name : String(entity);
        if (!dataStore[name]) initStore(name);
        const store = dataStore[name];
        const counter = idCounters;

        const repo: MockRepo = {
          create: (entity?: Record<string, unknown>) => ({
            id: counter[name]++,
            ...entity,
            createdAt: new Date(),
          }),

          save: async (entity: unknown) => {
            const e = entity as Record<string, unknown>;
            const idx = store.findIndex(d => (d as Record<string, unknown>).id === e.id);
            if (idx >= 0) {
              store[idx] = entity;
            } else {
              if (e.id === undefined || e.id === null) e.id = counter[name]++;
              store.push(entity);
            }
            return entity;
          },

          find: async (opts?: Record<string, unknown>) => {
            const where = (opts?.where ?? {}) as Record<string, unknown>;
            return store.filter(item => matches(where, item));
          },

          findOne: async (opts?: Record<string, unknown>) => {
            const where = (opts?.where ?? {}) as Record<string, unknown>;
            return store.find(item => matches(where, item)) ?? null;
          },

          findOneBy: async (where: Record<string, unknown>) => {
            return store.find(item => matches(where, item)) ?? null;
          },

          findBy: async (where: Record<string, unknown>) => {
            return store.filter(item => matches(where, item));
          },

          remove: async (entity: unknown) => {
            const id = (entity as Record<string, unknown>).id;
            const idx = store.findIndex(d => (d as Record<string, unknown>).id === id);
            if (idx >= 0) store.splice(idx, 1);
            return entity;
          },

          delete: async (criteria: unknown) => {
            const id = typeof criteria === 'number' || typeof criteria === 'string'
              ? Number(criteria) : (criteria as Record<string, unknown>).id as number;
            const before = store.length;
            const idx = store.findIndex(d => (d as Record<string, unknown>).id === id);
            if (idx >= 0) store.splice(idx, 1);
            return { affected: before - store.length };
          },

          count: async (opts?: Record<string, unknown>) => {
            const where = (opts?.where ?? {}) as Record<string, unknown>;
            return store.filter(item => matches(where, item)).length;
          },

          countBy: async (where: Record<string, unknown>) => {
            return store.filter(item => matches(where, item)).length;
          },

          createQueryBuilder: () => {
            const preds: Array<(item: any) => boolean> = [];
            const qb: any = {
              where: (_s: string, p?: any) => {
                if (p && 'archived' in p) preds.push((i: any) => i.isArchived == p.archived);
                return qb;
              },
              andWhere: (_s: string, p?: any) => {
                if (p && 'clubType' in p) preds.push((i: any) => i.type !== p.clubType);
                if (p && 'listed' in p && 'userId' in p) preds.push((i: any) => i.isListed == p.listed || i.createdById === p.userId);
                if (p && 'type' in p) preds.push((i: any) => i.type === p.type);
                return qb;
              },
              orderBy: () => qb,
              addSelect: () => qb,
              select: () => qb,
              groupBy: () => qb,
              getMany: async () => store.filter((it: any) => preds.every(fn => fn(it))),
              getRawMany: async () => [],
              getCount: async () => store.filter((it: any) => preds.every(fn => fn(it))).length,
              getOne: async () => store.find((it: any) => preds.every(fn => fn(it))) ?? null,
              delete: () => qb,
              update: () => qb,
              set: () => qb,
              from: () => qb,
              whereInIds: () => qb,
              execute: async () => {},
            };
            return qb;
          },
        };
        return repo;
      },
      query: async () => [],
      transaction: async (fn: (m: unknown) => Promise<unknown>) => fn({}),
    } as never,
  }));

  mock.module('../../src/middleware/auth', () => ({
    authenticate: async (ctx: Record<string, unknown>) => {
      const request = ctx.request as Request;
      const auth = request?.headers?.get?.('authorization');
      if (!auth) {
        ctx.set = { ...(ctx.set as object || {}), status: 401 } as Record<string, unknown>;
        return { error: 'Unauthorized' };
      }
      ctx.user = activeUser;
      ctx.userPermissions = [];
      ctx.t = (key: string) => key;
    },
    optionalAuth: async (ctx: Record<string, unknown>) => {
      const request = ctx.request as Request;
      const auth = request?.headers?.get?.('authorization');
      if (auth) {
        ctx.user = activeUser;
        ctx.userPermissions = [];
        ctx.t = (key: string) => key;
      }
    },
  }));

  mock.module('../../src/middleware/authorize', () => ({
    authorize: () => async () => {},
    hasPermissionSync: () => activeIsMod,
    hasPermission: async () => activeIsMod,
  }));

  mock.module('../../src/middleware/stepUp', () => ({
    requirePasskeyStepUp: () => true,
  }));

  mock.module('../../src/config/redis', () => ({
    withRedisCache: async <T>(_key: string, _ttl: number, fn: () => Promise<T>) => fn(),
    consumeRateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }),
    redisDelByPrefix: async () => {},
  }));

  mock.module('../../src/models/chatChannel.entity', () => ({ ChatChannel: class ChatChannel {} }));
  mock.module('../../src/models/chatMessage.entity', () => ({ ChatMessage: class ChatMessage {} }));
  mock.module('../../src/models/chatChannelMember.entity', () => ({ ChatChannelMember: class ChatChannelMember {} }));
  mock.module('../../src/models/chatIpLog.entity', () => ({ ChatIpLog: class ChatIpLog {} }));
  mock.module('../../src/models/chatIpBan.entity', () => ({ ChatIpBan: class ChatIpBan {} }));
  mock.module('../../src/models/user.entity', () => ({ User: class User {} }));
  mock.module('../../src/utils/bunCrypto', () => {
    const crypto = require('crypto');
    return {
      randomHex: () => 'mock-token-hex-32-bytes-long!',
      randomBytes: (n: number) => crypto.randomBytes(n),
      randomInt: (min: number, max: number) => crypto.randomInt(min, max),
      sha256Hex: (input: string | Uint8Array) => crypto.createHash('sha256').update(input).digest('hex'),
    };
  });

afterEach(() => {
  for (const key of Object.keys(dataStore)) delete dataStore[key];
  for (const key of Object.keys(idCounters)) delete idCounters[key];
  activeUser = {
    id: 1,
    email: 'member@test.com',
    luminosMember: true,
    settings: {},
    sessions: ['s1'],
  };
  activeIsMod = false;
});

function createApp(): Elysia {
  const app = new Elysia()
    .use(websocket())
    .derive(() => ({ t: (key: string) => key }))
    .error((ctx: any) => {
      console.error('[test-error]', ctx.code, ctx.error || ctx);
    });
  const compatMethods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options', 'all'];
  for (const m of compatMethods) {
    const orig = (app as any)[m];
    (app as any)[m] = function (path: string, ...args: any[]) {
      if (args.length >= 1 && typeof args[0] === 'function') {
        const [handler, ...rest] = args;
        return orig.call(this, path, ...rest, handler);
      }
      return orig.call(this, path, ...args);
    };
  }
  const { chatRoutes } = require('../../src/handlers/chatHandler');
  chatRoutes(app as never, '/api');
  return app;
}

async function handle(app: Elysia, method: string, path: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { authorization: 'Bearer test-token' };
  let req: Request;
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    req = new Request(`http://localhost${path}`, { method, headers, body: JSON.stringify(body) });
  } else {
    req = new Request(`http://localhost${path}`, { method, headers });
  }
  return app.handle(req);
}

describe('Luminos club channel gating', () => {
  it('hides the club channel from list endpoints for non-members', async () => {
    activeUser.luminosMember = false;
    seedRepo('ChatChannel', [CLUB_CHANNEL, COMMUNITY_CHANNEL, PUBLIC_CHANNEL]);
    const app = createApp();
    const list = await handle(app, 'GET', '/api/chat/channels');
    const all = await handle(app, 'GET', '/api/chat/channels/all');
    const listIds = (await list.json()).map((c: any) => c.id);
    const allIds = (await all.json()).map((c: any) => c.id);
    expect(listIds).toEqual([2, 3]);
    expect(allIds).toEqual([2, 3]);
  });

  it('includes the club channel for members', async () => {
    seedRepo('ChatChannel', [CLUB_CHANNEL, COMMUNITY_CHANNEL]);
    const app = createApp();
    const list = await handle(app, 'GET', '/api/chat/channels');
    const all = await handle(app, 'GET', '/api/chat/channels/all');
    const listIds = (await list.json()).map((c: any) => c.id);
    expect(listIds).toContain(1);
    const allIds = (await all.json()).map((c: any) => c.id);
    expect(allIds).toContain(1);
  });

  it('404s direct reads of the club channel for non-members', async () => {
    activeUser.luminosMember = false;
    seedRepo('ChatChannel', [CLUB_CHANNEL]);
    const app = createApp();
    const detail = await handle(app, 'GET', '/api/chat/channels/1');
    expect(detail.status).toBe(404);
    const threads = await handle(app, 'GET', '/api/chat/channels/1/threads');
    expect(threads.status).toBe(404);
  });

  it('allows direct reads for members', async () => {
    seedRepo('ChatChannel', [CLUB_CHANNEL]);
    const app = createApp();
    const detail = await handle(app, 'GET', '/api/chat/channels/1');
    expect(detail.status).toBe(200);
    const threads = await handle(app, 'GET', '/api/chat/channels/1/threads');
    expect(threads.status).toBe(200);
  });

  it('rejects joining the club channel without membership (403) and allows it for members', async () => {
    activeUser.luminosMember = false;
    seedRepo('ChatChannel', [CLUB_CHANNEL]);
    const app = createApp();
    const denied = await handle(app, 'POST', '/api/chat/channels/1/join');
    expect(denied.status).toBe(403);
  });

  it('lets a member join the club channel', async () => {
    seedRepo('ChatChannel', [CLUB_CHANNEL]);
    const app = createApp();
    const ok = await handle(app, 'POST', '/api/chat/channels/1/join');
    expect(ok.status).toBe(200);
    const members = dataStore['ChatChannelMember'] as any[];
    expect(members.some(m => m.channelId === 1 && m.userId === 1)).toBe(true);
  });

  it('rejects posting to the club channel without membership (403)', async () => {
    activeUser.luminosMember = false;
    seedRepo('ChatChannel', [CLUB_CHANNEL]);
    seedRepo('ChatMessage', []);
    const app = createApp();
    const res = await handle(app, 'POST', '/api/chat/channels/1/threads', { content: 'hello' });
    expect(res.status).toBe(403);
  });

  it('lets a member post to the club channel', async () => {
    seedRepo('ChatChannel', [CLUB_CHANNEL]);
    seedRepo('User', [{ id: 1, luminosMember: true }]);
    seedRepo('ChatMessage', []);
    const app = createApp();
    const res = await handle(app, 'POST', '/api/chat/channels/1/threads', { content: 'welcome in' });
    expect(res.status).toBe(200);
    const msgs = dataStore['ChatMessage'] as any[];
    expect(msgs.some(m => m.channelId === 1 && m.content === 'welcome in')).toBe(true);
  });

  it('only lets chat moderators create club channels', async () => {
    seedRepo('ChatChannel', []);
    activeIsMod = false;
    let app = createApp();
    const denied = await handle(app, 'POST', '/api/chat/channels', { name: 'Members Only', type: 'club' });
    expect(denied.status).toBe(403);

    activeIsMod = true;
    app = createApp();
    const allowed = await handle(app, 'POST', '/api/chat/channels', { name: 'Members Only', type: 'club' });
    expect(allowed.status).toBe(200);
    const created = await allowed.json();
    expect(created.type).toBe('club');
  });

  it('rejects WS subscribe to the club channel for non-members', async () => {
    seedRepo('ChatChannel', [CLUB_CHANNEL, COMMUNITY_CHANNEL]);
    seedRepo('User', [{ id: 2, luminosMember: false }]);
    const { handleChatSocketMessage } = await import('../../src/handlers/chatHandler');
    const sent: string[] = [];
    const ws = { data: { channels: new Set<number>(), userId: 2, luminosMember: undefined }, send: (s: string) => sent.push(s) };
    await handleChatSocketMessage(ws, JSON.stringify({ type: 'subscribe', channelId: 1 }));
    expect(ws.data.channels.has(1)).toBe(false);
    expect(sent.some(s => JSON.parse(s).type === 'error')).toBe(true);
    await handleChatSocketMessage(ws, JSON.stringify({ type: 'subscribe', channelId: 2 }));
    expect(ws.data.channels.has(2)).toBe(true);
  });

  it('allows WS subscribe to the club channel for members', async () => {
    seedRepo('ChatChannel', [CLUB_CHANNEL]);
    seedRepo('User', [{ id: 1, luminosMember: true }]);
    const { handleChatSocketMessage } = await import('../../src/handlers/chatHandler');
    const ws = { data: { channels: new Set<number>(), userId: 1, luminosMember: undefined }, send: () => {} };
    await handleChatSocketMessage(ws, JSON.stringify({ type: 'subscribe', channelId: 1 }));
    expect(ws.data.channels.has(1)).toBe(true);
  });

  it('rejects WS subscribe for unauthenticated sockets', async () => {
    seedRepo('ChatChannel', [CLUB_CHANNEL]);
    const { handleChatSocketMessage } = await import('../../src/handlers/chatHandler');
    const ws = { data: { channels: new Set<number>() }, send: () => {} };
    await handleChatSocketMessage(ws, JSON.stringify({ type: 'subscribe', channelId: 1 }));
    expect(ws.data.channels.has(1)).toBe(false);
  });
});
