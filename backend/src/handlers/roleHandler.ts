import { AppDataSource } from '../config/typeorm';
import { Role } from '../models/role.entity';
import { Permission } from '../models/permission.entity';
import { authenticate } from '../middleware/auth';
import { User } from '../models/user.entity';
import { t } from 'elysia';

// BTW NEVER FULLY TESTED AND I DOUBT IT WORKS LOL / UPD: They work somewhat
// (ROLES IN GENERAL ARE KINDA AN AFTERTHOUGHT AND NOT REALLY FULLY IMPLEMENTED)
const adminRoles = ['admin', 'rootAdmin', '*'];
function requireAdmin(ctx: any): true | { error: string } {
  const user = ctx.user as User | undefined;
  if (!user) {
    ctx.set.status = 401;
    ctx.log?.warn('unauthenticated access to admin-only route');
    return { error: 'Unauthenticated' };
  }
  if (!adminRoles.includes(user.role ?? '')) {
    ctx.set.status = 403;
    return { error: 'Forbidden' };
  }
  return true;
}

export async function roleRoutes(app: any, prefix = '') {
  const roleRepo = AppDataSource.getRepository(Role);
  const permRepo = AppDataSource.getRepository(Permission);

  app.post(prefix + '/roles', async (ctx: any) => {
    const adminCheck = requireAdmin(ctx);
    if (adminCheck !== true) return adminCheck;
    const body = ctx.body as Partial<Role>;
    const role = roleRepo.create(body);
    await roleRepo.save(role);
    return { success: true, role };
  }, {beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean(), role: t.Any() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Create a role (admin only)', tags: ['Roles'] }
  });

  app.get(prefix + '/roles', async (ctx: any) => {
    const adminCheck = requireAdmin(ctx);
    if (adminCheck !== true) return adminCheck;
    const roles = await roleRepo.find({ relations: ['permissions'] });
    return roles;
  }, {beforeHandle: authenticate,
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'List roles (admin only)', tags: ['Roles'] }
  });

  app.delete(prefix + '/roles/:id', async (ctx: any) => {
    const adminCheck = requireAdmin(ctx);
    if (adminCheck !== true) return adminCheck;
    const role = await roleRepo.findOneBy({ id: Number(ctx.params['id']) });
    if (!role) {
      ctx.set.status = 404;
      return { error: 'Role not found' };
    }
    await roleRepo.remove(role);
    return { success: true };
  }, {beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Delete a role (admin only)', tags: ['Roles'] }
  });

  app.post(prefix + '/roles/:id/permissions', async (ctx: any) => {
    const adminCheck = requireAdmin(ctx);
    if (adminCheck !== true) return adminCheck;
    const role = await roleRepo.findOneBy({ id: Number(ctx.params['id']) });
    if (!role) {
      ctx.set.status = 404;
      return { error: 'Role not found' };
    }
    const { value } = ctx.body as { value: string };
    const perm = permRepo.create({ value, role });
    await permRepo.save(perm);
    return { success: true, perm };
  }, {beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean(), perm: t.Any() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Add permission to role (admin only)', tags: ['Roles'] }
  });

  app.delete(prefix + '/roles/:id/permissions/:permId', async (ctx: any) => {
    const adminCheck = requireAdmin(ctx);
    if (adminCheck !== true) return adminCheck;
    const perm = await permRepo.findOneBy({ id: Number(ctx.params['permId']) });
    if (!perm) {
      ctx.set.status = 404;
      return { error: 'Permission not found' };
    }
    await permRepo.remove(perm);
    return { success: true };
  }, {beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Remove permission from role (admin only)', tags: ['Roles'] }
  });

  app.post(prefix + '/users/:id/roles', async (ctx: any) => {
    const adminCheck = requireAdmin(ctx);
    if (adminCheck !== true) return adminCheck;
    const userId = ctx.params['id'];
    const { roleId } = ctx.body as any;
    const userRepo = AppDataSource.getRepository(require('../models/user.entity').User);
    const user = await userRepo.findOneBy({ id: Number(userId) });
    if (!user) {
      ctx.set.status = 404;
      return { error: 'User not found' };
    }
    const role = await roleRepo.findOneBy({ id: Number(roleId) });
    if (!role) {
      ctx.set.status = 404;
      return { error: 'Role not found' };
    }
    const userRoleRepo = AppDataSource.getRepository(require('../models/userRole.entity').UserRole);
    const ur = userRoleRepo.create({ user, role });
    await userRoleRepo.save(ur);
    return { success: true, ur };
  }, {beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean(), ur: t.Any() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Assign role to user (admin only)', tags: ['Roles'] }
  });

  app.get(prefix + '/users/:id/roles', async (ctx: any) => {
    const adminCheck = requireAdmin(ctx);
    if (adminCheck !== true) return adminCheck;
    const userRoleRepo = AppDataSource.getRepository(require('../models/userRole.entity').UserRole);
    const urs = await userRoleRepo.find({
      where: { user: { id: Number(ctx.params['id']) } },
      relations: ['role'],
    });
    return urs;
  }, {beforeHandle: authenticate,
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'List roles assigned to user (admin only)', tags: ['Roles'] }
  });

  app.delete(prefix + '/users/:id/roles/:urId', async (ctx: any) => {
    const adminCheck = requireAdmin(ctx);
    if (adminCheck !== true) return adminCheck;
    const userRoleRepo = AppDataSource.getRepository(require('../models/userRole.entity').UserRole);
    const ur = await userRoleRepo.findOneBy({ id: Number(ctx.params['urId']) });
    if (!ur) {
      ctx.set.status = 404;
      return { error: 'Not found' };
    }
    await userRoleRepo.remove(ur);
    return { success: true };
  }, {beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Remove role from user (admin only)', tags: ['Roles'] }
  });
}
