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
      const orgId = user?.org?.id || apiKey?.user?.org?.id;
      const userId = user?.id || apiKey?.user?.id;
      const repo = AppDataSource.getRepository(require('../models/apiRequestLog.entity').ApiRequestLog);
      const record = repo.create({ endpoint: url, userId, organisationId: orgId, count: 1, timestamp: new Date() });
      await repo.save(record);
    } catch {}
  });
}

export { authenticate };