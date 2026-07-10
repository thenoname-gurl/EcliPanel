import { authenticate } from './auth';
import { AppDataSource } from '../config/typeorm';
import { OrganisationMember, ApiRequestLog, User } from '../repositories';

export function setupMiddleware(app: {
  log?: unknown;
  request: (handler: (ctx: unknown) => Promise<void>) => void;
  afterHandle: (handler: (ctx: unknown) => Promise<void>) => void;
}): void {
  app.request(
    async (ctx: {
      log?: { info?: (msg: string) => void };
      request?: { url?: string; method?: string };
      user?: { id?: number; userId?: number };
      apiKey?: { user?: { id?: number } };
      params?: Record<string, unknown>;
      query?: Record<string, unknown>;
      body?: Record<string, unknown>;
    }) => {
      if (!ctx.log) {
        ctx.log = (app as { log?: unknown }).log || console;
      }

      const req = ctx.request;
      const url = req?.url || '';
      const method = req?.method || '';
      ctx.log?.info?.(`${method} ${url}`);

      try {
        const user = ctx.user;
        const apiKey = ctx.apiKey;
        let userId: number | undefined;

        if (user && typeof user === 'object') {
          if ('id' in user && typeof user.id === 'number') {
            userId = user.id;
          } else if ('userId' in user && typeof (user as { userId?: number }).userId === 'number') {
            userId = (user as { userId?: number }).userId;
          }
        }

        if (userId === undefined && apiKey?.user?.id !== undefined) {
          userId = apiKey.user.id;
        }

        let orgId: number | undefined;
        const params = ctx.params;
        const query = ctx.query;
        const body = ctx.body;

        if (params) {
          const paramId = params.id || params.orgId || params.organisationId;
          if (typeof paramId === 'number') orgId = paramId;
          if (typeof paramId === 'string') orgId = parseInt(paramId, 10) || undefined;
        }

        if (orgId === undefined && query) {
          const queryId = query.id || query.orgId || query.organisationId;
          if (typeof queryId === 'number') orgId = queryId;
          if (typeof queryId === 'string') orgId = parseInt(queryId, 10) || undefined;
        }

        if (orgId === undefined && body) {
          const bodyId = body.orgId || body.organisationId;
          if (typeof bodyId === 'number') orgId = bodyId;
          if (typeof bodyId === 'string') orgId = parseInt(bodyId, 10) || undefined;
        }

        if (orgId === undefined && userId !== undefined) {
          try {
            const orgMemberRepo = AppDataSource.getRepository(OrganisationMember);
            const membership = await orgMemberRepo.findOne({
              where: { userId: Number(userId) },
              order: { createdAt: 'ASC' } as const,
            });
            orgId = membership?.organisationId;
          } catch {
            // ignore
          }
        }

        const repo = AppDataSource.getRepository(ApiRequestLog);
        const record = repo.create({
          endpoint: url,
          userId: userId ?? undefined,
          organisationId: orgId ?? undefined,
          count: 1,
          timestamp: new Date(),
        });
        await repo.save(record);
      } catch {
        // ignore
      }
    }
  );

  app.afterHandle(
    async (ctx: { user?: { id?: number; lastPanelActivityAt?: Date }; apiKey?: unknown }) => {
      try {
        const user = ctx.user;
        if (!user || user.id === undefined) return;
        if (ctx.apiKey) return;

        const now = new Date();
        const last = user.lastPanelActivityAt ? new Date(user.lastPanelActivityAt) : null;
        const minIntervalMs = 5 * 60 * 1000;
        const shouldUpdateActivity = !(last && now.getTime() - last.getTime() < minIntervalMs);
        if (!shouldUpdateActivity) return;

        const userRepo = AppDataSource.getRepository(User);
        await userRepo.update({ id: user.id }, { lastPanelActivityAt: now });

        user.lastPanelActivityAt = now;

        try {
          const orderRepo = AppDataSource.getRepository(
            require('../models/order.entity').Order
          );
          const configRepo = AppDataSource.getRepository(
            require('../models/serverConfig.entity').ServerConfig
          );
          const nodeRepo = AppDataSource.getRepository(
            require('../models/node.entity').Node
          );

          const blockedOrders = await orderRepo
            .createQueryBuilder('o')
            .where('o.userId = :uid', { uid: user.id })
            .andWhere('o.status = :status', { status: 'active' })
            .andWhere('o.billingType = :lifetime', { lifetime: 'lifetime' })
            .andWhere('o.lifetimeBlockedAt IS NOT NULL')
            .getMany();

          if (blockedOrders.length > 0) {
            for (const order of blockedOrders) {
              order.lifetimeBlockedAt = undefined as any;
              order.lifetimeGraceEndsAt = undefined as any;
              order.notes = order.notes
                ? `${order.notes}; Lifetime unblocked on ${now.toISOString()}`
                : `Lifetime unblocked on ${now.toISOString()}`;
            }
            await orderRepo.save(blockedOrders);

            const suspendedServers = await configRepo
              .createQueryBuilder('s')
              .where('s.userId = :uid', { uid: user.id })
              .andWhere('s.suspended = :suspended', { suspended: true })
              .andWhere('s.suspendedBy = :suspendedBy', { suspendedBy: 'system' })
              .andWhere('s.suspendedReason LIKE :reason', { reason: 'Lifetime product inactivity%' })
              .getMany();

            for (const cfg of suspendedServers) {
              try {
                const node = await nodeRepo.findOneBy({ id: cfg.nodeId });
                if (node) {
                  const { WingsApiService } = require('../services/wingsApiService');
                  const svc = new WingsApiService(
                    (node as any).backendWingsUrl || node.url,
                    node.token
                  );
                  await svc.syncServer(cfg.uuid, {}).catch(() => {});
                }
              } catch {}
              cfg.suspended = false;
              cfg.suspendedBy = undefined as any;
              cfg.suspendedReason = undefined as any;
              cfg.suspendedAt = undefined as any;
              await configRepo.save(cfg);
            }
          }
        } catch {}
      } catch {
        // buh
      }
    }
  );
}

export { authenticate };
export { checkKycStatus } from './kycCheck';
