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

    if (required === 'transfer:execute' && user.role === 'admin') {
      return;
    }

    if (required.startsWith('servers:')) {
      try {
        const { ServerSubuser } = require('../models/serverSubuser.entity');
        const subuserRepo = AppDataSource.getRepository(ServerSubuser);
        const serverUuid = ctx.params?.id || ctx.params?.serverId || ctx.request?.body?.serverUuid || ctx.request?.body?.id || ctx.query?.serverUuid;

        const serverSubuserGrant = (sub: any, requiredPerm: string) => {
          if (!sub || !Array.isArray(sub.permissions)) return false;
          if (sub.permissions.includes('*')) return true;

          const serverPermissionMap: Record<string, string[]> = {
            read: ['console', 'files', 'backups', 'startup', 'settings', 'databases', 'schedules'],
            write: ['files', 'backups', 'startup', 'settings', 'databases', 'schedules'],
            console: ['console'],
            backups: ['backups'],
            power: [],
            settings: ['settings'],
            databases: ['databases'],
            schedules: ['schedules'],
            activity: ['activity'],
            stats: ['stats'],
            network: ['network'],
            mounts: ['mounts'],
          };

          if (requiredPerm && serverPermissionMap[requiredPerm]) {
            if (sub.permissions.some((p: string) => serverPermissionMap[requiredPerm].includes(p))) {
              return true;
            }
          }

          return sub.permissions.includes(requiredPerm);
        };

        if (serverUuid) {
          const whereAny: any[] = [];
          whereAny.push({ userId: user.id, serverUuid });
          if (user.email) whereAny.push({ userEmail: user.email, serverUuid });
          const sub = await subuserRepo.findOne({ where: whereAny });
          if (sub) {
            const permNeeded = required.split(':')[1];
            if (!permNeeded || permNeeded === '*') return;
            if (serverSubuserGrant(sub, permNeeded)) return;
          }

          try {
            const cfgRepo = AppDataSource.getRepository(require('../models/serverConfig.entity').ServerConfig);
            const cfg = await cfgRepo.findOneBy({ uuid: serverUuid });
            if (cfg && cfg.userId === user.id) return;
          } catch (e) {
            // skip
          }
        } else {
          const anySub = await subuserRepo.findOne({ where: user.email ? [{ userId: user.id }, { userEmail: user.email }] : { userId: user.id } });
          if (anySub) return;
        }
      } catch (e) {
        // skip
      }
    }

    if (required.startsWith('files:')) {
      try {
        const { ServerSubuser } = require('../models/serverSubuser.entity');
        const subuserRepo = AppDataSource.getRepository(ServerSubuser);
        const serverUuid = ctx.params?.id || ctx.params?.serverId || ctx.request?.body?.serverUuid || ctx.request?.body?.id || ctx.query?.serverUuid;

        if (serverUuid) {
          const whereAny: any[] = [];
          whereAny.push({ userId: user.id, serverUuid });
          if (user.email) whereAny.push({ userEmail: user.email, serverUuid });
          const sub = await subuserRepo.findOne({ where: whereAny });
          if (sub && Array.isArray(sub.permissions) && (sub.permissions.includes('*') || sub.permissions.includes('files'))) {
            return;
          }

          try {
            const cfgRepo = AppDataSource.getRepository(require('../models/serverConfig.entity').ServerConfig);
            const cfg = await cfgRepo.findOneBy({ uuid: serverUuid });
            if (cfg && cfg.userId === user.id) return;
          } catch (e) {
            // skip
          }
        }
      } catch (e) {
        // skip
      }
    }

    if (required.startsWith('org:') || required.startsWith('organisation:')) {
      try {
        const orgId = ctx.params?.id || ctx.request?.body?.organisationId || ctx.request?.body?.orgId || ctx.query?.id;
        if (orgId && user && user.org && String(user.org.id) === String(orgId) && (user.orgRole === 'owner' || user.orgRole === 'admin')) {
          return;
        }
      } catch (e) {
        // skip
      }
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

    if (perms.length === 0) {
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
      ctx.set.status = 403;
      return { error: 'Insufficient permissions' };
    }
  };
}
