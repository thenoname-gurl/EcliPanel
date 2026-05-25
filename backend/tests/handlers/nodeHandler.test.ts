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
  createQueryBuilder: () => { delete: () => { from: () => { where: () => { andWhere: () => { execute: () => Promise<void> } } } } };
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

const testNode = {
  id: 1,
  name: 'Test Node',
  url: 'https://node1.example.com',
  token: 'test-token-123',
  nodeId: 'abc123def456abc123def456abc123de',
  nodeType: 'free',
  useSSL: true,
  deploymentsDisabled: false,
  createdAt: new Date(),
};

const testUser = {
  id: 1,
  email: 'admin@test.com',
  firstName: 'Admin',
  lastName: 'User',
  passwordHash: '',
  orgRole: 'admin',
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
};

let mockNodeService: any;
let mockGetUnhealthyNodeIds: any;

beforeAll(() => {
  mockNodeService = {
    registerNode: async (...args: unknown[]) => {
      const [name, url, token, nodeId] = args;
      const node = { id: idCounters['Node'] || 1, name, url, token, nodeId, nodeType: 'free', useSSL: true, deploymentsDisabled: false, createdAt: new Date() };
      if (!dataStore['Node']) dataStore['Node'] = [];
      (node as any).id = idCounters['Node'] ? idCounters['Node']++ : (idCounters['Node'] = 2, 1);
      dataStore['Node'].push(node);
      return node;
    },
    invalidateNode: async () => {},
    updateCredentials: async (id: number, rootUser: string, rootPassword: string) => ({ id, rootUser, rootPassword }),
    getCredentials: async (id: number) => ({ rootUser: 'admin', rootPassword: 'secret' }),
    mapServer: async (uuid: string, nodeId: number) => ({ uuid, nodeId }),
  };

  mockGetUnhealthyNodeIds = async () => [];

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

  mock.module('../../src/config/redis', () => ({
    withRedisCache: async <T>(_key: string, _ttl: number, fn: () => Promise<T>) => fn(),
    consumeRateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }),
    redisDelByPrefix: async () => {},
  }));

  mock.module('../../src/services/nodeService', () => ({ nodeService: mockNodeService }));

  mock.module('../../src/utils/nodeHealth', () => ({
    getUnhealthyNodeIds: (...args: unknown[]) => mockGetUnhealthyNodeIds(...args),
  }));

  mock.module('../../src/utils/ipv6', () => ({
    isValidIpv6Cidr: (s: string) => /^([a-f0-9:]+)\/(\d+)$/i.test(s),
  }));

  mock.module('../../src/utils/bunCrypto', () => ({
    randomHex: () => 'mock-token-hex-32-bytes-long!',
  }));

  mock.module('../../src/services/sftpProxyService', () => ({
    refreshAllSftpProxies: async () => {},
  }));

  mock.module('../../src/services/wingsApiService', () => ({
    WingsApiService: class {
      async getServers() { return { data: [] }; }
      async getServer() { return { data: { state: 'offline' } }; }
      async powerServer() {}
      async syncServer() {}
    },
  }));

  // Model mocks to prevent TypeORM decorator evaluation
  mock.module('../../src/models/node.entity', () => ({ Node: class Node {} }));
  mock.module('../../src/models/serverMapping.entity', () => ({ ServerMapping: class ServerMapping {} }));
  mock.module('../../src/models/nodeHeartbeat.entity', () => ({ NodeHeartbeat: class NodeHeartbeat {} }));
  mock.module('../../src/models/serverConfig.entity', () => ({ ServerConfig: class ServerConfig {} }));
});

afterEach(() => {
  for (const key of Object.keys(dataStore)) delete dataStore[key];
  for (const key of Object.keys(idCounters)) delete idCounters[key];
});

function createApp(): Elysia {
  const { nodeRoutes } = require('../../src/handlers/nodeHandler');
  const app = new Elysia();
  nodeRoutes(app as never, '/api');
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

// ---------------------------------------------------------------------------
// Route Tests
// ---------------------------------------------------------------------------

describe('GET /api/nodes', () => {
  it('should return list of nodes (admin)', async () => {
    seedRepo('Node', [testNode]);
    const app = createApp();

    const res = await handle(app, '/api/nodes');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Test Node');
    expect(res.body[0].token).toBeUndefined();
    expect(res.body[0].rootUser).toBeUndefined();
    expect(res.body[0].rootPassword).toBeUndefined();
  });

  it('should return empty list when no nodes', async () => {
    seedRepo('Node', []);
    const app = createApp();

    const res = await handle(app, '/api/nodes');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  it('should return 401 without auth', async () => {
    seedRepo('Node', []);
    const app = createApp();

    const req = new Request('http://localhost/api/nodes', { method: 'GET' });
    const res = await app.handle(req);
    const text = await res.clone().text();
    let body: unknown;
    try { body = JSON.parse(text); } catch { body = text; }
    expect(res.status).toBe(401);
    expect(body).toHaveProperty('error');
  });
});

describe('GET /api/nodes/available', () => {
  it('should return available nodes for admin user', async () => {
    seedRepo('Node', [testNode]);
    const app = createApp();

    const res = await handle(app, '/api/nodes/available');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('should return available nodes for regular user', async () => {
    seedRepo('Node', [testNode]);
    seedRepo('OrganisationMember', []);
    const app = createApp();

    const res = await handle(app, '/api/nodes/available');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('should return 401 without auth', async () => {
    seedRepo('Node', []);
    const app = createApp();

    const req = new Request('http://localhost/api/nodes/available', { method: 'GET' });
    const res = await app.handle(req);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/nodes/:id', () => {
  it('should return node by id', async () => {
    seedRepo('Node', [testNode]);
    const app = createApp();

    const res = await handle(app, '/api/nodes/1');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Test Node');
    expect(res.body.token).toBeUndefined();
  });

  it('should return node by UUID', async () => {
    seedRepo('Node', [testNode]);
    const app = createApp();

    const res = await handle(app, `/api/nodes/${testNode.nodeId}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Test Node');
  });

  it('should return 404 for non-existent node', async () => {
    seedRepo('Node', []);
    const app = createApp();

    const res = await handle(app, '/api/nodes/999');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});

describe('POST /api/nodes', () => {
  it('should create a new node', async () => {
    seedRepo('Node', []);
    const app = createApp();

    const res = await handle(app, '/api/nodes', {
      method: 'POST',
      body: { name: 'New Node', url: 'https://new.example.com', token: 'new-token' },
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.node.name).toBe('New Node');
  });

  it('should reject missing name, url, or token', async () => {
    seedRepo('Node', []);
    const app = createApp();

    const res = await handle(app, '/api/nodes', {
      method: 'POST',
      body: { name: 'X' },
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('should reject invalid nodeId format', async () => {
    seedRepo('Node', []);
    const app = createApp();

    const res = await handle(app, '/api/nodes', {
      method: 'POST',
      body: { name: 'X', url: 'https://x.com', token: 't', nodeId: 'not-a-uuid' },
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('should reject invalid port range', async () => {
    seedRepo('Node', []);
    const app = createApp();

    const res = await handle(app, '/api/nodes', {
      method: 'POST',
      body: { name: 'X', url: 'https://x.com', token: 't', portRangeStart: 0 },
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('should reject port range start > end', async () => {
    seedRepo('Node', []);
    const app = createApp();

    const res = await handle(app, '/api/nodes', {
      method: 'POST',
      body: { name: 'X', url: 'https://x.com', token: 't', portRangeStart: 100, portRangeEnd: 50 },
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

describe('PUT /api/nodes/:id', () => {
  it('should update a node', async () => {
    seedRepo('Node', [testNode]);
    const app = createApp();

    const res = await handle(app, '/api/nodes/1', {
      method: 'PUT',
      body: { name: 'Updated Node' },
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.node.name).toBe('Updated Node');
  });

  it('should return 404 for non-existent node', async () => {
    seedRepo('Node', []);
    const app = createApp();

    const res = await handle(app, '/api/nodes/999', {
      method: 'PUT',
      body: { name: 'X' },
    });
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('should reject invalid nodeType', async () => {
    seedRepo('Node', [testNode]);
    const app = createApp();

    const res = await handle(app, '/api/nodes/1', {
      method: 'PUT',
      body: { name: 'X', nodeType: 'invalid' },
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

describe('DELETE /api/nodes/:id', () => {
  it('should delete a node', async () => {
    seedRepo('Node', [testNode]);
    const app = createApp();

    const res = await handle(app, '/api/nodes/1', { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(dataStore['Node']).toHaveLength(0);
  });

  it('should return 404 for non-existent node', async () => {
    seedRepo('Node', []);
    const app = createApp();

    const res = await handle(app, '/api/nodes/999', { method: 'DELETE' });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/nodes/heartbeats', () => {
  it('should return heartbeats for all nodes', async () => {
    seedRepo('Node', [testNode]);
    seedRepo('NodeHeartbeat', []);
    const app = createApp();

    const res = await handle(app, '/api/nodes/heartbeats');
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('object');
  });
});

describe('GET /api/nodes/:id/heartbeats', () => {
  it('should return heartbeats for a single node', async () => {
    seedRepo('Node', [testNode]);
    seedRepo('NodeHeartbeat', []);
    const app = createApp();

    const res = await handle(app, '/api/nodes/1/heartbeats');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('points');
    expect(res.body).toHaveProperty('summary');
  });

  it('should accept window parameter', async () => {
    seedRepo('Node', [testNode]);
    seedRepo('NodeHeartbeat', []);
    const app = createApp();

    const res = await handle(app, '/api/nodes/1/heartbeats?window=7d');
    expect(res.status).toBe(200);
    expect(res.body.summary.window).toBe('7d');
  });
});

describe('GET /api/nodes/generate-token', () => {
  it('should generate a random token', async () => {
    const app = createApp();

    const res = await handle(app, '/api/nodes/generate-token');
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.length).toBeGreaterThan(0);
  });
});

describe('PUT /api/nodes/:id/credentials', () => {
  it('should update node credentials', async () => {
    const app = createApp();

    const res = await handle(app, '/api/nodes/1/credentials', {
      method: 'PUT',
      body: { rootUser: 'admin', rootPassword: 'newpass' },
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/nodes/:id/credentials', () => {
  it('should return node credentials', async () => {
    const app = createApp();

    const res = await handle(app, '/api/nodes/1/credentials');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('credentials');
  });
});

describe('GET /api/nodes/:id/token', () => {
  it('should return node token', async () => {
    seedRepo('Node', [testNode]);
    const app = createApp();

    const res = await handle(app, '/api/nodes/1/token');
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
  });

  it('should return 404 for non-existent node', async () => {
    seedRepo('Node', []);
    const app = createApp();

    const res = await handle(app, '/api/nodes/999/token');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});

describe('POST /api/servers/:id/map', () => {
  it('should map server to node', async () => {
    const app = createApp();

    const res = await handle(app, '/api/servers/some-uuid/map', {
      method: 'POST',
      body: { nodeId: '1' },
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.mapping).toBeDefined();
  });
});

describe('POST /api/nodes/:id/mass-allocation-change', () => {
  it('should change IP allocations', async () => {
    seedRepo('Node', [testNode]);
    const app = createApp();

    const res = await handle(app, '/api/nodes/1/mass-allocation-change', {
      method: 'POST',
      body: { oldIp: '192.168.1.1', newIp: '192.168.1.2' },
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should reject missing oldIp or newIp', async () => {
    seedRepo('Node', [testNode]);
    const app = createApp();

    const res = await handle(app, '/api/nodes/1/mass-allocation-change', {
      method: 'POST',
      body: { oldIp: '' },
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('should reject same oldIp and newIp', async () => {
    seedRepo('Node', [testNode]);
    const app = createApp();

    const res = await handle(app, '/api/nodes/1/mass-allocation-change', {
      method: 'POST',
      body: { oldIp: '10.0.0.1', newIp: '10.0.0.1' },
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('should return 404 for non-existent node', async () => {
    seedRepo('Node', []);
    const app = createApp();

    const res = await handle(app, '/api/nodes/999/mass-allocation-change', {
      method: 'POST',
      body: { oldIp: '10.0.0.1', newIp: '10.0.0.2' },
    });
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});

describe('POST /api/nodes/:id/reboot-all-servers', () => {
  it('should initiate reboot operation', async () => {
    seedRepo('Node', [testNode]);
    const app = createApp();

    const res = await handle(app, '/api/nodes/1/reboot-all-servers', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('operationId');
    expect(res.body.status).toBe('completed');
    expect(res.body.message).toBe('node.noRunningServers');
  });

  it('should return 400 for invalid node id', async () => {
    const app = createApp();

    const res = await handle(app, '/api/nodes/NaN/reboot-all-servers', { method: 'POST' });
    expect(res.status).toBe(400);
  });

  it('should return 404 for non-existent node', async () => {
    seedRepo('Node', []);
    const app = createApp();

    const res = await handle(app, '/api/nodes/999/reboot-all-servers', { method: 'POST' });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/nodes/:id/reboot-status/:operationId', () => {
  it('should return 404 for unknown operation', async () => {
    const app = createApp();

    const res = await handle(app, '/api/nodes/1/reboot-status/non-existent-op');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});
