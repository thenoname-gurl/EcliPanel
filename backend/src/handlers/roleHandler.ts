import { AppDataSource } from '../config/typeorm';
import { Role } from '../models/role.entity';
import { Permission } from '../models/permission.entity';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import { t } from 'elysia';
import { PERMISSION_METADATA } from '../utils/permissionMetadata';


export async function roleRoutes(app: any, prefix = '') {
  const roleRepo = AppDataSource.getRepository(Role);
  const permRepo = AppDataSource.getRepository(Permission);

  app.post(prefix + '/roles', async (ctx: any) => {
    const { name, description, parentRoleId } = ctx.body as any;
    const role = roleRepo.create({
      name,
      description,
      parentRole: parentRoleId ? { id: Number(parentRoleId) } : undefined,
    } as any) as any;
    await roleRepo.save(role);
    const saved = await roleRepo.findOne({ where: { id: role.id }, relations: ['permissions', 'parentRole', 'parentRole.permissions'] });
    return { success: true, role: saved || role };
  }, {beforeHandle: [authenticate, authorize('roles:create')],
    response: { 200: t.Object({ success: t.Boolean(), role: t.Any() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Create a role (admin only)', tags: ['Roles'] }
  });

  app.get(prefix + '/roles', async (ctx: any) => {
    const roles = await roleRepo.find({ relations: ['permissions', 'parentRole', 'parentRole.permissions'] });
    return roles;
  }, {beforeHandle: [authenticate, authorize('roles:read')],
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'List roles (admin only)', tags: ['Roles'] }
  });

  app.get(prefix + '/roles/:id', async (ctx: any) => {
    const role = await roleRepo.findOne({ where: { id: Number(ctx.params['id']) }, relations: ['permissions', 'parentRole', 'parentRole.permissions'] });
    if (!role) {
      ctx.set.status = 404;
      return { error: 'Role not found' };
    }
    return role;
  }, {beforeHandle: [authenticate, authorize('roles:read')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Get role by id (admin only)', tags: ['Roles'] }
  });

  app.get(prefix + '/roles/:id/permissions', async (ctx: any) => {
    const role = await roleRepo.findOne({ where: { id: Number(ctx.params['id']) }, relations: ['permissions'] });
    if (!role) {
      ctx.set.status = 404;
      return { error: 'Role not found' };
    }
    return role.permissions || [];
  }, {beforeHandle: [authenticate, authorize('roles:read')],
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Get permissions for a role (admin only)', tags: ['Roles'] }
  });

  app.get(prefix + '/permissions', async (ctx: any) => {
    return PERMISSION_METADATA;
  }, {beforeHandle: [authenticate, authorize('roles:read')],
    response: { 200: t.Array(t.Object({ value: t.String(), category: t.String(), description: t.Optional(t.String()), admin: t.Boolean() })), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Get permission metadata (admin only)', tags: ['Roles'] }
  });

  app.delete(prefix + '/roles/:id', async (ctx: any) => {
    const role = await roleRepo.findOneBy({ id: Number(ctx.params['id']) });
    if (!role) {
      ctx.set.status = 404;
      return { error: 'Role not found' };
    }
    await roleRepo.remove(role);
    return { success: true };
  }, {beforeHandle: [authenticate, authorize('roles:delete')],
    response: { 200: t.Object({ success: t.Boolean() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Delete a role (admin only)', tags: ['Roles'] }
  });

  app.post(prefix + '/roles/:id/permissions', async (ctx: any) => {
    const role = await roleRepo.findOneBy({ id: Number(ctx.params['id']) });
    if (!role) {
      ctx.set.status = 404;
      return { error: 'Role not found' };
    }
    const { value } = ctx.body as { value: string };
    const perm = permRepo.create({ value, role });
    await permRepo.save(perm);
    return { success: true, perm };
  }, {beforeHandle: [authenticate, authorize('permissions:assign')],
    response: { 200: t.Object({ success: t.Boolean(), perm: t.Any() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Add permission to role (admin only)', tags: ['Roles'] }
  });

  app.delete(prefix + '/roles/:id/permissions/:permId', async (ctx: any) => {
    const perm = await permRepo.findOneBy({ id: Number(ctx.params['permId']) });
    if (!perm) {
      ctx.set.status = 404;
      return { error: 'Permission not found' };
    }
    await permRepo.remove(perm);
    return { success: true };
  }, {beforeHandle: [authenticate, authorize('permissions:assign')],
    response: { 200: t.Object({ success: t.Boolean() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Remove permission from role (admin only)', tags: ['Roles'] }
  });

  app.post(prefix + '/users/:id/roles', async (ctx: any) => {
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
  }, {beforeHandle: [authenticate, authorize('roles:assign')],
    response: { 200: t.Object({ success: t.Boolean(), ur: t.Any() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Assign role to user (admin only)', tags: ['Roles'] }
  });

  app.get(prefix + '/users/:id/roles', async (ctx: any) => {
    const userRoleRepo = AppDataSource.getRepository(require('../models/userRole.entity').UserRole);
    const urs = await userRoleRepo.find({
      where: { user: { id: Number(ctx.params['id']) } },
      relations: ['role'],
    });
    return urs;
  }, {beforeHandle: [authenticate, authorize('roles:read')],
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'List roles assigned to user (admin only)', tags: ['Roles'] }
  });

  app.delete(prefix + '/users/:id/roles/:urId', async (ctx: any) => {
    const userRoleRepo = AppDataSource.getRepository(require('../models/userRole.entity').UserRole);
    const ur = await userRoleRepo.findOneBy({ id: Number(ctx.params['urId']) });
    if (!ur) {
      ctx.set.status = 404;
      return { error: 'Not found' };
    }
    await userRoleRepo.remove(ur);
    return { success: true };
  }, {beforeHandle: [authenticate, authorize('roles:assign')],
    response: { 200: t.Object({ success: t.Boolean() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Remove role from user (admin only)', tags: ['Roles'] }
  });
}
