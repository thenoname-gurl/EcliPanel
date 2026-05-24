import { authenticate } from './auth';
import { AppDataSource } from '../config/typeorm';
import { OrganisationMember, ApiRequestLog, User } from '../repositories';

export function setupMiddleware(app: {
  log?: unknown;
  onRequest: (handler: (ctx: unknown) => Promise<void>) => void;
  onAfterHandle: (handler: (ctx: unknown) => Promise<void>) => void;
}): void {
  app.onRequest(
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

  app.onAfterHandle(
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
      } catch {
        // ignore
      }
    }
  );
}

export { authenticate };
