import { AppDataSource } from '../config/typeorm';
import { ApiKey } from '../models/apiKey.entity';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import crypto from 'crypto';
import { t } from 'elysia';

export async function apiKeyRoutes(app: any, prefix = '') {
  const repo = AppDataSource.getRepository(ApiKey);

  app.get(prefix + '/apikeys', async (ctx: any) => {
    const keys = await repo.find({ relations: ['user'] });
    return keys.map(k => ({ ...k, key: undefined }));
  }, { beforeHandle: [authenticate, authorize('apikeys:read')],
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() })},
    detail: { summary: 'List all API keys', tags: ['API Keys'] }
  });

  app.get(prefix + '/apikeys/my', async (ctx: any) => {
    const user = ctx.user;
    const apiKey = ctx.apiKey;
    let keys;
    if (apiKey) {
      keys = [apiKey];
    } else if (user) {
      keys = await repo.createQueryBuilder('k')
        .leftJoinAndSelect('k.user', 'user')
        .where('user.id = :uid', { uid: user.id })
        .getMany();
    } else {
      ctx.set.status = 401;
      return { error: 'Unauthorized' };
    }
    return keys.map(k => ({ ...k, key: undefined }));
  }, {beforeHandle: authenticate,
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }) },
    detail: { summary: 'List keys for caller', tags: ['API Keys'] }
  });

  app.post(prefix + '/apikeys', async (ctx: any) => {
    const { name, type, permissions, userId, expiresAt } = ctx.body as any;
    if (!name || !type || (type !== 'client' && type !== 'admin')) {
      ctx.set.status = 400;
      return { error: 'name and valid type required' };
    }
    const key = crypto.randomBytes(32).toString('hex');
    const actor = ctx.user as any;

    let userRef;
    const isAdmin = actor && (actor.role === 'admin' || actor.role === 'rootAdmin' || actor.role === '*');
    if (userId) {
      if (!isAdmin && userId !== actor?.id) {
        ctx.set.status = 403;
        return { error: 'Not allowed to create keys for other users' };
      }
      userRef = { id: userId };
    } else if (actor) {
      userRef = { id: actor.id };
    } else {
      ctx.set.status = 401;
      return { error: 'Unauthorized' };
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
    const saved = await repo.findOne({ where: { id: ent.id }, relations: ['user'] });
    return { success: true, apiKey: key, id: ent.id, entry: saved };
  }, { beforeHandle: [authenticate, authorize('apikeys:create')],
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Create API key', tags: ['API Keys'] }
  });

  app.delete(prefix + '/apikeys/:id', async (ctx: any) => {
    const id = Number(ctx.params.id);
    await repo.delete(id);
    return { success: true };
  }, { beforeHandle: [authenticate, authorize('apikeys:delete')],
    response: { 200: t.Object({ success: t.Boolean() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Delete API key', tags: ['API Keys'] }
  });

  app.get(prefix + '/apikeys/:id', async (ctx: any) => {
    const id = Number(ctx.params.id);
    const key = await repo.findOne({ where: { id }, relations: ['user'] });
    if (!key) {
      ctx.set.status = 404;
      return { error: 'not found' };
    }
    const caller = ctx.apiKey || ctx.user;
    if (ctx.apiKey) {
      if (ctx.apiKey.type === 'admin' || ctx.apiKey.id === id) {
        return { ...key, key: undefined };
      }
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    const user = ctx.user;
    if (user && (user.role === 'admin' || key.user?.id === user.id)) {
      return { ...key, key: undefined };
    }
    ctx.set.status = 403;
    return { error: 'Forbidden' };
  }, {beforeHandle: authenticate,
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Get API key by id', tags: ['API Keys'] }
  });
}
