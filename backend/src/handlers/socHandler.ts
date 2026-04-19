import { AppDataSource } from '../config/typeorm';
import { SocData } from '../models/socData.entity';
import { authenticate } from '../middleware/auth';
import { authorize, hasPermissionSync } from '../middleware/authorize';
import { WingsApiService } from '../services/wingsApiService';
import { redisGet, redisSet } from '../config/redis';
import { t } from 'elysia';

export async function socRoutes(app: any, prefix = '') {
  const socRepo = AppDataSource.getRepository(SocData);

  async function withCache<T>(key: string, ttlSeconds: number, loader: () => Promise<T>) {
    try {
      const cached = await redisGet(key);
      if (cached) {
        const raw = typeof cached === 'string' ? cached : cached.toString();
        return JSON.parse(raw) as T;
      }
    } catch {}

    const data = await loader();
    try {
      await redisSet(key, JSON.stringify(data), ttlSeconds);
    } catch {}
    return data;
  }

  app.get(prefix + '/soc/overview', async (ctx: any) => {
    const user = ctx.user as any;
    const isAdmin = hasPermissionSync(ctx, 'soc:read');

    const cacheKey = isAdmin
      ? 'soc:overview:admin'
      : `soc:overview:user:${user.id}`;

    return withCache(cacheKey, 5, async () => {
      if (isAdmin) {
        return socRepo.find({ order: { timestamp: 'DESC' }, take: 500 });
      }

      try {
        const nodeRepo = AppDataSource.getRepository(require('../models/node.entity').Node);
        const nodes = await nodeRepo.find();

        const serverIds: string[] = [];
        for (const n of nodes) {
          try {
            const base = (n as any).backendWingsUrl || n.url;
            const svc = new WingsApiService(base, n.token);
            const res = await svc.getServers();
            for (const s of (res.data || [])) {
              if (s.owner === user.id) serverIds.push(s.uuid);
            }
          } catch {}
        }

        if (!serverIds.length) return [];

        return socRepo.createQueryBuilder('s')
          .where('s.serverId IN (:...ids)', { ids: serverIds })
          .orderBy('s.timestamp', 'DESC')
          .take(200)
          .getMany();
      } catch {
        return [];
      }
    });
  }, {beforeHandle: authenticate,
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }) },
    detail: { summary: 'SOC overview metrics', tags: ['SOC'] }
  });

  app.post(prefix + '/soc/data', async (ctx: any) => {
    const payload = ctx.body as Partial<SocData>;
    const entry = socRepo.create({
      serverId: payload.serverId,
      metrics: payload.metrics || {},
      timestamp: new Date(),
    });
    await socRepo.save(entry);
    try {
      const { socEmitter } = require('../services/socSocketService');
      socEmitter.emit('update', entry);
    } catch {};
    return { success: true, entry };
  }, { beforeHandle: [authenticate, authorize('soc:write')],
    response: { 200: t.Object({ success: t.Boolean(), entry: t.Any() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Submit SOC data point', tags: ['SOC'] }
  });

  app.get(prefix + '/soc/plans', async (ctx: any) => {
    const planRepo = AppDataSource.getRepository(require('../models/plan.entity').Plan);
    const plans = await planRepo.find();
    return plans;
  }, {beforeHandle: authenticate,
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }) },
    detail: { summary: 'List SOC plans', tags: ['SOC'] }
  });

  app.get(prefix + '/soc/usage/user/:id', async (ctx: any) => {
    const userId = Number(ctx.params['id']);
    const repo = AppDataSource.getRepository(require('../models/apiRequestLog.entity').ApiRequestLog);
    const data = await repo.createQueryBuilder('r')
      .select('r.endpoint', 'endpoint')
      .addSelect('COUNT(*)','count')
      .where('r.userId = :uid', { uid: userId })
      .groupBy('r.endpoint')
      .getRawMany();
    return data;
  }, {beforeHandle: authenticate,
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }) },
    detail: { summary: 'API usage by user', tags: ['SOC'] }
  });

  app.get(prefix + '/soc/usage/org/:id', async (ctx: any) => {
    const orgId = Number(ctx.params['id']);
    const repo = AppDataSource.getRepository(require('../models/apiRequestLog.entity').ApiRequestLog);
    const data = await repo.createQueryBuilder('r')
      .select('r.endpoint', 'endpoint')
      .addSelect('COUNT(*)','count')
      .where('r.organisationId = :oid', { oid: orgId })
      .groupBy('r.endpoint')
      .getRawMany();
    return data;
  }, {beforeHandle: authenticate,
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }) },
    detail: { summary: 'API usage by organisation', tags: ['SOC'] }
  });
}
