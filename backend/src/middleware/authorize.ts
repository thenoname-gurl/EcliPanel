import { AppDataSource } from '../config/typeorm';
import { User } from '../models/user.entity';

export function authorize(required: string) {
  return async (ctx: any) => {
    const apiKey = ctx.apiKey;
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
      ctx.set.status = 403;
      return { error: 'Insufficient permissions (api key)' };
    }

    const user = ctx.user as User;
    if (!user) {
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
      ctx.set.status = 401;
      return { error: 'Unauthorized' };
    }

    const perms: string[] = [];
    u.userRoles.forEach((ur) => {
      ur.role.permissions.forEach((p) => perms.push(p.value));
    });

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
      ctx.set.status = 403;
      return { error: 'Insufficient permissions' };
    }
  };
}
