import { AppDataSource } from '../config/typeorm';
import { t } from 'elysia';
import { ServerSubuser } from '../models/serverSubuser.entity';
import { ServerConfig } from '../models/serverConfig.entity';
import { User } from '../models/user.entity';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import { createActivityLog } from './logHandler';

const VALID_PERMISSIONS = ['console', 'files', 'backups', 'startup', 'settings', 'databases', 'schedules', 'subusersd', 'activity', 'stats', 'network', 'mounts'];

async function canManageSubusers(ctx: any, serverUuid: string): Promise<boolean> {
  const user = (ctx as any).user as User;
  if (!user) return false;

  if (user.role === '*' || user.role === 'rootAdmin' || user.role === 'admin') return true;

  const cfgRepo = AppDataSource.getRepository(ServerConfig);
  const cfg = await cfgRepo.findOneBy({ uuid: serverUuid });
  if (cfg && cfg.userId === user.id) return true;

  return false;
}

export async function serverSubuserRoutes(app: any, prefix = '') {
  const subuserRepo = () => AppDataSource.getRepository(ServerSubuser);
  const userRepo = () => AppDataSource.getRepository(User);
  app.get(prefix + '/servers/:id/subusers', async (ctx) => {
    const { id } = ctx.params as any;
    if (await canManageSubusers(ctx, id)) {
      const subusers = await subuserRepo().find({ where: { serverUuid: id }, order: { createdAt: 'ASC' } });
      return subusers;
    }
    const user = (ctx as any).user as User;
    if (!user) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    const entry = await subuserRepo().findOne({ where: { serverUuid: id, userId: user.id } });
    return entry ? [entry] : [];
  }, {
    beforeHandle: authenticate,
    detail: { summary: 'List subusers for a server', tags: ['Servers'] },
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) }
  });

  app.post(prefix + '/servers/:id/subusers', async (ctx) => {
    const { id } = ctx.params as any;
    const user = (ctx as any).user as User;
    const { email, permissions } = ctx.body as any;
    let actingAsSubuser: any = null;
    if (!(await canManageSubusers(ctx, id))) {
      const whereAny: any[] = [];
      whereAny.push({ userId: (user as any).id, serverUuid: id });
      if (user && (user as any).email) whereAny.push({ userEmail: (user as any).email, serverUuid: id });
      actingAsSubuser = await subuserRepo().findOne({ where: whereAny });

      if (!actingAsSubuser || !Array.isArray(actingAsSubuser.permissions) || !actingAsSubuser.permissions.includes('subusersd')) {
        ctx.set.status = 403;
        return { error: 'Only server owner, staff, or authorized subusers can manage subusers' };
      }
    }
    if (!email) {
      ctx.set.status = 400;
      return { error: 'email is required' };
    }

    const target = await userRepo().findOneBy({ email });
    if (!target) {
      ctx.set.status = 404;
      return { error: 'User not found with that email' };
    }
    if (target.id === user.id) {
      ctx.set.status = 400;
      return { error: 'Cannot add yourself as a subuser' };
    }

    const existing = await subuserRepo().findOneBy({ serverUuid: id, userId: target.id });
    if (existing) {
      ctx.set.status = 409;
      return { error: 'User is already a subuser of this server' };
    }
    const providedPerms = Array.isArray(permissions) ? permissions : ['console'];
    const allowedPermSet = actingAsSubuser && Array.isArray(actingAsSubuser.permissions)
      ? new Set(actingAsSubuser.permissions)
      : null;

    const validPerms = providedPerms.filter((p: string) => VALID_PERMISSIONS.includes(p) && (!allowedPermSet || allowedPermSet.has(p)));
    if (validPerms.length === 0) validPerms.push('console');

    const entry = subuserRepo().create({
      serverUuid: id,
      userId: target.id,
      userEmail: target.email,
      permissions: validPerms,
    });
    await subuserRepo().save(entry);

    await createActivityLog({
      userId: user.id,
      action: 'server:subuser:add',
      targetId: id,
      targetType: 'server',
      metadata: { subuserEmail: target.email, subuserId: target.id, permissions: validPerms },
      ipAddress: ctx.request.ip,
    });

    return entry;
  }, {
    beforeHandle: authenticate,
    detail: { summary: 'Add a subuser to a server', tags: ['Servers'] },
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }), 409: t.Object({ error: t.String() }) }
  });

  app.put(prefix + '/servers/:id/subusers/:subId', async (ctx) => {
    const { id, subId } = ctx.params as any;
    const user = (ctx as any).user as User;
    let actingAsSubuser: any = null;
    if (!(await canManageSubusers(ctx, id))) {
      const whereAny: any[] = [];
      whereAny.push({ userId: (user as any).id, serverUuid: id });
      if (user && (user as any).email) whereAny.push({ userEmail: (user as any).email, serverUuid: id });
      actingAsSubuser = await subuserRepo().findOne({ where: whereAny });

      if (!actingAsSubuser || !Array.isArray(actingAsSubuser.permissions) || !actingAsSubuser.permissions.includes('subusersd')) {
        ctx.set.status = 403;
        return { error: 'Only server owner, staff, or authorized subusers can manage subusers' };
      }
    }

    const entry = await subuserRepo().findOneBy({ id: Number(subId), serverUuid: id });
    if (!entry) {
      ctx.set.status = 404;
      return { error: 'Subuser not found' };
    }

    const { permissions, locked } = ctx.body as any;
    if (!Array.isArray(permissions)) {
      ctx.set.status = 400;
      return { error: 'permissions array required' };
    }

    const providedPerms = Array.isArray(permissions) ? permissions : [];
    const allowedPermSet = actingAsSubuser && Array.isArray(actingAsSubuser.permissions)
      ? new Set(actingAsSubuser.permissions)
      : null;

    const filtered = providedPerms.filter((p: string) => VALID_PERMISSIONS.includes(p) && (!allowedPermSet || allowedPermSet.has(p)));
    entry.permissions = filtered.length > 0 ? filtered : ['console'];

    if (typeof locked !== 'undefined') {
      if (!(await canManageSubusers(ctx, id))) {
        ctx.set.status = 403;
        return { error: 'Only server owner or staff can change locked status' };
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
  }, {
    beforeHandle: authenticate,
    detail: { summary: 'Update permissions for a server subuser', tags: ['Servers'] },
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) }
  });

  app.delete(prefix + '/servers/:id/subusers/:subId', async (ctx) => {
    const { id, subId } = ctx.params as any;
    const user = (ctx as any).user as User;
    const entry = await subuserRepo().findOneBy({ id: Number(subId), serverUuid: id });
    if (!entry) {
      ctx.set.status = 404;
      return { error: 'Subuser not found' };
    }

    if (!(await canManageSubusers(ctx, id))) {
      if (entry.userId === user.id) {
        // skip
      } else {
        const whereAny: any[] = [];
        whereAny.push({ userId: (user as any).id, serverUuid: id });
        if (user && (user as any).email) whereAny.push({ userEmail: (user as any).email, serverUuid: id });
        const actingAsSubuser = await subuserRepo().findOne({ where: whereAny });
        if (!actingAsSubuser || !Array.isArray(actingAsSubuser.permissions) || !actingAsSubuser.permissions.includes('subusersd')) {
          ctx.set.status = 403;
          return { error: 'Only server owner, admin, or authorized subusers can remove this entry' };
        }

        if (entry.locked) {
          ctx.set.status = 403;
          return { error: 'This subuser is locked and cannot be removed by other subusers' };
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
  }, {
    beforeHandle: authenticate,
    detail: { summary: 'Remove a server subuser', tags: ['Servers'] },
    response: { 200: t.Object({ success: t.Boolean() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) }
  });
}
