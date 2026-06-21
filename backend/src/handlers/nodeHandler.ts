import { nodeService } from '../services/nodeService';
import { ProxmoxApiService } from '../services/proxmoxApiService';
import { authenticate } from '../middleware/auth';
import { authorize, hasPermissionSync } from '../middleware/authorize';
import { AppDataSource } from '../config/typeorm';
import { In, MoreThanOrEqual, Not } from 'typeorm';
import { User } from '../models/user.entity';
import { Node } from '../models/node.entity';
import { Organisation } from '../models/organisation.entity';
import { NodeHeartbeat } from '../models/nodeHeartbeat.entity';
import { ServerConfig } from '../models/serverConfig.entity';
import { ServerSubuser } from '../models/serverSubuser.entity';
import { refreshAllSftpProxies } from '../services/sftpProxyService';
import { isValidIpv6Cidr } from '../utils/ipv6';
import { getUnhealthyNodeIds } from '../utils/nodeHealth';
import { withRedisCache } from '../config/redis';
import { WingsApiService } from '../services/wingsApiService';
import { t } from 'elysia';
import { errorMessage, sanitizeError } from '../utils/sanitizeError';
import { randomHex } from '../utils/bunCrypto';
import type { BaseHandlerContext, NodeApp, CreateNodeBody, UpdateNodeBody, RebootOperation } from '../types';
import type { OrganisationMember } from '../models/organisationMember.entity';

const NODE_TYPES = ['free', 'paid', 'free_and_paid', 'enterprise'] as const;
const NODE_PROVIDERS = ['wings', 'proxmox'] as const;

function requireAdminCtx(ctx: BaseHandlerContext): true | { error: string } {
  const ctxAny = ctx as unknown as Record<string, unknown>;
  const user = ctxAny.user as User | undefined;
  const apiKey = ctxAny.apiKey as { type: string } | undefined;
  if (apiKey?.type === 'admin') return true;
  if (!user) {
    ctx.set.status = 401;
    return { error: ctx.t('auth.unauthorized') };
  }
  if (!hasPermissionSync(ctx, 'nodes:read')) {
    ctx.set.status = 403;
    return { error: ctx.t('node.adminRequired') };
  }
  return true;
}

export async function nodeRoutes(app: NodeApp, prefix = '') {
  const nodeRepo = () => AppDataSource.getRepository(Node);
  const orgMemberRepo = () =>
    AppDataSource.getRepository(require('../models/organisationMember.entity').OrganisationMember);

  async function resolveNode(param: string | number) {
    const raw = String(param);
    const asNum = Number(raw);
    if (!Number.isNaN(asNum) && `${asNum}` === raw) {
      const byId = await nodeRepo().findOneBy({ id: asNum });
      if (byId) return byId;
    }
    const byUuid = await nodeRepo().findOneBy({ nodeId: raw });
    if (byUuid) return byUuid;
    const normalized = raw.replace(/-/g, '');
    return await nodeRepo().findOneBy({ nodeId: normalized });
  }

  app.get(
    prefix + '/nodes',
    async (ctx: BaseHandlerContext) => {
      const adminErr = requireAdminCtx(ctx);
      if (adminErr !== true) return adminErr;
      const nodes = await nodeRepo().find({ relations: { organisation: true } });
      const safe = nodes.map(({ rootUser: _ru, rootPassword: _rp, token: _t, ...rest }: Node) => rest);
      return safe;
    },
    {
      beforeHandle: authenticate,
      response: {
        200: t.Array(t.Any()),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
      },
      detail: { summary: 'List all nodes (admin only)', tags: ['Nodes'] },
    }
  );

  function sanitizeNodes(nodes: Node[]) {
    return nodes.map(({ rootUser: _ru, rootPassword: _rp, token: _t, ...rest }: Node) => rest);
  }

  app.get(
    prefix + '/nodes/available',
    async (ctx: BaseHandlerContext) => {
      const user = (ctx as unknown as Record<string, unknown>).user as User;
      if (!user) {
        ctx.set.status = 401;
        return { error: ctx.t('auth.unauthorized') };
      }

      const isAdmin = hasPermissionSync(ctx, 'nodes:read');

      const effectivePortalType = user.portalType;
      const portalType =
        effectivePortalType === 'educational' ? 'paid' : effectivePortalType || 'free';

      const cacheKey = `nodes:available:${user.id}:${portalType}:${isAdmin ? 'admin' : 'user'}:v1`;
      return withRedisCache(cacheKey, 10, async () => {
        if (isAdmin) {
          const nodes = await nodeRepo().find({ relations: { organisation: true } });
          return sanitizeNodes(nodes);
        }

        const unhealthyNodeIds = await getUnhealthyNodeIds();
        const baseOptions: Record<string, unknown> = { relations: { organisation: true } };
        const deploymentFilter = { deploymentsDisabled: false };

        if (portalType === 'enterprise') {
          const memberships = await orgMemberRepo().find({ where: { userId: user.id } });
          const orgIds = memberships
            .map((m: OrganisationMember) => Number(m.organisationId))
            .filter((v: number) => Number.isFinite(v));
          if (orgIds.length === 0) return [];
          const whereOpts: Record<string, unknown> = { organisation: { id: In(orgIds) }, ...deploymentFilter };
          if (unhealthyNodeIds.length) {
            whereOpts.id = Not(In(unhealthyNodeIds));
          }
          baseOptions.where = whereOpts;
          const nodes = await nodeRepo().find(baseOptions);
          return sanitizeNodes(nodes);
        }

        const types = portalType === 'paid' ? ['paid', 'free_and_paid'] : ['free', 'free_and_paid'];
        const whereOpts: Record<string, unknown> = { nodeType: In(types), ...deploymentFilter };
        if (unhealthyNodeIds.length) {
          whereOpts.id = Not(In(unhealthyNodeIds));
        }
        baseOptions.where = whereOpts;
        const nodes = await nodeRepo().find(baseOptions);
        return sanitizeNodes(nodes);
      });
    },
    {
      beforeHandle: authenticate,
      response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }) },
      detail: { summary: 'List nodes available for the current user', tags: ['Nodes'] },
    }
  );

  app.get(
    prefix + '/nodes/my-health',
    async (ctx: BaseHandlerContext) => {
      const user = (ctx as unknown as Record<string, unknown>).user as User;
      if (!user) {
        ctx.set.status = 401;
        return { error: ctx.t('auth.unauthorized') };
      }

      const cfgRepo = AppDataSource.getRepository(ServerConfig);
      const subuserEntries = await AppDataSource.getRepository(ServerSubuser).find({
        where: { userId: user.id },
      });
      const subuserUuids = subuserEntries.map(s => s.serverUuid);
      const where: Record<string, unknown>[] = [{ userId: user.id }];
      if (subuserUuids.length) where.push({ uuid: In(subuserUuids) });
      const configs = await cfgRepo.find({ where });

      const nodeIds = [...new Set(configs.map(c => c.nodeId))];
      if (nodeIds.length === 0) return [];

      const unhealthyNodeIds = await getUnhealthyNodeIds();
      const affectedIds = nodeIds.filter(id => unhealthyNodeIds.includes(id));
      if (affectedIds.length === 0) return [];

      const nodes = await nodeRepo().find({ where: { id: In(affectedIds) } });
      return nodes.map(n => ({ id: n.id, name: n.name }));
    },
    {
      beforeHandle: authenticate,
      response: {
        200: t.Array(t.Object({ id: t.Number(), name: t.String() })),
        401: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Get unhealthy nodes for the current user\'s servers', tags: ['Nodes'] },
    }
  );

  app.get(
    prefix + '/nodes/:id',
    async (ctx: BaseHandlerContext) => {
      const adminErr = requireAdminCtx(ctx);
      if (adminErr !== true) return adminErr;
      const node = await resolveNode(ctx.params.id);
      if (!node) {
        ctx.set.status = 404;
        return { error: ctx.t('node.notFound') };
      }
      const { rootUser: _ru, rootPassword: _rp, token: _t, ...safe } = node;
      return safe;
    },
    {
      beforeHandle: authenticate,
      response: {
        200: t.Any(),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Get node details (admin only)', tags: ['Nodes'] },
    }
  );

  app.post(
    prefix + '/nodes',
    async (ctx: BaseHandlerContext) => {
      const adminErr = await authorize('nodes:create')(ctx);
      if (adminErr !== undefined) return adminErr;
      const body = ctx.body as CreateNodeBody;
      const { name, url, token, nodeId, provider, nodeType, useSSL, allowedOrigin, sftpPort, sftpProxyPort, fqdn, ipv6Subnet, ipv6ExcludedPorts, ipv6ReservedCount, backendWingsUrl, portRangeStart, portRangeEnd, deploymentsDisabled, deploymentNotice, proxmoxHost, proxmoxTokenId, proxmoxSecret, proxmoxRealm, proxmoxNode, proxmoxStorage, proxmoxBridge } = body;
      if (!name || !url || !token) {
        ctx.set.status = 400;
        return { error: ctx.t('validation.nameUrlTokenRequired') };
      }
      if (nodeId && typeof nodeId === 'string') {
        const normalized = nodeId.replace(/-/g, '');
        if (!/^[0-9a-f]{32}$/i.test(normalized)) {
          ctx.set.status = 400;
          return { error: ctx.t('validation.nodeIdUuidRequired') };
        }
      }

      const resolvedProvider = provider && NODE_PROVIDERS.includes(provider as typeof NODE_PROVIDERS[number])
        ? (provider as typeof NODE_PROVIDERS[number])
        : 'wings';

      if (resolvedProvider === 'proxmox') {
        if (!proxmoxHost || !proxmoxTokenId || !proxmoxSecret) {
          ctx.set.status = 400;
          return { error: 'Proxmox host, token ID, and secret are required for Proxmox nodes' };
        }
      }

      const node = await nodeService.registerNode(name, url, token, nodeId, backendWingsUrl, resolvedProvider);
      if (resolvedProvider === 'proxmox') {
        node.provider = 'proxmox';
        node.proxmoxHost = proxmoxHost;
        node.proxmoxTokenId = proxmoxTokenId;
        node.proxmoxSecret = proxmoxSecret;
        if (proxmoxRealm) node.proxmoxRealm = proxmoxRealm;
        if (proxmoxNode) node.proxmoxNode = proxmoxNode;
        if (proxmoxStorage) node.proxmoxStorage = proxmoxStorage;
        if (proxmoxBridge) node.proxmoxBridge = proxmoxBridge;
      }
      if (nodeType && NODE_TYPES.includes(nodeType as typeof NODE_TYPES[number])) {
        node.nodeType = nodeType as typeof NODE_TYPES[number];
      }
      if (useSSL !== undefined) {
        node.useSSL = useSSL === true || useSSL === 'true';
      } else {
        node.useSSL = node.url.toLowerCase().startsWith('https://');
      }
      if (allowedOrigin) node.allowedOrigin = allowedOrigin;
      if (fqdn !== undefined) node.fqdn = fqdn || undefined;
      if (ipv6Subnet !== undefined) {
        if (ipv6Subnet && !isValidIpv6Cidr(String(ipv6Subnet))) {
          ctx.set.status = 400;
          return { error: ctx.t('server.invalidIpv6Subnet') };
        }
        node.ipv6Subnet = ipv6Subnet || undefined;
      }
      if (ipv6ExcludedPorts !== undefined) {
        node.ipv6ExcludedPorts =
          typeof ipv6ExcludedPorts === 'string'
            ? ipv6ExcludedPorts
            : Array.isArray(ipv6ExcludedPorts)
              ? ipv6ExcludedPorts
                  .map((p: any) => String(p).trim())
                  .filter((p: string) => p.length > 0)
                  .join(',')
              : String(ipv6ExcludedPorts);
      }
      if (ipv6ReservedCount !== undefined) {
        const parsedReservedCount = Number(ipv6ReservedCount);
        if (
          !Number.isInteger(parsedReservedCount) ||
          parsedReservedCount < 0 ||
          parsedReservedCount > 10000
        ) {
          ctx.set.status = 400;
          return { error: ctx.t('server.invalidLimitsIpv6Reserved') };
        }
        node.ipv6ReservedCount = parsedReservedCount;
      }
      if (sftpPort !== undefined)
        node.sftpPort = sftpPort !== null ? Number(sftpPort) : undefined;
      if (sftpProxyPort !== undefined)
        node.sftpProxyPort = sftpProxyPort !== null ? Number(sftpProxyPort) : undefined;
      if (portRangeStart !== undefined) {
        const parsed = Number(portRangeStart);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
          ctx.set.status = 400;
          return { error: ctx.t('server.portRangeInvalid') };
        }
        node.portRangeStart = parsed;
      }
      if (portRangeEnd !== undefined) {
        const parsed = Number(portRangeEnd);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
          ctx.set.status = 400;
          return { error: ctx.t('server.portRangeEndInvalid') };
        }
        node.portRangeEnd = parsed;
      }
      if (
        node.portRangeStart != null &&
        node.portRangeEnd != null &&
        node.portRangeStart > node.portRangeEnd
      ) {
        ctx.set.status = 400;
        return { error: ctx.t('server.portRangeOrder') };
      }
      if (deploymentsDisabled !== undefined)
        node.deploymentsDisabled = deploymentsDisabled === true || deploymentsDisabled === 'true';
      if (deploymentNotice !== undefined)
        node.deploymentNotice = deploymentNotice || undefined;
      await nodeRepo().save(node);
      refreshAllSftpProxies().catch(() => {});
      return { success: true, node };
    },
    {
      beforeHandle: authenticate,
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Create a new node (admin only)', tags: ['Nodes'] },
    }
  );

  app.put(
    prefix + '/nodes/:id',
    async (ctx: BaseHandlerContext) => {
      const adminErr = await authorize('nodes:*')(ctx);
      if (adminErr !== undefined) return adminErr;
      const { id } = ctx.params as Record<string, string>;
      const body = ctx.body as UpdateNodeBody;
      const { nodeId, url, nodeType, provider, orgId, name, portRangeStart, portRangeEnd, defaultIp, ipv6Subnet, ipv6ExcludedPorts, ipv6ReservedCount, fqdn, cost, memory, disk, cpu, serverLimit, useSSL, allowedOrigin, sftpPort, sftpProxyPort, backendWingsUrl, deploymentsDisabled, deploymentNotice, proxmoxHost, proxmoxTokenId, proxmoxSecret, proxmoxRealm, proxmoxNode, proxmoxStorage, proxmoxBridge } = body;

      const node = await resolveNode(id);
      if (!node) {
        ctx.set.status = 404;
        return { error: ctx.t('node.notFound') };
      }

      if (nodeId !== undefined) {
        if (nodeId && typeof nodeId === 'string') {
          const normalized = nodeId.replace(/-/g, '');
          if (!/^[0-9a-f]{32}$/i.test(normalized)) {
            ctx.set.status = 400;
            return { error: ctx.t('validation.nodeIdUuidRequired') };
          }
        }
        node.nodeId = nodeId || undefined;
      }

      if (url !== undefined) node.url = url;
      if (name !== undefined) node.name = name;
      if (nodeType !== undefined) {
        if (!(NODE_TYPES as readonly string[]).includes(nodeType)) {
          ctx.set.status = 400;
          return { error: `nodeType must be one of: ${NODE_TYPES.join(', ')}` };
        }
        node.nodeType = nodeType as Node['nodeType'];
      }
      if (orgId !== undefined) {
        node.organisation = orgId ? ({ id: Number(orgId) } as Organisation) : undefined;
      }
      if (portRangeStart !== undefined) {
        if (portRangeStart !== null) {
          const parsed = Number(portRangeStart);
          if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
            ctx.set.status = 400;
            return { error: ctx.t('server.portRangeInvalid') };
          }
          node.portRangeStart = parsed;
        } else {
          node.portRangeStart = undefined;
        }
      }
      if (portRangeEnd !== undefined) {
        if (portRangeEnd !== null) {
          const parsed = Number(portRangeEnd);
          if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
            ctx.set.status = 400;
            return { error: ctx.t('server.portRangeEndInvalid') };
          }
          node.portRangeEnd = parsed;
        } else {
          node.portRangeEnd = undefined;
        }
      }
      if (
        node.portRangeStart != null &&
        node.portRangeEnd != null &&
        node.portRangeStart > node.portRangeEnd
      ) {
        ctx.set.status = 400;
        return { error: ctx.t('server.portRangeOrder') };
      }
      if (defaultIp !== undefined) node.defaultIp = defaultIp || undefined;
      if (ipv6Subnet !== undefined) {
        if (ipv6Subnet && !isValidIpv6Cidr(String(ipv6Subnet))) {
          ctx.set.status = 400;
          return { error: ctx.t('server.invalidIpv6Subnet') };
        }
        node.ipv6Subnet = ipv6Subnet || undefined;
      }
      if (ipv6ExcludedPorts !== undefined) {
        node.ipv6ExcludedPorts =
          typeof ipv6ExcludedPorts === 'string'
            ? ipv6ExcludedPorts
            : Array.isArray(ipv6ExcludedPorts)
              ? ipv6ExcludedPorts
                  .map((p: any) => String(p).trim())
                  .filter((p: string) => p.length > 0)
                  .join(',')
              : String(ipv6ExcludedPorts);
      }
      if (ipv6ReservedCount !== undefined) {
        const parsedReservedCount = Number(ipv6ReservedCount);
        if (
          !Number.isInteger(parsedReservedCount) ||
          parsedReservedCount < 0 ||
          parsedReservedCount > 10000
        ) {
          ctx.set.status = 400;
          return { error: ctx.t('server.invalidLimitsIpv6Reserved') };
        }
        node.ipv6ReservedCount = parsedReservedCount;
      }
      if (fqdn !== undefined) node.fqdn = fqdn || undefined;
      if (cost !== undefined) node.cost = cost !== null ? Number(cost) : undefined;
      if (memory !== undefined) node.memory = memory !== null ? Number(memory) : undefined;
      if (disk !== undefined) node.disk = disk !== null ? Number(disk) : undefined;
      if (cpu !== undefined) node.cpu = cpu !== null ? Number(cpu) : undefined;
      if (serverLimit !== undefined)
        node.serverLimit = serverLimit !== null ? Number(serverLimit) : undefined;
      if (provider !== undefined) {
        if (!(NODE_PROVIDERS as readonly string[]).includes(provider)) {
          ctx.set.status = 400;
          return { error: `provider must be one of: ${NODE_PROVIDERS.join(', ')}` };
        }
        node.provider = provider as typeof node.provider;
      }
      if (proxmoxHost !== undefined) node.proxmoxHost = proxmoxHost || undefined;
      if (proxmoxTokenId !== undefined) node.proxmoxTokenId = proxmoxTokenId || undefined;
      if (proxmoxSecret !== undefined) node.proxmoxSecret = proxmoxSecret || undefined;
      if (proxmoxRealm !== undefined) node.proxmoxRealm = proxmoxRealm || undefined;
      if (proxmoxNode !== undefined) node.proxmoxNode = proxmoxNode || undefined;
      if (proxmoxStorage !== undefined) node.proxmoxStorage = proxmoxStorage || undefined;
      if (proxmoxBridge !== undefined) node.proxmoxBridge = proxmoxBridge || undefined;
      if (useSSL !== undefined) {
        node.useSSL = useSSL === true || useSSL === 'true';
        if (node.useSSL && node.url.toLowerCase().startsWith('http://')) {
          app.log.warn(
            `node ${node.id} marked useSSL=true but URL is http://; mixed-content may occur`
          );
        } else if (!node.useSSL && node.url.toLowerCase().startsWith('https://')) {
          app.log.warn(
            `node ${node.id} marked useSSL=false but URL is https://; proxying unnecessary`
          );
        }
      }
      if (allowedOrigin !== undefined) node.allowedOrigin = allowedOrigin || undefined;
      if (sftpPort !== undefined)
        node.sftpPort = sftpPort !== null ? Number(sftpPort) : undefined;
      if (sftpProxyPort !== undefined)
        node.sftpProxyPort = sftpProxyPort !== null ? Number(sftpProxyPort) : undefined;
      if (backendWingsUrl !== undefined)
        node.backendWingsUrl = backendWingsUrl || undefined;
      if (deploymentsDisabled !== undefined)
        node.deploymentsDisabled = deploymentsDisabled === true || deploymentsDisabled === 'true';
      if (deploymentNotice !== undefined)
        node.deploymentNotice = deploymentNotice || undefined;
      await nodeRepo().save(node);
      nodeService.invalidateNode(node.id);
      refreshAllSftpProxies().catch(() => {});
      const updated = await nodeRepo().findOne({
        where: { id: Number(id) },
        relations: { organisation: true },
      });
      return { success: true, node: updated };
    },
    {
      beforeHandle: authenticate,
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Update node (admin only)', tags: ['Nodes'] },
    }
  );

  app.delete(
    prefix + '/nodes/:id',
    async (ctx: BaseHandlerContext) => {
      const adminErr = await authorize('nodes:*')(ctx);
      if (adminErr !== undefined) return adminErr;
      const node = await resolveNode(ctx.params.id);
      if (!node) {
        ctx.set.status = 404;
        return { error: ctx.t('node.notFound') };
      }
      nodeService.invalidateNode(node.id);
      await nodeRepo().remove(node);
      refreshAllSftpProxies().catch(() => {});
      return { success: true };
    },
    {
      beforeHandle: authenticate,
      response: {
        200: t.Object({ success: t.Boolean() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Delete node (admin only)', tags: ['Nodes'] },
    }
  );

  app.get(
    prefix + '/nodes/heartbeats',
    async (ctx: BaseHandlerContext) => {
      const adminErr = requireAdminCtx(ctx);
      if (adminErr !== true) return adminErr;
      const nodes = await nodeRepo().find();
      const hbRepo = AppDataSource.getRepository(NodeHeartbeat);
      const result: Record<number, Array<{ timestamp: Date; responseMs: number | null; status: string }>> = {};
      for (const node of nodes) {
        const rows = await hbRepo.find({
          where: { nodeId: node.id },
          order: { id: 'DESC' },
          take: 200,
        });
        result[node.id] = rows.reverse().map(r => ({
          timestamp: r.timestamp,
          responseMs: r.responseMs ?? null,
          status: r.status,
          errorMessage: r.errorMessage ?? null,
        }));
      }
      return result;
    },
    {
      beforeHandle: authenticate,
      response: {
        200: t.Any(),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Get all node heartbeats (admin only)', tags: ['Nodes'] },
    }
  );

  app.get(
    prefix + '/nodes/:id/heartbeats',
    async (ctx: BaseHandlerContext) => {
      const adminErr = requireAdminCtx(ctx);
      if (adminErr !== true) return adminErr;
      const nodeId = Number(ctx.params.id);
      const { window: w = '24h' } = ctx.query as Record<string, string>;
      const hours = w === '7d' ? 168 : 24;
      const since = new Date(Date.now() - hours * 3_600_000);
      const hbRepo = AppDataSource.getRepository(NodeHeartbeat);
      const rows = await hbRepo.find({
        where: { nodeId, timestamp: MoreThanOrEqual(since) },
        order: { id: 'ASC' },
      });
      const total = rows.length;
      const okCount = rows.filter(r => r.status === 'ok').length;
      const validMs = rows.filter(r => r.responseMs != null).map(r => r.responseMs!);
      return {
        points: rows.map(r => ({
          timestamp: r.timestamp,
          responseMs: r.responseMs ?? null,
          status: r.status,
          errorMessage: r.errorMessage ?? null,
        })),
        summary: {
          uptime_pct: total > 0 ? Math.round((okCount / total) * 1000) / 10 : 100,
          avg_ms:
            validMs.length > 0
              ? Math.round(validMs.reduce((a, b) => a + b, 0) / validMs.length)
              : null,
          total_checks: total,
          window: w,
        },
      };
    },
    {
      beforeHandle: authenticate,
      response: {
        200: t.Any(),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Get heartbeats for single node (admin only)', tags: ['Nodes'] },
    }
  );

  app.get(
    prefix + '/nodes/generate-token',
    async (ctx: BaseHandlerContext) => {
      const adminErr = await authorize('nodes:read-creds')(ctx);
      if (adminErr !== undefined) return adminErr;
      const token = randomHex(32);
      return { token };
    },
    {
      beforeHandle: authenticate,
      response: {
        200: t.Object({ token: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Generate a temporary node token (admin only)', tags: ['Nodes'] },
    }
  );

  app.put(
    prefix + '/nodes/:id/credentials',
    async (ctx: BaseHandlerContext) => {
      const adminErr = requireAdminCtx(ctx);
      if (adminErr !== true) return adminErr;
      const { id } = ctx.params as Record<string, string>;
      const { rootUser, rootPassword } = ctx.body as Record<string, string>;
      const node = await nodeService.updateCredentials(Number(id), rootUser, rootPassword);
      return { success: true, node };
    },
    {
      beforeHandle: [authenticate, authorize('nodes:update-creds')],
      response: {
        200: t.Any(),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Update node credentials (admin only)', tags: ['Nodes'] },
    }
  );

  app.get(
    prefix + '/nodes/:id/credentials',
    async (ctx: BaseHandlerContext) => {
      const adminErr = requireAdminCtx(ctx);
      if (adminErr !== true) return adminErr;
      const { id } = ctx.params as Record<string, string>;
      try {
        const creds = await nodeService.getCredentials(Number(id));
        return { success: true, credentials: creds };
      } catch (e: unknown) {
        ctx.set.status = 404;
        console.error('[nodeHandler:get-credentials]', e);
        return { error: errorMessage(e, 'nodeHandler:get-credentials') };
      }
    },
    {
      beforeHandle: [authenticate, authorize('nodes:read-creds')],
      response: {
        200: t.Any(),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Read node credentials (admin only)', tags: ['Nodes'] },
    }
  );

  app.get(
    prefix + '/nodes/:id/token',
    async (ctx: BaseHandlerContext) => {
      const adminErr = await authorize('nodes:read-creds')(ctx);
      if (adminErr !== undefined) return adminErr;
      const node = await nodeRepo().findOneBy({ id: Number(ctx.params.id) });
      if (!node) {
        ctx.set.status = 404;
        return { error: ctx.t('node.notFound') };
      }
      return { token: node.token };
    },
    {
      beforeHandle: authenticate,
      response: {
        200: t.Object({ token: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Get node token (admin only)', tags: ['Nodes'] },
    }
  );

  app.post(
    prefix + '/servers/:id/map',
    async (ctx: BaseHandlerContext) => {
      const adminErr = requireAdminCtx(ctx);
      if (adminErr !== true) return adminErr;
      const { id: uuid } = ctx.params as Record<string, string>;
      const { nodeId } = ctx.body as Record<string, string>;
      const mapping = await nodeService.mapServer(uuid, Number(nodeId));
      return { success: true, mapping };
    },
    {
      beforeHandle: [authenticate, authorize('nodes:map')],
      response: {
        200: t.Any(),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Map server to node (admin only)', tags: ['Nodes'] },
    }
  );

  app.post(
    prefix + '/nodes/:id/mass-allocation-change',
    async (ctx: BaseHandlerContext) => {
      const adminErr = requireAdminCtx(ctx);
      if (adminErr !== true) return adminErr;
      const nodeId = Number(ctx.params.id);
      if (!Number.isFinite(nodeId)) {
        ctx.set.status = 400;
        return { error: ctx.t('validation.invalidNodeId') };
      }
      const nodeRepo = AppDataSource.getRepository(Node);
      const node = await nodeRepo.findOneBy({ id: nodeId });
      if (!node) {
        ctx.set.status = 404;
        return { error: ctx.t('node.notFound') };
      }

      const { oldIp, newIp } = ctx.body as Record<string, string>;
      if (!oldIp || !newIp) {
        ctx.set.status = 400;
        return { error: ctx.t('validation.oldIpAndNewIpRequired') };
      }
      const oldIpNorm = String(oldIp).trim();
      const newIpNorm = String(newIp).trim();
      if (!oldIpNorm || !newIpNorm) {
        ctx.set.status = 400;
        return { error: ctx.t('validation.oldIpAndNewIpNonEmpty') };
      }
      if (oldIpNorm === newIpNorm) {
        ctx.set.status = 400;
        return { error: ctx.t('validation.oldIpAndNewIpDifferent') };
      }

      const cfgRepo = AppDataSource.getRepository(ServerConfig);
      const configs = await cfgRepo.find({ where: { nodeId } });

      const updatedServers: Array<{ uuid: string; name: string | null }> = [];
      const errors: Array<{ uuid: string; error: string }> = [];

      for (const cfg of configs) {
        const alloc = cfg.allocations as Record<string, any> | null;
        if (!alloc) continue;

        let changed = false;

        if (alloc.default?.ip === oldIpNorm) {
          alloc.default.ip = newIpNorm;
          changed = true;
        }

        if (alloc.mappings && typeof alloc.mappings === 'object') {
          const keys = Object.keys(alloc.mappings);
          for (const ipKey of keys) {
            if (ipKey === oldIpNorm) {
              alloc.mappings[newIpNorm] = alloc.mappings[ipKey];
              delete alloc.mappings[ipKey];
              changed = true;
            }
          }
        }

        if (alloc.dedicatedIps && Array.isArray(alloc.dedicatedIps)) {
          for (const dip of alloc.dedicatedIps) {
            if (dip.ip === oldIpNorm) {
              dip.ip = newIpNorm;
              changed = true;
            }
          }
        }

        if (alloc.fqdns && typeof alloc.fqdns === 'object') {
          const fqKeys = Object.keys(alloc.fqdns);
          for (const fqKey of fqKeys) {
            const prefixMatch = fqKey.startsWith(oldIpNorm + ':') || fqKey === oldIpNorm;
            if (prefixMatch) {
              const newKey = fqKey.replace(oldIpNorm, newIpNorm);
              alloc.fqdns[newKey] = alloc.fqdns[fqKey];
              delete alloc.fqdns[fqKey];
              changed = true;
            }
          }
        }

        if (alloc.owners && typeof alloc.owners === 'object') {
          const ownerKeys = Object.keys(alloc.owners);
          for (const ownerKey of ownerKeys) {
            if (ownerKey === oldIpNorm) {
              alloc.owners[newIpNorm] = alloc.owners[ownerKey];
              delete alloc.owners[ownerKey];
              changed = true;
            }
          }
        }

        if (changed) {
          cfg.allocations = alloc;
          try {
            await cfgRepo.save(cfg);
            const base = node.backendWingsUrl || node.url;
            const svc = new WingsApiService(base, node.token);
            await svc.syncServer(cfg.uuid, { allocations: alloc }).catch(() => {});
            updatedServers.push({ uuid: cfg.uuid, name: cfg.name });
          } catch (e: unknown) {
            errors.push({ uuid: cfg.uuid, error: errorMessage(e, 'Failed to save or sync') });
          }
        }
      }

      return {
        success: true,
        totalServersOnNode: configs.length,
        updatedCount: updatedServers.length,
        errorCount: errors.length,
        updatedServers,
        errors: errors.length > 0 ? errors : undefined,
      };
    },
    {
      beforeHandle: [authenticate, authorize('admin:servers:manage')],
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Mass change IP allocations for all servers on a node', tags: ['Nodes'] },
    }
  );

  const rebootOperations = new Map<string, RebootOperation>();
  const OPERATION_TTL = 5 * 60 * 1000;

  setInterval(() => {
    const now = Date.now();
    for (const [id, op] of rebootOperations) {
      if (now - op.createdAt > OPERATION_TTL) rebootOperations.delete(id);
    }
  }, 60_000);

  app.post(
    prefix + '/nodes/:id/reboot-all-servers',
    async (ctx: BaseHandlerContext) => {
      const adminErr = requireAdminCtx(ctx);
      if (adminErr !== true) return adminErr;
      const nodeId = Number(ctx.params.id);
      if (!Number.isFinite(nodeId)) {
        ctx.set.status = 400;
        return { error: ctx.t('validation.invalidNodeId') };
      }
      const nodeRepo = AppDataSource.getRepository(Node);
      const node = await nodeRepo.findOneBy({ id: nodeId });
      if (!node) {
        ctx.set.status = 404;
        return { error: ctx.t('node.notFound') };
      }

      const base = node.backendWingsUrl || node.url;
      const svc = new WingsApiService(base, node.token);

      let wingsServers: Record<string, unknown>[];
      try {
        const res = await svc.getServers() as Record<string, unknown>;
        wingsServers = Array.isArray(res.data) ? res.data as Record<string, unknown>[] : Array.isArray(res) ? res as Record<string, unknown>[] : [];
      } catch (e: unknown) {
        ctx.set.status = 502;
        return { error: ctx.t('node.fetchServersFailed') + errorMessage(e, 'unknown') };
      }

      const serverUuid = (s: Record<string, unknown>) => String((s.configuration as Record<string, unknown>)?.uuid || s.uuid || s.id);
      const serverName = (s: Record<string, unknown>) => {
        const meta = (s.configuration as Record<string, unknown>)?.meta as Record<string, unknown> | undefined;
        return (meta?.name as string) || (s.name as string) || String(serverUuid(s));
      };

      const onlineServers = wingsServers.filter((s: Record<string, unknown>) => {
        const state = String(s.state || s.status || '')
          .trim()
          .toLowerCase();
        return ['running', 'online', 'up', 'healthy', 'available', 'starting', 'stopping'].includes(
          state
        );
      });

      const opId = crypto.randomUUID();
      const op: RebootOperation = {
        id: opId,
        nodeId,
        nodeName: node.name,
        status: 'running',
        progress: 0,
        message: ctx.t('node.operationStarted'),
        totalServers: wingsServers.length,
        onlineCount: onlineServers.length,
        servers: [],
        killedCount: 0,
        createdAt: Date.now(),
      };
      rebootOperations.set(opId, op);

      if (onlineServers.length === 0) {
        op.status = 'completed';
        op.progress = 100;
        op.message = ctx.t('node.noRunningServers');
        return { operationId: opId, status: 'completed', message: ctx.t('node.noRunningServers') };
      }

      (async () => {
        try {
          op.message = 'Stopping servers...';
          op.progress = 10;

          const stopResults = await Promise.allSettled(
            onlineServers.map(async (s: Record<string, unknown>) => {
              const uuid = serverUuid(s);
              try {
                await svc.powerServer(uuid, 'stop');
                return { uuid, name: serverName(s), ok: true };
              } catch {
                return { uuid, name: serverName(s), ok: false };
              }
            })
          );

          const stopMap = new Map<string, { name?: string; stopOk: boolean }>();
          for (const r of stopResults) {
            if (r.status === 'fulfilled') {
              const val = r.value as { uuid: string; name?: string; ok: boolean };
              stopMap.set(val.uuid, { name: val.name, stopOk: val.ok });
            }
          }

          op.message = 'Waiting for graceful shutdown (10s)...';
          op.progress = 30;
          await new Promise(resolve => setTimeout(resolve, 10_000));

          op.message = 'Checking for stuck servers...';
          op.progress = 50;

          const killResults = await Promise.allSettled(
            onlineServers.map(async (s: Record<string, unknown>) => {
              const uuid = serverUuid(s);
              let needsKill = false;
              try {
                const checkRes = await svc.getServer(uuid);
                const checkData = checkRes.data || checkRes;
                const state = String(checkData.state || checkData.status || '')
                  .trim()
                  .toLowerCase();
                needsKill = !['offline', 'off', 'stopped'].includes(state);
              } catch {
                needsKill = false;
              }
              if (needsKill) {
                try {
                  await svc.powerServer(uuid, 'kill');
                  return { uuid, killed: true };
                } catch {
                  return { uuid, killed: false };
                }
              }
              return { uuid, killed: false };
            })
          );

          const killedSet = new Set<string>();
          for (const r of killResults) {
            if (r.status === 'fulfilled') {
              const val = r.value as { uuid: string; killed: boolean };
              if (val.killed) killedSet.add(val.uuid);
            }
          }
          op.killedCount = killedSet.size;

          op.message = 'Starting servers...';
          op.progress = 70;
          await new Promise(resolve => setTimeout(resolve, 2_000));

          const startResults = await Promise.allSettled(
            onlineServers.map(async (s: Record<string, unknown>) => {
              const uuid = serverUuid(s);
              try {
                await svc.powerServer(uuid, 'start');
                return { uuid, ok: true };
              } catch {
                return { uuid, ok: false };
              }
            })
          );

          for (const r of startResults) {
            if (r.status === 'fulfilled') {
              const entry = r.value as { uuid: string; ok: boolean };
              const stopInfo = stopMap.get(entry.uuid);
              op.servers.push({
                uuid: entry.uuid,
                name: stopInfo?.name || entry.uuid,
                stop: stopInfo?.stopOk ? 'stopped' : 'failed',
                kill: killedSet.has(entry.uuid) ? 'killed' : undefined,
                start: entry.ok ? 'started' : 'failed',
              });
            }
          }

          op.status = 'completed';
          op.progress = 100;
          op.message = 'Reboot completed';
        } catch (e: unknown) {
          op.status = 'failed';
          op.message = errorMessage(e, 'Unexpected error during reboot');
          op.progress = 100;
        }
      })();

      return {
        operationId: opId,
        status: 'running',
        totalServers: wingsServers.length,
        onlineCount: onlineServers.length,
      };
    },
    {
      beforeHandle: [authenticate, authorize('admin:servers:manage')],
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
        502: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Reboot all running servers on a node (async)', tags: ['Nodes'] },
    }
  );

  app.get(
    prefix + '/nodes/:id/proxmox/storages',
    async (ctx: BaseHandlerContext) => {
      const adminErr = requireAdminCtx(ctx);
      if (adminErr !== true) return adminErr;
      const node = await resolveNode(ctx.params.id);
      if (!node) { ctx.set.status = 404; return { error: ctx.t('node.notFound') }; }
      if (node.provider !== 'proxmox') { ctx.set.status = 400; return { error: 'Not a Proxmox node' }; }
      try {
        const svc = await nodeService.getProxmoxService(node.id) as ProxmoxApiService;
        const storages = await svc.getStorages();
        return storages;
      } catch (e: unknown) {
        ctx.set.status = 502;
        return { error: errorMessage(e, 'proxmox:storages') };
      }
    },
    {
      beforeHandle: authenticate,
      response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 400: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }), 502: t.Object({ error: t.String() }) },
      detail: { summary: 'List Proxmox storages', tags: ['Proxmox'] },
    }
  );

  app.get(
    prefix + '/nodes/:id/proxmox/storage/:storage/content',
    async (ctx: BaseHandlerContext) => {
      const adminErr = requireAdminCtx(ctx);
      if (adminErr !== true) return adminErr;
      const node = await resolveNode(ctx.params.id);
      if (!node) { ctx.set.status = 404; return { error: ctx.t('node.notFound') }; }
      if (node.provider !== 'proxmox') { ctx.set.status = 400; return { error: 'Not a Proxmox node' }; }
      try {
        const svc = await nodeService.getProxmoxService(node.id) as ProxmoxApiService;
        const storage = ctx.params.storage as string || node.proxmoxStorage || 'local';
        const content = await svc.getStorageContent(storage);
        return content;
      } catch (e: unknown) {
        ctx.set.status = 502;
        return { error: errorMessage(e, 'proxmox:storage-content') };
      }
    },
    {
      beforeHandle: authenticate,
      response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 400: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }), 502: t.Object({ error: t.String() }) },
      detail: { summary: 'List Proxmox storage content (ISOs/templates)', tags: ['Proxmox'] },
    }
  );

  app.get(
    prefix + '/nodes/:id/proxmox/templates',
    async (ctx: BaseHandlerContext) => {
      const adminErr = requireAdminCtx(ctx);
      if (adminErr !== true) return adminErr;
      const node = await resolveNode(ctx.params.id);
      if (!node) { ctx.set.status = 404; return { error: ctx.t('node.notFound') }; }
      if (node.provider !== 'proxmox') { ctx.set.status = 400; return { error: 'Not a Proxmox node' }; }
      try {
        const svc = await nodeService.getProxmoxService(node.id) as ProxmoxApiService;
        const templates = await svc.getTemplates();
        return templates;
      } catch (e: unknown) {
        ctx.set.status = 502;
        return { error: errorMessage(e, 'proxmox:templates') };
      }
    },
    {
      beforeHandle: authenticate,
      response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 400: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }), 502: t.Object({ error: t.String() }) },
      detail: { summary: 'List Proxmox templates (LXC + ISO)', tags: ['Proxmox'] },
    }
  );

  app.get(
    prefix + '/nodes/:id/proxmox/isos',
    async (ctx: BaseHandlerContext) => {
      const adminErr = requireAdminCtx(ctx);
      if (adminErr !== true) return adminErr;
      const node = await resolveNode(ctx.params.id);
      if (!node) { ctx.set.status = 404; return { error: ctx.t('node.notFound') }; }
      if (node.provider !== 'proxmox') { ctx.set.status = 400; return { error: 'Not a Proxmox node' }; }
      try {
        const svc = await nodeService.getProxmoxService(node.id) as ProxmoxApiService;
        const isos = await svc.getIsos();
        return isos;
      } catch (e: unknown) {
        ctx.set.status = 502;
        return { error: errorMessage(e, 'proxmox:isos') };
      }
    },
    {
      beforeHandle: authenticate,
      response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 400: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }), 502: t.Object({ error: t.String() }) },
      detail: { summary: 'List Proxmox ISO files available on storage', tags: ['Proxmox'] },
    }
  );

  app.get(
    prefix + '/nodes/:id/proxmox/lxc-templates',
    async (ctx: BaseHandlerContext) => {
      const adminErr = requireAdminCtx(ctx);
      if (adminErr !== true) return adminErr;
      const node = await resolveNode(ctx.params.id);
      if (!node) { ctx.set.status = 404; return { error: ctx.t('node.notFound') }; }
      if (node.provider !== 'proxmox') { ctx.set.status = 400; return { error: 'Not a Proxmox node' }; }
      try {
        const svc = await nodeService.getProxmoxService(node.id) as ProxmoxApiService;
        const templates = await svc.getLxcTemplates();
        return templates;
      } catch (e: unknown) {
        ctx.set.status = 502;
        return { error: errorMessage(e, 'proxmox:lxc-templates') };
      }
    },
    {
      beforeHandle: authenticate,
      response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 400: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }), 502: t.Object({ error: t.String() }) },
      detail: { summary: 'List Proxmox LXC templates', tags: ['Proxmox'] },
    }
  );

  app.get(
    prefix + '/nodes/:id/reboot-status/:operationId',
    async (ctx: BaseHandlerContext) => {
      const adminErr = requireAdminCtx(ctx);
      if (adminErr !== true) return adminErr;
      const op = rebootOperations.get(ctx.params.operationId as string);
      if (!op) {
        ctx.set.status = 404;
        return { error: ctx.t('node.operationNotFound') };
      }
      if (op.nodeId !== Number(ctx.params.id)) {
        ctx.set.status = 404;
        return { error: ctx.t('node.operationBelongsToDifferentNode') };
      }
      return {
        operationId: op.id,
        status: op.status,
        progress: op.progress,
        message: op.message,
        totalServers: op.totalServers,
        onlineCount: op.onlineCount,
        killedCount: op.killedCount,
        servers: op.servers,
        createdAt: op.createdAt,
      };
    },
    {
      beforeHandle: [authenticate, authorize('admin:servers:manage')],
      response: {
        200: t.Any(),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Get reboot operation status', tags: ['Nodes'] },
    }
  );
}
