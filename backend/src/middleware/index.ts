import { authenticate } from './auth';
import { AppDataSource } from '../config/typeorm';

export function setupMiddleware(app: any) {
  app.onRequest(async (ctx: any) => {
    if (!ctx.log) {
      ctx.log = app.log || console;
    }

    const req = ctx.request;
    const url = req.url || '';
    const method = req.method || '';
    ctx.log.info?.(`${method} ${url}`);

    try {
      const user = ctx.user;
      const apiKey = ctx.apiKey;
      const userId = (user && typeof user === 'object' && ('id' in user) && (user as any).id)
        || (user && typeof user === 'object' && ('userId' in user) && (user as any).userId)
        || (apiKey?.user?.id ?? undefined);

      let orgId = (ctx.params && (ctx.params.id || ctx.params.orgId || ctx.params.organisationId))
        || (ctx.query && (ctx.query.id || ctx.query.orgId || ctx.query.organisationId))
        || (ctx.body && (ctx.body.orgId || ctx.body.organisationId));

      if (!orgId && userId) {
        try {
          const orgMemberRepo = AppDataSource.getRepository(require('../models/organisationMember.entity').OrganisationMember);
          const membership = await orgMemberRepo.findOne({ where: { userId: Number(userId) }, order: { createdAt: 'ASC' } as any });
          orgId = membership?.organisationId;
        } catch {}
      }

      const repo = AppDataSource.getRepository(require('../models/apiRequestLog.entity').ApiRequestLog);
      const record = repo.create({ endpoint: url, userId: userId ?? undefined, organisationId: orgId ?? undefined, count: 1, timestamp: new Date() });
      await repo.save(record);
    } catch {}
  });

  app.onAfterHandle(async (ctx: any) => {
    try {
      const user = ctx.user;
      if (!user || !user.id) return;
      if (ctx.apiKey) return;

      const now = new Date();
      const last = user.lastPanelActivityAt ? new Date(user.lastPanelActivityAt) : null;
      const minIntervalMs = 5 * 60 * 1000;
      const shouldUpdateActivity = !(last && now.getTime() - last.getTime() < minIntervalMs);
      if (!shouldUpdateActivity) return;

      const userRepo = AppDataSource.getRepository(require('../models/user.entity').User);
      await userRepo.update({ id: user.id }, { lastPanelActivityAt: now });

      user.lastPanelActivityAt = now;
    } catch {}
  });
}

export { authenticate };