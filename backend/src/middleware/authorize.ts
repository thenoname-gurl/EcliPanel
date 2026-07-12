import { AppDataSource } from '../config/typeorm';
import { User } from '../models/user.entity';

function permissionMatches(granted: string, required: string) {
  if (!granted || !required) return false;
  if (granted === '*') return true;
  if (granted === required) return true;
  const parts = String(granted).split(':');
  const reqParts = String(required).split(':');
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === '*') return true;
    if (reqParts[i] !== parts[i]) return false;
  }
  return true;
}

function getUserPermissionsFromCtx(ctx: any): string[] {
  const user = ctx.user as User | undefined;
  if (!user) return [];
  if (user.role === '*' || user.role === 'rootAdmin') return ['*'];
  if (Array.isArray(ctx.userPermissions)) return ctx.userPermissions;

  const perms: string[] = [];
  const loadedUser = user as any;
  if (Array.isArray(loadedUser.userRoles)) {
    for (const ur of loadedUser.userRoles) {
      const role = ur?.role;
      if (!role || !Array.isArray(role.permissions)) continue;
      for (const perm of role.permissions) {
        if (perm && typeof perm.value === 'string') {
          perms.push(perm.value);
        }
      }
    }
  }
  return perms;
}

export function hasPermissionSync(ctx: any, required: string): boolean {
  const user = ctx.user as User | undefined;
  if (!user) return false;
  if (user.role === '*' || user.role === 'rootAdmin') return true;

  const perms = getUserPermissionsFromCtx(ctx);
  return perms.some(p => permissionMatches(p, required));
}

export function isAdminContext(ctx: any): boolean {
  if (!ctx) return false;
  const apiKey = ctx.apiKey;
  if (apiKey?.type === 'admin') return true;
  return hasPermissionSync(ctx, 'admin:access');
}

export async function getUserPermissions(ctx: any): Promise<string[]> {
  const user = ctx.user as User | undefined;
  if (!user) return [];
  if (user.role === '*' || user.role === 'rootAdmin') return ['*'];

  const perms = getUserPermissionsFromCtx(ctx);
  if (perms.length > 0) return perms;

  const userRepo = AppDataSource.getRepository(User);
  const u = await userRepo.findOne({
    where: { id: user.id },
    relations: { userRoles: { role: { permissions: true } } },
  });
  if (u && Array.isArray(u.userRoles)) {
    for (const ur of u.userRoles) {
      const role = ur?.role as any;
      if (!role || !Array.isArray(role.permissions)) continue;
      for (const perm of role.permissions) {
        if (perm && typeof perm.value === 'string') {
          perms.push(perm.value);
        }
      }
    }
  }

  if (perms.length === 0) {
    try {
      const roleRepo = AppDataSource.getRepository(require('../models/role.entity').Role);
      const def = await roleRepo.findOne({
        where: { name: 'default' },
        relations: { permissions: true },
      });
      if (def && Array.isArray(def.permissions)) {
        def.permissions.forEach((p: any) => perms.push(p.value));
      }
    } catch (e) {
      console.warn('[authorize] failed to load default role permissions', e?.message || e);
    }
  }

  return perms;
}

export async function hasPermission(ctx: any, required: string): Promise<boolean> {
  const user = ctx.user as User | undefined;
  if (!user) return false;
  if (user.role === '*' || user.role === 'rootAdmin') return true;

  const perms = await getUserPermissions(ctx);
  return perms.some(p => permissionMatches(p, required));
}

export function authorize(required: string) {
  return async (ctx: any) => {
    const t = (key: string, def?: string) =>
      typeof ctx.t === 'function' ? ctx.t(key) : def || key;
    const apiKey = ctx.apiKey;
    const ip = ctx.ip || (ctx.request && ctx.request.ip) || 'unknown';
    const _ctxInfo = { ip, path: ctx.path || ctx.request?.url || 'unknown' };
    if (apiKey) {
      if (apiKey.type === 'admin') return;
      const perms: string[] = apiKey.permissions || [];
      const has = perms.some(p => permissionMatches(p, required));
      if (has) return;
      ctx.set.status = 403;
      return { error: t('sshKey.insufficientPermissionsApiKey', 'API key lacks permissions') };
    }

    const user = ctx.user as User;
    if (!user) {
      ctx.set.status = 401;
      return { error: t('auth.unauthorized', 'Unauthorized') };
    }

    if (user.role === '*' || user.role === 'rootAdmin') {
      return;
    }

    const serverRelatedPrefixes = [
      'servers:',
      'server:',
      'files:',
      'backups:',
      'commands:',
      'logs:',
      'reinstall:',
      'schedules:',
      'sync:',
      'transfer:',
      'version:',
      'configuration:',
      'databases:',
    ];
    const isServerRelated = serverRelatedPrefixes.some(prefix => required.startsWith(prefix));
    if (isServerRelated && !hasPermissionSync(ctx, 'admin:access') && !user.dateOfBirth) {
      ctx.set.status = 403;
      return { error: t('validation.ageVerificationRequired', 'Age verification required') };
    }

    const serverReadPerms = [
      'servers:read', 'files:read', 'backups:read',
      'schedules:read', 'configuration:read', 'version:read',
      'logs:read', 'databases:read',
    ];
    if (serverReadPerms.includes(required)) return;

    if (isServerRelated && required !== 'servers:create') {
      try {
        const { ServerSubuser } = require('../models/serverSubuser.entity');
        const subuserRepo = AppDataSource.getRepository(ServerSubuser);
        const serverUuid =
          ctx.params?.id ||
          ctx.params?.serverId ||
          ctx.request?.body?.serverUuid ||
          ctx.request?.body?.id ||
          ctx.query?.serverUuid ||
          ctx.query?.server;

        if (serverUuid) {
          const cfgRepo = AppDataSource.getRepository(
            require('../models/serverConfig.entity').ServerConfig
          );
          const cfg = await cfgRepo.findOneBy({ uuid: serverUuid });
          if (cfg && cfg.userId === user.id) return;
          const whereAny: any[] = [];
          whereAny.push({ userId: user.id, serverUuid });
          if (user.email) whereAny.push({ userEmail: user.email, serverUuid });
          const sub = await subuserRepo.findOne({ where: whereAny });
          if (sub && sub.accepted !== false && Array.isArray(sub.permissions)) {
            if (sub.permissions.includes('*')) return;
            const prefix = required.split(':')[0];
            const suffix = required.split(':')[1];
            const prefixToSubPerm: Record<string, string> = {
              files: 'files',
              backups: 'backups',
              commands: 'console',
              logs: 'activity',
              reinstall: 'settings',
              schedules: 'schedules',
              sync: 'settings',
              transfer: 'settings',
              version: 'stats',
              configuration: 'settings',
              databases: 'databases',
            };
            const subPermNeeded = prefix === 'servers' ? suffix : prefixToSubPerm[prefix];
            if (subPermNeeded && sub.permissions.includes(subPermNeeded)) return;

            if (sub.permissions.includes('read') && ['console', 'files', 'backups', 'startup', 'settings', 'databases', 'schedules', 'activity', 'stats'].includes(subPermNeeded)) return;
            if (sub.permissions.includes('write') && ['files', 'backups', 'startup', 'settings', 'databases', 'schedules'].includes(subPermNeeded)) return;
          }
        }
      } catch (e) {
        // uwu
      }
    }

    if (required.startsWith('org:') || required.startsWith('organisation:')) {
      try {
        const orgId =
          ctx.params?.id ||
          ctx.params?.orgId ||
          ctx.request?.body?.organisationId ||
          ctx.request?.body?.orgId ||
          ctx.query?.id ||
          ctx.query?.orgId;
        if (orgId && user) {
          const orgMemberRepo = AppDataSource.getRepository(
            require('../models/organisationMember.entity').OrganisationMember
          );
          const membership = await orgMemberRepo.findOne({
            where: { userId: user.id, organisationId: Number(orgId) },
          });
          if (membership) {
            if (required === 'org:read' || required === 'org:invite') return;
            if (
              required === 'org:write' &&
              (membership.orgRole === 'owner' || membership.orgRole === 'admin')
            )
              return;
          }
        }
      } catch (e) {
        // skip
      }
    }

    if (required === 'apikeys:create') return;
    if (required === 'apikeys:delete') {
      try {
        const keyId = ctx.params?.id || ctx.params?.keyId;
        if (keyId) {
          const keyRepo = AppDataSource.getRepository(require('../models/apiKey.entity').ApiKey);
          const key = await keyRepo.findOne({ where: { id: Number(keyId), userId: user.id } });
          if (key) return;
        }
      } catch (e) {
        // skip
      }
    }

    const has = await hasPermission(ctx, required);
    if (has) return;

    ctx.set.status = 403;
    return { error: t('common.insufficientPermissions', 'Insufficient permissions') };
  };
}
