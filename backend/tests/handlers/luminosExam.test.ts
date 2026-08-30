import { describe, expect, it, beforeAll, afterEach, mock } from 'bun:test';
import { Elysia } from 'elysia';

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
    if (Array.isArray(v)) return v.includes(item[k]);
    if (typeof v === 'object' && v !== null && '_value' in v) return v._value.includes(item[k]);
    if (typeof v === 'object' && v !== null) return item[k] == null;
    return item[k] === v;
  });
}

let activeUser: any = {
  id: 1,
  email: 'candidate@test.com',
  luminosMember: false,
  settings: {},
  billingCountry: 'US',
  sessions: ['s1'],
};
let activeIsMod = false;

beforeAll(() => {
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
            const before = store.length;
            if (criteria && typeof criteria === 'object' && 'userId' in (criteria as any)) {
              const uid = (criteria as any).userId;
              for (let i = store.length - 1; i >= 0; i--) {
                if ((store[i] as any).userId === uid) store.splice(i, 1);
              }
              return { affected: before - store.length };
            }
            const id = typeof criteria === 'number' || typeof criteria === 'string'
              ? Number(criteria) : (criteria as Record<string, unknown>).id as number;
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
  }));

  mock.module('../../src/middleware/authorize', () => ({
    authorize: () => async () => {},
    hasPermissionSync: () => activeIsMod,
    hasPermission: async () => activeIsMod,
  }));

  mock.module('../../src/config/redis', () => ({
    withRedisCache: async <T>(_key: string, _ttl: number, fn: () => Promise<T>) => fn(),
    consumeRateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }),
    redisDelByPrefix: async () => {},
  }));

  const bank = Array.from({ length: 52 }, (_, i) => ({
    id: i + 1,
    category: 'test',
    question: `Question ${i + 1}?`,
    options: ['A', 'B', 'C', 'D'],
    correctIndex: i % 4,
    imageUrl: i < 6 ? 'https://example.com/photo.jpg' : undefined,
    lat: i < 6 ? 10 + i : undefined,
    lng: i < 6 ? 20 + i : undefined,
  }));
  mock.module('../../src/data/luminosQuestions.json', () => ({ default: { version: 1, questions: bank } }));

  mock.module('../../src/models/luminosAttempt.entity', () => ({ LuminosAttempt: class LuminosAttempt {} }));
  mock.module('../../src/models/luminosEvent.entity', () => ({ LuminosEvent: class LuminosEvent {} }));
  mock.module('../../src/models/luminosEventRsvp.entity', () => ({ LuminosEventRsvp: class LuminosEventRsvp {} }));
  mock.module('../../src/models/luminosGiveaway.entity', () => ({ LuminosGiveaway: class LuminosGiveaway {} }));
  mock.module('../../src/models/luminosGiveawayEntry.entity', () => ({ LuminosGiveawayEntry: class LuminosGiveawayEntry {} }));
  mock.module('../../src/models/luminosContest.entity', () => ({ LuminosContest: class LuminosContest {} }));
  mock.module('../../src/models/luminosContestSubmission.entity', () => ({ LuminosContestSubmission: class LuminosContestSubmission {} }));
  mock.module('../../src/models/luminosDailyScore.entity', () => ({ LuminosDailyScore: class LuminosDailyScore {} }));
  mock.module('../../src/models/luminosBounty.entity', () => ({ LuminosBounty: class LuminosBounty {} }));
  mock.module('../../src/models/luminosBountyFinding.entity', () => ({ LuminosBountyFinding: class LuminosBountyFinding {} }));
  mock.module('../../src/models/luminosBountyComment.entity', () => ({ LuminosBountyComment: class LuminosBountyComment {} }));
  mock.module('../../src/models/luminosPoint.entity', () => ({ LuminosPoint: class LuminosPoint {} }));
  mock.module('../../src/models/coupon.entity', () => ({ Coupon: class Coupon {} }));
  mock.module('../../src/models/user.entity', () => ({ User: class User {} }));
  mock.module('../../src/models/userLog.entity', () => ({ UserLog: class UserLog {} }));
  mock.module('../../src/models/chatChannel.entity', () => ({ ChatChannel: class ChatChannel {} }));
  mock.module('../../src/models/chatChannelMember.entity', () => ({ ChatChannelMember: class ChatChannelMember {} }));
});

afterEach(() => {
  for (const key of Object.keys(dataStore)) delete dataStore[key];
  for (const key of Object.keys(idCounters)) delete idCounters[key];
  activeUser = {
    id: 1,
    email: 'candidate@test.com',
    luminosMember: false,
    settings: {},
    billingCountry: 'US',
    sessions: ['s1'],
  };
  activeIsMod = false;
});

function createApp(): Elysia {
  const { luminosRoutes } = require('../../src/handlers/luminosHandler');
  const app = new Elysia();
  luminosRoutes(app as never, '/api');
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

function makeAttempt(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    userId: 1,
    questionIds: Array.from({ length: 50 }, (_, i) => i + 1),
    score: 0,
    passed: false,
    status: 'in_progress',
    startedAt: new Date(),
    ...overrides,
  };
}

function allCorrectAnswers(questions: Array<{ id: number }>): Record<string, number> {
  const answers: Record<string, number> = {};
  for (const q of questions) answers[String(q.id)] = (q.id - 1) % 4;
  return answers;
}

describe('Luminos exam', () => {
  it('status returns defaults for a fresh user', async () => {
    const res = await handle(createApp(), 'GET', '/api/luminos/status');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.attemptsUsed).toBe(0);
    expect(data.attemptsRemaining).toBe(3);
    expect(data.membership).toBe(false);
    expect(data.totalQuestions).toBe(50);
    expect(data.passThreshold).toBe(45);
  });

  it('start returns exactly 50 questions without correctIndex', async () => {
    const res = await handle(createApp(), 'POST', '/api/luminos/start');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.questions).toHaveLength(50);
    for (const q of data.questions) {
      expect(q).not.toHaveProperty('correctIndex');
      expect(q).not.toHaveProperty('explanation');
      expect(q.options).toHaveLength(4);
    }
    const ids = new Set(data.questions.map((q: any) => q.id));
    expect(ids.size).toBe(50);
    const stored = dataStore['LuminosAttempt'];
    expect(stored).toHaveLength(1);
    expect((stored[0] as any).questionIds).toHaveLength(50);
  });

  it('blocks a second start while an attempt is in progress (409)', async () => {
    const app = createApp();
    await handle(app, 'POST', '/api/luminos/start');
    const res = await handle(app, 'POST', '/api/luminos/start');
    expect(res.status).toBe(409);
  });

  it('scores a perfect exam, grants membership, badge, and auto-joins the club channel', async () => {
    seedRepo('ChatChannel', [{ id: 1, slug: 'luminos', type: 'club', isListed: true }]);
    const app = createApp();
    const started = await handle(app, 'POST', '/api/luminos/start');
    const { attemptId, questions } = await started.json();
    const res = await handle(app, 'POST', '/api/luminos/submit', { attemptId, answers: allCorrectAnswers(questions) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.score).toBe(50);
    expect(data.passed).toBe(true);
    expect(data.membership).toBe(true);
    expect(activeUser.luminosMember).toBe(true);
    expect(activeUser.settings.badges).toContain('luminos');
    const members = dataStore['ChatChannelMember'] as any[];
    expect(members.some(m => m.channelId === 1 && m.userId === 1)).toBe(true);
    const again = await handle(app, 'POST', '/api/luminos/submit', { attemptId, answers: allCorrectAnswers(questions) });
    expect(again.status).toBe(200);
    expect((await again.json()).passed).toBe(true);
  });

  it('does not grant membership on a failing score', async () => {
    const app = createApp();
    const started = await handle(app, 'POST', '/api/luminos/start');
    const { attemptId } = await started.json();
    const res = await handle(app, 'POST', '/api/luminos/submit', { attemptId, answers: {} });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.score).toBe(0);
    expect(data.passed).toBe(false);
    expect(activeUser.luminosMember).toBe(false);
    expect(activeUser.settings?.badges ?? []).not.toContain('luminos');
  });

  it('rejects a submit for another user\'s attempt (403)', async () => {
    seedRepo('LuminosAttempt', [makeAttempt()]);
    activeUser.id = 2;
    const app = createApp();
    const res = await handle(app, 'POST', '/api/luminos/submit', { attemptId: 1, answers: {} });
    expect(res.status).toBe(403);
  });

  it('rejects an expired attempt (400)', async () => {
    seedRepo('LuminosAttempt', [makeAttempt({ startedAt: new Date(Date.now() - 3 * 60 * 60 * 1000) })]);
    const app = createApp();
    const res = await handle(app, 'POST', '/api/luminos/submit', { attemptId: 1, answers: {} });
    expect(res.status).toBe(400);
    expect((dataStore['LuminosAttempt'][0] as any).status).toBe('expired');
  });

  it('lazily expires stale in-progress attempts and lets you start again', async () => {
    seedRepo('LuminosAttempt', [makeAttempt({ startedAt: new Date(Date.now() - 3 * 60 * 60 * 1000) })]);
    const app = createApp();
    const status = await handle(app, 'GET', '/api/luminos/status');
    const data = await status.json();
    expect(data.attemptsUsed).toBe(0);
    expect(data.attemptsRemaining).toBe(3);
    expect(data.activeAttempt).toBeNull();
    const started = await handle(app, 'POST', '/api/luminos/start');
    expect(started.status).toBe(200);
  });

  it('blocks a 4th submission (403) but expired attempts do not consume the limit', async () => {
    const submitted = Array.from({ length: 3 }, (_, i) => makeAttempt({ id: i + 1, status: 'submitted' }));
    seedRepo('LuminosAttempt', submitted);
    const app = createApp();
    const res = await handle(app, 'POST', '/api/luminos/start');
    expect(res.status).toBe(403);
  });

  it('blocks starting once already a member (403)', async () => {
    activeUser.luminosMember = true;
    const res = await handle(createApp(), 'POST', '/api/luminos/start');
    expect(res.status).toBe(403);
  });

  it('rejects a malformed submit (400)', async () => {
    const res = await handle(createApp(), 'POST', '/api/luminos/submit', { attemptId: 1 });
    expect(res.status).toBe(400);
    const res2 = await handle(createApp(), 'POST', '/api/luminos/submit', { attemptId: 1, answers: [1, 2] });
    expect(res2.status).toBe(400);
  });
});

describe('Luminos club events', () => {
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  function seedEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: 1,
      title: 'Quiz Night',
      description: 'Trivia in the club channel',
      startsAt: future,
      isArchived: false,
      createdById: 1,
      createdAt: new Date(),
      ...overrides,
    };
  }

  it('denies the event list to non-members without chat:manage (403)', async () => {
    const res = await handle(createApp(), 'GET', '/api/luminos/events');
    expect(res.status).toBe(403);
  });

  it('lists upcoming events for members', async () => {
    activeUser.luminosMember = true;
    seedRepo('LuminosEvent', [seedEvent(), seedEvent({ id: 2, title: 'Game Night' })]);
    const res = await handle(createApp(), 'GET', '/api/luminos/events');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(2);
    expect(data[0].title).toBe('Quiz Night');
  });

  it('only lets chat:manage users create events', async () => {
    const app = createApp();
    const denied = await handle(app, 'POST', '/api/luminos/events', { title: 'Party', startsAt: future });
    expect(denied.status).toBe(403);

    activeIsMod = true;
    const allowed = await handle(app, 'POST', '/api/luminos/events', { title: 'Party', startsAt: future });
    expect(allowed.status).toBe(200);
    const created = await allowed.json();
    expect(created.title).toBe('Party');
    expect(created.createdById).toBe(1);
  });

  it('requires a title and a valid start time (400)', async () => {
    activeIsMod = true;
    const app = createApp();
    const noTitle = await handle(app, 'POST', '/api/luminos/events', { title: '  ', startsAt: future });
    expect(noTitle.status).toBe(400);
    const badDate = await handle(app, 'POST', '/api/luminos/events', { title: 'Party', startsAt: 'nope' });
    expect(badDate.status).toBe(400);
  });

  it('lets the creator or a mod archive an event, and blocks others', async () => {
    seedRepo('LuminosEvent', [seedEvent()]);
    activeUser.id = 2;
    const app = createApp();
    const denied = await handle(app, 'DELETE', '/api/luminos/events/1');
    expect(denied.status).toBe(403);
    activeUser.id = 1;
    const ok = await handle(app, 'DELETE', '/api/luminos/events/1');
    expect(ok.status).toBe(200);
    expect((dataStore['LuminosEvent'][0] as any).isArchived).toBe(true);
    activeUser.luminosMember = true;
    const list = await handle(app, 'GET', '/api/luminos/events');
    expect((await list.json())).toHaveLength(0);
  });

  it('toggles RSVP on an event and reports the count', async () => {
    activeUser.luminosMember = true;
    seedRepo('LuminosEvent', [{ id: 1, title: 'Quiz Night', startsAt: new Date(Date.now() + 86400000).toISOString(), isArchived: false, createdById: 1, createdAt: new Date() }]);
    const app = createApp();
    const on = await handle(app, 'POST', '/api/luminos/events/1/rsvp');
    expect(on.status).toBe(200);
    const onData = await on.json();
    expect(onData.rsvped).toBe(true);
    expect(onData.rsvpCount).toBe(1);
    const list = await handle(app, 'GET', '/api/luminos/events');
    const events = await list.json();
    expect(events[0].rsvpCount).toBe(1);
    expect(events[0].rsvped).toBe(true);
    const off = await handle(app, 'POST', '/api/luminos/events/1/rsvp');
    const offData = await off.json();
    expect(offData.rsvped).toBe(false);
    expect(offData.rsvpCount).toBe(0);
  });

  it('denies RSVP to non-members without chat:manage (403)', async () => {
    seedRepo('LuminosEvent', [{ id: 1, title: 'Quiz Night', startsAt: new Date().toISOString(), isArchived: false, createdById: 1, createdAt: new Date() }]);
    const res = await handle(createApp(), 'POST', '/api/luminos/events/1/rsvp');
    expect(res.status).toBe(403);
  });
});

describe('Luminos giveaways', () => {
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  function seedGiveaway(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: 1, title: 'Steam Key Giveaway', description: null, prize: 'Steam game',
      startsAt: new Date().toISOString(), endsAt: future, isArchived: false,
      winnerId: null, createdById: 1, createdAt: new Date(), ...overrides,
    };
  }

  it('only lets chat:manage create giveaways', async () => {
    const app = createApp();
    const denied = await handle(app, 'POST', '/api/luminos/giveaways', { title: 'G', endsAt: future });
    expect(denied.status).toBe(403);
    activeIsMod = true;
    const ok = await handle(app, 'POST', '/api/luminos/giveaways', { title: 'G', endsAt: future });
    expect(ok.status).toBe(200);
    expect((await ok.json()).title).toBe('G');
  });

  it('lets members enter and counts entries', async () => {
    activeUser.luminosMember = true;
    seedRepo('LuminosGiveaway', [seedGiveaway()]);
    const app = createApp();
    const res = await handle(app, 'POST', '/api/luminos/giveaways/1/enter');
    expect(res.status).toBe(200);
    expect((await res.json()).entryCount).toBe(1);
    const again = await handle(app, 'POST', '/api/luminos/giveaways/1/enter');
    expect((await again.json()).entryCount).toBe(1);
    const list = await handle(app, 'GET', '/api/luminos/giveaways');
    const listData = await list.json();
    expect(listData[0].entryCount).toBe(1);
    expect(listData[0].entered).toBe(true);
  });

  it('blocks entering an ended giveaway and drawing without entries', async () => {
    activeUser.luminosMember = true;
    seedRepo('LuminosGiveaway', [seedGiveaway({ endsAt: new Date(Date.now() - 1000).toISOString() })]);
    const app = createApp();
    const enter = await handle(app, 'POST', '/api/luminos/giveaways/1/enter');
    expect(enter.status).toBe(400);
    activeIsMod = true;
    const draw = await handle(app, 'POST', '/api/luminos/giveaways/1/draw');
    expect(draw.status).toBe(400);
  });

  it('draws a random winner from entries', async () => {
    activeUser.luminosMember = true;
    seedRepo('LuminosGiveaway', [seedGiveaway()]);
    seedRepo('LuminosGiveawayEntry', [
      { id: 1, giveawayId: 1, userId: 7, createdAt: new Date() },
      { id: 2, giveawayId: 1, userId: 8, createdAt: new Date() },
    ]);
    const app = createApp();
    activeIsMod = true;
    const res = await handle(app, 'POST', '/api/luminos/giveaways/1/draw');
    expect(res.status).toBe(200);
    const winnerId = (await res.json()).winnerId;
    expect([7, 8]).toContain(winnerId);
    expect((dataStore['LuminosGiveaway'][0] as any).winnerId).toBe(winnerId);
    const again = await handle(app, 'POST', '/api/luminos/giveaways/1/draw');
    expect((await again.json()).winnerId).toBe(winnerId);
  });
});

describe('Luminos contests', () => {
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  function seedContest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: 1, title: 'Best Server Build', description: null, endsAt: future,
      isArchived: false, winnerId: null, createdById: 1, createdAt: new Date(), ...overrides,
    };
  }

  it('only lets chat:manage create contests', async () => {
    const app = createApp();
    const denied = await handle(app, 'POST', '/api/luminos/contests', { title: 'C', endsAt: future });
    expect(denied.status).toBe(403);
    activeIsMod = true;
    const ok = await handle(app, 'POST', '/api/luminos/contests', { title: 'C', endsAt: future });
    expect(ok.status).toBe(200);
  });

  it('lets members submit once and blocks a second submission', async () => {
    activeUser.luminosMember = true;
    seedRepo('LuminosContest', [seedContest()]);
    seedRepo('User', [{ id: 1, displayName: 'Candidate', email: 'candidate@test.com' }]);
    const app = createApp();
    const sub = await handle(app, 'POST', '/api/luminos/contests/1/submit', { content: 'My entry' });
    expect(sub.status).toBe(200);
    const again = await handle(app, 'POST', '/api/luminos/contests/1/submit', { content: 'Another' });
    expect(again.status).toBe(400);
    const list = await handle(app, 'GET', '/api/luminos/contests');
    const contests = await list.json();
    expect(contests[0].submissionCount).toBe(1);
    expect(contests[0].mySubmission.content).toBe('My entry');
    expect(contests[0].submissions[0].displayName).toBe('Candidate');
  });

  it('blocks submissions after the deadline and picks a winner', async () => {
    activeUser.luminosMember = true;
    seedRepo('LuminosContest', [seedContest({ endsAt: new Date(Date.now() - 1000).toISOString() })]);
    const app = createApp();
    const late = await handle(app, 'POST', '/api/luminos/contests/1/submit', { content: 'Late' });
    expect(late.status).toBe(400);
    const denied = await handle(app, 'POST', '/api/luminos/contests/1/winner', { submissionId: 1 });
    expect(denied.status).toBe(403);
  });

  it('sets the winner from a submission', async () => {
    activeUser.luminosMember = true;
    seedRepo('LuminosContest', [seedContest()]);
    seedRepo('LuminosContestSubmission', [{ id: 1, contestId: 1, userId: 5, content: 'Build', imageUrl: null, createdAt: new Date() }]);
    const app = createApp();
    activeIsMod = true;
    const res = await handle(app, 'POST', '/api/luminos/contests/1/winner', { submissionId: 1 });
    expect(res.status).toBe(200);
    expect((await res.json()).winnerId).toBe(5);
    expect((dataStore['LuminosContest'][0] as any).winnerId).toBe(5);
  });
});

describe('Luminos daily challenge', () => {
  it('serves the same seeded 10 questions without answers, and scores a submit', async () => {
    activeUser.luminosMember = true;
    const app = createApp();
    const first = await handle(app, 'GET', '/api/luminos/daily');
    expect(first.status).toBe(200);
    const data = await first.json();
    expect(data.questions).toHaveLength(10);
    for (const q of data.questions) {
      expect(q).not.toHaveProperty('correctIndex');
    }
    const second = await handle(app, 'GET', '/api/luminos/daily');
    const data2 = await second.json();
    expect(data2.questions.map((q: any) => q.id)).toEqual(data.questions.map((q: any) => q.id));
    expect(data2.submitted).toBeNull();

    const answers: Record<string, number> = {};
    for (const q of data.questions) answers[String(q.id)] = (q.id - 1) % 4;
    const res = await handle(app, 'POST', '/api/luminos/daily/submit', { answers });
    expect(res.status).toBe(200);
    const result = await res.json();
    expect(result.total).toBe(10);
    expect(result.alreadySubmitted).toBe(false);

    const again = await handle(app, 'POST', '/api/luminos/daily/submit', { answers });
    expect((await again.json()).alreadySubmitted).toBe(true);
    const after = await handle(app, 'GET', '/api/luminos/daily');
    const afterData = await after.json();
    expect(afterData.submitted.score).toBe(result.score);
    expect(afterData.leaderboard.length).toBeGreaterThanOrEqual(1);
  });

  it('denies the daily challenge to non-members (403)', async () => {
    const res = await handle(createApp(), 'GET', '/api/luminos/daily');
    expect(res.status).toBe(403);
  });
});

describe('Luminos expel', () => {
  it('only lets chat:manage expel a member', async () => {
    activeUser.luminosMember = true;
    seedRepo('User', [{ id: 5, luminosMember: true, settings: { badges: ['luminos'] } }]);
    const denied = await handle(createApp(), 'POST', '/api/luminos/expel/5');
    expect(denied.status).toBe(403);
  });

  it('expels a member: flag off, badge gone, attempts reset, channel access revoked', async () => {
    activeUser.luminosMember = true;
    activeIsMod = true;
    seedRepo('User', [{ id: 5, luminosMember: true, settings: { badges: ['luminos', 'other'], gambling: { badges: ['luminos'] } } }]);
    seedRepo('LuminosAttempt', [{ id: 1, userId: 5, status: 'submitted', score: 50 }]);
    seedRepo('ChatChannel', [{ id: 1, slug: 'luminos', type: 'club' }]);
    seedRepo('ChatChannelMember', [{ id: 1, channelId: 1, userId: 5 }]);
    const app = createApp();
    const res = await handle(app, 'POST', '/api/luminos/expel/5');
    expect(res.status).toBe(200);
    expect((await res.json()).expelled).toBe(true);

    const member = dataStore['User'].find((u: any) => u.id === 5) as any;
    expect(member.luminosMember).toBe(false);
    expect(member.settings.badges).toEqual(['other']);
    expect(member.settings.gambling.badges).toEqual([]);
    expect((dataStore['LuminosAttempt'] as any[])).toHaveLength(0);
    expect((dataStore['ChatChannelMember'] as any[])).toHaveLength(0);
    const logs = dataStore['UserLog'] as any[];
    expect(logs.some(l => l.userId === 5 && l.action === 'luminos_expel')).toBe(true);
  });

  it('is a no-op for non-members and 404s unknown users', async () => {
    activeUser.luminosMember = true;
    activeIsMod = true;
    seedRepo('User', [{ id: 5, luminosMember: false, settings: {} }]);
    const app = createApp();
    const noop = await handle(app, 'POST', '/api/luminos/expel/5');
    expect((await noop.json()).expelled).toBe(false);
    const missing = await handle(app, 'POST', '/api/luminos/expel/999');
    expect(missing.status).toBe(404);
  });
});

describe('Luminos assign', () => {
  it('only lets chat:manage assign a member', async () => {
    activeUser.luminosMember = true;
    seedRepo('User', [{ id: 5, luminosMember: false, settings: {} }]);
    const denied = await handle(createApp(), 'POST', '/api/luminos/assign/5');
    expect(denied.status).toBe(403);
  });

  it('assigns a member: flag on, badge added, club channel joined', async () => {
    activeUser.luminosMember = true;
    activeIsMod = true;
    seedRepo('User', [{ id: 5, luminosMember: false, settings: { badges: ['other'] } }]);
    seedRepo('ChatChannel', [{ id: 1, slug: 'luminos', type: 'club' }]);
    const app = createApp();
    const res = await handle(app, 'POST', '/api/luminos/assign/5');
    expect(res.status).toBe(200);
    expect((await res.json()).assigned).toBe(true);

    const member = dataStore['User'].find((u: any) => u.id === 5) as any;
    expect(member.luminosMember).toBe(true);
    expect(member.settings.badges).toContain('luminos');
    expect(member.settings.badges).toContain('other');
    const members = dataStore['ChatChannelMember'] as any[];
    expect(members.some(m => m.channelId === 1 && m.userId === 5)).toBe(true);
    const logs = dataStore['UserLog'] as any[];
    expect(logs.some(l => l.userId === 5 && l.action === 'luminos_assign')).toBe(true);
  });

  it('is a no-op for existing members and 404s unknown users', async () => {
    activeUser.luminosMember = true;
    activeIsMod = true;
    seedRepo('User', [{ id: 5, luminosMember: true, settings: {} }]);
    const app = createApp();
    const noop = await handle(app, 'POST', '/api/luminos/assign/5');
    expect((await noop.json()).assigned).toBe(false);
    const missing = await handle(app, 'POST', '/api/luminos/assign/999');
    expect(missing.status).toBe(404);
  });
});
