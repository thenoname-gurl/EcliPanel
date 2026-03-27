import { WingsApiService } from '../services/wingsApiService';
import { authenticate } from '../middleware/auth';
import { AppDataSource } from '../config/typeorm';
import { Node } from '../models/node.entity';
import { User } from '../models/user.entity';
import { t } from 'elysia';
import { Readable } from 'stream';

const adminRoles = ['admin', 'rootAdmin', '*'];

function requireAdminCtx(ctx: any): boolean {
  const user = ctx.store?.user as User | undefined;
  if (!user) {
    ctx.set.status = 401;
    return false;
  }
  if (!adminRoles.includes(user.role ?? '')) {
    ctx.set.status = 403;
    return false;
  }
  return true;
}

async function getNodeService(nodeId: number): Promise<{ service: WingsApiService; node: Node } | null> {
  const node = await AppDataSource.getRepository(Node).findOneBy({ id: nodeId });
  if (!node) return null;
  const base = (node as any).backendWingsUrl || node.url;
  return { service: new WingsApiService(base, node.token), node };
}

function parseNodeId(ctx: any): number | null {
  const nodeId = Number(ctx.query?.nodeId);
  if (!nodeId || isNaN(nodeId)) {
    ctx.set.status = 400;
    return null;
  }
  return nodeId;
}

async function handleWingsError(err: any, ctx: any): Promise<any> {
  if (err?.response) {
    ctx.set.status = err.response.status;
    return err.response.data;
  }
  ctx.set.status = 502;
  return { error: `Wings request failed: ${err?.message ?? 'Unknown error'}` };
}

export function wingsRoutes(app: any, prefix = '') {
  app.get(`${prefix}/wings/system`, async (ctx: any) => {
      if (!requireAdminCtx(ctx)) return { error: ctx.set.status === 401 ? 'Unauthorized' : 'Admin access required.' };

      const nodeId = parseNodeId(ctx);
      if (!nodeId) return { error: 'nodeId query param required' };

      const result = await getNodeService(nodeId);
      if (!result) {
        ctx.set.status = 404;
        return { error: 'Node not found' };
      }

      try {
        const res = await result.service.getSystemInfo();
        return res.data;
      } catch (err: any) {
        return handleWingsError(err, ctx);
      }
    },
    {
      beforeHandle: authenticate,
      query: t.Object({ nodeId: t.String() }),
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
        502: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Get system info from Wings node (admin only)', tags: ['Remote'] },
    },
  );

  app.get(`${prefix}/wings/update`, async (ctx: any) => {
      if (!requireAdminCtx(ctx)) return { error: ctx.set.status === 401 ? 'Unauthorized' : 'Admin access required.' };

      const nodeId = parseNodeId(ctx);
      if (!nodeId) return { error: 'nodeId query param required' };

      const result = await getNodeService(nodeId);
      if (!result) {
        ctx.set.status = 404;
        return { error: 'Node not found' };
      }

      try {
        const res = await result.service.getUpdates();
        return res.data;
      } catch (err: any) {
        return handleWingsError(err, ctx);
      }
    },
    {
      beforeHandle: authenticate,
      query: t.Object({ nodeId: t.String() }),
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
        502: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Check node for updates (admin only)', tags: ['Remote'] },
    },
  );

  app.get(`${prefix}/wings/transfers`, async (ctx: any) => {
      if (!requireAdminCtx(ctx)) return { error: ctx.set.status === 401 ? 'Unauthorized' : 'Admin access required.' };

      const nodeId = parseNodeId(ctx);
      if (!nodeId) return { error: 'nodeId query param required' };

      const result = await getNodeService(nodeId);
      if (!result) {
        ctx.set.status = 404;
        return { error: 'Node not found' };
      }

      try {
        const res = await result.service.getTransfers();
        return res.data;
      } catch (err: any) {
        return handleWingsError(err, ctx);
      }
    },
    {
      beforeHandle: authenticate,
      query: t.Object({ nodeId: t.String() }),
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
        502: t.Object({ error: t.String() }),
      },
      detail: { summary: 'List active transfers (admin only)', tags: ['Remote'] },
    },
  );

  app.get(`${prefix}/wings/backups`, async (ctx: any) => {
      if (!requireAdminCtx(ctx)) return { error: ctx.set.status === 401 ? 'Unauthorized' : 'Admin access required.' };

      const nodeId = parseNodeId(ctx);
      if (!nodeId) return { error: 'nodeId query param required' };

      const result = await getNodeService(nodeId);
      if (!result) {
        ctx.set.status = 404;
        return { error: 'Node not found' };
      }

      try {
        const res = await result.service.getBackups();
        return res.data;
      } catch (err: any) {
        return handleWingsError(err, ctx);
      }
    },
    {
      beforeHandle: authenticate,
      query: t.Object({ nodeId: t.String() }),
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
        502: t.Object({ error: t.String() }),
      },
      detail: { summary: 'List node backups', tags: ['Remote'] },
    },
  );

  app.post(`${prefix}/wings/deauthorize-user`, async (ctx: any) => {
      if (!requireAdminCtx(ctx)) return { error: ctx.set.status === 401 ? 'Unauthorized' : 'Admin access required.' };

      const nodeId = Number(ctx.query?.nodeId || ctx.body?.nodeId);
      if (!nodeId || isNaN(nodeId)) {
        ctx.set.status = 400;
        return { error: 'nodeId required' };
      }

      const result = await getNodeService(nodeId);
      if (!result) {
        ctx.set.status = 404;
        return { error: 'Node not found' };
      }

      try {
        const res = await result.service.deauthorizeUser(ctx.body);
        return res.data;
      } catch (err: any) {
        return handleWingsError(err, ctx);
      }
    },
    {
      beforeHandle: authenticate,
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
        502: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Deauthorize a user on node (admin only)', tags: ['Remote'] },
    },
  );

  app.post(`${prefix}/transfers`, async (ctx: any) => {
      if (!requireAdminCtx(ctx)) return { error: ctx.set.status === 401 ? 'Unauthorized' : 'Admin access required.' };

      const nodeId = parseNodeId(ctx);
      if (!nodeId) return { error: 'nodeId query param required' };

      const node = await AppDataSource.getRepository(Node).findOneBy({ id: nodeId });
      if (!node) {
        ctx.set.status = 404;
        return { error: 'Node not found' };
      }

      const url = `${node.url.replace(/\/+$/, '')}/transfers`;

      const hopByHopHeaders = new Set([
        'host', 'connection', 'keep-alive', 'proxy-authenticate',
        'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade',
      ]);

      const forwardHeaders: Record<string, string> = {};
      if (ctx.request?.headers) {
        for (const [key, value] of ctx.request.headers.entries()) {
          if (!hopByHopHeaders.has(key.toLowerCase()) && key.toLowerCase() !== 'authorization') {
            forwardHeaders[key] = value;
          }
        }
      }
      forwardHeaders['authorization'] = `Bearer ${node.token}`;

      let lastError: any;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const upstreamRes = await fetch(url, {
            method: 'POST',
            headers: forwardHeaders,
            body: ctx.raw,
          });

          ctx.set.status = upstreamRes.status;

          for (const [key, value] of upstreamRes.headers.entries()) {
            if (!hopByHopHeaders.has(key.toLowerCase())) {
              ctx.set.headers[key] = value;
            }
          }

          if (upstreamRes.body) {
            return new Response(upstreamRes.body, {
              status: upstreamRes.status,
              headers: Object.fromEntries(upstreamRes.headers.entries()),
            });
          }

          return await upstreamRes.text();
        } catch (e: any) {
          lastError = e;
          if (attempt < 3) {
            await new Promise((r) => setTimeout(r, 1000 * attempt));
          }
        }
      }

      ctx.set.status = 502;
      return { error: `Transfer proxy failed after 3 attempts: ${lastError?.message ?? 'Unknown error'}` };
    },
    {
      beforeHandle: authenticate,
      query: t.Object({ nodeId: t.String() }),
      detail: { summary: 'Proxy a file transfer upload (admin only)', tags: ['Remote'] },
    },
  );

  return app;
}