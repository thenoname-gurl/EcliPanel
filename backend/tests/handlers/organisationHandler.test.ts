import { describe, expect, it, beforeAll, afterEach, mock } from 'bun:test';
import { Elysia } from 'elysia';
import { User } from '../../src/models/user.entity';
import { Organisation } from '../../src/models/organisation.entity';

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
  createQueryBuilder: () => { delete: () => { from: () => { where: () => { andWhere: () => { execute: () => Promise<void> } } } } };
  [key: string]: unknown;
};

const dataStore: Record<string, unknown[]> = {};
const idCounters: Record<string, number> = {};

function nextId(name: string, data: unknown[]): number {
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

const testUser: User = {
  id: 1,
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  passwordHash: '',
  orgRole: 'member',
  portalType: 'free',
  fraudFlag: false,
  emailVerified: true,
  studentVerified: false,
  idVerified: false,
  twoFactorEnabled: false,
  suspended: false,
  supportBanned: false,
  deletionRequested: false,
  deletionApproved: false,
  guideShown: false,
  createdAt: new Date(),
  address: '',
  sessions: [],
  userRoles: [],
  organisationMemberships: [],
} as unknown as User;

const testOrg: Organisation = {
  id: 1,
  name: 'Test Org',
  handle: 'test.org',
  ownerId: 1,
  portalTier: 'free',
  avatarUrl: null,
  isStaff: false,
  invites: [],
  memberships: [],
} as unknown as Organisation;

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
              if (e.id === undefined || e.id === null) {
                e.id = counter[name]++;
              }
              store.push(entity);
            }
            return entity;
          },

          find: async (opts?: Record<string, unknown>) => {
            const where = (opts?.where ?? {}) as Record<string, unknown>;
            return store.filter(item => {
              for (const [k, v] of Object.entries(where)) {
                if (v !== undefined && (item as Record<string, unknown>)[k] !== v) return false;
              }
              return true;
            });
          },

          findOne: async (opts?: Record<string, unknown>) => {
            const where = (opts?.where ?? {}) as Record<string, unknown>;
            return store.find(item => {
              for (const [k, v] of Object.entries(where)) {
                if (v !== undefined && (item as Record<string, unknown>)[k] !== v) return false;
              }
              return true;
            }) ?? null;
          },

          findOneBy: async (where: Record<string, unknown>) => {
            return store.find(item => {
              for (const [k, v] of Object.entries(where)) {
                if (v !== undefined && (item as Record<string, unknown>)[k] !== v) return false;
              }
              return true;
            }) ?? null;
          },

          findBy: async (where: Record<string, unknown>) => {
            return store.filter(item => {
              for (const [k, v] of Object.entries(where)) {
                if (v !== undefined && (item as Record<string, unknown>)[k] !== v) return false;
              }
              return true;
            });
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
            return store.filter(item => {
              for (const [k, v] of Object.entries(where)) {
                if (v !== undefined && (item as Record<string, unknown>)[k] !== v) return false;
              }
              return true;
            }).length;
          },

          createQueryBuilder: () => ({
            delete: () => ({
              from: () => ({
                where: () => ({
                  andWhere: () => ({
                    execute: async () => {},
                  }),
                }),
              }),
            }),
          }),
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
      ctx.user = testUser;
      ctx.userPermissions = ['*'];
      ctx.t = (key: string) => key;
    },
  }));

  mock.module('../../src/middleware/authorize', () => ({
    authorize: () => async () => {},
    hasPermissionSync: () => true,
    hasPermission: async () => true,
  }));

  mock.module('../../src/middleware/featureToggle', () => ({
    requireFeature: async () => true,
  }));

  mock.module('../../src/config/redis', () => ({
    withRedisCache: async <T>(_key: string, _ttl: number, fn: () => Promise<T>) => fn(),
    consumeRateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }),
    redisDelByPrefix: async () => {},
  }));

  mock.module('../../src/handlers/logHandler', () => ({
    createActivityLog: async () => {},
  }));

  mock.module('../../src/services/cloudflareService', () => ({
    CloudflareService: class {
      async getZone() { return { id: 'zone1', recordsList: [], rrsets: [] }; }
      async addRecord() { return { success: true }; }
      async updateRecord() { return { success: true }; }
      async deleteRecord() { return { success: true }; }
    },
  }));

  mock.module('../../src/workers/imageWorker', () => ({
    resizeImage: async (buffer: Buffer) => buffer,
  }));

  mock.module('../../src/utils/mailboxMessage', () => ({
    createMailboxMessageForUser: async () => {},
  }));

  mock.module('../../src/services/mailcowService', () => ({
    getMailboxAccountForUser: async () => null,
  }));

  mock.module('../../src/services/wingsApiService', () => ({
    WingsApiService: class {
      async getServers() { return { data: [] }; }
    },
  }));

  mock.module('../../src/services/mailService', () => ({
    sendMail: async () => {},
  }));
});

afterEach(() => {
  for (const key of Object.keys(dataStore)) delete dataStore[key];
  for (const key of Object.keys(idCounters)) delete idCounters[key];
});

function createApp(): Elysia {
  const { organisationRoutes } = require('../../src/handlers/organisationHandler');
  const app = new Elysia();
  organisationRoutes(app as never, '/api');
  return app;
}

async function handle(
  app: Elysia,
  path: string,
  opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
) {
  const method = opts.method ?? 'GET';
  const req = new Request(`http://localhost${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer test-token',
      ...opts.headers,
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const res = await app.handle(req);
  const text = await res.clone().text();
  let body: unknown;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body: body as any };
}

// Setup base data needed by handler + DNS zone creation on org create
function baseSeed() {
  seedRepo('OrganisationDnsZone', []);
}

// ---------------------------------------------------------------------------
// Helper unit tests
// ---------------------------------------------------------------------------

describe('errorMessage', () => {
  const { errorMessage } = require('../../src/utils/sanitizeError');

  it('should return message from Error instance', () => {
    expect(errorMessage(new Error('test error'), 'fallback')).toBe('test error');
  });

  it('should return fallback for non-error values', () => {
    expect(errorMessage(null, 'fallback')).toBe('fallback');
    expect(errorMessage(undefined, 'fallback')).toBe('fallback');
    expect(errorMessage('string', 'fallback')).toBe('fallback');
  });

  it('should extract message from object with message property', () => {
    expect(errorMessage({ message: 'custom message' }, 'fallback')).toBe('custom message');
  });
});

// ---------------------------------------------------------------------------
// Route handler integration tests
// ---------------------------------------------------------------------------

describe('GET /api/organisations', () => {
  it('should return empty list when user has no organisations', async () => {
    baseSeed();
    seedRepo('OrganisationMember', []);
    seedRepo('Organisation', []);
    const app = createApp();

    const res = await handle(app, '/api/organisations');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  it('should return organisations where user is a member', async () => {
    baseSeed();
    seedRepo('Organisation', [{ ...testOrg }]);
    seedRepo('OrganisationMember', [{
      id: 1,
      userId: 1,
      organisationId: 1,
      orgRole: 'member',
      createdAt: new Date(),
      user: testUser,
      organisation: testOrg,
    }]);
    const app = createApp();

    const res = await handle(app, '/api/organisations');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Test Org');
    expect(res.body[0].orgRole).toBe('member');
  });

  it('should include orgs owned by user even without membership', async () => {
    baseSeed();
    seedRepo('Organisation', [{ ...testOrg }]);
    seedRepo('OrganisationMember', []);
    const app = createApp();

    const res = await handle(app, '/api/organisations');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Test Org');
  });
});

describe('POST /api/organisations', () => {
  it('should create a new organisation', async () => {
    baseSeed();
    seedRepo('Organisation', []);
    seedRepo('OrganisationMember', []);
    seedRepo('OrganisationDnsZone', []);
    const app = createApp();

    const res = await handle(app, '/api/organisations', {
      method: 'POST',
      body: { name: 'New Org', handle: 'new.org' },
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.org.name).toBe('New Org');
    expect(res.body.org.orgRole).toBe('owner');
  });

  it('should reject missing name or handle', async () => {
    baseSeed();
    seedRepo('Organisation', []);
    seedRepo('OrganisationMember', []);
    const app = createApp();

    const res1 = await handle(app, '/api/organisations', {
      method: 'POST', body: { handle: 'test.org' },
    });
    expect(res1.status).toBe(400);

    const res2 = await handle(app, '/api/organisations', {
      method: 'POST', body: { name: 'Test' },
    });
    expect(res2.status).toBe(400);
  });

  it('should reject invalid handle format', async () => {
    baseSeed();
    seedRepo('Organisation', []);
    seedRepo('OrganisationMember', []);
    const app = createApp();

    const res = await handle(app, '/api/organisations', {
      method: 'POST', body: { name: 'Test', handle: 'invalid-handle' },
    });
    expect(res.status).toBe(400);
  });

  it('should reject duplicate handle', async () => {
    baseSeed();
    seedRepo('Organisation', [{ ...testOrg }]);
    seedRepo('OrganisationMember', []);
    seedRepo('OrganisationDnsZone', []);
    const app = createApp();

    const res = await handle(app, '/api/organisations', {
      method: 'POST', body: { name: 'Another', handle: 'test.org' },
    });
    expect(res.status).toBe(409);
  });
});

describe('GET /api/organisations/:id', () => {
  it('should return organisation details', async () => {
    baseSeed();
    seedRepo('Organisation', [{ ...testOrg }]);
    seedRepo('OrganisationMember', [{
      id: 1, userId: 1, organisationId: 1, orgRole: 'admin',
      createdAt: new Date(), user: testUser, organisation: testOrg,
    }]);
    seedRepo('OrganisationInvite', []);
    const app = createApp();

    const res = await handle(app, '/api/organisations/1');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Test Org');
    expect(res.body.orgRole).toBe('admin');
  });

  it('should return 404 for non-existent org', async () => {
    baseSeed();
    seedRepo('Organisation', []);
    seedRepo('OrganisationMember', []);
    const app = createApp();

    const res = await handle(app, '/api/organisations/999');
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/organisations/:id', () => {
  it('should update organisation name', async () => {
    baseSeed();
    seedRepo('Organisation', [{ ...testOrg }]);
    seedRepo('OrganisationMember', [{
      id: 1, userId: 1, organisationId: 1, orgRole: 'owner',
      createdAt: new Date(), user: testUser, organisation: testOrg,
    }]);
    const app = createApp();

    const res = await handle(app, '/api/organisations/1', {
      method: 'PUT', body: { name: 'Updated Org' },
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.org.name).toBe('Updated Org');
  });

  it('should return 404 for non-existent org', async () => {
    baseSeed();
    seedRepo('Organisation', []);
    seedRepo('OrganisationMember', []);
    const app = createApp();

    const res = await handle(app, '/api/organisations/999', {
      method: 'PUT', body: { name: 'X' },
    });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/organisations/:id/users/:userId', () => {
  it('should remove a user from organisation', async () => {
    baseSeed();
    seedRepo('Organisation', [{ ...testOrg, ownerId: 1 }]);
    seedRepo('OrganisationMember', [
      {
        id: 1, userId: 1, organisationId: 1, orgRole: 'admin',
        createdAt: new Date(), user: testUser, organisation: testOrg,
      },
      {
        id: 2, userId: 2, organisationId: 1, orgRole: 'member',
        createdAt: new Date(),
        user: { ...testUser, id: 2, email: 'user2@test.com' },
        organisation: testOrg,
      },
    ]);
    const app = createApp();

    const res = await handle(app, '/api/organisations/1/users/2', { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should reject removing the owner', async () => {
    baseSeed();
    seedRepo('Organisation', [{ ...testOrg, ownerId: 1 }]);
    seedRepo('OrganisationMember', [{
      id: 1, userId: 1, organisationId: 1, orgRole: 'owner',
      createdAt: new Date(), user: { ...testUser, id: 1 }, organisation: testOrg,
    }]);
    const app = createApp();

    const res = await handle(app, '/api/organisations/1/users/1', { method: 'DELETE' });
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/organisations/:id/users/:userId/role', () => {
  it('should change a user role', async () => {
    baseSeed();
    seedRepo('Organisation', [{ ...testOrg }]);
    seedRepo('OrganisationMember', [
      {
        id: 1, userId: 1, organisationId: 1, orgRole: 'admin',
        createdAt: new Date(), user: testUser, organisation: testOrg,
      },
      {
        id: 2, userId: 2, organisationId: 1, orgRole: 'member',
        createdAt: new Date(),
        user: { ...testUser, id: 2, email: 'user2@test.com' },
        organisation: testOrg,
      },
    ]);
    const app = createApp();

    const res = await handle(app, '/api/organisations/1/users/2/role', {
      method: 'PUT', body: { orgRole: 'admin' },
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should reject invalid role', async () => {
    baseSeed();
    seedRepo('Organisation', [{ ...testOrg }]);
    seedRepo('OrganisationMember', [
      {
        id: 1, userId: 1, organisationId: 1, orgRole: 'owner',
        createdAt: new Date(), user: testUser, organisation: testOrg,
      },
      {
        id: 2, userId: 2, organisationId: 1, orgRole: 'member',
        createdAt: new Date(),
        user: { ...testUser, id: 2, email: 'user2@test.com' },
        organisation: testOrg,
      },
    ]);
    const app = createApp();

    const res = await handle(app, '/api/organisations/1/users/2/role', {
      method: 'PUT', body: { orgRole: 'superadmin' },
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/organisations/:id/invite', () => {
  it('should invite a user by email', async () => {
    baseSeed();
    seedRepo('Organisation', [{ ...testOrg }]);
    seedRepo('OrganisationMember', [{
      id: 1, userId: 1, organisationId: 1, orgRole: 'admin',
      createdAt: new Date(), user: testUser, organisation: testOrg,
    }]);
    seedRepo('OrganisationInvite', []);
    seedRepo('User', []);
    const app = createApp();

    const res = await handle(app, '/api/organisations/1/invite', {
      method: 'POST', body: { email: 'invited@test.com' },
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.token).toBe('string');
  });

  it('should reject invite for existing member', async () => {
    baseSeed();
    seedRepo('Organisation', [{ ...testOrg }]);
    seedRepo('User', [{ ...testUser, id: 2, email: 'existing@test.com' }]);
    seedRepo('OrganisationMember', [
      {
        id: 1, userId: 1, organisationId: 1, orgRole: 'admin',
        createdAt: new Date(), user: testUser, organisation: testOrg,
      },
      {
        id: 2, userId: 2, organisationId: 1, orgRole: 'member',
        createdAt: new Date(),
        user: { ...testUser, id: 2, email: 'existing@test.com' },
        organisation: testOrg,
      },
    ]);
    seedRepo('OrganisationInvite', []);
    const app = createApp();

    const res = await handle(app, '/api/organisations/1/invite', {
      method: 'POST', body: { email: 'existing@test.com' },
    });
    expect(res.status).toBe(409);
  });

  it('should reject inviting self', async () => {
    baseSeed();
    seedRepo('Organisation', [{ ...testOrg }]);
    seedRepo('OrganisationMember', [{
      id: 1, userId: 1, organisationId: 1, orgRole: 'admin',
      createdAt: new Date(), user: testUser, organisation: testOrg,
    }]);
    seedRepo('OrganisationInvite', []);
    const app = createApp();

    const res = await handle(app, '/api/organisations/1/invite', {
      method: 'POST', body: { email: 'test@example.com' },
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/organisations/accept-invite', () => {
  it('should accept invite with valid token', async () => {
    const invite = {
      id: 1, email: 'test@example.com', token: 'valid-token',
      accepted: false, createdAt: new Date(),
      organisation: { ...testOrg },
    };
    baseSeed();
    seedRepo('OrganisationInvite', [invite]);
    seedRepo('OrganisationMember', []);
    const app = createApp();

    const res = await handle(app, '/api/organisations/accept-invite', {
      method: 'POST', body: { token: 'valid-token' },
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should reject invalid or already accepted token', async () => {
    const acceptedInvite = {
      id: 2, email: 'test@example.com', token: 'used-token',
      accepted: true, createdAt: new Date(),
      organisation: { ...testOrg },
    };
    baseSeed();
    seedRepo('OrganisationInvite', [acceptedInvite]);
    const app = createApp();

    const res = await handle(app, '/api/organisations/accept-invite', {
      method: 'POST', body: { token: 'used-token' },
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/organisations/invites', () => {
  it('should list pending invites for current user', async () => {
    baseSeed();
    seedRepo('OrganisationInvite', [
      {
        id: 1, email: 'test@example.com', token: 't1',
        accepted: false, createdAt: new Date(),
        organisation: { ...testOrg, id: 1, name: 'Org A' },
      },
      {
        id: 2, email: 'test@example.com', token: 't2',
        accepted: false, createdAt: new Date(),
        organisation: { ...testOrg, id: 2, name: 'Org B' },
      },
    ]);
    const app = createApp();

    const res = await handle(app, '/api/organisations/invites');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });
});

describe('POST /api/organisations/invites/:inviteId/accept', () => {
  it('should accept a pending invite by ID', async () => {
    const invite = {
      id: 1, email: 'test@example.com', token: 't1',
      accepted: false, createdAt: new Date(),
      organisation: { ...testOrg },
    };
    baseSeed();
    seedRepo('OrganisationInvite', [invite]);
    seedRepo('OrganisationMember', []);
    const app = createApp();

    const res = await handle(app, '/api/organisations/invites/1/accept', {
      method: 'POST',
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('POST /api/organisations/invites/:inviteId/reject', () => {
  it('should reject a pending invite by ID', async () => {
    const invite = {
      id: 1, email: 'test@example.com', token: 't1',
      accepted: false, createdAt: new Date(),
      organisation: { ...testOrg },
    };
    baseSeed();
    seedRepo('OrganisationInvite', [invite]);
    const app = createApp();

    const res = await handle(app, '/api/organisations/invites/1/reject', {
      method: 'POST',
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should return 404 for non-existent invite', async () => {
    baseSeed();
    seedRepo('OrganisationInvite', []);
    const app = createApp();

    const res = await handle(app, '/api/organisations/invites/999/reject', {
      method: 'POST',
    });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/organisations/:id/leave', () => {
  it('should allow member to leave organisation', async () => {
    baseSeed();
    // org owner is user 2, so user 1 can leave
    seedRepo('Organisation', [{ ...testOrg, ownerId: 2 }]);
    seedRepo('OrganisationMember', [{
      id: 1, userId: 1, organisationId: 1, orgRole: 'member',
      createdAt: new Date(), user: testUser, organisation: testOrg,
    }]);
    const app = createApp();

    const res = await handle(app, '/api/organisations/1/leave', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should prevent owner from leaving', async () => {
    baseSeed();
    seedRepo('Organisation', [{ ...testOrg, ownerId: 1 }]);
    seedRepo('OrganisationMember', [{
      id: 1, userId: 1, organisationId: 1, orgRole: 'owner',
      createdAt: new Date(), user: testUser, organisation: testOrg,
    }]);
    const app = createApp();

    const res = await handle(app, '/api/organisations/1/leave', { method: 'POST' });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/organisations/:id/add-user', () => {
  it('should add an existing user by ID', async () => {
    baseSeed();
    seedRepo('Organisation', [{ ...testOrg }]);
    seedRepo('User', [{ ...testUser, id: 2, email: 'newuser@test.com' }]);
    seedRepo('OrganisationMember', [{
      id: 1, userId: 1, organisationId: 1, orgRole: 'admin',
      createdAt: new Date(), user: testUser, organisation: testOrg,
    }]);
    const app = createApp();

    const res = await handle(app, '/api/organisations/1/add-user', {
      method: 'POST', body: { userId: 2, orgRole: 'member' },
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should add an existing user by email', async () => {
    baseSeed();
    seedRepo('Organisation', [{ ...testOrg }]);
    seedRepo('User', [{ ...testUser, id: 2, email: 'byemail@test.com' }]);
    seedRepo('OrganisationMember', [{
      id: 1, userId: 1, organisationId: 1, orgRole: 'admin',
      createdAt: new Date(), user: testUser, organisation: testOrg,
    }]);
    const app = createApp();

    const res = await handle(app, '/api/organisations/1/add-user', {
      method: 'POST', body: { email: 'byemail@test.com', orgRole: 'member' },
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should reject adding a user already in org', async () => {
    baseSeed();
    seedRepo('Organisation', [{ ...testOrg }]);
    seedRepo('User', [{ ...testUser, id: 2, email: 'already@test.com' }]);
    seedRepo('OrganisationMember', [
      {
        id: 1, userId: 1, organisationId: 1, orgRole: 'admin',
        createdAt: new Date(), user: testUser, organisation: testOrg,
      },
      {
        id: 2, userId: 2, organisationId: 1, orgRole: 'member',
        createdAt: new Date(),
        user: { ...testUser, id: 2, email: 'already@test.com' },
        organisation: testOrg,
      },
    ]);
    const app = createApp();

    const res = await handle(app, '/api/organisations/1/add-user', {
      method: 'POST', body: { userId: 2 },
    });
    expect(res.status).toBe(409);
  });
});

describe('GET /api/organisations/:id/users', () => {
  it('should list members of an organisation', async () => {
    baseSeed();
    seedRepo('Organisation', [{ ...testOrg }]);
    seedRepo('OrganisationMember', [
      {
        id: 1, userId: 1, organisationId: 1, orgRole: 'admin',
        createdAt: new Date(), user: testUser, organisation: testOrg,
      },
      {
        id: 2, userId: 2, organisationId: 1, orgRole: 'member',
        createdAt: new Date(),
        user: { ...testUser, id: 2, email: 'user2@test.com' },
        organisation: testOrg,
      },
    ]);
    const app = createApp();

    const res = await handle(app, '/api/organisations/1/users');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });
});

describe('error handling', () => {
  it('should return 404 for non-existent organisation on detail', async () => {
    baseSeed();
    seedRepo('Organisation', []);
    seedRepo('OrganisationMember', []);
    const app = createApp();

    const res = await handle(app, '/api/organisations/999');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('should return 404 for non-existent org on user list', async () => {
    baseSeed();
    seedRepo('Organisation', []);
    seedRepo('OrganisationMember', []);
    const app = createApp();

    const res = await handle(app, '/api/organisations/999/users');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('should return 401 for unauthenticated request', async () => {
    baseSeed();
    seedRepo('Organisation', []);
    seedRepo('OrganisationMember', []);
    const app = createApp();

    const req = new Request('http://localhost/api/organisations', { method: 'GET' });
    const res = await app.handle(req);
    const text = await res.clone().text();
    let body: unknown;
    try { body = JSON.parse(text); } catch { body = text; }
    expect(res.status).toBe(401);
    expect(body).toHaveProperty('error');
  });
});
