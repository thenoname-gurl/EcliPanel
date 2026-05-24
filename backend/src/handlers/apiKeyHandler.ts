import { AppDataSource } from '../config/typeorm';
import { ApiKey } from '../models/apiKey.entity';
import { authenticate } from '../middleware/auth';
import { authorize, hasPermissionSync } from '../middleware/authorize';
import { randomHex } from '../utils/bunCrypto';
import { t } from 'elysia';

export async function apiKeyRoutes(app: any, prefix = '') {
  const repo = AppDataSource.getRepository(ApiKey);

  app.get(
    prefix + '/apikeys',
    async (ctx: any) => {
      const keys = await repo.find({ relations: { user: true } });
      return keys.map(k => ({ ...k, key: undefined }));
    },
    {
      beforeHandle: [authenticate, authorize('apikeys:read')],
      response: {
        200: t.Array(t.Any()),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
      },
      detail: { summary: 'List all API keys', tags: ['API Keys'] },
    }
  );

  app.get(
    prefix + '/apikeys/my',
    async (ctx: any) => {
      const user = ctx.user;
      const apiKey = ctx.apiKey;
      let keys;
      if (apiKey) {
        keys = [apiKey];
      } else if (user) {
        keys = await repo
          .createQueryBuilder('k')
          .leftJoinAndSelect('k.user', 'user')
          .where('user.id = :uid', { uid: user.id })
          .getMany();
      } else {
        ctx.set.status = 401;
        return { error: ctx.t('auth.unauthorized') };
      }
      return keys.map(k => ({ ...k, key: undefined }));
    },
    {
      beforeHandle: authenticate,
      response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }) },
      detail: { summary: 'List keys for caller', tags: ['API Keys'] },
    }
  );

  app.post(
    prefix + '/apikeys',
    async (ctx: any) => {
      const actor = ctx.user as any;
      const isAdmin = actor?.role === '*';
      if (!isAdmin) {
        try {
          const ip = (ctx.ip || ctx.request?.ip || '').toString().slice(0, 200);
          const keyIp = `rate:apikey:create:ip:${ip}`;
          const keyUser = `rate:apikey:create:user:${ctx.user?.id}`;
          const rlIp = await require('../config/redis').consumeRateLimit(
            keyIp,
            Number(process.env.APIKEY_CREATE_RATE_IP || 10),
            Number(process.env.APIKEY_CREATE_WINDOW_IP || 3600)
          );
          if (!rlIp.allowed) {
            ctx.set.status = 429;
            ctx.set.headers = {
              ...(ctx.set.headers || {}),
              'Retry-After': String(rlIp.retryAfterSeconds),
            };
            return { error: 'rate_limited', retryAfter: rlIp.retryAfterSeconds };
          }
          const rlUser = await require('../config/redis').consumeRateLimit(
            keyUser,
            Number(process.env.APIKEY_CREATE_RATE_USER || 5),
            Number(process.env.APIKEY_CREATE_WINDOW_USER || 86400)
          );
          if (!rlUser.allowed) {
            ctx.set.status = 429;
            ctx.set.headers = {
              ...(ctx.set.headers || {}),
              'Retry-After': String(rlUser.retryAfterSeconds),
            };
            return { error: 'rate_limited', retryAfter: rlUser.retryAfterSeconds };
          }
        } catch (e) {
          /* meow */
        }
      }

      const { name, type, permissions, userId, expiresAt } = ctx.body as any;
      if (!name || !type || (type !== 'client' && type !== 'admin')) {
        ctx.set.status = 400;
        return { error: ctx.t('validation.nameAndValidTypeRequired') };
      }
      const key = randomHex(32);

      let userRef;
      const canManageUsers = actor && hasPermissionSync(ctx, 'users:write');
      if (userId) {
        if (!canManageUsers && userId !== actor?.id) {
          ctx.set.status = 403;
          return { error: ctx.t('user.notAllowedToCreateKeysForOtherUsers') };
        }
        userRef = { id: userId };
      } else if (actor) {
        userRef = { id: actor.id };
      } else {
        ctx.set.status = 401;
        return { error: ctx.t('auth.unauthorized') };
      }

      if (type === 'admin') {
        const actorRole = actor?.role;
        if (actorRole !== '*' && !hasPermissionSync(ctx, '*')) {
          ctx.set.status = 403;
          return { error: ctx.t('admin.apiKeyAdminOnly') };
        }
      }

      const ent = repo.create({
        name,
        type,
        permissions: permissions || [],
        key,
        user: userRef,
        createdAt: new Date(),
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      });
      await repo.save(ent);
      const saved = await repo.findOne({ where: { id: ent.id }, relations: { user: true } });
      return { success: true, apiKey: key, id: ent.id, entry: saved };
    },
    {
      beforeHandle: [authenticate, authorize('apikeys:create')],
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Create API key', tags: ['API Keys'] },
    }
  );

  app.delete(
    prefix + '/apikeys/:id',
    async (ctx: any) => {
      const id = Number(ctx.params.id);
      await repo.delete(id);
      return { success: true };
    },
    {
      beforeHandle: [authenticate, authorize('apikeys:delete')],
      response: {
        200: t.Object({ success: t.Boolean() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Delete API key', tags: ['API Keys'] },
    }
  );

  app.get(
    prefix + '/apikeys/:id',
    async (ctx: any) => {
      const id = Number(ctx.params.id);
      const key = await repo.findOne({ where: { id }, relations: { user: true } });
      if (!key) {
        ctx.set.status = 404;
        return { error: ctx.t('common.notFound_1') };
      }
      const caller = ctx.apiKey || ctx.user;
      if (ctx.apiKey) {
        if (ctx.apiKey.type === 'admin' || ctx.apiKey.id === id) {
          return { ...key, key: undefined };
        }
        ctx.set.status = 403;
        return { error: ctx.t('common.forbidden') };
      }
      const user = ctx.user;
      if (user && (hasPermissionSync(ctx, 'apikeys:read') || key.user?.id === user.id)) {
        return { ...key, key: undefined };
      }
      ctx.set.status = 403;
      return { error: ctx.t('common.forbidden') };
    },
    {
      beforeHandle: authenticate,
      response: {
        200: t.Any(),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Get API key by id', tags: ['API Keys'] },
    }
  );
}
