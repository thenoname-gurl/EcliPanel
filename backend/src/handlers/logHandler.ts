import { AppDataSource } from '../config/typeorm';
import { UserLog } from '../models/userLog.entity';
import { User } from '../models/user.entity';
import { sendMail } from '../services/mailService';
import { authenticate } from '../middleware/auth';
import { t } from 'elysia';
import { hasPermissionSync } from '../middleware/authorize';

/*
 * A: Always give your 100%!
 * B: Never lose hope!
 * C: The world's largest military is nothing more than a personal guard for the billionaire class.
 *    They will commit genocide on order to enact this brutal hierarchy and use propaganda to justify it and their endless wars.
 *    Our only hope is to join together in a working class revolution and reclaim our freedom.
 * D: Basketball
*/

function formatMetadataForEmail(meta: Record<string, any>, action: string): { message: string; details: string } {
  const { changes, actor, where: target, ipAddress, ...rest } = meta || {};

  const actionLabel = action.replace(/[:_-]/g, ' ').replace(/\b\w/g, (s: string) => s.toUpperCase());
  const actorName = actor?.name ? `${actor.name}` : '';
  let message = `Event: ${actionLabel}`;
  if (actorName) message += ` by ${actorName}`;
  if (target) message += ` on ${target}`;

  const lines: string[] = [];

  if (changes && typeof changes === 'object') {
    const entries = Object.entries(changes).filter(([, v]) => v !== undefined && v !== null && v !== '');
    if (entries.length > 0) {
      lines.push('Changes:');
      for (const [key, val] of entries) {
        let formatted = val;
        if (typeof val === 'number') {
          if (['memory', 'disk', 'swap'].includes(key)) {
            formatted = val >= 1024 ? `${(val / 1024).toFixed(1)} GB` : `${val} MB`;
          } else if (key === 'cpu') {
            formatted = `${val} core${val !== 1 ? 's' : ''}`;
          } else if (key === 'ioWeight') {
            formatted = String(val);
          }
        } else if (typeof val === 'boolean') {
          formatted = val ? 'Yes' : 'No';
        }
        const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (s: string) => s.toUpperCase());
        lines.push(`  \u2022 ${label}: ${formatted}`);
      }
    }
  }

  if (ipAddress) {
    if (lines.length > 0) lines.push('');
    lines.push(`IP Address: ${ipAddress}`);
  }

  if (actor) {
    if (lines.length > 0 && !changes) lines.push('');
    if (actor.email) lines.push(`Email: ${actor.email}`);
    if (actor.role && actor.role !== '*') lines.push(`Role: ${actor.role}`);
  }

  const remaining = Object.entries(rest).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (remaining.length > 0) {
    if (lines.length > 0) lines.push('');
    for (const [key, val] of remaining) {
      const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (s: string) => s.toUpperCase());
      if (typeof val === 'object') {
        lines.push(`${label}: ${JSON.stringify(val)}`);
      } else {
        lines.push(`${label}: ${val}`);
      }
    }
  }

  return { message, details: lines.join('\n') };
}

function stripHtml(value: any): any {
  if (typeof value === 'string') {
    let result = '';
    let last = 0;
    for (const m of value.matchAll(/<[^>]*>/g)) {
      result += Bun.escapeHTML(value.slice(last, m.index));
      last = m.index + m[0].length;
    }
    result += Bun.escapeHTML(value.slice(last));
    return result;
  }
  if (Array.isArray(value)) {
    return value.map(stripHtml);
  }
  if (value && typeof value === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      cleaned[k] = stripHtml(v);
    }
    return cleaned;
  }
  return value;
}

export async function createActivityLog(opts: {
  userId?: number;
  action: string;
  targetId?: string;
  targetType?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  notify?: boolean;
}) {
  const repo = AppDataSource.getRepository(UserLog);
  const entry = repo.create({
    userId: opts.userId || undefined,
    action: opts.action,
    targetId: opts.targetId,
    targetType: opts.targetType,
    metadata: stripHtml(opts.metadata || {}),
    ipAddress: opts.ipAddress,
    timestamp: new Date(),
    isRead: false,
  });
  await repo.save(entry);

  (async () => {
    try {
      if (opts.notify === false) return;

      if (!entry.userId) return;
      const userRepo = AppDataSource.getRepository(User);
      const targetUser = await userRepo.findOneBy({ id: entry.userId });
      if (!targetUser || !targetUser.email) return;

      try {
        const meta = (entry.metadata && typeof entry.metadata === 'object') ? { ...entry.metadata } : {};
        if (!meta.actor) {
          const actor = await userRepo.findOneBy({ id: entry.userId });
          if (actor) meta.actor = { id: actor.id, name: [actor.firstName, actor.lastName].filter(Boolean).join(' ') || actor.email, email: actor.email, role: actor.role };
        }
        if (!meta.where && entry.targetType) meta.where = entry.targetType + (entry.targetId ? `:${entry.targetId}` : '');
        if (entry.ipAddress) meta.ipAddress = entry.ipAddress;
        entry.metadata = meta;
        await repo.save(entry);
      } catch (e) {
        // skip
      }

      const a = (entry.action || '').toLowerCase();
      const notifKey = (() => {
        if (a.startsWith('wings:') || a.includes('wings:')) return 'serverActivity';
        if (a.includes('offline') || a.includes('failed') || a.includes('error') || a.includes('crash')) return 'serverErrors';
        if (a.startsWith('server:') && (a.includes('delete') || a.includes('reinstall') || a.includes('create') || a.includes('stop') || a.includes('start'))) return 'serverLifecycle';
        if (a.includes('bill') || a.includes('invoice') || a.includes('payment')) return 'billing';
        if (a.includes('login') || a.includes('security') || a.includes('suspicious')) return 'security';
        if (a.includes('product') || a.includes('update') || a.includes('announcement')) return 'productUpdates';
        if (a.includes('ticket') || a.includes('support')) return 'tickets';
        if (a.includes('ai') || a.includes('usage') || a.includes('credits')) return 'aiUsage';
        return null;
      })();

      if (!notifKey) return;

      const wants = targetUser.settings?.notifications || {};
      const defaultPrefs: Record<string, boolean> = {
        serverAlerts: true,
        serverLifecycle: true,
        serverErrors: true,
        serverActivity: false,
        billing: true,
        security: true,
        productUpdates: false,
        tickets: true,
        aiUsage: false,
      };

      const prefValue = wants[notifKey];
      const fallback = (notifKey.startsWith('server') && typeof wants['serverAlerts'] === 'boolean') ? wants['serverAlerts'] : undefined;
      const enabled = typeof prefValue === 'boolean' ? prefValue : (typeof fallback === 'boolean' ? fallback : (defaultPrefs[notifKey] ?? true));
      if (!enabled) return;

      const title = notifKey === 'serverErrors' ? 'Server Error' : notifKey === 'serverLifecycle' ? 'Server Event' : notifKey === 'serverActivity' ? 'Server Activity' : notifKey === 'billing' ? 'Billing Notification' : notifKey === 'security' ? 'Security Alert' : notifKey === 'productUpdates' ? 'Product Update' : notifKey === 'tickets' ? 'Ticket Update' : 'Notification';

      const formatted = entry.metadata ? formatMetadataForEmail(entry.metadata, entry.action) : null;
      const message = formatted?.message || `Event: ${entry.action}`;
      const details = formatted?.details || '';

      try {
        await sendMail({
          to: targetUser.email,
          from: process.env.MAIL_FROM,
          subject: `${title} — Eclipse Systems`,
          template: 'notification',
          vars: { title, message, details }
        });
      } catch (e) {
        console.warn('Failed to send notification email', e?.message || e);
      }
    } catch (e) {
      // skip
    }
  })();

  return entry;
}

export async function logRoutes(app: any, prefix = '') {
  app.post(prefix + '/logs', async (ctx: any) => {
    const { userId, action, targetId, targetType, metadata, ipAddress } = (ctx.body as any) || {};
    if (!action) {
      ctx.set.status = 400;
      return { error: 'action is required' };
    }
    const logRepo = AppDataSource.getRepository(UserLog);
    const log = logRepo.create({
      userId: Number(userId) || undefined,
      action,
      targetId: String(targetId || ''),
      targetType: String(targetType || ''),
      metadata: metadata || {},
      ipAddress: String(ipAddress || ''),
      timestamp: new Date(),
      isRead: false,
    });
    await logRepo.save(log);
    return { success: true, log };
  }, {
    beforeHandle: authenticate,
    body: t.Object({
      action: t.String({ minLength: 1, maxLength: 100 }),
      userId: t.Optional(t.Number()),
      targetId: t.Optional(t.String()),
      targetType: t.Optional(t.String()),
      metadata: t.Optional(t.Any()),
      ipAddress: t.Optional(t.String()),
    }),
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }) },
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
    if (requester.id !== userId && !hasPermissionSync(ctx, 'logs:read')) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    const { limit = '50', offset = '0', action, targetType, unread } = ctx.query as any;
    const logRepo = AppDataSource.getRepository(UserLog);
    const qb = logRepo.createQueryBuilder('log')
      .where('log.userId = :userId', { userId })
      .orderBy('log.timestamp', 'DESC')
      .skip(Number(offset))
      .take(Math.min(Number(limit), 200));
    if (action) qb.andWhere('log.action LIKE :action', { action: `%${action}%` });
    if (targetType) qb.andWhere('log.targetType = :targetType', { targetType });
    if (typeof unread !== 'undefined') {
      const unreadVal = String(unread).toLowerCase();
      qb.andWhere('log.isRead = :isRead', { isRead: unreadVal === '1' || unreadVal === 'true' || unreadVal === 'yes' ? false : true });
    }
    const logs = await qb.getMany();
    return logs;
  }, {
   beforeHandle: authenticate,
    response: { 200: t.Array(t.Any()), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Fetch activity logs for a given user', tags: ['Logs'] }
  });

  app.get(prefix + '/users/:id/logs/unread-count', async (ctx: any) => {
    const userId = Number(ctx.params['id']);
    const requester = ctx.user as any;
    if (requester.id !== userId && !hasPermissionSync(ctx, 'logs:read')) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    const logRepo = AppDataSource.getRepository(UserLog);
    const unread = await logRepo.createQueryBuilder('log')
      .where('log.userId = :userId', { userId })
      .andWhere('log.isRead = :isRead', { isRead: false })
      .getCount();

    return { unread };
  }, {
   beforeHandle: authenticate,
    response: { 200: t.Object({ unread: t.Number() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Get unread user log count', tags: ['Logs'] }
  });

  app.patch(prefix + '/users/:id/logs/read-all', async (ctx: any) => {
    const userId = Number(ctx.params['id']);
    const requester = ctx.user as any;
    if (requester.id !== userId && !hasPermissionSync(ctx, 'logs:read')) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    const logRepo = AppDataSource.getRepository(UserLog);
    await logRepo.createQueryBuilder()
      .update(UserLog)
      .set({ isRead: true })
      .where('userId = :userId', { userId })
      .execute();
    return { success: true };
  }, {
   beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Mark all user logs as read', tags: ['Logs'] }
  });

  app.patch(prefix + '/users/:id/logs/:logId/read', async (ctx: any) => {
    const userId = Number(ctx.params['id']);
    const logId = Number(ctx.params['logId']);
    const requester = ctx.user as any;
    if (requester.id !== userId && !hasPermissionSync(ctx, 'logs:read')) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    const logRepo = AppDataSource.getRepository(UserLog);
    const log = await logRepo.findOneBy({ id: logId, userId });
    if (!log) {
      ctx.set.status = 404;
      return { error: 'Not found' };
    }
    log.isRead = true;
    await logRepo.save(log);
    return { success: true, log };
  }, {
   beforeHandle: authenticate,
    response: { 200: t.Any(), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Mark a single log notification as read', tags: ['Logs'] }
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

  app.get(prefix + '/servers/:id/activity', async (ctx: any) => {
    const serverId = ctx.params['id'] as string;
    const { limit = '50', offset = '0' } = ctx.query as any;
    const logRepo = AppDataSource.getRepository(UserLog);
    const logs = await logRepo.createQueryBuilder('log')
      .leftJoinAndMapOne('log.user', User, 'user', 'user.id = log.userId')
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
    detail: { summary: 'Fetch activity for a specific server (alias)', tags: ['Logs'] }
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

  app.get(prefix + '/organisations/:id/activity', async (ctx: any) => {
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
    detail: { summary: 'Fetch activity for a specific organisation (alias)', tags: ['Logs'] }
  });

  app.get(prefix + '/users/:id/activity', async (ctx: any) => {
    const userId = Number(ctx.params['id']);
    const requester = ctx.user as any;
    if (requester.id !== userId && !hasPermissionSync(ctx, 'logs:read')) {
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
    detail: { summary: 'Fetch activity logs for a given user (alias)', tags: ['Logs'] }
  });
}
