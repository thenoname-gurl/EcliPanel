import { AppDataSource } from '../config/typeorm';
import { t } from 'elysia';
import { In, FindOptionsWhere } from 'typeorm';
import { ServerSubuser } from '../models/serverSubuser.entity';
import { ServerConfig } from '../models/serverConfig.entity';
import { User } from '../models/user.entity';
import { authenticate } from '../middleware/auth';
import { authorize, hasPermissionSync } from '../middleware/authorize';
import { createActivityLog } from './logHandler';
import { createMailboxMessageForUser } from '../utils/mailboxMessage';
import { getMailboxAccountForUser } from '../services/mailcowService';
import { consumeRateLimit } from '../config/redis';
import { resolvePanelBaseUrl } from '../utils/url';
import type { RequestContext, AppLike, RouteMethod } from '../types/request';

const VALID_PERMISSIONS = [
  'console',
  'files',
  'backups',
  'startup',
  'settings',
  'databases',
  'schedules',
  'subusersd',
  'activity',
  'stats',
  'network',
  'mounts',
  'file-sharing',
];

// shared types moved to backend/src/types/request.ts

async function canManageSubusers(ctx: RequestContext, serverUuid: string): Promise<boolean> {
  const user = ctx.user as User | null;
  if (!user) return false;

  if (hasPermissionSync(ctx as unknown as Record<string, unknown>, 'admin:access')) return true;

  const cfgRepo = AppDataSource.getRepository(ServerConfig);
  const cfg = await cfgRepo.findOneBy({ uuid: serverUuid });
  if (cfg && cfg.userId === user.id) return true;

  return false;
}

export async function serverSubuserRoutes(app: AppLike, prefix = '') {
  const subuserRepo = () => AppDataSource.getRepository(ServerSubuser);
  const userRepo = () => AppDataSource.getRepository(User);

  function getRequesterIp(ctx: RequestContext): string {
    const forwarded = String((ctx.headers?.['x-forwarded-for'] as string) || '').trim();
    const firstForwarded = forwarded.split(',')[0]?.trim();
    const direct = String(ctx.ip || ctx.request?.ip || '').trim();
    return (firstForwarded || direct || 'unknown').slice(0, 100);
  }

  async function enforceSubuserInviteRateLimit(ctx: RequestContext, userId: number) {
    try {
      const ip = getRequesterIp(ctx);
      const key = `rate:subuser-invite:user:${userId}:ip:${ip}`;
      const result = await consumeRateLimit(key, 10, 30);
      if (result.allowed) return null;
      if (!ctx.set) ctx.set = {} as { status?: number; headers?: Record<string, string> };
      ctx.set.status = 429;
      ctx.set.headers = {
        ...(ctx.set.headers || {}),
        'Retry-After': String(result.retryAfterSeconds),
      };
      return { error: 'rate_limited', retryAfter: result.retryAfterSeconds };
    } catch {
      return null;
    }
  }

  async function attachSubuserUserInfo(entries: Array<Record<string, unknown>>) {
    const ids = [...new Set(entries.map(entry => entry.userId as number).filter(Boolean))];
    if (ids.length === 0) return entries;
    const users = await userRepo().find({ where: { id: In(ids) } });
    const userMap = new Map(users.map(u => [u.id, u]));
    return entries.map(entry => ({
      ...entry,
      user: userMap.get(entry.userId as number) || null,
    }));
  }

  app.get(
    prefix + '/servers/:id/subusers',
    async (ctx: RequestContext) => {
      const { id } = (ctx.params || {}) as Record<string, string>;
      if (await canManageSubusers(ctx, id)) {
        const subusers = await subuserRepo().find({
          where: { serverUuid: id },
          order: { createdAt: 'ASC' },
        });
        return attachSubuserUserInfo(subusers as unknown as Array<Record<string, unknown>>);
      }
      const user = ctx.user as User | null;
      if (!user) {
        if (!ctx.set) ctx.set = {} as { status?: number; headers?: Record<string, string> };
        ctx.set.status = 403;
        return { error: ctx.t ? ctx.t('common.forbidden') : 'forbidden' };
      }
      const entry = await subuserRepo().findOne({
        where: { serverUuid: id, userId: user.id, accepted: true },
      });
      return entry ? await attachSubuserUserInfo([entry as unknown as Record<string, unknown>]) : [];
    },
    {
      beforeHandle: authenticate,
      detail: { summary: 'List subusers for a server', tags: ['Servers'] },
      response: {
        200: t.Array(t.Any()),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
      },
    }
  );

  app.post(
    prefix + '/servers/:id/subusers',
    async (ctx: RequestContext) => {
      const { id } = (ctx.params || {}) as Record<string, string>;
      const user = ctx.user as User;
      const inviteRateLimit = await enforceSubuserInviteRateLimit(ctx, user.id);
      if (inviteRateLimit) return inviteRateLimit;
      const { email, permissions } = (ctx.body as Record<string, unknown>) || {};
      let actingAsSubuser: ServerSubuser | null = null;
      if (!(await canManageSubusers(ctx, id))) {
        const whereAny: Array<Record<string, unknown>> = [];
        whereAny.push({ userId: user.id, serverUuid: id, accepted: true });
        if (user && user.email) whereAny.push({ userEmail: user.email, serverUuid: id, accepted: true });
        actingAsSubuser = await subuserRepo().findOne({ where: whereAny as FindOptionsWhere<ServerSubuser>[] });

        if (
          !actingAsSubuser ||
          !Array.isArray(actingAsSubuser.permissions) ||
          !actingAsSubuser.permissions.includes('subusersd')
        ) {
          if (!ctx.set) ctx.set = {} as { status?: number; headers?: Record<string, string> };
          ctx.set.status = 403;
          return { error: ctx.t ? ctx.t('server.onlyOwnerCanManageSubusers') : 'forbidden' };
        }
      }
      if (!email) {
        if (!ctx.set) ctx.set = {} as { status?: number; headers?: Record<string, string> };
        ctx.set.status = 400;
        return { error: ctx.t ? ctx.t('validation.emailRequired') : 'email_required' };
      }

      const target = await userRepo().findOneBy({ email: String(email) });
      if (!target) {
        ctx.set.status = 404;
        return { error: ctx.t('user.notFoundEmail') };
      }
      if (target.id === user.id) {
        ctx.set.status = 400;
        return { error: ctx.t('server.cannotAddSelfAsSubuser') };
      }

      const existing = await subuserRepo().findOneBy({ serverUuid: id, userId: target.id });
      if (existing) {
        ctx.set.status = 409;
        return { error: ctx.t('server.alreadySubuser') };
      }
      const providedPerms = Array.isArray(permissions) ? permissions : ['console'];
      const allowedPermSet =
        actingAsSubuser && Array.isArray(actingAsSubuser.permissions)
          ? new Set(actingAsSubuser.permissions)
          : null;

      const validPerms = providedPerms.filter(
        (p: string) => VALID_PERMISSIONS.includes(p) && (!allowedPermSet || allowedPermSet.has(p))
      );
      if (validPerms.length === 0) validPerms.push('console');

      const entry = subuserRepo().create({
        serverUuid: id,
        userId: target.id,
        userEmail: target.email,
        permissions: validPerms,
        accepted: false,
      });
      await subuserRepo().save(entry);

      const mailboxAccount = await getMailboxAccountForUser(target.id).catch(() => null);
      const recipientTo = Array.from(
        new Set([target.email, mailboxAccount?.email].filter(Boolean) as string[])
      );

      try {
        const panelUrl = resolvePanelBaseUrl(ctx);
        const { sendMail } = require('../services/mailService');
        await sendMail({
          to: recipientTo,
          from: process.env.SMTP_USER || 'noreply@ecli.app',
          subject: `Server access invitation for ${id}`,
          template: 'invite',
          vars: {
            name: target.email.split('@')[0],
            orgName: `Server access to ${id}`,
            link: `${panelUrl}/dashboard/subusers/invites`,
          },
          locale: ctx.locale,
        });

        if (mailboxAccount?.email) {
          await createMailboxMessageForUser(target, {
            subject: `Server access invitation for ${id}`,
            body: `You have been invited to become a subuser for server ${id}. Review the invitation in your panel at ${panelUrl}/dashboard/subusers/invites.`,
            toAddress: mailboxAccount.email,
          });
        }
      } catch (e) {
        app.log.error({ err: e }, 'failed to send subuser invite email');
      }

      await createActivityLog({
        userId: user.id,
        action: 'server:subuser:add',
        targetId: id,
        targetType: 'server',
        metadata: { subuserEmail: target.email, subuserId: target.id, permissions: validPerms },
        ipAddress: ctx.request.ip,
      });

      return entry;
    },
    {
      beforeHandle: authenticate,
      detail: { summary: 'Add a subuser to a server', tags: ['Servers'] },
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
        409: t.Object({ error: t.String() }),
        429: t.Object({ error: t.String(), retryAfter: t.Number() }),
      },
    }
  );

  app.put(
    prefix + '/servers/:id/subusers/:subId',
    async (ctx: RequestContext) => {
      const { id, subId } = (ctx.params || {}) as Record<string, string>;
      const user = ctx.user as User;
      let actingAsSubuser: ServerSubuser | null = null;
      if (!(await canManageSubusers(ctx, id))) {
        const whereAny: Array<Record<string, unknown>> = [];
        whereAny.push({ userId: user.id, serverUuid: id, accepted: true });
        if (user && user.email) whereAny.push({ userEmail: user.email, serverUuid: id, accepted: true });
          actingAsSubuser = await subuserRepo().findOne({ where: whereAny as FindOptionsWhere<ServerSubuser>[] });

        if (
          !actingAsSubuser ||
          !Array.isArray(actingAsSubuser.permissions) ||
          !actingAsSubuser.permissions.includes('subusersd')
        ) {
          ctx.set.status = 403;
          return { error: ctx.t('server.onlyOwnerCanManageSubusers') };
        }
      }

      const entry = await subuserRepo().findOneBy({ id: Number(subId), serverUuid: id });
      if (!entry) {
        ctx.set.status = 404;
        return { error: ctx.t('server.subuserNotFound') };
      }

      const { permissions, locked } = ((ctx.body as Record<string, unknown>) || {}) as {
        permissions?: unknown;
        locked?: unknown;
      };
      if (!Array.isArray(permissions)) {
        ctx.set.status = 400;
        return { error: ctx.t('validation.permissionsArrayRequired') };
      }

      const providedPerms = Array.isArray(permissions) ? permissions : [];
      const allowedPermSet =
        actingAsSubuser && Array.isArray(actingAsSubuser.permissions)
          ? new Set(actingAsSubuser.permissions)
          : null;

      const filtered = providedPerms.filter(
        (p: string) => VALID_PERMISSIONS.includes(p) && (!allowedPermSet || allowedPermSet.has(p))
      );
      entry.permissions = filtered.length > 0 ? filtered : ['console'];

      if (typeof locked !== 'undefined') {
        if (!(await canManageSubusers(ctx, id))) {
          ctx.set.status = 403;
          return { error: ctx.t('server.onlyOwnerCanTransfer') };
        }
        entry.locked = !!locked;
      }
      await subuserRepo().save(entry);

      await createActivityLog({
        userId: user.id,
        action: 'server:subuser:update',
        targetId: id,
        targetType: 'server',
        metadata: { subuserEmail: entry.userEmail, permissions: entry.permissions },
        ipAddress: ctx.request.ip,
      });

      return entry;
    },
    {
      beforeHandle: authenticate,
      detail: { summary: 'Update permissions for a server subuser', tags: ['Servers'] },
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
    }
  );

  app.delete(
    prefix + '/servers/:id/subusers/:subId',
    async (ctx: RequestContext) => {
      const { id, subId } = (ctx.params || {}) as Record<string, string>;
      const user = ctx.user as User;
      const entry = await subuserRepo().findOneBy({ id: Number(subId), serverUuid: id });
      if (!entry) {
        ctx.set.status = 404;
        return { error: ctx.t('server.subuserNotFound') };
      }

      if (!(await canManageSubusers(ctx, id))) {
        if (entry.userId === user.id) {
          // skip
        } else {
          const whereAny: Array<Record<string, unknown>> = [];
          whereAny.push({ userId: user.id, serverUuid: id, accepted: true });
          if (user && user.email) whereAny.push({ userEmail: user.email, serverUuid: id, accepted: true });
          const actingAsSubuser = await subuserRepo().findOne({ where: whereAny as FindOptionsWhere<ServerSubuser>[] });
          if (
            !actingAsSubuser ||
            !Array.isArray(actingAsSubuser.permissions) ||
            !actingAsSubuser.permissions.includes('subusersd')
          ) {
            ctx.set.status = 403;
            return { error: ctx.t('server.onlyOwnerCanRemove') };
          }

          if (entry.locked) {
            ctx.set.status = 403;
            return { error: ctx.t('server.subuserLocked') };
          }
        }
      }

      await subuserRepo().delete({ id: entry.id });

      await createActivityLog({
        userId: user.id,
        action: 'server:subuser:remove',
        targetId: id,
        targetType: 'server',
        metadata: { subuserEmail: entry.userEmail, subuserId: entry.userId },
        ipAddress: ctx.request.ip,
      });

      return { success: true };
    },
    {
      beforeHandle: authenticate,
      detail: { summary: 'Remove a server subuser', tags: ['Servers'] },
      response: {
        200: t.Object({ success: t.Boolean() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
    }
  );

  app.get(
    prefix + '/subusers/invites',
    async (ctx: RequestContext) => {
      const user = ctx.user as User | null;
      if (!user) {
        ctx.set.status = 401;
        return { error: ctx.t('auth.unauthorized') };
      }
      const invites = await subuserRepo().find({
        where: { userId: user.id, accepted: false },
        order: { createdAt: 'ASC' },
      });
      const serverUuids = [...new Set(invites.map(invite => invite.serverUuid))];
      const serverConfigs =
        serverUuids.length > 0
          ? await AppDataSource.getRepository(ServerConfig).find({
              where: { uuid: In(serverUuids) },
            })
          : [];
      const configMap = new Map(serverConfigs.map(cfg => [cfg.uuid, cfg]));
      return invites.map(invite => ({
        ...invite,
        serverName: configMap.get(invite.serverUuid)?.name || null,
        serverExists: configMap.has(invite.serverUuid),
      }));
    },
    {
      beforeHandle: authenticate,
      response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }) },
      detail: { summary: 'List pending subuser invites for current user', tags: ['Servers'] },
    }
  );

  app.post(
    prefix + '/subusers/invites/:inviteId/accept',
    async (ctx: RequestContext) => {
      const user = ctx.user as User | null;
      const { inviteId } = (ctx.params || {}) as Record<string, string>;
      if (!user) {
        ctx.set.status = 401;
        return { error: ctx.t('auth.unauthorized') };
      }
      const entry = await subuserRepo().findOneBy({
        id: Number(inviteId),
        userId: user.id,
        accepted: false,
      });
      if (!entry) {
        ctx.set.status = 404;
        return { error: ctx.t('organisation.inviteNotFound') };
      }
      entry.accepted = true;
      await subuserRepo().save(entry);
      await createActivityLog({
        userId: user.id,
        action: 'server:subuser:accept_invite',
        targetId: entry.serverUuid,
        targetType: 'server',
        metadata: { subuserId: entry.userId },
        ipAddress: ctx.request.ip,
      });
      return entry;
    },
    {
      beforeHandle: authenticate,
      response: {
        200: t.Any(),
        401: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Accept a pending server subuser invite', tags: ['Servers'] },
    }
  );

  app.post(
    prefix + '/subusers/invites/:inviteId/reject',
    async (ctx: RequestContext) => {
      const user = ctx.user as User | null;
      const { inviteId } = (ctx.params || {}) as Record<string, string>;
      if (!user) {
        ctx.set.status = 401;
        return { error: ctx.t('auth.unauthorized') };
      }
      const entry = await subuserRepo().findOneBy({
        id: Number(inviteId),
        userId: user.id,
        accepted: false,
      });
      if (!entry) {
        ctx.set.status = 404;
        return { error: ctx.t('organisation.inviteNotFound') };
      }
      await subuserRepo().delete({ id: entry.id });
      await createActivityLog({
        userId: user.id,
        action: 'server:subuser:reject_invite',
        targetId: entry.serverUuid,
        targetType: 'server',
        metadata: { subuserId: entry.userId },
        ipAddress: ctx.request.ip,
      });
      return { success: true };
    },
    {
      beforeHandle: authenticate,
      response: {
        200: t.Object({ success: t.Boolean() }),
        401: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Reject a pending server subuser invite', tags: ['Servers'] },
    }
  );
}
