import { AppDataSource } from '../config/typeorm';
import { UserLog } from '../models/userLog.entity';
import { User } from '../models/user.entity';
import { ServerConfig } from '../models/serverConfig.entity';
import { sendMail } from '../services/mailService';
import { resolveLocale } from '../i18n/resolve';
import { tForUser } from '../i18n';
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

function formatMetadataForEmail(
  meta: Record<string, any>,
  action: string,
  t: (key: string, params?: Record<string, string | undefined>) => string
): { message: string; details: string } {
  const { changes, actor, where: whereStr, ipAddress, ...rest } = meta || {};

  const parts = action.toLowerCase().split(':');
  const domain = parts[0];
  const verb = parts[parts.length - 1];
  const subdomain = parts.length > 2 ? parts.slice(1, -1).join(' ') : parts.length === 2 ? '' : '';

  const nameEmail = actor?.email
    ? `${actor.name || 'Someone'} (${actor.email})`
    : actor?.name || 'Someone';
  const targetId = whereStr ? whereStr.replace(/^server:/, '') : '';
  const targetLabel = meta?.serverName || meta?.changes?.name || targetId || '';

  const server =
    targetLabel && targetId && targetLabel !== targetId
      ? `${targetLabel} (${targetId})`
      : targetLabel || 'a server';
  const actorStr = nameEmail;

  const n = (key: string, vars?: Record<string, string | undefined>) =>
    t('notification.' + key, vars as any);

  let message = '';

  if (domain === 'server') {
    if (verb === 'create') {
      message = n('serverCreated', { server, actor: actorStr });
    } else if (verb === 'delete') {
      message = n('serverDeleted', { server, actor: actorStr });
    } else if (verb === 'suspend') {
      message = n('serverSuspended', { server, actor: actorStr });
    } else if (verb === 'unsuspend') {
      message = n('serverUnsuspended', { server, actor: actorStr });
    } else if (verb === 'reinstall') {
      message = n('serverReinstalled', { server, actor: actorStr });
    } else if (subdomain === 'power' || parts[1] === 'power') {
      message = n('powerAction', { server, actor: actorStr, action: verb });
    } else if (subdomain === 'console' || parts[1] === 'console') {
      message = n('consoleCommand', { server, actor: actorStr });
    } else if (subdomain === 'file' || parts[1] === 'file') {
      message = n('fileAction', { server, actor: actorStr, action: verb });
    } else if ((subdomain === 'subuser' || parts[1] === 'subuser') && verb === 'add') {
      message = n('subuserAdded', { server, actor: actorStr });
    } else if ((subdomain === 'subuser' || parts[1] === 'subuser') && verb === 'remove') {
      message = n('subuserRemoved', { server, actor: actorStr });
    } else if ((subdomain === 'subuser' || parts[1] === 'subuser') && verb === 'update') {
      message = n('subuserUpdated', { server, actor: actorStr });
    } else if (subdomain === 'kvm' || parts[1] === 'kvm') {
      message = n('kvmAccess', { server, actor: actorStr, action: verb });
    } else if (verb === 'update') {
      message = n('serverUpdated', { server, actor: actorStr });
    } else if (verb === 'assign') {
      message = n('ipAssigned', { server, actor: actorStr });
    } else if (verb === 'deassign') {
      message = n('ipRemoved', { server, actor: actorStr });
    } else {
      const what = subdomain ? `${subdomain} ${verb}` : verb;
      message = n('serverGenericAction', { server, actor: actorStr, action: what });
    }
  } else if (domain === 'org' || domain === 'organization') {
    const orgName = meta?.orgName || meta?.handle || targetId || 'an organization';
    if (verb === 'create') {
      message = n('orgCreated', { org: orgName, actor: actorStr });
    } else if (verb === 'invite') {
      message = n('orgInvited', { invited: meta?.invitedEmail || 'A user', actor: actorStr });
    } else if (verb === 'accept_invite') {
      message = n('orgInviteAccepted', { actor: actorStr });
    } else if (verb === 'reject_invite') {
      message = n('orgInviteRejected', { actor: actorStr });
    } else if (verb === 'remove_member') {
      message = n('orgMemberRemoved', { org: orgName, actor: actorStr });
    } else if (verb === 'change_role') {
      message = n('orgRoleChanged', { org: orgName, actor: actorStr });
    } else if (verb === 'leave') {
      message = n('orgLeft', { org: orgName, actor: actorStr });
    } else if (verb === 'add_user') {
      message = n('orgUserAdded', { org: orgName, actor: actorStr });
    } else if (verb === 'resend_invite') {
      message = n('orgInviteResent', { invited: meta?.invitedEmail || 'a user', actor: actorStr });
    } else if (verb === 'revoke_invite') {
      message = n('orgInviteRevoked', { invited: meta?.invitedEmail || 'a user', actor: actorStr });
    } else {
      message = n('orgGenericAction', {
        org: orgName,
        action: verb.replace(/_/g, ' '),
        actor: actorStr,
      });
    }
  } else if (domain === 'ticket') {
    if (verb === 'urgent') {
      message = n('ticketUrgent', { actor: actorStr });
    } else if (verb === 'escalate') {
      message = n('ticketEscalated', { actor: actorStr });
    } else if (verb === 'spam') {
      message = n('ticketSpam');
    } else if (subdomain === 'ai' && verb === 'reply') {
      message = n('ticketAiReplied');
    } else if (subdomain === 'ai' && verb === 'set') {
      message = n('ticketAiSetResponse');
    } else if (subdomain === 'ai' && verb === 'close') {
      message = n('ticketAiClosed');
    } else if (verb === 'close') {
      message = n('ticketClosed');
    } else if (verb === 'human') {
      message = n('ticketEscalatedHuman');
    } else {
      message = n('ticketUpdated', { actor: actorStr });
    }
  } else if (domain === 'ai') {
    message = n('aiTriggered', { action: verb });
  } else if (domain === 'billing' || domain === 'bill' || domain === 'invoice') {
    message = n('billingEvent', {
      action: verb.replace(/_/g, ' '),
      type: action.includes('invoice') ? 'invoice' : 'billing',
    });
  } else if (domain === 'security') {
    message = n('securityAlertMsg', { action: verb.replace(/_/g, ' ') });
  } else {
    message = n('genericEvent', {
      action: action.replace(/[:_-]/g, ' ').replace(/\b\w/g, (s: string) => s.toUpperCase()),
    });
  }

  message = message.charAt(0).toUpperCase() + message.slice(1);

  if (ipAddress) {
    message += n('eventFromIp', { ip: ipAddress });
  }

  const detailLines: string[] = [];

  if (changes && typeof changes === 'object') {
    const entries = Object.entries(changes).filter(
      ([, v]) => v !== undefined && v !== null && v !== ''
    );
    if (entries.length > 0) {
      detailLines.push(n('changes'));
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
        detailLines.push(`  \u2022 ${label}: ${formatted}`);
      }
    }
  }

  const skipKeys = new Set([
    'changes',
    'actor',
    'where',
    'ipAddress',
    'orgName',
    'handle',
    'invitedEmail',
    'serverName',
    'powerAction',
  ]);
  const remaining = Object.entries(rest).filter(
    ([k, v]) => v !== undefined && v !== null && v !== '' && !skipKeys.has(k)
  );
  if (remaining.length > 0) {
    if (detailLines.length > 0) detailLines.push('');
    for (const [key, val] of remaining) {
      const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (s: string) => s.toUpperCase());
      if (typeof val === 'object') {
        detailLines.push(`${label}: ${JSON.stringify(val)}`);
      } else {
        detailLines.push(`${label}: ${val}`);
      }
    }
  }

  if (detailLines.length > 0) detailLines.push('');
  detailLines.push(n('securityFooter'));

  return { message, details: detailLines.join('\n') };
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
        const meta =
          entry.metadata && typeof entry.metadata === 'object' ? { ...entry.metadata } : {};
        if (!meta.actor) {
          const actor = await userRepo.findOneBy({ id: entry.userId });
          if (actor)
            meta.actor = {
              id: actor.id,
              name: [actor.firstName, actor.lastName].filter(Boolean).join(' ') || actor.email,
              email: actor.email,
              role: actor.role,
            };
        }
        if (!meta.where && entry.targetType)
          meta.where = entry.targetType + (entry.targetId ? `:${entry.targetId}` : '');
        if (entry.ipAddress) meta.ipAddress = entry.ipAddress;
        if (entry.targetType === 'server' && entry.targetId && !meta.serverName) {
          const serverRepo = AppDataSource.getRepository(ServerConfig);
          const server = await serverRepo.findOne({
            where: { uuid: entry.targetId },
            select: { name: true },
          });
          if (server?.name) meta.serverName = server.name;
        }
        entry.metadata = meta;
        await repo.save(entry);
      } catch (e) {
        // skip
      }

      const a = (entry.action || '').toLowerCase();
      const notifKey = (() => {
        if (a.startsWith('wings:') || a.includes('wings:')) return 'serverActivity';
        if (
          a.includes('offline') ||
          a.includes('failed') ||
          a.includes('error') ||
          a.includes('crash')
        )
          return 'serverErrors';
        if (
          a.startsWith('server:') &&
          (a.includes('delete') ||
            a.includes('reinstall') ||
            a.includes('create') ||
            a.includes('stop') ||
            a.includes('start'))
        )
          return 'serverLifecycle';
        if (a.includes('bill') || a.includes('invoice') || a.includes('payment')) return 'billing';
        if (a.includes('login') || a.includes('security') || a.includes('suspicious'))
          return 'security';
        if (a.includes('product') || a.includes('update') || a.includes('announcement'))
          return 'productUpdates';
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
      const fallback =
        notifKey.startsWith('server') && typeof wants['serverAlerts'] === 'boolean'
          ? wants['serverAlerts']
          : undefined;
      const enabled =
        typeof prefValue === 'boolean'
          ? prefValue
          : typeof fallback === 'boolean'
            ? fallback
            : (defaultPrefs[notifKey] ?? true);
      if (!enabled) return;

      const t = tForUser(targetUser);

      const title =
        notifKey === 'serverErrors'
          ? t('notification.serverError')
          : notifKey === 'serverLifecycle'
            ? t('notification.serverEvent')
            : notifKey === 'serverActivity'
              ? t('notification.serverActivity')
              : notifKey === 'billing'
                ? t('notification.billingNotification')
                : notifKey === 'security'
                  ? t('notification.securityAlert')
                  : notifKey === 'productUpdates'
                    ? t('notification.productUpdate')
                    : notifKey === 'tickets'
                      ? t('notification.ticketUpdate')
                      : t('notification.title');

      const formatted = entry.metadata
        ? formatMetadataForEmail(entry.metadata, entry.action, t)
        : null;
      const message = formatted?.message || `Event: ${entry.action}`;
      const details = formatted?.details || '';

      try {
        await sendMail({
          to: targetUser.email,
          from: process.env.MAIL_FROM,
          subject: `${title} — Eclipse Systems`,
          template: 'notification',
          vars: { title, message, details },
          locale: resolveLocale({ user: targetUser }),
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
  app.post(
    prefix + '/logs',
    async (ctx: any) => {
      const { userId, action, targetId, targetType, metadata, ipAddress } = (ctx.body as any) || {};
      if (!action) {
        ctx.set.status = 400;
        return { error: ctx.t('validation.actionRequired') };
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
    },
    {
      beforeHandle: authenticate,
      body: t.Object({
        action: t.String({ minLength: 1, maxLength: 100 }),
        userId: t.Optional(t.Number()),
        targetId: t.Optional(t.String()),
        targetType: t.Optional(t.String()),
        metadata: t.Optional(t.Any()),
        ipAddress: t.Optional(t.String()),
      }),
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
      },
      detail: {
        summary: 'Create a new log entry (internal use)',
        description: 'Internal endpoint for creating log entries. Not for public use.',
        tags: ['Logs'],
        hide: true,
      },
    }
  );

  app.get(
    prefix + '/users/:id/logs',
    async (ctx: any) => {
      const userId = Number(ctx.params['id']);
      const requester = ctx.user as any;
      if (requester.id !== userId && !hasPermissionSync(ctx, 'logs:read')) {
        ctx.set.status = 403;
        return { error: ctx.t('common.forbidden') };
      }
      const { limit = '50', offset = '0', action, targetType, unread } = ctx.query as any;
      const logRepo = AppDataSource.getRepository(UserLog);
      const qb = logRepo
        .createQueryBuilder('log')
        .where('log.userId = :userId', { userId })
        .orderBy('log.timestamp', 'DESC')
        .skip(Number(offset))
        .take(Math.min(Number(limit), 200));
      if (action) qb.andWhere('log.action LIKE :action', { action: `%${action}%` });
      if (targetType) qb.andWhere('log.targetType = :targetType', { targetType });
      if (typeof unread !== 'undefined') {
        const unreadVal = String(unread).toLowerCase();
        qb.andWhere('log.isRead = :isRead', {
          isRead: unreadVal === '1' || unreadVal === 'true' || unreadVal === 'yes' ? false : true,
        });
      }
      const logs = await qb.getMany();
      return logs;
    },
    {
      beforeHandle: authenticate,
      response: { 200: t.Array(t.Any()), 403: t.Object({ error: t.String() }) },
      detail: { summary: 'Fetch activity logs for a given user', tags: ['Logs'] },
    }
  );

  app.get(
    prefix + '/users/:id/logs/unread-count',
    async (ctx: any) => {
      const userId = Number(ctx.params['id']);
      const requester = ctx.user as any;
      if (requester.id !== userId && !hasPermissionSync(ctx, 'logs:read')) {
        ctx.set.status = 403;
        return { error: ctx.t('common.forbidden') };
      }
      const logRepo = AppDataSource.getRepository(UserLog);
      const unread = await logRepo
        .createQueryBuilder('log')
        .where('log.userId = :userId', { userId })
        .andWhere('log.isRead = :isRead', { isRead: false })
        .getCount();

      return { unread };
    },
    {
      beforeHandle: authenticate,
      response: { 200: t.Object({ unread: t.Number() }), 403: t.Object({ error: t.String() }) },
      detail: { summary: 'Get unread user log count', tags: ['Logs'] },
    }
  );

  app.patch(
    prefix + '/users/:id/logs/read-all',
    async (ctx: any) => {
      const userId = Number(ctx.params['id']);
      const requester = ctx.user as any;
      if (requester.id !== userId && !hasPermissionSync(ctx, 'logs:read')) {
        ctx.set.status = 403;
        return { error: ctx.t('common.forbidden') };
      }
      const logRepo = AppDataSource.getRepository(UserLog);
      await logRepo
        .createQueryBuilder()
        .update(UserLog)
        .set({ isRead: true })
        .where('userId = :userId', { userId })
        .execute();
      return { success: true };
    },
    {
      beforeHandle: authenticate,
      response: { 200: t.Object({ success: t.Boolean() }), 403: t.Object({ error: t.String() }) },
      detail: { summary: 'Mark all user logs as read', tags: ['Logs'] },
    }
  );

  app.patch(
    prefix + '/users/:id/logs/:logId/read',
    async (ctx: any) => {
      const userId = Number(ctx.params['id']);
      const logId = Number(ctx.params['logId']);
      const requester = ctx.user as any;
      if (requester.id !== userId && !hasPermissionSync(ctx, 'logs:read')) {
        ctx.set.status = 403;
        return { error: ctx.t('common.forbidden') };
      }
      const logRepo = AppDataSource.getRepository(UserLog);
      const log = await logRepo.findOneBy({ id: logId, userId });
      if (!log) {
        ctx.set.status = 404;
        return { error: ctx.t('common.notFound') };
      }
      log.isRead = true;
      await logRepo.save(log);
      return { success: true, log };
    },
    {
      beforeHandle: authenticate,
      response: {
        200: t.Any(),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Mark a single log notification as read', tags: ['Logs'] },
    }
  );

  app.get(
    prefix + '/servers/:id/logs',
    async (ctx: any) => {
      const serverId = ctx.params['id'] as string;
      const { limit = '50', offset = '0' } = ctx.query as any;
      const logRepo = AppDataSource.getRepository(UserLog);
      const logs = await logRepo
        .createQueryBuilder('log')
        .where('log.targetId = :serverId', { serverId })
        .andWhere('log.targetType = :type', { type: 'server' })
        .orderBy('log.timestamp', 'DESC')
        .skip(Number(offset))
        .take(Math.min(Number(limit), 200))
        .getMany();
      return logs;
    },
    {
      beforeHandle: authenticate,
      response: { 200: t.Array(t.Any()) },
      detail: { summary: 'Fetch logs for a specific server', tags: ['Logs'] },
    }
  );

  app.get(
    prefix + '/servers/:id/activity',
    async (ctx: any) => {
      const serverId = ctx.params['id'] as string;
      const { limit = '50', offset = '0' } = ctx.query as any;
      const logRepo = AppDataSource.getRepository(UserLog);
      const logs = await logRepo
        .createQueryBuilder('log')
        .leftJoinAndMapOne('log.user', User, 'user', 'user.id = log.userId')
        .where('log.targetId = :serverId', { serverId })
        .andWhere('log.targetType = :type', { type: 'server' })
        .orderBy('log.timestamp', 'DESC')
        .skip(Number(offset))
        .take(Math.min(Number(limit), 200))
        .getMany();
      return logs;
    },
    {
      beforeHandle: authenticate,
      response: { 200: t.Array(t.Any()) },
      detail: { summary: 'Fetch activity for a specific server (alias)', tags: ['Logs'] },
    }
  );

  app.get(
    prefix + '/organisations/:id/logs',
    async (ctx: any) => {
      const orgId = ctx.params['id'] as string;
      const { limit = '50', offset = '0' } = ctx.query as any;
      const logRepo = AppDataSource.getRepository(UserLog);
      const logs = await logRepo
        .createQueryBuilder('log')
        .where('log.targetId = :orgId', { orgId })
        .andWhere('log.targetType = :type', { type: 'organisation' })
        .orderBy('log.timestamp', 'DESC')
        .skip(Number(offset))
        .take(Math.min(Number(limit), 200))
        .getMany();
      return logs;
    },
    {
      beforeHandle: authenticate,
      response: { 200: t.Array(t.Any()) },
      detail: { summary: 'Fetch logs for a specific organisation', tags: ['Logs'] },
    }
  );

  app.get(
    prefix + '/organisations/:id/activity',
    async (ctx: any) => {
      const orgId = ctx.params['id'] as string;
      const { limit = '50', offset = '0' } = ctx.query as any;
      const logRepo = AppDataSource.getRepository(UserLog);
      const logs = await logRepo
        .createQueryBuilder('log')
        .where('log.targetId = :orgId', { orgId })
        .andWhere('log.targetType = :type', { type: 'organisation' })
        .orderBy('log.timestamp', 'DESC')
        .skip(Number(offset))
        .take(Math.min(Number(limit), 200))
        .getMany();
      return logs;
    },
    {
      beforeHandle: authenticate,
      response: { 200: t.Array(t.Any()) },
      detail: { summary: 'Fetch activity for a specific organisation (alias)', tags: ['Logs'] },
    }
  );

  app.get(
    prefix + '/users/:id/activity',
    async (ctx: any) => {
      const userId = Number(ctx.params['id']);
      const requester = ctx.user as any;
      if (requester.id !== userId && !hasPermissionSync(ctx, 'logs:read')) {
        ctx.set.status = 403;
        return { error: ctx.t('common.forbidden') };
      }
      const { limit = '50', offset = '0', action, targetType } = ctx.query as any;
      const logRepo = AppDataSource.getRepository(UserLog);
      const qb = logRepo
        .createQueryBuilder('log')
        .where('log.userId = :userId', { userId })
        .orderBy('log.timestamp', 'DESC')
        .skip(Number(offset))
        .take(Math.min(Number(limit), 200));
      if (action) qb.andWhere('log.action LIKE :action', { action: `%${action}%` });
      if (targetType) qb.andWhere('log.targetType = :targetType', { targetType });
      const logs = await qb.getMany();
      return logs;
    },
    {
      beforeHandle: authenticate,
      response: { 200: t.Array(t.Any()), 403: t.Object({ error: t.String() }) },
      detail: { summary: 'Fetch activity logs for a given user (alias)', tags: ['Logs'] },
    }
  );
}
