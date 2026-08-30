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
    if (typeof v === 'object' && v !== null) return item[k] == null;
    return item[k] === v;
  });
}

let activeUser: any = {
  id: 1,
  email: 'member@test.com',
  luminosMember: true,
  settings: {},
  billingCountry: 'US',
  sessions: ['s1'],
  portalType: 'free',
};

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
    hasPermissionSync: () => false,
    hasPermission: async () => false,
  }));

  mock.module('../../src/middleware/featureToggle', () => ({
    requireFeature: async () => true,
  }));

  mock.module('../../src/middleware/stepUp', () => ({
    requirePasskeyStepUp: () => true,
  }));

  mock.module('../../src/config/redis', () => ({
    withRedisCache: async <T>(_key: string, _ttl: number, fn: () => Promise<T>) => fn(),
    consumeRateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }),
    redisDelByPrefix: async () => {},
  }));

  mock.module('../../src/models/order.entity', () => ({ Order: class Order {} }));
  mock.module('../../src/models/coupon.entity', () => ({ Coupon: class Coupon {} }));
  mock.module('../../src/models/couponUse.entity', () => ({ CouponUse: class CouponUse {} }));
  mock.module('../../src/models/user.entity', () => ({ User: class User {} }));
  mock.module('../../src/models/plan.entity', () => ({ Plan: class Plan {} }));
  mock.module('../../src/models/panelSetting.entity', () => ({ PanelSetting: class PanelSetting {} }));
  mock.module('../../src/models/regionalPrice.entity', () => ({ RegionalPrice: class RegionalPrice {} }));
});

afterEach(() => {
  for (const key of Object.keys(dataStore)) delete dataStore[key];
  for (const key of Object.keys(idCounters)) delete idCounters[key];
  activeUser = {
    id: 1,
    email: 'member@test.com',
    luminosMember: true,
    settings: {},
    billingCountry: 'US',
    sessions: ['s1'],
    portalType: 'free',
  };
});

describe('applyMembershipDiscount', () => {
  it('returns amount unchanged for non-members', async () => {
    const { applyMembershipDiscount } = await import('../../src/utils/regionalPricing');
    expect(applyMembershipDiscount(10, { luminosMember: false } as any)).toBe(10);
    expect(applyMembershipDiscount(10, null)).toBe(10);
    expect(applyMembershipDiscount(10, undefined)).toBe(10);
  });

  it('applies 5% for members and rounds to cents', async () => {
    const { applyMembershipDiscount } = await import('../../src/utils/regionalPricing');
    expect(applyMembershipDiscount(10, { luminosMember: true } as any)).toBe(9.5);
    expect(applyMembershipDiscount(0, { luminosMember: true } as any)).toBe(0);
    expect(applyMembershipDiscount(9.99, { luminosMember: true } as any)).toBe(9.49); // 9.4905 -> 9.49
    expect(applyMembershipDiscount(100, { luminosMember: true } as any)).toBe(95);
  });
});

describe('Order creation with membership discount', () => {
  function shimmedApp(): Elysia {
    const app = new Elysia();
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
    const { orderRoutes } = require('../../src/handlers/orderHandler');
    orderRoutes(app as never, '/api');
    return app;
  }

  async function createOrder(planId = 1): Promise<Response> {
    const res = await shimmedApp().handle(
      new Request('http://localhost/api/orders', {
        method: 'POST',
        headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
        body: JSON.stringify({ planId, description: 'Test plan' }),
      })
    );
    return res;
  }

  it('discounts amount, items, and tax for a member', async () => {
    seedRepo('Plan', [{ id: 1, name: 'Test Plan', price: 10, type: 'standard' }]);
    seedRepo('PanelSetting', [{ key: 'billingTaxRules', value: 'US:20' }]);
    const res = await createOrder();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.order.amount).toBe(9.5);
    const items = JSON.parse(data.order.items);
    expect(items[0].price).toBe(9.5);
    expect(data.order.taxAmount).toBe(1.9);
    expect(data.order.taxRate).toBe(20);
    expect(data.order.notes).toContain('luminos_discount:true');
    expect(data.order.status).toBe('pending');
  });

  it('keeps full price and tax for a non-member', async () => {
    activeUser.luminosMember = false;
    seedRepo('Plan', [{ id: 1, name: 'Test Plan', price: 10, type: 'standard' }]);
    seedRepo('PanelSetting', [{ key: 'billingTaxRules', value: 'US:20' }]);
    const res = await createOrder();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.order.amount).toBe(10);
    const items = JSON.parse(data.order.items);
    expect(items[0].price).toBe(10);
    expect(data.order.taxAmount).toBe(2);
    expect(data.order.notes ?? '').not.toContain('luminos_discount:true');
  });

  it('applies no discount when there is no tax country and plan is free', async () => {
    activeUser.billingCountry = null;
    seedRepo('Plan', [{ id: 1, name: 'Free Plan', price: 0, type: 'standard' }]);
    const res = await createOrder();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.order.amount).toBe(0);
    expect(data.order.status).toBe('active');
    expect(data.order.notes ?? '').not.toContain('luminos_discount:true');
  });
});
