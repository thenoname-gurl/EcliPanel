import { NodeService } from '../services/nodeService';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import { AppDataSource } from '../config/typeorm';
import { MoreThanOrEqual } from 'typeorm';
import { User } from '../models/user.entity';
import { Node } from '../models/node.entity';
import { NodeHeartbeat } from '../models/nodeHeartbeat.entity';
import { refreshAllSftpProxies } from '../services/sftpProxyService';
import { t } from 'elysia';

const nodeService = new NodeService();

const NODE_TYPES = ['free', 'paid', 'free_and_paid', 'enterprise'] as const;

function requireAdminCtx(ctx: any): true | { error: string } {
  const user = ctx.user as User | undefined;
  const apiKey = ctx.apiKey;
  if (apiKey?.type === 'admin') return true;
  if (!user) {
    ctx.set.status = 401;
    return { error: 'Unauthorized' };
  }
  const adminRoles = ['admin', 'rootAdmin', '*'];
  if (!adminRoles.includes(user.role ?? '')) {
    ctx.set.status = 403;
    return { error: 'Admin access required.' };
  }
  return true;
}

export async function nodeRoutes(app: any, prefix = '') {
  const nodeRepo = () => AppDataSource.getRepository(Node);

  app.get(prefix + '/nodes', async (ctx: any) => {
    const adminErr = requireAdminCtx(ctx);
    if (adminErr !== true) return adminErr;
    const nodes = await nodeRepo().find({ relations: ['organisation'] });
    const safe = nodes.map(({ rootUser, rootPassword, token, ...rest }) => rest);
    return safe;
  }, {beforeHandle: authenticate,
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'List all nodes (admin only)', tags: ['Nodes'] }
  });

  app.get(prefix + '/nodes/:id', async (ctx: any) => {
    const adminErr = requireAdminCtx(ctx);
    if (adminErr !== true) return adminErr;
    const node = await nodeRepo().findOne({ where: { id: Number(ctx.params.id) }, relations: ['organisation'] });
    if (!node) {
      ctx.set.status = 404;
      return { error: 'Node not found' };
    }
    const { rootUser, rootPassword, token, ...safe } = node as any;
    return safe;
  }, {beforeHandle: authenticate,
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Get node details (admin only)', tags: ['Nodes'] }
  });

  app.post(prefix + '/nodes', async (ctx: any) => {
    const adminErr = requireAdminCtx(ctx);
    if (adminErr !== true) return adminErr;
    const { name, url, token, nodeType, useSSL, allowedOrigin, sftpPort, sftpProxyPort } = ctx.body as any;
    if (!name || !url || !token) {
      ctx.set.status = 400;
      return { error: 'name, url and token are required' };
    }
    const node = await nodeService.registerNode(name, url, token);
    if (nodeType && NODE_TYPES.includes(nodeType)) {
      (node as any).nodeType = nodeType;
    }
    if (useSSL !== undefined) {
      node.useSSL = useSSL === true || useSSL === 'true';
    } else {
      node.useSSL = node.url.toLowerCase().startsWith('https://');
    }
    if (allowedOrigin) node.allowedOrigin = allowedOrigin;
    if (sftpPort !== undefined) node.sftpPort = sftpPort !== null ? Number(sftpPort) : undefined as any;
    if (sftpProxyPort !== undefined) node.sftpProxyPort = sftpProxyPort !== null ? Number(sftpProxyPort) : undefined as any;
    await nodeRepo().save(node);
    refreshAllSftpProxies().catch(() => {});
    return { success: true, node };
  }, {beforeHandle: authenticate,
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Create a new node (admin only)', tags: ['Nodes'] }
  });

  app.put(prefix + '/nodes/:id', async (ctx: any) => {
    const adminErr = requireAdminCtx(ctx);
    if (adminErr !== true) return adminErr;
    const { id } = ctx.params as any;
    const { nodeType, orgId, name, portRangeStart, portRangeEnd, defaultIp, cost, memory, disk, cpu, serverLimit, useSSL, allowedOrigin, sftpPort, sftpProxyPort } = ctx.body as any;

    const node = await nodeRepo().findOneBy({ id: Number(id) });
    if (!node) {
      ctx.set.status = 404;
      return { error: 'Node not found' };
    }

    if (name !== undefined) node.name = name;
    if (nodeType !== undefined) {
      if (!NODE_TYPES.includes(nodeType)) {
        ctx.set.status = 400;
        return { error: `nodeType must be one of: ${NODE_TYPES.join(', ')}` };
      }
      node.nodeType = nodeType;
    }
    if (orgId !== undefined) {
      node.organisation = orgId ? { id: Number(orgId) } as any : undefined as any;
    }
    if (portRangeStart !== undefined) node.portRangeStart = portRangeStart !== null ? Number(portRangeStart) : undefined as any;
    if (portRangeEnd !== undefined) node.portRangeEnd = portRangeEnd !== null ? Number(portRangeEnd) : undefined as any;
    if (defaultIp !== undefined) node.defaultIp = defaultIp || undefined as any;
    if (cost !== undefined) node.cost = cost !== null ? Number(cost) : undefined as any;
    if (memory !== undefined) node.memory = memory !== null ? Number(memory) : undefined as any;
    if (disk !== undefined) node.disk = disk !== null ? Number(disk) : undefined as any;
    if (cpu !== undefined) node.cpu = cpu !== null ? Number(cpu) : undefined as any;
    if (serverLimit !== undefined) node.serverLimit = serverLimit !== null ? Number(serverLimit) : undefined as any;
    if (useSSL !== undefined) {
      node.useSSL = useSSL === true || useSSL === 'true';
      if (node.useSSL && node.url.toLowerCase().startsWith('http://')) {
        app.log.warn(`node ${node.id} marked useSSL=true but URL is http://; mixed-content may occur`);
      } else if (!node.useSSL && node.url.toLowerCase().startsWith('https://')) {
        app.log.warn(`node ${node.id} marked useSSL=false but URL is https://; proxying unnecessary`);
      }
    }
    if (allowedOrigin !== undefined) node.allowedOrigin = allowedOrigin || undefined;
    if (sftpPort !== undefined) node.sftpPort = sftpPort !== null ? Number(sftpPort) : undefined as any;
    if (sftpProxyPort !== undefined) node.sftpProxyPort = sftpProxyPort !== null ? Number(sftpProxyPort) : undefined as any;
    await nodeRepo().save(node);
    refreshAllSftpProxies().catch(() => {});
    const updated = await nodeRepo().findOne({ where: { id: Number(id) }, relations: ['organisation'] });
    return { success: true, node: updated };
  }, {beforeHandle: authenticate,
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Update node (admin only)', tags: ['Nodes'] }
  });

  app.delete(prefix + '/nodes/:id', async (ctx: any) => {
    const adminErr = requireAdminCtx(ctx);
    if (adminErr !== true) return adminErr;
    const node = await nodeRepo().findOneBy({ id: Number(ctx.params.id) });
    if (!node) {
      ctx.set.status = 404;
      return { error: 'Node not found' };
    }
    await nodeRepo().remove(node);
    refreshAllSftpProxies().catch(() => {});
    return { success: true };
  }, {beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Delete node (admin only)', tags: ['Nodes'] }
  });

  app.get(prefix + '/nodes/heartbeats', async (ctx: any) => {
    const adminErr = requireAdminCtx(ctx);
    if (adminErr !== true) return adminErr;
    const nodes = await nodeRepo().find();
    const hbRepo = AppDataSource.getRepository(NodeHeartbeat);
    const result: Record<number, any[]> = {};
    for (const node of nodes) {
      const rows = await hbRepo.find({
        where: { nodeId: node.id },
        order: { id: 'DESC' },
        take: 200,
      });
      result[node.id] = rows.reverse().map((r) => ({
        timestamp: r.timestamp,
        responseMs: r.responseMs ?? null,
        status: r.status,
      }));
    }
    return result;
  }, {beforeHandle: authenticate,
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Get all node heartbeats (admin only)', tags: ['Nodes'] }
  });

  app.get(prefix + '/nodes/:id/heartbeats', async (ctx: any) => {
    const adminErr = requireAdminCtx(ctx);
    if (adminErr !== true) return adminErr;
    const nodeId = Number(ctx.params.id);
    const { window: w = '24h' } = ctx.query as any;
    const hours = w === '7d' ? 168 : 24;
    const since = new Date(Date.now() - hours * 3_600_000);
    const hbRepo = AppDataSource.getRepository(NodeHeartbeat);
    const rows = await hbRepo.find({
      where: { nodeId, timestamp: MoreThanOrEqual(since) },
      order: { id: 'ASC' },
    });
    const total   = rows.length;
    const okCount = rows.filter((r) => r.status === 'ok').length;
    const validMs = rows.filter((r) => r.responseMs != null).map((r) => r.responseMs!);
    return {
      points: rows.map((r) => ({ timestamp: r.timestamp, responseMs: r.responseMs ?? null, status: r.status })),
      summary: {
        uptime_pct:   total > 0 ? Math.round((okCount / total) * 1000) / 10 : 100,
        avg_ms:       validMs.length > 0 ? Math.round(validMs.reduce((a, b) => a + b, 0) / validMs.length) : null,
        total_checks: total,
        window:       w,
      },
    };
  }, {beforeHandle: authenticate,
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Get heartbeats for single node (admin only)', tags: ['Nodes'] }
  });

  app.get(prefix + '/nodes/generate-token', async (ctx: any) => {
    const adminErr = requireAdminCtx(ctx);
    if (adminErr !== true) return adminErr;
    const token = require('crypto').randomBytes(32).toString('hex');
    return { token };
  }, {beforeHandle: authenticate,
    response: { 200: t.Object({ token: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Generate a temporary node token (admin only)', tags: ['Nodes'] }
  });

  app.put(prefix + '/nodes/:id/credentials', async (ctx: any) => {
    const adminErr = requireAdminCtx(ctx);
    if (adminErr !== true) return adminErr;
    const { id } = ctx.params as any;
    const { rootUser, rootPassword } = ctx.body as any;
    const node = await nodeService.updateCredentials(Number(id), rootUser, rootPassword);
    return { success: true, node };
  }, { beforeHandle: [authenticate, authorize('nodes:update-creds')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Update node credentials (admin only)', tags: ['Nodes'] }
  });

  app.get(prefix + '/nodes/:id/credentials', async (ctx: any) => {
    const adminErr = requireAdminCtx(ctx);
    if (adminErr !== true) return adminErr;
    const { id } = ctx.params as any;
    try {
      const creds = await nodeService.getCredentials(Number(id));
      return { success: true, credentials: creds };
    } catch (e: any) {
      ctx.set.status = 404;
      return { error: e.message };
    }
  }, { beforeHandle: [authenticate, authorize('nodes:read-creds')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Read node credentials (admin only)', tags: ['Nodes'] }
  });

  app.get(prefix + '/nodes/:id/token', async (ctx: any) => {
    const adminErr = requireAdminCtx(ctx);
    if (adminErr !== true) return adminErr;
    const node = await nodeRepo().findOneBy({ id: Number(ctx.params.id) });
    if (!node) {
      ctx.set.status = 404;
      return { error: 'Node not found' };
    }
    return { token: (node as any).token };
  }, {beforeHandle: authenticate,
    response: { 200: t.Object({ token: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Get node token (admin only)', tags: ['Nodes'] }
  });

  app.post(prefix + '/servers/:id/map', async (ctx: any) => {
    const adminErr = requireAdminCtx(ctx);
    if (adminErr !== true) return adminErr;
    const { id: uuid } = ctx.params as any;
    const { nodeId } = ctx.body as any;
    const mapping = await nodeService.mapServer(uuid, nodeId);
    return { success: true, mapping };
  }, { beforeHandle: [authenticate, authorize('nodes:map')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Map server to node (admin only)', tags: ['Nodes'] }
  });
}
