import { AppDataSource } from '../config/typeorm';
import { User } from '../models/user.entity';

export function authorize(required: string) {
  return async (ctx: any) => {
    const apiKey = ctx.apiKey;
    const ip = ctx.ip || (ctx.request && ctx.request.ip) || 'unknown';
    const _ctxInfo = { ip, path: ctx.path || ctx.request?.url || 'unknown' };
    if (apiKey) {
      if (apiKey.type === 'admin') return;
      const perms: string[] = apiKey.permissions || [];
      const has = perms.some((p) => {
        if (p === '*') return true;
        if (p === required) return true;
        const parts = p.split(':');
        const reqParts = required.split(':');
        for (let i = 0; i < parts.length; i++) {
          if (parts[i] === '*') return true;
          if (reqParts[i] !== parts[i]) return false;
        }
        return false;
      });
      if (has) return;
      console.warn('[authorize] Insufficient API key permissions', { required, perms, apiKeyType: apiKey.type, ctx: _ctxInfo });
      ctx.set.status = 403;
      return { error: 'Insufficient permissions (api key)' };
    }

    const user = ctx.user as User;
    if (!user) {
      console.warn('[authorize] No user on context', { required, ctx: _ctxInfo });
      ctx.set.status = 401;
      return { error: 'Unauthorized' };
    }

    if (user.role === '*' || user.role === 'rootAdmin') {
      return;
    }

    const userRepo = AppDataSource.getRepository(User);
    const u = await userRepo.findOne({
      where: { id: user.id },
      relations: ['userRoles', 'userRoles.role', 'userRoles.role.permissions'],
    });
    if (!u) {
      console.warn('[authorize] User record not found', { userId: user.id, required, ctx: _ctxInfo });
      ctx.set.status = 401;
      return { error: 'Unauthorized' };
    }

    const perms: string[] = [];
    u.userRoles.forEach((ur) => {
      ur.role.permissions.forEach((p) => perms.push(p.value));
    });

    if (perms.length === 0 && !user.role) {
      try {
        const roleRepo = AppDataSource.getRepository(require('../models/role.entity').Role);
        const def = await roleRepo.findOne({ where: { name: 'default' }, relations: ['permissions'] });
        if (def && Array.isArray(def.permissions)) {
          def.permissions.forEach((p: any) => perms.push(p.value));
        }
      } catch (e) {
        console.warn('[authorize] failed to load default role permissions', e?.message || e);
      }
    }

    const has = perms.some((p) => {
      if (p === '*') return true;
      if (p === required) return true;
      const parts = p.split(':');
      const reqParts = required.split(':');
      for (let i = 0; i < parts.length; i++) {
        if (parts[i] === '*') return true;
        if (reqParts[i] !== parts[i]) return false;
      }
      return false;
    });
    if (!has) {
      console.warn('[authorize] Insufficient permissions for user', { userId: user.id, role: user.role, required, perms, ctx: _ctxInfo });
      ctx.set.status = 403;
      return { error: 'Insufficient permissions' };
    }
  };
}
