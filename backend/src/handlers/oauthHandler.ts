/**
 * OAuth 2.0 Authorization Server
 *
 * Supported grant types:
 *   - authorization_code  (+ PKCE S256/plain)
 *   - client_credentials
 *   - refresh_token
 *
 * Endpoints:
 *   GET  /oauth/authorize          – authorization endpoint (info / consent UI data)
 *   POST /oauth/authorize          – approve or deny consent (user must be authenticated)
 *   POST /oauth/token              – token exchange
 *   POST /oauth/token/revoke       – revoke access/refresh token
 *   GET  /oauth/userinfo           – OpenID-style userinfo (Bearer OAuth token required)
 *   GET  /oauth/apps               – list apps owned by the authenticated user
 *   POST /oauth/apps               – register a new OAuth application
 *   GET  /oauth/apps/:clientId     – public metadata for a single app
 *   PUT  /oauth/apps/:id           – update your app
 *   DELETE /oauth/apps/:id         – delete your app
 *   GET  /.well-known/oauth-authorization-server  – RFC 8414 discovery document
 *
 * FUN FACT I HAVE NEVER EVER TESTED IT PROPERLY..
 * BURN IN HELLLLLLLLL OAUTH 2.0
 */
import crypto from 'crypto';
import { t } from 'elysia';
import { AppDataSource } from '../config/typeorm';
import { OAuthApp, OAUTH_SCOPES } from '../models/oauthApp.entity';
import { OAuthAuthCode } from '../models/oauthAuthCode.entity';
import { OAuthToken } from '../models/oauthToken.entity';
import { User } from '../models/user.entity';
import { authenticate } from '../middleware/auth';
import { hashPassword, comparePassword } from '../utils/password';

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function filterScopes(requested: string[], allowed: string[]): string[] {
  return requested.filter((s) => allowed.includes(s) && OAUTH_SCOPES.includes(s as any));
}

function verifyPkce(
  verifier: string,
  challenge: string,
  method: string | undefined,
): boolean {
  if (!method || method === 'plain') {
    return timingSafeEqual(verifier, challenge);
  }
  if (method === 'S256') {
    const hash = crypto
      .createHash('sha256')
      .update(verifier)
      .digest('base64url');
    return timingSafeEqual(hash, challenge);
  }
  return false;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return crypto.timingSafeEqual(ab, bb);
}

const ACCESS_TOKEN_TTL = 3600;
const REFRESH_TOKEN_TTL = 30 * 86400;
const AUTH_CODE_TTL = 600;

export async function oauthWellKnownRoutes(app: any, prefix = '') {
  app.get(prefix + '/.well-known/oauth-authorization-server', async (_ctx) => {
    const base = process.env.PANEL_API_URL || process.env.PANEL_URL || 'https://panel.ecli.app';
    return {
      issuer: base,
      authorization_endpoint: `${base}/api/oauth/authorize`,
      token_endpoint: `${base}/api/oauth/token`,
      revocation_endpoint: `${base}/api/oauth/token/revoke`,
      userinfo_endpoint: `${base}/api/oauth/userinfo`,
      introspection_endpoint: `${base}/api/oauth/token/introspect`,
      scopes_supported: [...OAUTH_SCOPES],
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'client_credentials', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
      code_challenge_methods_supported: ['S256', 'plain'],
      service_documentation: `${base}/api/oauth/docs`,
    };
  }, {
    detail: { summary: 'OAuth 2.0 discovery document', tags: ['OAuth'] },
    response: { 200: t.Any() }
  });
}

export async function oauthRoutes(app: any, prefix = '') {
  const appRepo = AppDataSource.getRepository(OAuthApp);
  const codeRepo = AppDataSource.getRepository(OAuthAuthCode);
  const tokenRepo = AppDataSource.getRepository(OAuthToken);

  app.post(prefix + '/oauth/apps', async (ctx) => {
    const owner = (ctx as any).user as User;
    const {
      name,
      description,
      logoUrl,
      redirectUris,
      allowedScopes,
      grantTypes,
    } = ctx.body as any;

    if (!name) {
      ctx.set.status = 400;
      return { error: 'name is required' };
    }
    if (!redirectUris || !Array.isArray(redirectUris) || redirectUris.length === 0) {
      ctx.set.status = 400;
      return { error: 'redirectUris must be a non-empty array' };
    }

    const validScopes = filterScopes(
      allowedScopes || ['profile', 'email'],
      [...OAUTH_SCOPES],
    );
    if (validScopes.length === 0) {
      ctx.set.status = 400;
      return { error: 'No valid scopes provided' };
    }

    const allowedGrants = ['authorization_code', 'client_credentials', 'refresh_token'];
    const grants: string[] = (grantTypes || ['authorization_code', 'refresh_token']).filter(
      (g: string) => allowedGrants.includes(g),
    );

    const clientId = crypto.randomUUID();
    const rawSecret = randomToken(40);
    const clientSecretHash = await hashPassword(rawSecret);

    const entity = appRepo.create({
      clientId,
      clientSecretHash,
      name,
      description,
      logoUrl,
      redirectUris,
      allowedScopes: validScopes,
      grantTypes: grants,
      owner,
      active: true,
    });
    await appRepo.save(entity);

    ctx.set.status = 201;
    return {
      id: entity.id,
      clientId,
      clientSecret: rawSecret,
      name: entity.name,
      description: entity.description,
      redirectUris: entity.redirectUris,
      allowedScopes: entity.allowedScopes,
      grantTypes: entity.grantTypes,
      createdAt: entity.createdAt,
      _note: 'Store clientSecret securely - it will not be shown again.',
    };
  }, {
    beforeHandle: authenticate,
    detail: { summary: 'Register a new OAuth app', tags: ['OAuth'] },
    response: { 201: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }) }
  });

  app.get(prefix + '/oauth/apps', async (ctx) => {
    const user = (ctx as any).user as User;
    const apps = await appRepo.find({
      where: { owner: { id: user.id } },
      relations: ['owner'],
    });
    return apps.map((a) => ({
      id: a.id,
      clientId: a.clientId,
      name: a.name,
      description: a.description,
      logoUrl: a.logoUrl,
      redirectUris: a.redirectUris,
      allowedScopes: a.allowedScopes,
      grantTypes: a.grantTypes,
      active: a.active,
      createdAt: a.createdAt,
    }));
  }, {
    beforeHandle: authenticate,
    detail: { summary: 'List OAuth apps for current user', tags: ['OAuth'] },
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }) }
  });

  app.get(prefix + '/oauth/apps/:clientId', async (ctx) => {
    const { clientId } = ctx.params as any;
    const oauthApp = await appRepo.findOne({ where: { clientId }, relations: ['owner'] });
    if (!oauthApp || !oauthApp.active) {
      ctx.set.status = 404;
      return { error: 'App not found' };
    }
    return {
      clientId: oauthApp.clientId,
      name: oauthApp.name,
      description: oauthApp.description,
      logoUrl: oauthApp.logoUrl,
      allowedScopes: oauthApp.allowedScopes,
      grantTypes: oauthApp.grantTypes,
      ownerName: oauthApp.owner
        ? `${oauthApp.owner.firstName} ${oauthApp.owner.lastName}`
        : 'Eclipse Systems',
    };
  }, {
    detail: { summary: 'Get public OAuth app metadata', tags: ['OAuth'] },
    response: { 200: t.Any(), 404: t.Object({ error: t.String() }) }
  });

  app.put(prefix + '/oauth/apps/:id', async (ctx) => {
    const user = (ctx as any).user as User;
    const id = Number(ctx.params['id']);
    const oauthApp = await appRepo.findOne({ where: { id }, relations: ['owner'] });
    if (!oauthApp) {
      ctx.set.status = 404;
      return { error: 'App not found' };
    }
    if (oauthApp.owner?.id !== user.id && user.role !== 'admin') {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    const { name, description, logoUrl, redirectUris, allowedScopes, grantTypes, active } =
      ctx.body as any;
    if (name !== undefined) oauthApp.name = name;
    if (description !== undefined) oauthApp.description = description;
    if (logoUrl !== undefined) oauthApp.logoUrl = logoUrl;
    if (redirectUris !== undefined) oauthApp.redirectUris = redirectUris;
    if (allowedScopes !== undefined) {
      oauthApp.allowedScopes = filterScopes(allowedScopes, [...OAUTH_SCOPES]);
    }
    if (grantTypes !== undefined) oauthApp.grantTypes = grantTypes;
    if (active !== undefined) oauthApp.active = active;
    await appRepo.save(oauthApp);
    return { success: true, app: oauthApp };
  }, {
    beforeHandle: authenticate,
    detail: { summary: 'Update an OAuth app', tags: ['OAuth'] },
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) }
  });

  app.post(prefix + '/oauth/apps/:id/rotate-secret', async (ctx) => {
    const user = (ctx as any).user as User;
    const id = Number(ctx.params['id']);
    const oauthApp = await appRepo.findOne({ where: { id }, relations: ['owner'] });
    if (!oauthApp) {
      ctx.set.status = 404;
      return { error: 'App not found' };
    }
    if (oauthApp.owner?.id !== user.id && user.role !== 'admin') {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    const rawSecret = randomToken(40);
    oauthApp.clientSecretHash = await hashPassword(rawSecret);
    await appRepo.save(oauthApp);
    // revoke all existing tokens for this app
    await tokenRepo.update({ app: { id: oauthApp.id } }, { revoked: true });
    return {
      clientId: oauthApp.clientId,
      clientSecret: rawSecret,
      _note: 'All existing tokens have been revoked. Store the new secret securely.',
    };
  }, {
    beforeHandle: authenticate,
    detail: { summary: 'Rotate OAuth client secret', tags: ['OAuth'] },
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) }
  });

  app.delete(prefix + '/oauth/apps/:id', async (ctx) => {
    const user = (ctx as any).user as User;
    const id = Number(ctx.params['id']);
    const oauthApp = await appRepo.findOne({ where: { id }, relations: ['owner'] });
    if (!oauthApp) {
      ctx.set.status = 404;
      return { error: 'App not found' };
    }
    if (oauthApp.owner?.id !== user.id && user.role !== 'admin') {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    await appRepo.remove(oauthApp);
    return { success: true };
  }, {
    beforeHandle: authenticate,
    detail: { summary: 'Delete an OAuth app', tags: ['OAuth'] },
    response: { 200: t.Object({ success: t.Boolean() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) }
  });

  app.get(prefix + '/oauth/authorize', async (ctx) => {
    const {
      client_id,
      redirect_uri,
      scope,
      state,
      response_type,
      code_challenge,
      code_challenge_method,
    } = ctx.query as any;

    if (response_type !== 'code') {
      ctx.set.status = 400;
      return { error: 'unsupported_response_type' };
    }
    if (!client_id) {
      ctx.set.status = 400;
      return { error: 'client_id required' };
    }
    if (!redirect_uri) {
      ctx.set.status = 400;
      return { error: 'redirect_uri required' };
    }

    const oauthApp = await appRepo.findOne({
      where: { clientId: client_id, active: true },
      relations: ['owner'],
    });
    if (!oauthApp) {
      ctx.set.status = 400;
      return { error: 'invalid_client' };
    }

    if (!oauthApp.redirectUris.includes(redirect_uri)) {
      ctx.set.status = 400;
      return { error: 'redirect_uri_mismatch' };
    }

    if (!oauthApp.grantTypes.includes('authorization_code')) {
      ctx.set.status = 400;
      return { error: 'unauthorized_client' };
    }

    const requestedScopes = scope ? scope.split(' ') : ['profile'];
    const grantableScopes = filterScopes(requestedScopes, oauthApp.allowedScopes);

    return {
      app: {
        clientId: oauthApp.clientId,
        name: oauthApp.name,
        description: oauthApp.description,
        logoUrl: oauthApp.logoUrl,
        ownerName: oauthApp.owner
          ? `${oauthApp.owner.firstName} ${oauthApp.owner.lastName}`
          : 'Eclipse Systems',
      },
      requestedScopes: grantableScopes,
      state: state || null,
      redirect_uri,
      code_challenge: code_challenge || null,
      code_challenge_method: code_challenge_method || null,
    };
  }, {
    detail: { summary: 'OAuth authorization endpoint (consent info)', tags: ['OAuth'] },
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }) }
  });

  app.post(prefix + '/oauth/authorize', async (ctx) => {
    const user = (ctx as any).user as User;
    const {
      client_id,
      redirect_uri,
      scope,
      state,
      approved,
      code_challenge,
      code_challenge_method,
    } = ctx.body as any;

    if (!client_id || !redirect_uri) {
      ctx.set.status = 400;
      return { error: 'client_id and redirect_uri required' };
    }

    const oauthApp = await appRepo.findOne({
      where: { clientId: client_id, active: true },
    });
    if (!oauthApp) {
      ctx.set.status = 400;
      return { error: 'invalid_client' };
    }
    if (!oauthApp.redirectUris.includes(redirect_uri)) {
      ctx.set.status = 400;
      return { error: 'redirect_uri_mismatch' };
    }

    const stateParam = state ? `&state=${encodeURIComponent(state)}` : '';

    if (!approved) {
      return { redirect: `${redirect_uri}?error=access_denied${stateParam}` };
    }

    const requestedScopes = scope ? scope.split(' ') : ['profile'];
    const grantedScopes = filterScopes(requestedScopes, oauthApp.allowedScopes);

    // Don't grant 'admin' to non-admin users
    const finalScopes = grantedScopes.filter(
      (s) => s !== 'admin' || user.role === 'admin' || user.role === '*',
    );

    const code = randomToken(32);
    const expiresAt = new Date(Date.now() + AUTH_CODE_TTL * 1000);

    const authCode = codeRepo.create({
      code,
      app: oauthApp,
      user,
      redirectUri: redirect_uri,
      scopes: finalScopes,
      codeChallenge: code_challenge,
      codeChallengeMethod: code_challenge_method,
      state,
      expiresAt,
    });
    await codeRepo.save(authCode);

    return { redirect: `${redirect_uri}?code=${code}${stateParam}` };
  }, {
    beforeHandle: authenticate,
    detail: { summary: 'Submit OAuth consent decision', tags: ['OAuth'] },
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }) }
  });

  app.post(prefix + '/oauth/token', async (ctx) => {
    const body = ctx.body as any;
    const { grant_type } = body;

    if (!grant_type) {
      ctx.set.status = 400;
      return { error: 'invalid_request', error_description: 'grant_type required' };
    }

    let clientId: string | undefined;
    let clientSecret: string | undefined;

    const authHeader = (ctx.request.headers as any)['authorization'] as string | undefined;
    if (authHeader && authHeader.startsWith('Basic ')) {
      const decoded = Buffer.from(authHeader.slice(6), 'base64').toString();
      const [ci, cs] = decoded.split(':');
      clientId = ci;
      clientSecret = cs;
    } else {
      clientId = body.client_id;
      clientSecret = body.client_secret;
    }

    const requireSecret = grant_type !== 'authorization_code' || !body.code_verifier;

    if (!clientId) {
      ctx.set.status = 401;
      return { error: 'invalid_client', error_description: 'client_id required' };
    }

    const oauthApp = await appRepo.findOne({ where: { clientId, active: true } });
    if (!oauthApp) {
      ctx.set.status = 401;
      return { error: 'invalid_client' };
    }

    if (requireSecret) {
      if (!clientSecret) {
        ctx.set.status = 401;
        return { error: 'invalid_client', error_description: 'client_secret required' };
      }
      const secretValid = await comparePassword(clientSecret, oauthApp.clientSecretHash);
      if (!secretValid) {
        ctx.set.status = 401;
        return { error: 'invalid_client', error_description: 'Invalid client credentials' };
      }
    }

    if (grant_type === 'authorization_code') {
      const { code, redirect_uri, code_verifier } = body;
      if (!code) {
        ctx.set.status = 400;
        return { error: 'invalid_request', error_description: 'code required' };
      }
      if (!redirect_uri) {
        ctx.set.status = 400;
        return { error: 'invalid_request', error_description: 'redirect_uri required' };
      }

      const authCode = await codeRepo.findOne({
        where: { code, used: false },
        relations: ['app', 'user'],
      });

      if (!authCode) {
        ctx.set.status = 400;
        return { error: 'invalid_grant', error_description: 'Code not found or already used' };
      }
      if (authCode.app.clientId !== clientId) {
        ctx.set.status = 400;
        return { error: 'invalid_grant' };
      }
      if (authCode.redirectUri !== redirect_uri) {
        ctx.set.status = 400;
        return { error: 'invalid_grant', error_description: 'redirect_uri mismatch' };
      }
      if (new Date() > authCode.expiresAt) {
        ctx.set.status = 400;
        return { error: 'invalid_grant', error_description: 'Code expired' };
      }

      if (authCode.codeChallenge) {
        if (!code_verifier) {
          ctx.set.status = 400;
          return { error: 'invalid_grant', error_description: 'code_verifier required' };
        }
        if (!verifyPkce(code_verifier, authCode.codeChallenge, authCode.codeChallengeMethod)) {
          ctx.set.status = 400;
          return { error: 'invalid_grant', error_description: 'code_verifier mismatch' };
        }
      }

      authCode.used = true;
      await codeRepo.save(authCode);

      const accessToken = randomToken(40);
      const refreshToken = randomToken(40);
      const now = Date.now();

      const tokenEntity = tokenRepo.create({
        accessToken,
        refreshToken,
        app: oauthApp,
        user: authCode.user,
        scopes: authCode.scopes,
        accessTokenExpiresAt: new Date(now + ACCESS_TOKEN_TTL * 1000),
        refreshTokenExpiresAt: new Date(now + REFRESH_TOKEN_TTL * 1000),
        revoked: false,
      });
      await tokenRepo.save(tokenEntity);

      return {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: ACCESS_TOKEN_TTL,
        refresh_token: refreshToken,
        scope: authCode.scopes.join(' '),
      };
    }

    if (grant_type === 'client_credentials') {
      if (!oauthApp.grantTypes.includes('client_credentials')) {
        ctx.set.status = 400;
        return { error: 'unauthorized_client' };
      }
      const requestedScopes = body.scope ? body.scope.split(' ') : [];
      const grantedScopes = filterScopes(requestedScopes, oauthApp.allowedScopes);

      const accessToken = randomToken(40);
      const now = Date.now();

      const tokenEntity = tokenRepo.create({
        accessToken,
        app: oauthApp,
        user: undefined,
        scopes: grantedScopes,
        accessTokenExpiresAt: new Date(now + ACCESS_TOKEN_TTL * 1000),
        revoked: false,
      });
      await tokenRepo.save(tokenEntity);

      return {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: ACCESS_TOKEN_TTL,
        scope: grantedScopes.join(' '),
      };
    }

    if (grant_type === 'refresh_token') {
      if (!oauthApp.grantTypes.includes('refresh_token')) {
        ctx.set.status = 400;
        return { error: 'unauthorized_client' };
      }
      const { refresh_token } = body;
      if (!refresh_token) {
        ctx.set.status = 400;
        return { error: 'invalid_request', error_description: 'refresh_token required' };
      }

      const existing = await tokenRepo.findOne({
        where: { refreshToken: refresh_token, revoked: false },
        relations: ['app', 'user'],
      });
      if (!existing) {
        ctx.set.status = 400;
        return { error: 'invalid_grant', error_description: 'Refresh token not found or revoked' };
      }
      if (existing.app.clientId !== clientId) {
        ctx.set.status = 400;
        return { error: 'invalid_grant' };
      }
      if (existing.refreshTokenExpiresAt && new Date() > existing.refreshTokenExpiresAt) {
        ctx.set.status = 400;
        return { error: 'invalid_grant', error_description: 'Refresh token expired' };
      }

      existing.revoked = true;
      await tokenRepo.save(existing);

      const newAccessToken = randomToken(40);
      const newRefreshToken = randomToken(40);
      const now = Date.now();

      const newToken = tokenRepo.create({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        app: oauthApp,
        user: existing.user,
        scopes: existing.scopes,
        accessTokenExpiresAt: new Date(now + ACCESS_TOKEN_TTL * 1000),
        refreshTokenExpiresAt: new Date(now + REFRESH_TOKEN_TTL * 1000),
        revoked: false,
      });
      await tokenRepo.save(newToken);

      return {
        access_token: newAccessToken,
        token_type: 'Bearer',
        expires_in: ACCESS_TOKEN_TTL,
        refresh_token: newRefreshToken,
        scope: existing.scopes.join(' '),
      };
    }

    ctx.set.status = 400;
    return { error: 'unsupported_grant_type' };
  }, {
    detail: { summary: 'Exchange OAuth grant for tokens', tags: ['OAuth'] },
    response: { 200: t.Any(), 400: t.Object({ error: t.String(), error_description: t.Optional(t.String()) }), 401: t.Object({ error: t.String(), error_description: t.Optional(t.String()) }) }
  });

  app.post(prefix + '/oauth/token/revoke', async (ctx) => {
    const { token, client_id, client_secret } = ctx.body as any;
    if (!token || !client_id || !client_secret) {
      ctx.set.status = 400;
      return { error: 'invalid_request' };
    }

    const oauthApp = await appRepo.findOne({ where: { clientId: client_id, active: true } });
    if (!oauthApp) {
      ctx.set.status = 401;
      return { error: 'invalid_client' };
    }

    const secretValid = await comparePassword(client_secret, oauthApp.clientSecretHash);
    if (!secretValid) {
      ctx.set.status = 401;
      return { error: 'invalid_client' };
    }

    const byAccess = await tokenRepo.findOne({ where: { accessToken: token, app: { id: oauthApp.id } } });
    if (byAccess) {
      byAccess.revoked = true;
      await tokenRepo.save(byAccess);
      ctx.set.status = 200;
      return {};
    }

    const byRefresh = await tokenRepo.findOne({ where: { refreshToken: token, app: { id: oauthApp.id } } });
    if (byRefresh) {
      byRefresh.revoked = true;
      await tokenRepo.save(byRefresh);
      ctx.set.status = 200;
      return {};
    }

    ctx.set.status = 200;
    return {};
  }, {
    detail: { summary: 'Revoke an access or refresh token', tags: ['OAuth'] },
    response: { 200: t.Object({}) , 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }) }
  });

  app.get(prefix + '/oauth/userinfo', async (ctx) => {
    const oauthToken = (ctx as any).oauthToken as OAuthToken | undefined;
    const user = (ctx as any).user as User | undefined;

    if (!user) {
      ctx.set.status = 401;
      return { error: 'Unauthorized' };
    }

    if (!oauthToken) {
      ctx.set.status = 403;
      return { error: 'endpoint_only_for_oauth_tokens' };
    }

    const scopes = oauthToken.scopes;
    const out: Record<string, any> = { sub: String(user.id) };

    if (scopes.includes('profile')) {
      out.firstName = user.firstName;
      out.lastName = user.lastName;
      out.displayName = user.displayName || null;
      out.avatarUrl = user.avatarUrl || null;
      out.portalType = user.portalType;
      out.role = user.role || null;
    }
    if (scopes.includes('email')) {
      out.email = user.email;
      out.emailVerified = user.emailVerified ?? false;
    }
    if (scopes.includes('orgs:read') && user.org) {
      out.org = {
        id: user.org.id,
        name: user.org.name,
        handle: (user.org as any).handle || null,
        role: user.orgRole,
      };
    }
    if (scopes.includes('billing:read')) {
      out.billingCompany = user.billingCompany || null;
      out.billingCity = user.billingCity || null;
      out.billingState = user.billingState || null;
      out.billingZip = user.billingZip || null;
      out.billingCountry = user.billingCountry || null;
    }

    return out;
  }, {
    detail: { summary: 'OpenID Connect userinfo endpoint', tags: ['OAuth'] },
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) }
  }, {
    beforeHandle: authenticate,
    detail: { summary: 'OpenID Connect userinfo endpoint', tags: ['OAuth'] },
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) }
  });

  app.post(prefix + '/oauth/token/introspect', async (ctx) => {
    const { token, client_id, client_secret } = ctx.body as any;
    if (!token || !client_id || !client_secret) {
      ctx.set.status = 400;
      return { error: 'invalid_request' };
    }

    const oauthApp = await appRepo.findOne({ where: { clientId: client_id, active: true } });
    if (!oauthApp) {
      ctx.set.status = 401;
      return { error: 'invalid_client' };
    }

    const secretValid = await comparePassword(client_secret, oauthApp.clientSecretHash);
    if (!secretValid) {
      ctx.set.status = 401;
      return { error: 'invalid_client' };
    }

    const tokenEntity = await tokenRepo.findOne({
      where: { accessToken: token },
      relations: ['app', 'user'],
    });

    if (
      !tokenEntity ||
      tokenEntity.revoked ||
      new Date() > tokenEntity.accessTokenExpiresAt
    ) {
      return { active: false };
    }

    return {
      active: true,
      scope: tokenEntity.scopes.join(' '),
      client_id: tokenEntity.app.clientId,
      token_type: 'Bearer',
      exp: Math.floor(tokenEntity.accessTokenExpiresAt.getTime() / 1000),
      iat: Math.floor(tokenEntity.createdAt.getTime() / 1000),
      sub: tokenEntity.user ? String(tokenEntity.user.id) : undefined,
    };
  }, {
    detail: { summary: 'OAuth token introspection endpoint', tags: ['OAuth'] },
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }) }
  });
}
