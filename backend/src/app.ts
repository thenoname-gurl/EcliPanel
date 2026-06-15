import { Elysia, t } from 'elysia';
import { jwt } from '@elysia/jwt';
import cors from '@elysia/cors';
import { helmet } from 'elysia-helmet';
import jsonwebtoken from 'jsonwebtoken';
import { registerRoutes } from './routes/index';
import { setupMiddleware, authenticate } from './middleware';
import { i18n } from './i18n/plugin';
import { preloadAll } from './i18n/loader';
import { hasPermissionSync } from './middleware/authorize';
import { setupConfig } from './config';
import { createActivityLog } from './handlers/logHandler';
import { AppDataSource } from './config/typeorm';
import { scheduleStudentReverifyJob } from './jobs/studentReverifyJob';
import { scheduleMetricsCollectionJob } from './jobs/metricsCollectionJob';
import { scheduleExportJobRunner } from './jobs/exportJobRunner';
import { scheduleDeletionExecutionJob } from './jobs/deletionExecutionJob';
import { scheduleMailboxSyncJob } from './jobs/mailboxSyncJob';
import { scheduleOutboundEmailRunner } from './jobs/outboundEmailRunner';
import { scheduleAdminBroadcastJobRunner } from './jobs/adminBroadcastJobRunner';
import { scheduleSunsetPolicyJob } from './jobs/sunsetPolicyJob';
import { scheduleServerSunsetPolicyJob } from './jobs/serverSunsetPolicyJob';
import { scheduleGithubContributorsJob } from './jobs/githubContributorsJob';
import { scheduleTunnelCleanupJob } from './jobs/tunnelCleanupJob';
import { scheduleRenewalJob } from './jobs/renewalJob';
import { scheduleEloDecayJob } from './jobs/eloDecayJob';
import path from 'path';
import { decryptBuffer } from './utils/crypto';
import { openapi } from '@elysia/openapi';
import { csrfProtection } from './middleware/csrf';
import {
  initPqJwtKeypair,
  signPqJwt,
  verifyAnyToken,
} from './utils/pqJwt';
import type { SignOptions } from 'jsonwebtoken';
import type { JwtPayload as AppJwtPayload, PqJwtPayload } from './types/context';
import type { BaseHandlerContext } from './types/handler';

interface AppServerLike {
  requestIP?: (request: Request) => { address?: string | null } | null | undefined;
}

type AppRequestContext = Omit<BaseHandlerContext, 'request' | 't'> & {
  request: Request & { ip?: string };
  server?: AppServerLike;
  query?: Record<string, string | undefined>;
  params?: Record<string, string | undefined>;
  user?: { id: number };
  apiKey?: { type?: string };
  jwtPayload?: AppJwtPayload;
  pqJwtPayload?: PqJwtPayload;
  clientIP?: string;
  store?: Record<string, unknown> & { clientIP?: string };
  t?: BaseHandlerContext['t'];
};

type AppErrorContext = AppRequestContext & {
  error?: (Error & { status?: number }) | { status?: number; message?: string; stack?: string };
  code?: number;
};

interface AppExtensions {
  jwt: {
    sign(payload: object, opts?: SignOptions): string;
    verify<T = unknown>(token: string): T;
  };
  pqJwt: {
    signPqJwt(payload: object, expiresInSec?: number): string;
    verifyAnyToken(token: string): PqJwtPayload;
  };
  log: typeof console;
  server?: AppServerLike;
}

function getSafeUploadPath(base: string, relPath: string) {
  const normalised = path
    .normalize(String(relPath || ''))
    .replace(/^([/\\])+/, '')
    .replace(/^(\.{2}(\/|\\|$))+/, '');
  const fullPath = path.join(base, normalised);
  const relative = path.relative(base, fullPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Invalid path');
  }
  return fullPath;
}

// Migrated from Fastify hence why code for Elysia could be a mess,
// sorry about that.
// I tried to clean it up but yes..
const app = new Elysia() as Elysia & AppExtensions;
app.decorate('log', console)
  .use(
    openapi({
      documentation: {
        info: {
          title: 'EcliPanel',
          version: '3.0.0',
          description: 'EcliPanel Backend documentation',
          contact: {
            name: 'EclipseSystems Support',
            email: 'contact@ecli.app',
            url: 'https://ecli.app',
          },
        },
        servers: [
          { url: 'https://backend.ecli.app/', description: 'Primary API server' },
          { url: 'https://backend.canary.ecli.app/', description: 'Canary API server' },
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
            },
          },
        },
        tags: [
          { name: 'Users', description: 'Endpoints for user management' },
          { name: 'Auth', description: 'Authentication and session endpoints' },
          { name: 'Servers', description: 'Server control and information' },
          { name: 'Nodes', description: 'Wings node management' },
          { name: 'Billing', description: 'Orders, plans and payments' },
          { name: 'DNS', description: 'DNS management' },
          { name: 'Tickets', description: 'Support ticketing' },
          { name: 'AI', description: 'AI usage and models' },
          { name: 'SSH', description: 'SSH key management' },
          { name: 'Logs', description: 'Activity and audit logs' },
          { name: 'Identity', description: 'Endpoints for ID Verification management' },
          { name: 'Roles', description: 'Endpoints for Roles management' },
          { name: 'Organisations', description: 'Endpoints for Organisations management' },
          { name: 'SOC', description: 'Endpoints for SOC management' },
          { name: 'Health', description: 'Endpoints for Health data' },
          { name: 'OAuth', description: 'Endpoints for OAuth 2.0' },
          { name: 'Orders', description: 'Endpoints for Orders management' },
          { name: 'Remote', description: 'Endpoints for Wings Remote and Wings management' },
          { name: 'API Keys', description: 'Endpoints for API Keys management' },
          {
            name: 'Infrastructure',
            description: 'Endpoints for Enterprise infrastructure management',
          },
          { name: 'Eggs', description: 'Endpoints for Eggs (server templates) management' },
          { name: 'Plans', description: 'Endpoints for Plans management' },
          { name: 'Admin', description: 'Administrator tools' },
        ],
        security: [{ bearerAuth: [] }],
      },
    })
  )
  .model({
    User: t.Object({
      id: t.Number(),
      email: t.String(),
      firstName: t.Optional(t.String()),
      middleName: t.Optional(t.String()),
      lastName: t.Optional(t.String()),
      displayName: t.Optional(t.String()),
      address: t.Optional(t.String()),
      address2: t.Optional(t.String()),
      phone: t.Optional(t.String()),
      billingCompany: t.Optional(t.String()),
      billingCity: t.Optional(t.String()),
      billingState: t.Optional(t.String()),
      billingZip: t.Optional(t.String()),
      billingCountry: t.Optional(t.String()),
      role: t.Optional(t.String()),
      orgRole: t.Optional(t.String()),
      portalType: t.Optional(t.String()),
      nodeId: t.Optional(t.Number()),
      emailVerified: t.Optional(t.Boolean()),
      suspended: t.Optional(t.Boolean()),
      deletionRequested: t.Optional(t.Boolean()),
      deletionApproved: t.Optional(t.Boolean()),
      createdAt: t.Optional(t.String()),
    }),
    Server: t.Object({
      uuid: t.String(),
      nodeId: t.Number(),
      userId: t.Number(),
      name: t.Optional(t.String()),
      description: t.Optional(t.String()),
      suspended: t.Optional(t.Boolean()),
      dockerImage: t.Optional(t.String()),
      startup: t.Optional(t.String()),
      memory: t.Optional(t.Number()),
      disk: t.Optional(t.Number()),
      cpu: t.Optional(t.Number()),
      swap: t.Optional(t.Number()),
      ioWeight: t.Optional(t.Number()),
      eggId: t.Optional(t.Number()),
      maxDatabases: t.Optional(t.Number()),
      maxBackups: t.Optional(t.Number()),
      createdAt: t.Optional(t.String()),
    }),
    Node: t.Object({
      id: t.Number(),
      name: t.Optional(t.String()),
      url: t.String(),
      nodeType: t.Optional(t.String()),
      allowedOrigin: t.Optional(t.String()),
      useSSL: t.Optional(t.Boolean()),
    }),
    Plan: t.Object({
      id: t.Number(),
      name: t.String(),
      type: t.String(),
      price: t.Number(),
      description: t.Optional(t.String()),
      memory: t.Optional(t.Number()),
      disk: t.Optional(t.Number()),
      cpu: t.Optional(t.Number()),
      serverLimit: t.Optional(t.Number()),
      portCount: t.Optional(t.Number()),
      isDefault: t.Optional(t.Boolean()),
      features: t.Optional(t.Any()),
    }),
    DatabaseHost: t.Object({
      id: t.Number(),
      name: t.String(),
      host: t.String(),
      port: t.Number(),
      username: t.String(),
      nodeId: t.Optional(t.Number()),
      maxDatabases: t.Number(),
      createdAt: t.Optional(t.String()),
    }),
    ServerDatabase: t.Object({
      id: t.Number(),
      serverUuid: t.String(),
      hostId: t.Number(),
      name: t.String(),
      username: t.String(),
      label: t.Optional(t.String()),
      createdAt: t.Optional(t.String()),
    }),
    ApiKey: t.Object({
      id: t.Number(),
      key: t.String(),
      name: t.String(),
      type: t.String(),
      permissions: t.Optional(t.Array(t.String())),
      userId: t.Optional(t.Number()),
      createdAt: t.String(),
      expiresAt: t.Optional(t.String()),
    }),
    OAuthApp: t.Object({
      id: t.Number(),
      clientId: t.String(),
      name: t.String(),
      description: t.Optional(t.String()),
      logoUrl: t.Optional(t.String()),
      redirectUris: t.Array(t.String()),
      allowedScopes: t.Array(t.String()),
      grantTypes: t.Array(t.String()),
      createdAt: t.String(),
      active: t.Boolean(),
    }),
    Organisation: t.Object({
      id: t.Number(),
      name: t.String(),
      handle: t.String(),
      ownerId: t.Number(),
      portalTier: t.String(),
      avatarUrl: t.Optional(t.String()),
    }),
    Ticket: t.Object({
      id: t.Number(),
      userId: t.Number(),
      subject: t.String(),
      message: t.String(),
      status: t.String(),
      priority: t.String(),
      adminReply: t.Optional(t.String()),
      created: t.String(),
      updatedAt: t.String(),
    }),
    Order: t.Object({
      id: t.Number(),
      userId: t.Number(),
      orgId: t.Optional(t.Number()),
      items: t.String(),
      amount: t.Number(),
      status: t.String(),
      description: t.Optional(t.String()),
      planId: t.Optional(t.Number()),
      notes: t.Optional(t.String()),
      createdAt: t.String(),
      expiresAt: t.String(),
    }),
  })
  .use(
    cors({
      origin: (request: Request) => {
        const origin = request?.headers?.get?.('origin') ?? undefined;
        const rawCfg = [process.env.FRONTEND_URL, process.env.PANEL_URL]
          .filter(Boolean)
          .join(',')
          .split(',')
          .map(o => o.trim())
          .filter(Boolean);
        if (
          process.env.FRONTEND_URL === '*' ||
          process.env.FRONTEND_URL === 'true' ||
          process.env.PANEL_URL === '*' ||
          process.env.PANEL_URL === 'true'
        )
          return true;
        if (origin === 'null') return false;
        if (!origin) return true;
        if (rawCfg.length === 0) return true;

        const normalize = (s: unknown) => {
          if (!s && s !== '') return '';
          if (s instanceof URL) return s.origin;
          const str = typeof s === 'string' ? s : String(s);
          try {
            return new URL(str).origin;
          } catch {
            try {
              return new URL(str.startsWith('http') ? str : `https://${str}`).origin;
            } catch {
              return str.replace(/\/+$/g, '');
            }
          }
        };

        const originNorm = normalize(origin);
        const cfg = rawCfg.map(normalize);
        if (cfg.includes(originNorm)) return true;

        let originHost: string | null = null;
        try {
          originHost = new URL(originNorm).hostname;
        } catch {
          originHost = originNorm;
        }

        for (const c of cfg) {
          try {
            const cHost = new URL(c).hostname;
            if (originHost === cHost) return true;
            if (originHost.endsWith('.' + cHost)) return true;
          } catch {
            // skip
          }
        }

        return false;
      },
      credentials: true,
      methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'Origin',
        'x-sftp-password',
        'x-path',
        'x-csrf-token',
      ],
      exposeHeaders: ['Content-Type', 'Content-Length', 'Cache-Control'],
    })
  )
  .use(helmet())
  .use(jwt({ secret: process.env.JWT_SECRET }))
  .onRequest(async rawCtx => {
    const ctx = rawCtx as unknown as AppRequestContext;
    try {
      if (typeof ctx.t !== 'function') {
        ctx.t = (key: string) => String(key);
      }
    } catch {}
  })
  .use(i18n);

const _jwtSecret = process.env.JWT_SECRET;
app.jwt = {
  sign: (payload: object, opts?: SignOptions) => jsonwebtoken.sign(payload, _jwtSecret, opts),
  verify: <T = unknown>(token: string) => jsonwebtoken.verify(token, _jwtSecret) as T,
};
try {
  initPqJwtKeypair();
  console.log('[pqJwt] ML-DSA-65 keypair initialized');
} catch (err) {
  console.warn('[pqJwt] Failed to initialize ML-DSA-65 keypair:', err);
}
app.pqJwt = {
  signPqJwt: (payload: object, expiresInSec?: number) => signPqJwt(payload as any, expiresInSec),
  verifyAnyToken: (token: string) => verifyAnyToken(token),
};
app.log = console;

app.onError(rawCtx => {
  const ctx = rawCtx as unknown as AppErrorContext;
  let status = 500;

  if (
    ctx.error &&
    typeof ctx.error.status === 'number' &&
    ctx.error.status >= 100 &&
    ctx.error.status < 600
  ) {
    status = ctx.error.status;
  } else if (typeof ctx.code === 'number' && ctx.code >= 100 && ctx.code < 600) {
    status = ctx.code;
  }

  if (status === 404) {
    const origin = (ctx.request as Request)?.headers?.get?.('origin') || '*';
    return new Response(JSON.stringify({ error: 'Route not found' }), {
      status: 404,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers':
          'Content-Type, Authorization, X-Requested-With, Accept, Origin, x-sftp-password, x-path, x-csrf-token',
        'Access-Control-Expose-Headers': 'Content-Type, Content-Length, Cache-Control',
      },
    });
  }

  const log = app.log || console;
  if (status >= 500) {
    log.error({ err: ctx.error, url: ctx.request.url }, 'Unhandled server error');

    try {
      createActivityLog({
        userId: 0,
        action: 'server:error',
        targetType: 'server',
        metadata: {
          url: ctx.request?.url?.toString?.() ?? null,
          message: ctx.error?.message ?? String(ctx.error),
          stack: ctx.error?.stack ?? undefined,
          status,
        },
        ipAddress:
          (ctx.request as Request)?.headers?.get?.('x-forwarded-for') ||
          (ctx.request as Request)?.headers?.get?.('x-real-ip') ||
          '',
      }).catch((e: unknown) => {
        console.log('Failed to log server error activity', { err: e });
      });
    } catch {
      // skip
    }

    const origin = (ctx.request as Request)?.headers?.get?.('origin') || '*';
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers':
          'Content-Type, Authorization, X-Requested-With, Accept, Origin, x-sftp-password, x-path, x-csrf-token',
        'Access-Control-Expose-Headers': 'Content-Type, Content-Length, Cache-Control',
      },
    });
  }

  app.log?.warn?.({ err: ctx.error, url: ctx.request.url, status }, 'Request error');

  const origin = (ctx.request as Request)?.headers?.get?.('origin') || '*';
  return new Response(JSON.stringify({ error: 'Request error' }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers':
        'Content-Type, Authorization, X-Requested-With, Accept, Origin, x-sftp-password, x-path, x-csrf-token',
      'Access-Control-Expose-Headers': 'Content-Type, Content-Length, Cache-Control',
    },
  });
});

declare module 'elysia' {
  interface Elysia {
    jwt: {
      sign(payload: object, opts?: SignOptions): string;
      verify<T = unknown>(token: string): T;
    };
    pqJwt: {
      signPqJwt(payload: object, expiresInSec?: number): string;
      verifyAnyToken(token: string): PqJwtPayload;
    };
    log: typeof console;
  }
}

const _rateBuckets = new Map<string, { count: number; resetAt: number }>();
app.onRequest(async rawCtx => {
  const ctx = rawCtx as unknown as AppRequestContext;
  const req: Request = ctx.request;
  const headers = req?.headers;

  const getHeader = (name: string): string | null => {
    try {
      return headers?.get?.(name) ?? null;
    } catch {
      return null;
    }
  };

  const normalize = (value: string | null | undefined): string | undefined => {
    if (!value) return undefined;
    const trimmed = value.trim().replace(/^\[|\]$/g, '');
    return trimmed.length > 0 ? trimmed : undefined;
  };

  const cfIPv6 = normalize(getHeader('cf-connecting-ipv6'));
  const cfIP = normalize(getHeader('cf-connecting-ip'));

  const xForwardedFor = normalize(
    getHeader('x-forwarded-for')
      ?.split(',')
      .map(entry => entry.trim())
      .filter(Boolean)[0]
  );

  const xRealIP = normalize(getHeader('x-real-ip'));

  let remoteAddr: string | undefined;
  try {
    const server = ctx.server ?? app.server;
    if (server?.requestIP) {
      const ipInfo = server.requestIP(req);
      remoteAddr = ipInfo?.address ?? undefined;
    }
  } catch {
    // skip
  }

  if (!remoteAddr) {
    try {
      const builtinIP = ctx.ip;
      if (builtinIP && builtinIP !== 'unknown' && builtinIP !== 'null') {
        remoteAddr = builtinIP;
      }
    } catch {
      // skip
    }
  }

  const effectiveIP: string = cfIPv6 || cfIP || xForwardedFor || xRealIP || remoteAddr || 'unknown';

  try {
    ctx.ip = effectiveIP;
  } catch {
    /* skip */
  }
  try {
    ctx.request.ip = effectiveIP;
  } catch {
    /* skip */
  }
  try {
    ctx.clientIP = effectiveIP;
  } catch {
    /* skip */
  }
  try {
    ctx.store = ctx.store || {};
    ctx.store.clientIP = effectiveIP;
  } catch {
    /* skip */
  }

  if (effectiveIP === 'unknown') {
    console.warn('[IP Resolution Failed]', {
      cfIPv6: getHeader('cf-connecting-ipv6'),
      cfIP: getHeader('cf-connecting-ip'),
      xForwardedFor: getHeader('x-forwarded-for'),
      xRealIP: getHeader('x-real-ip'),
    });
  }

  const _rateLimitIP = remoteAddr || effectiveIP;
  const now = Date.now();
  const existing = _rateBuckets.get(_rateLimitIP);
  const bucket =
    existing && now <= existing.resetAt
      ? (existing.count++, existing)
      : { count: 1, resetAt: now + 60_000 };
  _rateBuckets.set(_rateLimitIP, bucket);

  if (bucket.count > 500) {
    const origin = getHeader('origin') || process.env.FRONTEND_URL || '*';
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Origin, x-sftp-password, x-path, x-csrf-token',
        'Access-Control-Expose-Headers': 'Content-Type, Content-Length, Cache-Control',
      },
    });
  }

  try {
    const isWsUpgrade = getHeader('upgrade')?.toLowerCase() === 'websocket';
    const authHeader = getHeader('authorization') || '';
    const qToken = ctx.query?.token;
    const rawToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : qToken;
    if (rawToken && !isWsUpgrade) {
      try {
        const decoded = app.pqJwt.verifyAnyToken(rawToken);
        ctx.pqJwtPayload = decoded;
        ctx.jwtPayload = decoded;
      } catch {
        try {
          const decoded = app.jwt.verify<unknown>(rawToken);
          ctx.jwtPayload = decoded as AppJwtPayload;
        } catch {
          // skip
        }
      }
    }
  } catch {
    // skip
  }

  const csrfResult = await csrfProtection(ctx);
  if (csrfResult) return csrfResult;
});

export async function initApp() {
  await preloadAll();
  await setupConfig(app);
  setupMiddleware(app);
  registerRoutes(app);
  try {
    scheduleStudentReverifyJob();
  } catch (e) {
    console.error('Failed to schedule student reverify job:', e);
  }
  try {
    scheduleMetricsCollectionJob();
  } catch (e) {
    console.error('Failed to schedule metrics collection job:', e);
  }
  try {
    scheduleExportJobRunner();
  } catch (e) {
    console.error('Failed to schedule export job runner:', e);
  }
  try {
    scheduleDeletionExecutionJob();
  } catch (e) {
    console.error('Failed to schedule deletion execution job:', e);
  }
  try {
    scheduleMailboxSyncJob();
  } catch (e) {
    console.error('Failed to schedule mailbox sync job:', e);
  }
  try {
    scheduleOutboundEmailRunner();
  } catch (e) {
    console.error('Failed to schedule outbound email runner:', e);
  }
  try {
    scheduleAdminBroadcastJobRunner();
  } catch (e) {
    console.error('Failed to schedule admin broadcast job runner:', e);
  }
  try {
    scheduleSunsetPolicyJob();
  } catch (e) {
    console.error('Failed to schedule sunset policy job:', e);
  }
  try {
    scheduleServerSunsetPolicyJob();
  } catch (e) {
    console.error('Failed to schedule server sunset policy job:', e);
  }
  try {
    scheduleRenewalJob();
  } catch (e) {
    console.error('Failed to schedule renewal job:', e);
  }
  try {
    scheduleTunnelCleanupJob();
  } catch (e) {
    console.error('Failed to schedule tunnel cleanup job:', e);
  }
  try {
    scheduleEloDecayJob();
  } catch (e) {
    console.error('Failed to schedule ELO decay job:', e);
  }
  try {
    scheduleGithubContributorsJob();
  } catch (e) {
    console.error('Failed to schedule GitHub contributors job:', e);
  }
  try {
    const { scheduleMailboxPasswordRotation } = require('./services/mailcowService');
    scheduleMailboxPasswordRotation();
  } catch (e) {
    console.error('Failed to schedule mailbox password rotation job:', e);
  }
}

app.get(
  '/health',
  async rawCtx => {
    const ctx = rawCtx as unknown as AppRequestContext;
    if (!AppDataSource.isInitialized) {
      return new Response(JSON.stringify({ status: 'starting' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    try {
      await AppDataSource.query('SELECT 1');
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch {
      return new Response(JSON.stringify({ status: 'degraded', db: false }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
  {
    response: {
      200: t.Object({ status: t.String() }),
      503: t.Object({ status: t.String(), db: t.Optional(t.Boolean()) }),
    },
    detail: {
      tags: ['Health'],
      summary: 'Database/boot health check',
      description: 'Returns status of the application and database connection',
    },
  }
);

app.get(
  '/uploads/id-docs/*',
  async rawCtx => {
    const ctx = rawCtx as unknown as AppRequestContext;
    const user = ctx.user;
    const apiKey = ctx.apiKey;
    if (!user && !apiKey) {
      return new Response(JSON.stringify({ error: 'Missing Authorization token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (apiKey) {
      if (apiKey.type !== 'admin') {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } else {
      if (!hasPermissionSync(ctx, 'id-docs:read')) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    const relPath = String(ctx.params?.['*'] || '');
    let filepath: string;
    try {
      filepath = getSafeUploadPath(path.join(process.cwd(), 'uploads', 'id-docs'), relPath);
    } catch {
      return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const ext = path.extname(filepath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
    };
    try {
      let buf: Buffer<ArrayBufferLike> = Buffer.from(await Bun.file(filepath).arrayBuffer()) as Buffer<ArrayBufferLike>;
      try {
        buf = decryptBuffer(buf);
      } catch {
        // skip
      }
      return new Response(new Uint8Array(buf), {
        status: 200,
        headers: {
          'Content-Type': mimeTypes[ext] || 'application/octet-stream',
          'Content-Length': String(buf.length),
        },
      });
    } catch {
      return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
  {
    beforeHandle: authenticate,
    detail: { hide: true },
  }
);

app.get(
  '/uploads/mailbox/*',
  async rawCtx => {
    const ctx = rawCtx as unknown as AppRequestContext;
    const relPath = String(ctx.params?.['*'] || '');
    let filepath: string;
    try {
      filepath = getSafeUploadPath(path.join(process.cwd(), 'uploads'), relPath);
    } catch {
      return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const normalised = path.relative(path.join(process.cwd(), 'uploads'), filepath);
    const parts = normalised.split(path.sep);
    if (parts.length < 3 || parts[0] !== 'mailbox') {
      return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const requester = ctx.user;
    const apiKey = ctx.apiKey;
    const ownerId = String(parts[1]);

    if (!requester && !apiKey) {
      return new Response(JSON.stringify({ error: 'Missing Authorization token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (apiKey) {
      if (apiKey.type !== 'admin') {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } else {
      if (String(requester.id) !== ownerId && !hasPermissionSync(ctx, 'mailbox:read')) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    const ext = path.extname(filepath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
    };

    try {
      let buf: Buffer<ArrayBufferLike> = Buffer.from(await Bun.file(filepath).arrayBuffer()) as Buffer<ArrayBufferLike>;
      try {
        buf = decryptBuffer(buf);
      } catch {
        // meow
      }
      return new Response(new Uint8Array(buf), {
        status: 200,
        headers: {
          'Content-Type': mimeTypes[ext] || 'application/octet-stream',
          'Content-Length': String(buf.length),
          'Cache-Control': 'private, max-age=300',
        },
      });
    } catch {
      return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
  {
    beforeHandle: authenticate,
    detail: { hide: true },
  }
);

app.get(
  '/uploads/user-documents/*',
  async rawCtx => {
    const ctx = rawCtx as unknown as AppRequestContext;
    const relPath = String(ctx.params?.['*'] || '');
    let filepath: string;
    try {
      filepath = getSafeUploadPath(path.join(process.cwd(), 'uploads', 'user-documents'), relPath);
    } catch {
      return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const normalised = path.relative(
      path.join(process.cwd(), 'uploads', 'user-documents'),
      filepath
    );
    const parts = normalised.split(path.sep);
    if (parts.length < 2) {
      return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const ownerId = parts[0];
    const requester = ctx.user;
    const apiKey = ctx.apiKey;
    if (!requester && !apiKey) {
      return new Response(JSON.stringify({ error: 'Missing Authorization token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (apiKey) {
      if (apiKey.type !== 'admin') {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } else if (
      String(requester.id) !== ownerId &&
      !hasPermissionSync(ctx, 'admin:users:documents')
    ) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const ext = path.extname(filepath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.pdf': 'application/pdf',
    };

    try {
      let buf: Buffer<ArrayBufferLike> = Buffer.from(await Bun.file(filepath).arrayBuffer()) as Buffer<ArrayBufferLike>;
      try {
        buf = decryptBuffer(buf);
      } catch {
        // meow
      }
      return new Response(new Uint8Array(buf), {
        status: 200,
        headers: {
          'Content-Type': mimeTypes[ext] || 'application/octet-stream',
          'Content-Length': String(buf.length),
          'Cache-Control': 'private, max-age=300',
        },
      });
    } catch {
      return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
  {
    beforeHandle: authenticate,
    detail: { hide: true },
  }
);

app.get(
  '/uploads/*',
  async rawCtx => {
    const ctx = rawCtx as unknown as AppRequestContext;
    const relPath = String(ctx.params?.['*'] || '');
    let filepath: string;
    try {
      filepath = getSafeUploadPath(path.join(process.cwd(), 'uploads'), relPath);
    } catch {
      return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const ext = path.extname(filepath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
    };
    try {
      const buf: Buffer<ArrayBufferLike> = Buffer.from(await Bun.file(filepath).arrayBuffer()) as Buffer<ArrayBufferLike>;
      return new Response(new Uint8Array(buf), {
        status: 200,
        headers: {
          'Content-Type': mimeTypes[ext] || 'application/octet-stream',
          'Content-Length': String(buf.length),
          'Cache-Control': 'public, max-age=300',
        },
      });
    } catch {
      return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
  {
    detail: { hide: true },
  }
);

export default app;
