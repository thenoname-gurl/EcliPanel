import { WingsApiService } from '../services/wingsApiService';
import { authenticate } from '../middleware/auth';
import { AppDataSource } from '../config/typeorm';
import { Node } from '../models/node.entity';
import { User } from '../models/user.entity';
import axios from 'axios';
import { t } from 'elysia';

const adminRoles = ['admin', 'rootAdmin', '*'];

function requireAdminCtx(ctx: any): boolean {
  const user = ctx.user as User | undefined;
  if (!user) {
    ctx.set.status = 401;
    ctx.body = { error: 'Unauthorized' };
    return false;
  }
  if (!adminRoles.includes(user.role ?? '')) {
    ctx.set.status = 403;
    ctx.body = { error: 'Admin access required.' };
    return false;
  }
  return true;
}

async function getNodeService(nodeId: number, ctx: any): Promise<WingsApiService | null> {
  const node = await AppDataSource.getRepository(Node).findOneBy({ id: nodeId });
  if (!node) {
    ctx.set.status = 404;
    return null;
  }
  return new WingsApiService(node.url, node.token);
}

export async function wingsRoutes(app: any, prefix = '') {
  app.get(prefix + '/wings/system', async (ctx: any) => {
    if (!requireAdminCtx(ctx)) return;
    const nodeId = Number(ctx.query.nodeId);
    if (!nodeId) {
      ctx.set.status = 400;
      return { error: 'nodeId query param required' };
    }
    const svc = await getNodeService(nodeId, ctx);
    if (!svc) return;
    try {
      const res = await svc.getSystemInfo();
      return res.data;
    } catch (err: any) {
      if (err?.response) {
        ctx.set.status = err.response.status;
        return err.response.data;
      }
      throw err;
    }
  }, {beforeHandle: authenticate,
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Get system info from Wings node (admin only)', tags: ['Remote'] }
  });

  app.get(prefix + '/wings/update', async (ctx: any) => {
    if (!requireAdminCtx(ctx)) return;
    const nodeId = Number(ctx.query.nodeId);
    if (!nodeId) {
      ctx.set.status = 400;
      return { error: 'nodeId query param required' };
    }
    const svc = await getNodeService(nodeId, ctx);
    if (!svc) return;
    try {
      const res = await svc.getUpdates();
      return res.data;
    } catch (err: any) {
      if (err?.response) {
        ctx.set.status = err.response.status;
        return err.response.data;
      }
      throw err;
    }
  }, {beforeHandle: authenticate,
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Check node for updates (admin only)', tags: ['Remote'] }
  });

  app.get(prefix + '/wings/transfers', async (ctx: any) => {
    if (!requireAdminCtx(ctx)) return;
    const nodeId = Number(ctx.query.nodeId);
    if (!nodeId) {
      ctx.set.status = 400;
      return { error: 'nodeId query param required' };
    }
    const svc = await getNodeService(nodeId, ctx);
    if (!svc) return;
    try {
      const res = await svc.getTransfers();
      return res.data;
    } catch (err: any) {
      if (err?.response) {
        ctx.set.status = err.response.status;
        return err.response.data;
      }
      throw err;
    }
  }, {beforeHandle: authenticate,
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'List active transfers (admin only)', tags: ['Remote'] }
  });

  app.get(prefix + '/wings/backups', async (ctx: any) => {
    if (!requireAdminCtx(ctx)) return;
    const nodeId = Number(ctx.query.nodeId);
    if (!nodeId) {
      ctx.set.status = 400;
      return { error: 'nodeId query param required' };
    }
    const svc = await getNodeService(nodeId, ctx);
    if (!svc) return;
    try {
      const res = await svc.getBackups();
      return res.data;
    } catch (err: any) {
      if (err?.response) {
        ctx.set.status = err.response.status;
        return err.response.data;
      }
      throw err;
    }
  }, {beforeHandle: authenticate,
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'List node backups', tags: ['Remote'] }
  });

  app.post(prefix + '/wings/deauthorize-user', async (ctx: any) => {
    if (!requireAdminCtx(ctx)) return;
    const nodeId = Number(ctx.query.nodeId || ctx.body.nodeId);
    if (!nodeId) {
      ctx.set.status = 400;
      return { error: 'nodeId required' };
    }
    const svc = await getNodeService(nodeId, ctx);
    if (!svc) return;
    const res = await svc.deauthorizeUser(ctx.body);
    return res.data;
  }, {beforeHandle: authenticate,
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Deauthorize a user on node (admin only)', tags: ['Remote'] }
  });

  // TODO: Test this when we get second node LOL
  app.post(prefix + '/transfers', async (ctx: any) => {
    if (!requireAdminCtx(ctx)) return;
    const nodeId = Number(ctx.query.nodeId);
    if (!nodeId) {
      ctx.set.status = 400;
      return { error: 'nodeId query param required' };
    }
    const node = await AppDataSource.getRepository(Node).findOneBy({ id: nodeId });
    if (!node) {
      ctx.set.status = 404;
      return { error: 'Node not found' };
    }

    const url = `${node.url.replace(/\/+$/, '')}/transfers`;
    const headers: any = { ...ctx.headers };
    headers.authorization = `Bearer ${node.token}`;
    ['host','connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade'].forEach(h => delete headers[h]);

    const tmp = require('tmp');
    const fs = require('fs');
    const { pipeline } = require('stream');
    const { promisify } = require('util');
    const pipe = promisify(pipeline);
    const tempFile = tmp.fileSync();
    await pipe(ctx.raw, fs.createWriteStream(tempFile.name));

    let res: any;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        res = await axios({
          method: 'post', url, headers,
          data: fs.createReadStream(tempFile.name),
          timeout: 120000,
          maxContentLength: Infinity, maxBodyLength: Infinity,
          responseType: 'stream',
        });
        break;
      } catch (e: any) {
        if (attempt === 3) throw e;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    fs.unlinkSync(tempFile.name);
    ctx.set.status = res.status;
    Object.entries(res.headers).forEach(([k, v]) => { if (v) ctx.header(k, v as string); });
    res.data.pipe(ctx.raw);
  }, {beforeHandle: authenticate,
    detail: { summary: 'Proxy a file transfer upload (admin only)', tags: ['Remote'] }
  });
}