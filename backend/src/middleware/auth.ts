import * as jwtLib from 'jsonwebtoken';
import { AppDataSource } from '../config/typeorm';
import { User } from '../models/user.entity';
import { ApiKey } from '../models/apiKey.entity';
import { OAuthToken } from '../models/oauthToken.entity';

export type AuthContext = {
  user?: User;
  apiKey?: ApiKey;
  oauthToken?: OAuthToken;
  jwtPayload?: any;
  userPermissions?: string[];
};

export async function authenticate(ctx: any) {
  const getHeader = (name: string) => {
    const h = ctx.headers || {};
    return h[name.toLowerCase()] || h[name];
  };

  const getCookieToken = () => {
    const cookieName = process.env.JWT_COOKIE_NAME || 'token';
    if (ctx.cookie && ctx.cookie[cookieName]) {
      return ctx.cookie[cookieName].value;
    }
    const cookie = ctx.headers?.cookie;
    if (cookie) {
      const parts = String(cookie).split(';').map((s: string) => s.trim());
      const pair = parts.find(p => p.startsWith(cookieName + '='));
      if (pair) return pair.split('=')[1];
    }
    return undefined;
  };

  let auth = getHeader('authorization') as string | undefined;
  const headerKey = getHeader('x-api-key') as string | undefined;
  const cookieToken = getCookieToken();

  if (!auth && headerKey) auth = `ApiKey ${headerKey}`;

  if (!auth && cookieToken) auth = `Bearer ${cookieToken}`;

  //ctx.log?.info?.({ authorization: auth, cookieToken }, '[authenticate] headers');

  if (auth?.startsWith('ApiKey ')) {
    const key = auth.slice('ApiKey '.length);
    const repo = AppDataSource.getRepository(ApiKey);
    const entry = await repo.findOne({ where: { key }, relations: ['user'] });
    if (!entry || (entry.expiresAt && new Date(entry.expiresAt) < new Date())) {
      ctx.set.status = 401;
      return { error: 'Invalid API key' };
    }
    ctx.apiKey = entry;
    if (entry.user) ctx.user = entry.user;
    return;
  }

  if (!auth) {
    ctx.set.status = 401;
    return { error: 'Missing token' };
  }

  let rawToken = '';
  const parts = auth.split(' ');
  if (parts.length === 2 && parts[0] === 'Bearer') {
    rawToken = parts[1];
  } else if (auth.length > 20 && !auth.includes(' ')) {
    rawToken = auth;
  }
  if (!rawToken) {
    ctx.set.status = 401;
    return { error: 'Invalid token format' };
  }

  try {
    const secret = process.env.JWT_SECRET;
    const decoded = jwtLib.verify(rawToken, secret) as any;
    ctx.jwtPayload = decoded;

    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({
      where: { id: decoded.userId },
      relations: [
        'org',
        'userRoles',
        'userRoles.role',
        'userRoles.role.permissions',
        'userRoles.role.parentRole',
        'userRoles.role.parentRole.permissions',
      ],
    });
    const debugInfo = {
      userId: decoded.userId,
      sessionId: decoded.sessionId,
      userFound: !!user,
      userSessions: user?.sessions,
      jwtPayload: decoded
    };

    //if (ctx.log && typeof ctx.log.info === 'function') {
    //  ctx.log.info(debugInfo, '[authenticate] session debug');
    //} else {
    //  console.log('[authenticate] session debug', debugInfo);
    //}
    
    if (!user) {
      ctx.set.status = 401;
      return { error: 'User not found' };
    }
    if (!user.sessions || !user.sessions.includes(decoded.sessionId)) {
      ctx.set.status = 401;
      return { error: 'Invalid session' };
    }

    if (user.pendingDeletionUntil && new Date(user.pendingDeletionUntil) > new Date()) {
      ctx.set.status = 403;
      return { error: 'Account is pending deletion and currently frozen' };
    }

    if (user.demoExpiresAt && new Date(user.demoExpiresAt) < new Date()) {
      user.demoExpiresAt = undefined;
      user.demoLimits = undefined;
      if (user.demoOriginalPortalType) {
        user.portalType = user.demoOriginalPortalType;
        user.demoOriginalPortalType = undefined;
      }
      await userRepo.save(user);
    }

    ctx.user = user;
    ctx.userPermissions = [];
    const seenRoles = new Set<number>();
    const addRolePermissions = (role: any) => {
      if (!role || !role.id || seenRoles.has(role.id)) return;
      seenRoles.add(role.id);
      if (Array.isArray(role.permissions)) {
        for (const perm of role.permissions) {
          if (perm && typeof perm.value === 'string') ctx.userPermissions.push(perm.value);
        }
      }
      if (role.parentRole) {
        addRolePermissions(role.parentRole);
      }
    };
    if (Array.isArray(user.userRoles)) {
      for (const ur of user.userRoles) {
        addRolePermissions((ur as any).role);
      }
    }
    return;
  } catch (e: any) {
    ctx.log?.info?.('[authenticate] JWT verify failed', e?.message || e);
  }

  const tokenRepo = AppDataSource.getRepository(OAuthToken);
  const oauthToken = await tokenRepo.findOne({
    where: { accessToken: rawToken, revoked: false },
    relations: ['user', 'user.organisationMemberships', 'user.organisationMemberships.organisation', 'app'],
  });
  if (!oauthToken || new Date() > oauthToken.accessTokenExpiresAt) {
    ctx.set.status = 401;
    return { error: 'Invalid token' };
  }
  ctx.oauthToken = oauthToken;
  if (oauthToken.user) ctx.user = oauthToken.user;
}

