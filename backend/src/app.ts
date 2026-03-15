import dotenv from 'dotenv';
dotenv.config();
import { Elysia, t } from 'elysia';
import { jwt } from '@elysiajs/jwt';
import cors from '@elysiajs/cors';
import { helmet } from 'elysia-helmet';
import jsonwebtoken from 'jsonwebtoken';
import { registerRoutes } from './routes/index';
import { setupMiddleware, authenticate } from './middleware';
import { setupConfig } from './config';
import { AppDataSource } from './config/typeorm';
import path from 'path';
import { promises as fsp } from 'fs';
import { decryptBuffer } from './utils/crypto';
import { openapi } from '@elysiajs/openapi';

// Migrated from Fastify hence why code for Elysia could be a mess, 
// sorry about that. 
// I tried to clean it up but yes..
const app = new Elysia()
  .decorate('log', console as any)
  .use(openapi({
    documentation: {
      info: {
        title: 'EcliPanel',
        version: '3.0.0',
        description: 'EcliPanel Backend documentation',
        contact: {
          name: 'EclipseSystems Support',
          email: 'contact@eclipsesystems.org',
          url: 'https://ecli.app',
        },
      },
      servers: [
        { url: 'https://backend.ecli.app/', description: 'Primary API server' },
        { url: 'https://backend.canary.ecli.app/', description: 'Canary API server' }
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT'
          }
        }
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
        { name: 'Infrastructure', description: 'Endpoints for Enterprise infrastructure management' },
        { name: 'Eggs', description: 'Endpoints for Eggs (server templates) management' },
        { name: 'Plans', description: 'Endpoints for Plans management' },
        { name: 'Admin', description: 'Administrator tools' },
      ],
      security: [
        { bearerAuth: [] }
      ]
    }
  }))
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
  .use(cors({
    origin: (process.env.FRONTEND_URL === '*' || process.env.FRONTEND_URL === 'true') ? true : (process.env.FRONTEND_URL || '').split(',').map(o => o.trim()),
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposeHeaders: ['Content-Type', 'Content-Length', 'Cache-Control'],
  }))
  .use(helmet())
  .use(jwt({ secret: process.env.JWT_SECRET || 'changeme' }));

const _jwtSecret = process.env.JWT_SECRET || 'changeme';
(app as any).jwt = {
  sign: (payload: object, opts?: any) => jsonwebtoken.sign(payload, _jwtSecret, opts),
  verify: <T = any>(token: string) => jsonwebtoken.verify(token, _jwtSecret) as T,
};
(app as any).log = console;


app.onError((ctx: any) => {
  let status = 500;
  if (typeof ctx.code === 'number' && ctx.code >= 100 && ctx.code < 600) {
    status = ctx.code;
  }
  if (ctx.error.status == 404) {
      return new Response(JSON.stringify({ error: 'Route not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
  const log = (app as any).log || console;
  if (status >= 500) {
    log.error({ err: ctx.error, url: ctx.request.url }, 'Unhandled server error');
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({ error: ctx.error?.message ?? 'Request error' }), { status, headers: { 'Content-Type': 'application/json' } });
});


declare module 'elysia' {
  interface Elysia {
    jwt: {
      sign(payload: object, opts?: any): string;
      verify<T = any>(token: string): T;
    };
    log: any;
  }
}

const _rateBuckets = new Map<string, { count: number; resetAt: number }>();
app.onRequest((ctx: any) => {
  const req = ctx.request as Request | undefined;
  const ip: string =
    req?.headers?.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    (ctx.server?.requestIP?.(req))?.address ||
    'unknown';
  const now = Date.now();
  let bucket = _rateBuckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 1, resetAt: now + 60_000 };
    _rateBuckets.set(ip, bucket);
  } else {
    bucket.count++;
  }
  if (bucket.count > 500) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  try {
    const authHeader = ctx.request?.headers?.get('authorization') || '';
    const qToken = (ctx.query as any)?.token as string | undefined;
    const rawToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : qToken;
    if (rawToken) {
      try {
        const decoded = (app as any).jwt.verify(rawToken) as any;
        ctx.user = decoded;
      } catch (e) {
        // skip
      }
    }
  } catch (e) {
    // skip
  }
});

export async function initApp() {
  await setupConfig(app);
  setupMiddleware(app);
  registerRoutes(app);
}

app.get('/health', async (ctx: any) => {
  if (!AppDataSource.isInitialized) {
    return new Response(JSON.stringify({ status: 'starting' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
  try {
    await AppDataSource.query('SELECT 1');
    return new Response(JSON.stringify({ status: 'ok' }), { headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ status: 'degraded', db: false }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
}, {
  response: {
    200: t.Object({ status: t.String() }),
    503: t.Object({ status: t.String(), db: t.Optional(t.Boolean()) })
  },
  detail: {
    tags: ['Health'],
    summary: 'Database/boot health check',
    description: 'Returns status of the application and database connection'
  },
});

app.get('/uploads/id-docs/*', async (ctx: any) => {
  const adminRoles = ['admin', 'rootAdmin', '*'];
  const user = ctx.user;
  const apiKey = ctx.apiKey;
  if (!user && !apiKey) {
    return new Response(JSON.stringify({ error: 'Missing Authorization token' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  if (apiKey) {
    if (apiKey.type !== 'admin') {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }
  } else {
    if (!adminRoles.includes(user.role ?? '')) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }
  }

  const relPath = (ctx.params as any)['*'];
  const normalised = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const filepath = path.join(process.cwd(), 'uploads', 'id-docs', normalised);
  const ext = path.extname(filepath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp', '.pdf': 'application/pdf',
  };
  try {
    let buf = await fsp.readFile(filepath);
    try {
      buf = decryptBuffer(buf);
    } catch {
      // skip
    }
    return new Response(buf as any, {
      status: 200,
      headers: {
        'Content-Type': mimeTypes[ext] || 'application/octet-stream',
        'Content-Length': String(buf.length),
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
}, {
  beforeHandle: authenticate,
  detail: { hide: true }
});

app.get('/uploads/*', async (ctx: any) => {
  const relPath = (ctx.params as any)['*'];
  const normalised = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const filepath = path.join(process.cwd(), 'uploads', normalised);
  const ext = path.extname(filepath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  };
  try {
    const buf = await fsp.readFile(filepath);
    return new Response(buf as any, {
      status: 200,
      headers: {
        'Content-Type': mimeTypes[ext] || 'application/octet-stream',
        'Content-Length': String(buf.length),
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
}, {
  detail: { hide: true }
});

export default app;