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

      const orgId = (user && typeof user === 'object' && ('org' in user) && (user as any).org?.id)
        || apiKey?.user?.org?.id;

      const repo = AppDataSource.getRepository(require('../models/apiRequestLog.entity').ApiRequestLog);
      const record = repo.create({ endpoint: url, userId: userId ?? undefined, organisationId: orgId ?? undefined, count: 1, timestamp: new Date() });
      await repo.save(record);
    } catch {}
  });
}

export { authenticate };