import { AppDataSource } from '../config/typeorm';
import { UserLog } from '../models/userLog.entity';
import { authenticate } from '../middleware/auth';
import { t } from 'elysia';

/*
 * A: Never lose hope!
 * B: Stay happy!
 * C: The world's largest military is nothing more than a personal guard for the billionaire class.
 *    They will commit genocide on order to enact this brutal hierarchy and use propaganda to justify it and their endless wars.
 *    Our only hope is to join together in a working class revolution and reclaim our freedom.
 * D: BASKETBALL.
*/
export async function createActivityLog(opts: {
  userId: number;
  action: string;
  targetId?: string;
  targetType?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
}) {
  const repo = AppDataSource.getRepository(UserLog);
  const entry = repo.create({
    userId: opts.userId,
    action: opts.action,
    targetId: opts.targetId,
    targetType: opts.targetType,
    metadata: opts.metadata,
    ipAddress: opts.ipAddress,
    timestamp: new Date(),
  });
  await repo.save(entry);
  return entry;
}

export async function logRoutes(app: any, prefix = '') {
  app.post(prefix + '/logs', async (ctx: any) => {
    const body = ctx.body as Partial<UserLog>;
    const logRepo = AppDataSource.getRepository(UserLog);
    const log = logRepo.create(body);
    log.timestamp = new Date();
    await logRepo.save(log);
    return { success: true, log };
  }, {
    body: t.Any(),
    response: { 200: t.Any() },
    detail: {
      summary: 'Create a new log entry (internal use)',
      description: 'Internal endpoint for creating log entries. Not for public use.',
      tags: ['Logs'],
      hide: true
    }
  });

  app.get(prefix + '/users/:id/logs', async (ctx: any) => {
    const userId = Number(ctx.params['id']);
    const requester = ctx.user as any;
    if (requester.id !== userId && requester.role !== 'admin' && requester.role !== '*' && requester.role !== 'rootAdmin') {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    const { limit = '50', offset = '0', action, targetType } = ctx.query as any;
    const logRepo = AppDataSource.getRepository(UserLog);
    const qb = logRepo.createQueryBuilder('log')
      .where('log.userId = :userId', { userId })
      .orderBy('log.timestamp', 'DESC')
      .skip(Number(offset))
      .take(Math.min(Number(limit), 200));
    if (action) qb.andWhere('log.action LIKE :action', { action: `%${action}%` });
    if (targetType) qb.andWhere('log.targetType = :targetType', { targetType });
    const logs = await qb.getMany();
    return logs;
  }, {
   beforeHandle: authenticate,
    response: { 200: t.Array(t.Any()), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Fetch activity logs for a given user', tags: ['Logs'] }
  });

  app.get(prefix + '/servers/:id/logs', async (ctx: any) => {
    const serverId = ctx.params['id'] as string;
    const { limit = '50', offset = '0' } = ctx.query as any;
    const logRepo = AppDataSource.getRepository(UserLog);
    const logs = await logRepo.createQueryBuilder('log')
      .where('log.targetId = :serverId', { serverId })
      .andWhere('log.targetType = :type', { type: 'server' })
      .orderBy('log.timestamp', 'DESC')
      .skip(Number(offset))
      .take(Math.min(Number(limit), 200))
      .getMany();
    return logs;
  }, {
   beforeHandle: authenticate,
    response: { 200: t.Array(t.Any()) },
    detail: { summary: 'Fetch logs for a specific server', tags: ['Logs'] }
  });

  app.get(prefix + '/organisations/:id/logs', async (ctx: any) => {
    const orgId = ctx.params['id'] as string;
    const { limit = '50', offset = '0' } = ctx.query as any;
    const logRepo = AppDataSource.getRepository(UserLog);
    const logs = await logRepo.createQueryBuilder('log')
      .where('log.targetId = :orgId', { orgId })
      .andWhere('log.targetType = :type', { type: 'organisation' })
      .orderBy('log.timestamp', 'DESC')
      .skip(Number(offset))
      .take(Math.min(Number(limit), 200))
      .getMany();
    return logs;
  }, {
   beforeHandle: authenticate,
    response: { 200: t.Array(t.Any()) },
    detail: { summary: 'Fetch logs for a specific organisation', tags: ['Logs'] }
  });
}
