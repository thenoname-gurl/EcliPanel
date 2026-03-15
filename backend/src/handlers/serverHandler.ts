import { WingsApiService } from '../services/wingsApiService';
import { NodeService } from '../services/nodeService';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import { AppDataSource } from '../config/typeorm';
import { UserLog } from '../models/userLog.entity';
import { Node } from '../models/node.entity';
import { Egg } from '../models/egg.entity';
import { v4 as uuidv4 } from 'uuid';
import { saveServerConfig, removeServerConfig, signWingsJwt } from './remoteHandler';
import { ServerConfig } from '../models/serverConfig.entity';
import { Mount } from '../models/mount.entity';
import { ServerMount } from '../models/serverMount.entity';
import { In, MoreThanOrEqual } from 'typeorm';
import { SocData } from '../models/socData.entity';
import { ServerMapping } from '../models/serverMapping.entity';
import { createActivityLog } from './logHandler';
import { ServerSubuser } from '../models/serverSubuser.entity';
import { t } from 'elysia';

export async function serverRoutes(app: any, prefix = '') {
  const nodeSvc = new NodeService();
  const logRepo = () => AppDataSource.getRepository(UserLog);
  const nodeRepo = () => AppDataSource.getRepository(Node);
  const eggRepo = () => AppDataSource.getRepository(Egg);
  const cfgRepo = () => AppDataSource.getRepository(ServerConfig);

  async function serviceFor(serverId: string) {
    return nodeSvc.getServiceForServer(serverId);
  }

  async function pickNode(userTier: string, preferredNodeId?: number, assignedNodeId?: number): Promise<Node> {
    // treat educational tier like paid for node selection
    // Tho lets be real, if you have educational limits you probably
    // didnt pay us..
    if (userTier === 'educational') userTier = 'paid';

    // Enterprise users with assigned nodes must use their assigned node
    // LIKE SERIOUSLY DONT TOUCH POOR USERS ASSIGNED NODES
    // ITS A NIGHTMARE TO SUPPORT OTHERWISE AND THEY PROBABLY 
    // PAID ONLY FOR THE ASSIGNED NODE FEATURE ANYWAY
    if (userTier === 'enterprise' && assignedNodeId) {
      const n = await nodeRepo().findOneBy({ id: assignedNodeId });
      if (!n) throw new Error('Assigned enterprise node not found');
      return n;
    }
    
    if (preferredNodeId) {
      const n = await nodeRepo().findOneBy({ id: preferredNodeId });
      if (!n) throw new Error('Specified node not found');
      return n;
    }

    let types: string[];
    if (userTier === 'enterprise') {
      // Plan change you know :D
      types = ['enterprise', 'free_and_paid', 'paid', 'free'];
    } else if (userTier === 'paid' || userTier === 'basic' || userTier === 'pro' || userTier === 'educational') {
      types = ['paid', 'free_and_paid', 'free'];
    } else {
      types = ['free', 'free_and_paid'];
    }
    for (const t of types) {
      const n = await nodeRepo().findOneBy({ nodeType: t as any });
      if (n) return n;
    }
    const fallback = await nodeRepo().findOneBy({});
    if (!fallback) throw new Error('No nodes available');
    return fallback;
  }

  app.get(prefix + '/servers', async (ctx: any) => {
    const nodes = await nodeRepo().find();
    const cfgRepo = AppDataSource.getRepository(require('../models/serverConfig.entity').ServerConfig);
    const configs = await cfgRepo.find();
    const cfgMap = new Map(configs.map((c: any) => [c.uuid, c]));
    let all: any[] = [];

    const user = ctx.user;
    const isAdmin = user.role === 'admin' || user.role === 'rootAdmin' || user.role === '*';

    if (isAdmin) {
      for (const n of nodes) {
        try {
          const svc = new WingsApiService(n.url, n.token);
          const res = await svc.getServers();
          for (const s of (res.data || [])) {
            const uuid: string = s.configuration?.uuid || s.uuid;
            const cfg = cfgMap.get(uuid);
            const norm = normalizeServer(s, cfg?.hibernated ? 'hibernated' : undefined);
            all.push({ ...norm, name: cfg?.name || norm.name, nodeId: n.id, nodeName: n.name });
          }
        } catch {
          // skip
        }
      }

      for (const c of configs) {
        if (!all.some((s: any) => s.uuid === c.uuid)) {
          all.push({
            uuid: c.uuid,
            name: c.name || c.uuid,
            status: c.hibernated ? 'hibernated' : 'unknown',
            hibernated: !!c.hibernated,
            is_suspended: c.suspended,
            resources: null,
            build: { memory_limit: c.memory, disk_space: c.disk, cpu_limit: c.cpu },
            container: { image: c.dockerImage },
            nodeId: c.nodeId,
          });
        }
      }
    } else {
      const subuserEntries = await AppDataSource.getRepository(ServerSubuser).find({ where: { userId: user.id } });
      const subuserUuids = new Set(subuserEntries.map(s => s.serverUuid));

      const allowedUuids = new Set<string>();
      for (const c of configs) {
        if (c.userId === user.id || subuserUuids.has(c.uuid)) allowedUuids.add(c.uuid);
      }

      const nodeMap = new Map(nodes.map(n => [n.id, n]));
      for (const c of configs) {
        if (!allowedUuids.has(c.uuid)) continue;
        const node = nodeMap.get(c.nodeId);
        if (!node) {
          all.push({
            uuid: c.uuid,
            name: c.name || c.uuid,
            status: c.hibernated ? 'hibernated' : 'unknown',
            hibernated: !!c.hibernated,
            is_suspended: c.suspended,
            resources: null,
            build: { memory_limit: c.memory, disk_space: c.disk, cpu_limit: c.cpu },
            container: { image: c.dockerImage },
            nodeId: c.nodeId,
          });
          continue;
        }
        try {
          const svc = new WingsApiService(node.url, node.token);
          const res = await svc.getServer(c.uuid);
          const s = res.data;
          const uuid: string = s.configuration?.uuid || s.uuid;
          const norm = normalizeServer(s, c.hibernated ? 'hibernated' : undefined);
          all.push({ ...norm, name: c.name || norm.name, nodeId: node.id, nodeName: node.name });
        } catch {
          all.push({
            uuid: c.uuid,
            name: c.name || c.uuid,
            status: c.hibernated ? 'hibernated' : 'unknown',
            hibernated: !!c.hibernated,
            is_suspended: c.suspended,
            resources: null,
            build: { memory_limit: c.memory, disk_space: c.disk, cpu_limit: c.cpu },
            container: { image: c.dockerImage },
            nodeId: c.nodeId,
          });
        }
      }
    }

    return all;
  }, { beforeHandle: [authenticate, authorize('servers:read')],
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'List all servers', tags: ['Servers'] }
  });

  function normalizeServer(raw: any, overrideStatus?: string): any {
    if (!raw) return raw;
    const cfg = raw.configuration || {};
    const meta = cfg.meta || {};
    const build = cfg.build || {};
    const ctr = cfg.container || cfg.docker || {};
    const status = overrideStatus ?? raw.state ?? raw.status ?? 'unknown';
    return {
      uuid: cfg.uuid || raw.uuid,
      name: meta.name || raw.name || cfg.uuid || raw.uuid,
      description: meta.description || raw.description,
      status,
      hibernated: status === 'hibernated',
      is_suspended: raw.is_suspended ?? false,
      resources: raw.utilization || raw.resources || null,
      build: {
        memory_limit: build.memory_limit ?? 0,
        disk_space: build.disk_space ?? 0,
        cpu_limit: build.cpu_limit ?? 0,
        swap: build.swap ?? 0,
        io_weight: build.io_weight ?? 500,
        oom_disabled: build.oom_disabled ?? false,
      },
      container: {
        image: ctr.image || ctr.images?.[0] || null,
        startup: cfg.invocation || raw.invocation || null,
      },
      invocation: cfg.invocation || raw.invocation || null,
      environment: cfg.environment || raw.environment || {},
      configuration: cfg,
    };
  }

  app.get(prefix + '/servers/:id', async (ctx: any) => {
    const { id } = ctx.params as any;
    const cfg = await cfgRepo().findOneBy({ uuid: id });
    let nodeName: string | null = null;
    let sftpInfo: Record<string, any> | null = null;
    if (cfg?.nodeId) {
      const node = await nodeRepo().findOneBy({ id: cfg.nodeId });
      if (node) {
        nodeName = node.name;
        const urlObj = (() => { try { return new URL(node.url); } catch { return null; } })();
        const nodeHost = urlObj?.hostname || node.url;
        const backendBase = (process.env.BACKEND_URL || '').replace(/\/+$/, '');
        const backendHost = backendBase ? ((() => { try { return new URL(backendBase).hostname; } catch { return backendBase; } })()) : null;
        const host = node.sftpProxyPort && backendHost ? backendHost : nodeHost;
        const port = node.sftpProxyPort ?? node.sftpPort ?? 2022;
        const sftpUser = ctx.user;
        const sftpHex = id.replace(/-/g, '').substring(0, 8);
        const username = sftpUser ? `${sftpUser.email}.${sftpHex}` : undefined;
        sftpInfo = { host, port, proxied: !!node.sftpProxyPort, username };
      }
    }
    try {
      const svc = await serviceFor(id);
      const res = await svc.getServer(id);
      const norm = normalizeServer(res.data, cfg?.hibernated ? 'hibernated' : undefined);
      return { ...norm, node: nodeName, sftp: sftpInfo };
    } catch (e: any) {
      if (cfg) {
        const norm = normalizeServer({
          uuid: cfg.uuid,
          state: cfg.hibernated ? 'hibernated' : 'unknown',
          is_suspended: cfg.suspended,
          configuration: {
            uuid: cfg.uuid,
            meta: { name: cfg.name, description: cfg.description },
            build: { memory_limit: cfg.memory, disk_space: cfg.disk, cpu_limit: cfg.cpu, swap: cfg.swap, io_weight: cfg.ioWeight },
            container: { image: cfg.dockerImage },
            invocation: cfg.startup,
            environment: cfg.environment,
            allocations: cfg.allocations,
          },
        });
        return { ...norm, node: nodeName, sftp: sftpInfo };
      }
      ctx.set.status = 502;
      return { error: e.message };
    }
  }, { beforeHandle: [authenticate, authorize('servers:read')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 502: t.Object({ error: t.String() }) },
    detail: { summary: 'Get server details by id', tags: ['Servers'] }
  });

  app.delete(prefix + '/servers/:id', async (ctx: any) => {
    const { id } = ctx.params as any;
    const user = ctx.user;
    const isAdmin = user.role === 'admin' || user.role === 'rootAdmin' || user.role === '*';
    const force = (ctx.query && (ctx.query.force === '1' || ctx.query.force === 'true')) || (ctx.body && ctx.body.force === true);

    if (force && !isAdmin) {
      ctx.set.status = 403;
      return { error: 'Only admins may force delete servers' };
    }

    try {
      const svc = await serviceFor(id);
      const res = await svc.serverRequest(id, '', 'delete');
      await createActivityLog({
        userId: user.id,
        action: 'server:delete',
        targetId: id,
        targetType: 'server',
        metadata: { serverUuid: id, force: !!force },
        ipAddress: ctx.ip,
      });
      await removeServerConfig(id);
      return res.data && typeof res.data === 'object' ? res.data : { success: true };
    } catch (e: any) {
      const status = e?.response?.status || 502;
      const errMsg = String(e?.message || '');
      const mappingMissing = errMsg.includes('No node mapping');
      if (isAdmin && (mappingMissing || status === 404 || force)) {
        try {
          await removeServerConfig(id).catch(() => {});
          await nodeSvc.unmapServer(id).catch(() => {});
        } catch {}
        await createActivityLog({
          userId: user.id,
          action: 'server:delete:force',
          targetId: id,
          targetType: 'server',
          metadata: { serverUuid: id, wingsError: e?.message || String(e), mappingMissing, status },
          ipAddress: ctx.ip,
        });
        return { success: true, note: 'Removed local server config and mapping (force)'};
      }

      ctx.set.status = status === 404 ? 502 : status;
      const msg = e?.response?.data?.error || e?.message || 'Failed to delete server';
      return { error: msg };
    }
  }, { beforeHandle: [authenticate, authorize('servers:delete')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 502: t.Object({ error: t.String() }) },
    detail: { summary: 'Delete a server', tags: ['Servers'] }
  });

  app.post(prefix + '/servers', async (ctx: any) => {
    const user = ctx.user;

    // PLEASE KEEP YOUR ACCOUHT SECURE OM<D LIKE SRS
    if (!(user.role === 'admin' || user.role === 'rootAdmin' || user.role === '*')) {
      if (user.portalType !== 'free') {
        if (!user.emailVerified) {
          ctx.set.status = 403;
          return { error: 'You must verify your email before creating servers' };
        }
        const passkeyRepo = AppDataSource.getRepository(require('../models/passkey.entity').Passkey);
        const passkeyCount = await passkeyRepo.count({ where: { user: { id: user.id } } });
        if (passkeyCount === 0) {
          ctx.set.status = 403;
          return { error: 'You must register a passkey before creating servers' };
        }
      }
    }

    const {
      eggId, name, nodeId, userId,
      memory: reqMemory, disk: reqDisk, cpu: reqCpu,
    } = ctx.body as any;

    const ownerId: number = (userId && (user.role === 'admin' || user.role === 'rootAdmin' || user.role === '*'))
      ? userId
      : user.id;

    const isAdmin = user.role === 'admin' || user.role === 'rootAdmin' || user.role === '*';
    
    let limits: any = {};
    if (!isAdmin) {
      const isDemoActive = user.demoExpiresAt && new Date(user.demoExpiresAt) > new Date();
      const effectivePortalType = isDemoActive && user.demoOriginalPortalType ? user.demoOriginalPortalType : user.portalType;

      if (effectivePortalType === 'enterprise' && user.nodeId) {
        const enterpriseNode = await nodeRepo().findOneBy({ id: user.nodeId });
        if (enterpriseNode) {
          limits = {
            memory: enterpriseNode.memory,
            disk: enterpriseNode.disk,
            cpu: enterpriseNode.cpu,
            serverLimit: enterpriseNode.serverLimit,
          };
        } else {
          limits = user.limits || {};
        }
      } else {
        limits = user.limits || {};
      }
      if (user.studentVerified && user.educationLimits) {
        for (const [k, v] of Object.entries(user.educationLimits)) {
          if (typeof v === 'number') {
            limits[k] = (limits[k] || 0) + v;
          } else {
            limits[k] = v;
          }
        }
      }
    }

    const memory = reqMemory != null ? Number(reqMemory) : (limits.memory ?? 1024);
    const disk   = reqDisk   != null ? Number(reqDisk)   : (limits.disk   ?? 10240);
    const cpu    = reqCpu    != null ? Number(reqCpu)     : (limits.cpu    ?? 100);

    if (!isAdmin) {
      if (limits.serverLimit != null && limits.serverLimit > 0) {
        const userServerCount = await cfgRepo().countBy({ userId: ownerId });
        if (userServerCount >= limits.serverLimit) {
          ctx.set.status = 403;
          return { error: `Server limit reached (${limits.serverLimit}). Delete an existing server to create a new one.` };
        }
      }

      if (limits.memory != null && memory > limits.memory) {
        ctx.set.status = 400;
        return { error: `Requested memory (${memory} MB) exceeds your account limit of ${limits.memory} MB.` };
      }
      if (limits.disk != null && disk > limits.disk) {
        ctx.set.status = 400;
        return { error: `Requested disk (${disk} MB) exceeds your account limit of ${limits.disk} MB.` };
      }
      if (limits.cpu != null && cpu > limits.cpu) {
        ctx.set.status = 400;
        return { error: `Requested CPU (${cpu}%) exceeds your account limit of ${limits.cpu}%.` };
      }
    }

    if (!eggId) {
      ctx.set.status = 400;
      return { error: 'eggId is required' };
    }
    const egg = await eggRepo().findOneBy({ id: eggId });
    if (!egg) {
      ctx.set.status = 404;
      return { error: 'Egg not found' };
    }
    if (!egg.visible && !isAdmin) {
      ctx.set.status = 403;
      return { error: 'Egg not available' };
    }

    let node: Node;
    try {
      node = await pickNode(user.portalType || 'free', nodeId, user.nodeId);
    } catch (e: any) {
      ctx.set.status = 503;
      return { error: e.message };
    }

    let autoAllocation: Record<string, any> | null = null;
    if (node.portRangeStart && node.portRangeEnd) {
      const bindIp = node.defaultIp || '0.0.0.0';
      const nodeConfigs = await cfgRepo().find({ where: { nodeId: node.id } });
      const takenPorts = new Set<number>();
      for (const c of nodeConfigs) {
        const alloc = c.allocations as any;
        if (!alloc) continue;
        if (alloc.default?.port) takenPorts.add(Number(alloc.default.port));
        for (const ports of Object.values(alloc.mappings ?? {}) as number[][]) {
          for (const p of ports) takenPorts.add(Number(p));
        }
      }
      for (let p = node.portRangeStart; p <= node.portRangeEnd; p++) {
        if (!takenPorts.has(p)) {
          autoAllocation = { default: { ip: bindIp, port: p }, mappings: { [bindIp]: [p] } };
          break;
        }
      }
      if (!autoAllocation) {
        ctx.set.status = 503;
        return { error: 'No free ports available on this node. Contact an administrator.' };
      }
    }

    const serverUuid = uuidv4();

    const envObject: Record<string, string> = {};
    for (const entry of ((egg.envVars || []) as any[])) {
      if (typeof entry === 'string') {
        const [k, ...rest] = (entry as string).split('=');
        if (k) envObject[k.trim()] = rest.join('=').trim();
      } else if (entry && typeof entry === 'object') {
        const k = entry.env_variable || entry.key || entry.name;
        const v = entry.default_value ?? entry.defaultValue ?? entry.value ?? '';
        if (k) envObject[String(k)] = String(v);
      }
    }
    const envOverrides: Record<string, string> = (ctx.body as any).environment || {};
    Object.assign(envObject, envOverrides);

    // fun fact I have no idea how this works but it works so dont touch it
    const resolvedStartup = egg.startup.replace(
      /\{\{([^}]+)\}\}/g,
      (_, varName: string) => envObject[varName.trim()] ?? '',
    );

    const wingsPayload = {
      uuid: serverUuid,
      start_on_completion: false,
      skip_scripts: false,
      environment: envObject,
      build: {
        memory_limit: memory,
        swap: 0,
        disk_space: disk,
        io_weight: 500,
        cpu_limit: cpu,
        threads: null,
      },
      container: {
        image: egg.dockerImage,
        startup: resolvedStartup,
      },
      ...(name ? { name } : {}),
    };

    // Wings will immediately call back GET /remote/servers/:uuid to validate
    // the server config. If we save after the Wings call, that remote request
    // returns 404 and Wings aborts with a 500.
    // Yeah wings are weird..
    await nodeSvc.mapServer(serverUuid, node.id);
    await saveServerConfig({
      uuid: serverUuid,
      nodeId: node.id,
      userId: ownerId,
      name,
      dockerImage: egg.dockerImage,
      startup: resolvedStartup,
      environment: envObject,
      memory,
      disk,
      cpu,
      eggId: egg.id,
      ...(autoAllocation ? { allocations: autoAllocation } : {}),
    });

    const svc = new WingsApiService(node.url, node.token);
    try {
      const res = await svc.createServer(wingsPayload);
      await createActivityLog({ userId: ownerId, action: 'server:create', targetId: serverUuid, targetType: 'server', metadata: { serverName: name, eggId: egg.id, nodeId: node.id, memory, disk, cpu }, ipAddress: ctx.ip });
      return { uuid: serverUuid, nodeId: node.id, ...res.data };
    } catch (e: any) {
      await removeServerConfig(serverUuid).catch(() => {});
      await nodeSvc.unmapServer(serverUuid).catch(() => {});
      ctx.set.status = 502;
      return { error: `Wings rejected the create request: ${e.message}` };
    }
  }, { beforeHandle: [authenticate, authorize('servers:create')],
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 502: t.Object({ error: t.String() }) },
    detail: { summary: 'Create a new server', tags: ['Servers'] }
  });
  app.put(prefix + '/servers/:id', async (ctx: any) => {
    const { id } = ctx.params as any;
    const { memory, disk, cpu, swap, environment, name } = ctx.body as any;
    try {
      const svc = await serviceFor(id);

      const build: any = {};
      if (memory !== undefined) build.memory_limit = Number(memory);
      if (disk !== undefined) build.disk_space = Number(disk);
      if (cpu !== undefined) build.cpu_limit = Number(cpu);
      if (swap !== undefined) build.swap = Number(swap);
      const syncPayload: any = {};
      if (Object.keys(build).length) syncPayload.build = build;
      if (environment !== undefined) syncPayload.environment = environment;
      if (name !== undefined) syncPayload.name = name;

      await svc.syncServer(id, syncPayload);

      const cfgRepo = AppDataSource.getRepository(require('../models/serverConfig.entity').ServerConfig);
      const existing = await cfgRepo.findOneBy({ uuid: id });
      if (existing) {
        if (memory !== undefined) existing.memory = Number(memory);
        if (disk !== undefined) existing.disk = Number(disk);
        if (cpu !== undefined) existing.cpu = Number(cpu);
        if (swap !== undefined) existing.swap = Number(swap);
        if (environment !== undefined) Object.assign(existing.environment ??= {}, environment);
        if (name !== undefined) existing.name = name;
        await cfgRepo.save(existing);
      }

      const user = ctx.user;
      await createActivityLog({ userId: user.id, action: 'server:update', targetId: id, targetType: 'server', metadata: { changes: { memory, disk, cpu, swap, name, environment: environment ? '(updated)' : undefined } }, ipAddress: ctx.ip });
      return { success: true };
    } catch (e: any) {
      ctx.set.status = 502;
      return { error: e.message };
    }
  }, { beforeHandle: [authenticate, authorize('servers:write')],
    response: { 200: t.Object({ success: t.Boolean() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 502: t.Object({ error: t.String() }) },
    detail: { summary: 'Update server settings', tags: ['Servers'] }
  });

  app.post(prefix + '/servers/:id/suspend', async (ctx: any) => {
    const { id } = ctx.params as any;
    try {
      const svc = await serviceFor(id);
      await svc.powerServer(id, 'kill').catch(() => {});
      await svc.syncServer(id, { suspended: true });
      const cfgRepo = AppDataSource.getRepository(require('../models/serverConfig.entity').ServerConfig);
      await cfgRepo.update({ uuid: id }, { suspended: true });
      const user = ctx.user;
      await createActivityLog({ userId: user.id, action: 'server:suspend', targetId: id, targetType: 'server', ipAddress: ctx.ip });
      return { success: true };
    } catch (e: any) {
      ctx.set.status = 502;
      return { error: e.message };
    }
  }, { beforeHandle: [authenticate, authorize('servers:write')],
    response: { 200: t.Object({ success: t.Boolean() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 502: t.Object({ error: t.String() }) },
    detail: { summary: 'Suspend a server', tags: ['Servers'] }
  });

  app.post(prefix + '/servers/:id/unsuspend', async (ctx: any) => {
    const { id } = ctx.params as any;
    try {
      const svc = await serviceFor(id);
      await svc.syncServer(id, { suspended: false });
      const cfgRepo = AppDataSource.getRepository(require('../models/serverConfig.entity').ServerConfig);
      await cfgRepo.update({ uuid: id }, { suspended: false });
      const user = ctx.user;
      await createActivityLog({ userId: user.id, action: 'server:unsuspend', targetId: id, targetType: 'server', ipAddress: ctx.ip });
      return { success: true };
    } catch (e: any) {
      ctx.set.status = 502;
      return { error: e.message };
    }
  }, { beforeHandle: [authenticate, authorize('servers:write')],
    response: { 200: t.Object({ success: t.Boolean() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 502: t.Object({ error: t.String() }) },
    detail: { summary: 'Unsuspend a server', tags: ['Servers'] }
  });

  app.post(prefix + '/servers/:id/power', async (ctx: any) => {
    const { id } = ctx.params as any;
    const { action } = ctx.body as any;
    const cfg = await AppDataSource.getRepository(ServerConfig).findOneBy({ uuid: id });
    if (cfg?.hibernated && (action === 'start' || action === 'restart')) {
      ctx.set.status = 403;
      return { error: 'Server is hibernated and cannot be started or restarted' };
    }
    try {
      const svc = await serviceFor(id);
      const res = await svc.powerServer(id, action);
      const user = ctx.user;
      await createActivityLog({ userId: user.id, action: `server:power:${action}`, targetId: id, targetType: 'server', metadata: { powerAction: action }, ipAddress: ctx.ip });
      return res.data && typeof res.data === 'object' ? res.data : { success: true };
    } catch (e: any) {
      const status = e?.response?.status || 502;
      const msg = e?.response?.data?.error || e?.message || 'Power action failed';
      ctx.set.status = status;
      return { error: msg };
    }
  }, { beforeHandle: [authenticate, authorize('servers:power')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Perform power action on server', tags: ['Servers'] }
  });

  // TODO: Test KVM on servers
  app.post(prefix + '/servers/:id/kvm', async (ctx: any) => {
    const { id } = ctx.params as any;
    const { enable } = ctx.body as any;
    const svc = await serviceFor(id);
    const res = await svc.toggleKvm(id, enable);
    const user = ctx.user;
    await createActivityLog({ userId: user.id, action: `server:kvm:${enable ? 'enable' : 'disable'}`, targetId: id, targetType: 'server', metadata: { kvmEnabled: enable }, ipAddress: ctx.ip });
    return res.data && typeof res.data === 'object' ? res.data : { success: true };
  }, { beforeHandle: [authenticate, authorize('servers:kvm')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Toggle server KVM', tags: ['Servers'] }
  });

  app.get(prefix + '/servers/:id/files', async (ctx: any) => {
    const { id } = ctx.params as any;
    const { path } = ctx.query as any;
    const dir = path || '/';
    try {
      const svc = await serviceFor(id);
      let res: any;
      try {
        res = await svc.serverRequest(id, `/files/list-directory?directory=${encodeURIComponent(dir)}`);
      } catch (e1: any) {
        if (e1?.response?.status === 404) {
          res = await svc.serverRequest(id, `/files/list?directory=${encodeURIComponent(dir)}`);
        } else {
          throw e1;
        }
      }
      const data = res.data;
      const entries =
        (Array.isArray(data) ? data : null) ??
        (Array.isArray(data?.entries) ? data.entries : null) ??
        (Array.isArray(data?.data) ? data.data : null) ??
        (Array.isArray(data?.files) ? data.files : null) ??
        [];
      return entries;
    } catch (e: any) {
      if (e?.response?.status === 404) return [];
      const status = e?.response?.status || 500;
      const msg = e?.response?.data?.error || e?.message || 'Failed to list files';
      ctx.set.status = status;
      return { error: msg };
    }
  }, { beforeHandle: [authenticate, authorize('files:read')],
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 500: t.Object({ error: t.String() }) },
    detail: { summary: 'List directory contents', tags: ['Servers'] }
  });

  app.get(prefix + '/servers/:id/files/contents', async (ctx: any) => {
    const { id } = ctx.params as any;
    const { path } = ctx.query as any;
    const svc = await serviceFor(id);
    const res = await svc.readFile(id, path);
    return res.data ?? '';
  }, { beforeHandle: [authenticate, authorize('files:read')],
    response: { 200: t.String(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Read file contents', tags: ['Servers'] }
  });

  app.post(prefix + '/servers/:id/files/write', async (ctx: any) => {
    const { id } = ctx.params as any;
    const { path, content } = ctx.body as any;
    const svc = await serviceFor(id);
    try {
      const res = await svc.writeFile(id, path, content);
      const user = ctx.user;
      await createActivityLog({ userId: user.id, action: 'server:file:write', targetId: id, targetType: 'server', metadata: { filePath: path }, ipAddress: ctx.ip });
      return res.data && typeof res.data === 'object' ? res.data : { success: true };
    } catch (e: any) {
      const status = e?.response?.status || 500;
      const msg = e?.response?.data?.error || e?.message || 'File write failed';
      ctx.set.status = status;
      return { error: msg };
    }
  }, { beforeHandle: [authenticate, authorize('files:write')],
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 500: t.Object({ error: t.String() }) },
    detail: { summary: 'Write file', tags: ['Servers'] }
  });

  app.post(prefix + '/servers/:id/files/delete', async (ctx: any) => {
    const { id } = ctx.params as any;
    const { path: filePath, files, bulk } = ctx.body as any;
    let root = '/';
    let targetFiles: string[] = [];

    if (bulk && Array.isArray(files)) {
      root = typeof filePath === 'string' && filePath.length > 0 ? filePath : '/';
      targetFiles = files.filter((f: any) => typeof f === 'string' && f.trim().length > 0);
    } else {
      const lastSlash = filePath.lastIndexOf('/');
      root = lastSlash > 0 ? filePath.substring(0, lastSlash) : '/';
      const fileName = filePath.substring(lastSlash + 1);
      targetFiles = fileName ? [fileName] : [];
    }

    if (targetFiles.length === 0) {
      ctx.set.status = 400;
      return { error: 'No files specified' };
    }

    const svc = await serviceFor(id);
    try {
      const res = await svc.deleteFile(id, root, targetFiles);
      const user = ctx.user;
      await createActivityLog({ userId: user.id, action: 'server:file:delete', targetId: id, targetType: 'server', metadata: { root, files: targetFiles }, ipAddress: ctx.ip });
      return res.data && typeof res.data === 'object' ? res.data : { success: true };
    } catch (e: any) {
      const status = e?.response?.status || 500;
      const msg = e?.response?.data?.error || e?.message || 'File delete failed';
      ctx.set.status = status;
      return { error: msg };
    }
  }, { beforeHandle: [authenticate, authorize('files:write')],
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 500: t.Object({ error: t.String() }) },
    detail: { summary: 'Delete file(s)', tags: ['Servers'] }
  });

  app.post(prefix + '/servers/:id/files/create-directory', async (ctx: any) => {
    const { id } = ctx.params as any;
    const { path: dirPath } = ctx.body as any;
    // Wings expects { root: "<parent-dir>", name: "<new-dir-name>" }
    // Learnt it hard way, dont change it :x
    const lastSlash = dirPath.lastIndexOf('/');
    const root = lastSlash > 0 ? dirPath.substring(0, lastSlash) : '/';
    const name = dirPath.substring(lastSlash + 1);
    const svc = await serviceFor(id);
    try {
      const res = await svc.createDirectory(id, root, name);
      return res.data && typeof res.data === 'object' ? res.data : { success: true };
    } catch (e: any) {
      const status = e?.response?.status || 500;
      const msg = e?.response?.data?.error || e?.message || 'Create directory failed';
      ctx.set.status = status;
      return { error: msg };
    }
  }, { beforeHandle: [authenticate, authorize('files:write')],
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 500: t.Object({ error: t.String() }) },
    detail: { summary: 'Create directory', tags: ['Servers'] }
  });

  app.post(prefix + '/servers/:id/files/archive', async (ctx: any) => {
    const { id } = ctx.params as any;
    const { root = '/', files } = ctx.body as any;
    if (!Array.isArray(files) || files.length === 0) {
      ctx.set.status = 400;
      return { error: 'files must be a non-empty array' };
    }
    const svc = await serviceFor(id);
    try {
      const res = await svc.archiveFiles(id, root, files);
      return res.data && typeof res.data === 'object' ? res.data : { success: true };
    } catch (e: any) {
      const status = e?.response?.status || 500;
      const msg = e?.response?.data?.error || e?.message || 'Archive failed';
      ctx.set.status = status;
      return { error: msg };
    }
  }, { beforeHandle: [authenticate, authorize('files:write')],
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 500: t.Object({ error: t.String() }) },
    detail: { summary: 'Archive files', tags: ['Servers'] }
  });

  app.post(prefix + '/servers/:id/files/move', async (ctx: any) => {
    const { id } = ctx.params as any;
    const { root = '/', files, destination } = ctx.body as any;
    if (!Array.isArray(files) || files.length === 0) {
      ctx.set.status = 400;
      return { error: 'files must be a non-empty array' };
    }
    if (!destination || typeof destination !== 'string') {
      ctx.set.status = 400;
      return { error: 'destination is required' };
    }

    const dest = destination.replace(/^\/+|\/+$/g, '');
    const mappings = files.map((name: string) => ({
      from: name,
      to: dest ? `${dest}/${name}` : name,
    }));

    const svc = await serviceFor(id);
    try {
      const res = await svc.moveFiles(id, root, mappings);
      return res.data && typeof res.data === 'object' ? res.data : { success: true };
    } catch (e: any) {
      const status = e?.response?.status || 500;
      const msg = e?.response?.data?.error || e?.message || 'Move failed';
      ctx.set.status = status;
      return { error: msg };
    }
  }, { beforeHandle: [authenticate, authorize('files:write')],
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 500: t.Object({ error: t.String() }) },
    detail: { summary: 'Move files', tags: ['Servers'] }
  });

  // yeah so basically wings-rs only cuz wings-go compatibility
  // would be nightmare to add
  // be happy that most shit is already supported and using wings-go is possible
  app.get(prefix + '/servers/:id/backups', async (ctx: any) => {
    const { id } = ctx.params as any;
    try {
      const svc = await serviceFor(id);
      const res = await svc.listServerBackups(id);
      return Array.isArray(res.data) ? res.data : [];
    } catch (e: any) {
      if (e?.response?.status === 404) return [];
      throw e;
    }
  }, { beforeHandle: [authenticate, authorize('backups:read')],
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'List backups', tags: ['Servers'] }
  });

  app.post(prefix + '/servers/:id/backups', async (ctx: any) => {
    const { id } = ctx.params as any;
    const payload = ctx.body;
    try {
      const svc = await serviceFor(id);
      const res = await svc.createServerBackup(id, payload);
      return res.data && typeof res.data === 'object' ? res.data : { success: true };
    } catch (e: any) {
      if (e?.response?.status === 404) {
        ctx.set.status = 400;
        return { error: 'Backups are not supported by this Wings version.' };
      }
      const status = e?.response?.status || 500;
      const msg = e?.response?.data?.error || e?.message || 'Failed to create backup';
      ctx.set.status = status;
      return { error: msg };
    }
  }, { beforeHandle: [authenticate, authorize('backups:create')],
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 500: t.Object({ error: t.String() }) },
    detail: { summary: 'Create backup', tags: ['Servers'] }
  });

  app.post(prefix + '/servers/:id/backups/:bid/restore', async (ctx: any) => {
    const { id, bid } = ctx.params as any;
    try {
      const svc = await serviceFor(id);
      const res = await svc.restoreServerBackup(id, bid);
      return res.data && typeof res.data === 'object' ? res.data : { success: true };
    } catch (e: any) {
      if (e?.response?.status === 404) {
        ctx.set.status = 400;
        return { error: 'Backups are not supported by this Wings version.' };
      }
      const status = e?.response?.status || 500;
      const msg = e?.response?.data?.error || e?.message || 'Failed to restore backup';
      ctx.set.status = status;
      return { error: msg };
    }
  }, { beforeHandle: [authenticate, authorize('backups:write')],
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 500: t.Object({ error: t.String() }) },
    detail: { summary: 'Restore backup', tags: ['Servers'] }
  });

  app.delete(prefix + '/servers/:id/backups/:bid', async (ctx: any) => {
    const { id, bid } = ctx.params as any;
    try {
      const svc = await serviceFor(id);
      const res = await svc.serverRequest(id, `/backups/${bid}`, 'delete');
      return res.data && typeof res.data === 'object' ? res.data : { success: true };
    } catch (e: any) {
      if (e?.response?.status === 404) {
        ctx.set.status = 400;
        return { error: 'Backups are not supported by this Wings version.' };
      }
      const status = e?.response?.status || 500;
      const msg = e?.response?.data?.error || e?.message || 'Failed to delete backup';
      ctx.set.status = status;
      return { error: msg };
    }
  }, { beforeHandle: [authenticate, authorize('backups:write')],
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 500: t.Object({ error: t.String() }) },
    detail: { summary: 'Delete backup', tags: ['Servers'] }
  });

  app.post(prefix + '/servers/:id/commands', async (ctx: any) => {
    const { id } = ctx.params as any;
    const { command } = ctx.body as any;
    const svc = await serviceFor(id);
    const res = await svc.executeServerCommand(id, command);
    const user = ctx.user;
    await createActivityLog({ userId: user.id, action: 'server:console:command', targetId: id, targetType: 'server', metadata: { command }, ipAddress: ctx.ip });
    return res.data && typeof res.data === 'object' ? res.data : { success: true };
  }, { beforeHandle: [authenticate, authorize('commands:execute')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Execute server command', tags: ['Servers'] }
  });

  app.get(prefix + '/servers/:id/logs', async (ctx: any) => {
    const { id } = ctx.params as any;
    try {
      const svc = await serviceFor(id);
      const res = await svc.getServerLogs(id);
      const raw = res.data;
      let lines: string[];
      if (Buffer.isBuffer(raw)) {
        lines = raw.toString('utf-8').split('\n').filter(Boolean);
      } else if (typeof raw === 'string') {
        lines = raw.split('\n').filter(Boolean);
      } else if (Array.isArray(raw)) {
        lines = raw.map((l: any) => (typeof l === 'string' ? l : JSON.stringify(l)));
      } else if (raw && typeof raw === 'object') {
        const inner = raw.logs ?? raw.data ?? raw.output;
        if (typeof inner === 'string') {
          lines = inner.split('\n').filter(Boolean);
        } else if (Array.isArray(inner)) {
          lines = inner.map((l: any) => (typeof l === 'string' ? l : JSON.stringify(l)));
        } else {
          lines = [JSON.stringify(raw)];
        }
      } else {
        lines = raw ? [String(raw)] : [];
      }
      return lines;
    } catch (e: any) {
      if (e?.response?.status === 404) return [];
      throw e;
    }
  }, { beforeHandle: [authenticate, authorize('logs:read')],
    response: { 200: t.Array(t.String()), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Fetch server logs', tags: ['Servers','Logs'] }
  });

  app.post(prefix + '/servers/:id/reinstall', async (ctx: any) => {
    const { id } = ctx.params as any;
    const payload = ctx.body;
    const svc = await serviceFor(id);
    const res = await svc.reinstallServer(id, payload);
    const user = ctx.user;
    await createActivityLog({ userId: user.id, action: 'server:reinstall', targetId: id, targetType: 'server', ipAddress: ctx.ip });
    return res.data && typeof res.data === 'object' ? res.data : { success: true };
  }, { beforeHandle: [authenticate, authorize('reinstall:execute')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Reinstall server', tags: ['Servers'] }
  });

  app.get(prefix + '/servers/:id/schedules', async (ctx: any) => {
    const { id } = ctx.params as any;
    const cfg = await cfgRepo().findOneBy({ uuid: id });
    return cfg?.schedules ?? [];
  }, { beforeHandle: [authenticate, authorize('schedules:read')],
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'List schedules', tags: ['Servers'] }
  });

  app.post(prefix + '/servers/:id/schedules', async (ctx: any) => {
    const { id } = ctx.params as any;
    const body = ctx.body as any;
    const cfg = await cfgRepo().findOneBy({ uuid: id });
    if (!cfg) {
      ctx.set.status = 404;
      return { error: 'Server not found' };
    }
    const schedule = {
      id: uuidv4(),
      name: body.name || '',
      cron_minute: body.cron_minute || '*',
      cron_hour: body.cron_hour || '*',
      cron_day_of_month: body.cron_day_of_month || '*',
      cron_month: body.cron_month || '*',
      cron_day_of_week: body.cron_day_of_week || '*',
      is_active: body.is_active !== false,
      last_run_at: null,
      created_at: new Date().toISOString(),
    };
    const schedules = [...(cfg.schedules ?? []), schedule];
    await cfgRepo().update({ uuid: id }, { schedules } as any);
    return schedule;
  }, { beforeHandle: [authenticate, authorize('schedules:create')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Create schedule', tags: ['Servers'] }
  });

  app.delete(prefix + '/servers/:id/schedules/:sid', async (ctx: any) => {
    const { id, sid } = ctx.params as any;
    const cfg = await cfgRepo().findOneBy({ uuid: id });
    if (!cfg) {
      ctx.set.status = 404;
      return { error: 'Server not found' };
    }
    const schedules = (cfg.schedules ?? []).filter((s: any) => s.id !== sid);
    await cfgRepo().update({ uuid: id }, { schedules } as any);
    return { success: true };
  }, { beforeHandle: [authenticate, authorize('schedules:write')],
    response: { 200: t.Object({ success: t.Boolean() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Delete schedule', tags: ['Servers'] }
  });

  app.post(prefix + '/servers/:id/sync', async (ctx: any) => {
    const { id } = ctx.params as any;
    const payload = ctx.body;
    const svc = await serviceFor(id);
    const res = await svc.syncServer(id, payload);
    return res.data && typeof res.data === 'object' ? res.data : { success: true };
  }, { beforeHandle: [authenticate, authorize('sync:execute')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Sync server', tags: ['Servers'] }
  });

  app.post(prefix + '/servers/:id/transfer', async (ctx: any) => {
    const { id } = ctx.params as any;
    const payload = ctx.body;
    const svc = await serviceFor(id);
    const res = await svc.transferServer(id, payload);
    return res.data && typeof res.data === 'object' ? res.data : { success: true };
  }, { beforeHandle: [authenticate, authorize('transfer:execute')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Transfer server', tags: ['Servers'] }
  });

  app.get(prefix + '/servers/:id/version', async (ctx: any) => {
    const { id } = ctx.params as any;
    const svc = await serviceFor(id);
    const res = await svc.getServerVersion(id);
    return res.data ?? {};
  }, { beforeHandle: [authenticate, authorize('version:read')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Get server software version', tags: ['Servers'] }
  });

  app.get(prefix + '/servers/:id/console', async (ctx: any) => {
    const { id } = ctx.params as any;
    try {
      const svc = await serviceFor(id);
      const res = await svc.serverRequest(id, '/console');
      return res.data && typeof res.data === 'object' ? res.data : { success: true };
    } catch (e: any) {
      if (e?.response?.status === 404) return { error: 'Not supported' };
      throw e;
    }
  }, { beforeHandle: [authenticate, authorize('servers:console')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Access server console', tags: ['Servers'] }
  });

  app.get(prefix + '/servers/:id/allocations', async (ctx: any) => {
    const { id } = ctx.params as any;
    const cfg = await cfgRepo().findOneBy({ uuid: id });
    const a = cfg?.allocations;
    if (!a) return [];
    const fqdns: Record<string, string> = (a as any).fqdns ?? {};
    const result: any[] = [];
    if (a.default) {
      const key = `${a.default.ip}:${a.default.port}`;
      result.push({ ip: a.default.ip, port: a.default.port, fqdn: fqdns[key] || null, is_default: true, notes: null });
    }
    const mappings: Record<string, number[]> = a.mappings ?? {};
    for (const [ip, ports] of Object.entries(mappings)) {
      for (const port of (ports as number[]) ?? []) {
        const isDef = a.default?.ip === ip && a.default?.port === port;
        if (!isDef) {
          const key = `${ip}:${port}`;
          result.push({ ip, port, fqdn: fqdns[key] || null, is_default: false, notes: null });
        }
      }
    }
    return result;
  }, { beforeHandle: [authenticate, authorize('servers:read')],
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'List network allocations', tags: ['Servers'] }
  });

  for (const sub of ['network', 'location']) {
    app.get(prefix + `/servers/:id/${sub}`, async (ctx: any) => {
      const { id } = ctx.params as any;
      try {
        const svc = await serviceFor(id);
        const res = await svc.serverRequest(id, `/${sub}`);
        return res.data ?? [];
      } catch (e: any) {
        if (e?.response?.status === 404) return [];
        throw e;
      }
    }, { beforeHandle: [authenticate, authorize('servers:read')],
      response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
      detail: { summary: `Get server ${sub}`, tags: ['Servers'] }
    });
  }

  app.get(prefix + '/servers/:id/stats', async (ctx: any) => {
    const { id } = ctx.params as any;
    const socRepo = AppDataSource.getRepository(SocData);
    const latest = await socRepo.findOne({ where: { serverId: id }, order: { timestamp: 'DESC' } });
    return latest?.metrics ?? {};
  }, { beforeHandle: [authenticate, authorize('servers:read')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Latest server stats', tags: ['Servers'] }
  });

  app.get(prefix + '/servers/:id/stats/history', async (ctx: any) => {
    const { id } = ctx.params as any;
    const { window: w = '1h', points: p = '60' } = ctx.query as any;
    const points = Math.max(12, Math.min(1440, Number(p) || 60));
    try {
      const { fetchHistorical } = await import('../services/metricsService');
      const rows = await fetchHistorical(id, w, points);
      return rows;
    } catch (e: any) {
      console.error('stats history error', e);
      ctx.set.status = 500;
      return { error: 'Unable to build historical stats' };
    }
  }, { beforeHandle: [authenticate, authorize('servers:read')],
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 500: t.Object({ error: t.String() }) },
    detail: { summary: 'Historical stats', tags: ['Servers'] }
  });

  // TODO: Actually fix this
  app.get(prefix + '/servers/:id/stats/node', async (ctx: any) => {
    const { id } = ctx.params as any;
    try {
      const mappingRepo = AppDataSource.getRepository(ServerMapping);
      const mapping = await mappingRepo.findOne({ where: { uuid: id }, relations: ['node'] });
      if (!mapping) {
        ctx.set.status = 404;
        return { error: 'No node mapping for server' };
      }
      const node = mapping.node;
      const svc = new WingsApiService(node.url, node.token);
      const [infoResult, statsResult] = await Promise.allSettled([
        svc.getSystemInfo(),
        svc.getSystemStats(),
      ]);
      const info = infoResult.status === 'fulfilled' ? (infoResult.value.data ?? {}) : {};
      const statsPayload = statsResult.status === 'fulfilled' ? (statsResult.value.data ?? {}) : {};
      return { ...info, ...(statsPayload.stats ?? {}) };
    } catch (e: any) {
      ctx.set.status = 502;
      return { error: 'Unable to retrieve node stats' };
    }
  }, { beforeHandle: [authenticate, authorize('servers:read')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 502: t.Object({ error: t.String() }) },
    detail: { summary: 'Node-level stats', tags: ['Servers'] }
  });

  app.get(prefix + '/servers/:id/configuration', async (ctx: any) => {
    const { id } = ctx.params as any;
    const svc = await serviceFor(id);
    const res = await svc.serverRequest(id, '/configuration');
    return res.data ?? {};
  }, { beforeHandle: [authenticate, authorize('configuration:read')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Server configuration', tags: ['Servers'] }
  });

  app.post(prefix + '/servers/:id/script', async (ctx: any) => {
    const { id } = ctx.params as any;
    const svc = await serviceFor(id);
    const res = await svc.serverRequest(id, '/script', 'post', ctx.body);
    return res.data && typeof res.data === 'object' ? res.data : { success: true };
  }, { beforeHandle: [authenticate, authorize('servers:write')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Run script', tags: ['Servers'] }
  });

  app.post(prefix + '/servers/:id/ws/permissions', async (ctx: any) => {
    const { id } = ctx.params as any;
    const svc = await serviceFor(id);
    const res = await svc.serverRequest(id, '/ws/permissions', 'post', ctx.body);
    return res.data && typeof res.data === 'object' ? res.data : { success: true };
  }, { beforeHandle: [authenticate, authorize('servers:write')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Set WS permissions', tags: ['Servers'] }
  });

  app.post(prefix + '/servers/:id/ws/broadcast', async (ctx: any) => {
    const { id } = ctx.params as any;
    const svc = await serviceFor(id);
    const res = await svc.serverRequest(id, '/ws/broadcast', 'post', ctx.body);
    return res.data && typeof res.data === 'object' ? res.data : { success: true };
  }, { beforeHandle: [authenticate, authorize('servers:write')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Broadcast WS message', tags: ['Servers'] }
  });

  app.post(prefix + '/servers/:id/install/abort', async (ctx: any) => {
    const { id } = ctx.params as any;
    const svc = await serviceFor(id);
    const res = await svc.serverRequest(id, '/install/abort', 'post');
    return res.data && typeof res.data === 'object' ? res.data : { success: true };
  }, { beforeHandle: [authenticate, authorize('servers:write')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Abort install', tags: ['Servers'] }
  });

  app.get(prefix + '/servers/:id/logs/install', async (ctx: any) => {
    const { id } = ctx.params as any;
    const svc = await serviceFor(id);
    const res = await svc.serverRequest(id, '/logs/install');
    return res.data ?? [];
  }, { beforeHandle: [authenticate, authorize('logs:read')],
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Fetch install logs', tags: ['Servers','Logs'] }
  });

  app.get(prefix + '/servers/:id/configuration/egg', async (ctx: any) => {
    const { id } = ctx.params as any;
    const svc = await serviceFor(id);
    const res = await svc.serverRequest(id, '/configuration/egg');
    return res.data ?? {};
  }, { beforeHandle: [authenticate, authorize('configuration:read')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Egg-specific configuration', tags: ['Servers'] }
  });

  app.put(prefix + '/servers/:id/configuration/egg', async (ctx: any) => {
    const { id } = ctx.params as any;
    const payload = ctx.body;
    const svc = await serviceFor(id);
    const res = await svc.serverRequest(id, '/configuration/egg', 'put', payload);
    return res.data && typeof res.data === 'object' ? res.data : { success: true };
  }, { beforeHandle: [authenticate, authorize('configuration:write')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Update egg configuration', tags: ['Servers'] }
  });

  app.get(prefix + '/servers/:id/startup', async (ctx: any) => {
    const { id } = ctx.params as any;
    const cfg = await cfgRepo().findOneBy({ uuid: id });
    if (!cfg) {
      ctx.set.status = 404;
      return { error: 'Server not found' };
    }
    const egg = cfg.eggId ? await eggRepo().findOneBy({ id: cfg.eggId }) : null;
    const eggProc = egg?.processConfig || {};
    const cfgProc = (cfg as any).processConfig || {};
    const proc: Record<string, any> = { ...eggProc, ...cfgProc };
    return {
      environment: cfg.environment || {},
      startup: cfg.startup || '',
      dockerImage: cfg.dockerImage || '',
      envVars: egg?.envVars || [],
      eggName: egg?.name || null,
      processConfig: {
        startup: {
          done: proc.startup?.done || [],
          strip_ansi: proc.startup?.strip_ansi ?? false,
        },
        stop: {
          type: proc.stop?.type || 'command',
          value: proc.stop?.value || 'stop',
        },
      },
    };
  }, { beforeHandle: [authenticate, authorize('servers:read')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Get startup configuration', tags: ['Servers'] }
  });

  app.put(prefix + '/servers/:id/startup', async (ctx: any) => {
    const { id } = ctx.params as any;
    const { environment, processConfig: incomingProcCfg } = ctx.body as any;
    if (!environment && !incomingProcCfg) {
      ctx.set.status = 400;
      return { error: 'environment or processConfig is required' };
    }

    const cfg = await cfgRepo().findOneBy({ uuid: id });
    if (!cfg) {
      ctx.set.status = 404;
      return { error: 'Server not found' };
    }

    const egg = cfg.eggId ? await eggRepo().findOneBy({ id: cfg.eggId }) : null;
    const editableKeys = new Set<string>();
    if (egg?.envVars) {
      for (const v of egg.envVars as any[]) {
        if (v.user_editable) editableKeys.add(v.env_variable || v.key || v.name);
      }
    }

    const merged = { ...(cfg.environment || {}) };
    if (environment && typeof environment === 'object') {
      for (const [key, val] of Object.entries(environment)) {
        if (editableKeys.size === 0 || editableKeys.has(key)) {
          merged[key] = String(val);
        }
      }
    }

    if (incomingProcCfg && typeof incomingProcCfg === 'object') {
      const existing = (cfg as any).processConfig || {};
      const updated = { ...existing };
      if (incomingProcCfg.startup) {
        updated.startup = { ...(existing.startup || {}), ...incomingProcCfg.startup };
      }
      if (incomingProcCfg.stop) {
        updated.stop = { ...(existing.stop || {}), ...incomingProcCfg.stop };
      }
      (cfg as any).processConfig = updated;
    }

    try {
      const svc = await serviceFor(id);
      await svc.syncServer(id, {});
    } catch {
      // continue
    }

    cfg.environment = merged;
    await cfgRepo().save(cfg);
    return { success: true, environment: merged, processConfig: (cfg as any).processConfig };
  }, { beforeHandle: [authenticate, authorize('servers:write')],
    response: { 200: t.Object({ success: t.Boolean(), environment: t.Any(), processConfig: t.Any() }), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Update startup configuration', tags: ['Servers'] }
  });

  app.get(prefix + '/servers/:id/mounts', async (ctx: any) => {
    const { id } = ctx.params as any;
    const mountRepo = AppDataSource.getRepository(Mount);
    const smRepo = AppDataSource.getRepository(ServerMount);
    const links = await smRepo.findBy({ serverUuid: id });
    if (links.length === 0) return [];
    const mountIds = links.map(l => l.mountId);
    const mounts = await mountRepo.findBy({ id: In(mountIds) });
    return mounts;
  }, { beforeHandle: [authenticate, authorize('servers:read')],
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'List server mounts', tags: ['Servers'] }
  });

  app.get(prefix + '/servers/:id/websocket', async (ctx: any) => {
    const { id } = ctx.params as any;
    const user = ctx.user;

    const cfgRepo = AppDataSource.getRepository(ServerConfig);
    const cfg = await cfgRepo.findOneBy({ uuid: id });
    if (!cfg) {
      ctx.set.status = 404;
      return { error: 'Server not found' };
    }

    const node = await nodeRepo().findOneBy({ id: cfg.nodeId });
    if (!node) {
      ctx.set.status = 500;
      return { error: 'Node not found for this server' };
    }

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: 'eclipanel',
      sub: user.id?.toString() || user.uuid || '',
      aud: [''],
      iat: now,
      nbf: now,
      exp: now + 600,
      jti: uuidv4(),
      user_uuid: user.uuid || user.id?.toString() || '',
      server_uuid: id,
      permissions: ['*'],
      use_console_read_permission: false,
    };

    const token = signWingsJwt(payload, node.token);

    let wsUrl: string;
    const incomingProto = (ctx.headers['x-forwarded-proto'] as string) || ctx.protocol || 'https';
    const forwardedHost = (ctx.headers['x-forwarded-host'] as string) || (ctx.headers['host'] as string) || ctx.hostname;
    const hostSafe = forwardedHost && forwardedHost !== 'undefined' ? forwardedHost : 'localhost';
    const backendBase = (process.env.BACKEND_URL || `${incomingProto}://${hostSafe}`).replace(/\/+$/, '');
    const backendIsHttps = backendBase.startsWith('https');
    const nodeUrlIsHttp = node.url.toLowerCase().startsWith('http://');
    const socketScheme = (backendIsHttps || incomingProto === 'https') ? 'wss' : 'ws';

    if (node.useSSL === false || (backendIsHttps && nodeUrlIsHttp)) {
      const cookieName = process.env.JWT_COOKIE_NAME || 'token';
      const getCookieToken = () => {
        const cookieValue = (ctx.cookie && ctx.cookie[cookieName] && ctx.cookie[cookieName].value) as string | undefined;
        if (cookieValue) return cookieValue;
        const raw = (ctx.headers && (ctx.headers.cookie as string)) || '';
        const parts = String(raw).split(';').map((s: string) => s.trim());
        const pair = parts.find(p => p.startsWith(cookieName + '='));
        if (pair) return pair.split('=')[1];
        return '';
      };

      const panelJwt = (ctx.headers['authorization'] as string || '').replace(/^Bearer\s+/i, '') || getCookieToken();
      wsUrl = backendBase.replace(/^https?/, socketScheme) + `/api/servers/${id}/ws/proxy?token=${encodeURIComponent(panelJwt)}`;
    } else {
      wsUrl = node.url.replace(/^http/, 'ws') + `/api/servers/${id}/ws`;
    }

    return {
      data: {
        token,
        socket: wsUrl,
      },
    };
  }, { beforeHandle: [authenticate, authorize('servers:console')],
    response: { 200: t.Object({ data: t.Object({ token: t.String(), socket: t.String() }) }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }), 500: t.Object({ error: t.String() }) },
    detail: { summary: 'Websocket auth token', tags: ['Servers'] }
  });

  app.get(prefix + '/servers/:id/sftp', async (ctx: any) => {
    const { id } = ctx.params as any;
    const user = ctx.user;

    const cfg = await cfgRepo().findOneBy({ uuid: id });
    if (!cfg) {
      ctx.set.status = 404;
      return { error: 'Server not found' };
    }

    const node = await nodeRepo().findOneBy({ id: cfg.nodeId });
    if (!node) {
      ctx.set.status = 500;
      return { error: 'Node not found' };
    }

    const urlObj = (() => { try { return new URL(node.url); } catch { return null; } })();
    const nodeHost = urlObj?.hostname || node.url;

    const backendBase = (process.env.BACKEND_URL || '').replace(/\/+$/,'');
    const backendHost = backendBase
      ? ((() => { try { return new URL(backendBase).hostname; } catch { return backendBase; } })())
      : null;

    const host = node.sftpProxyPort && backendHost ? backendHost : nodeHost;
    const port = node.sftpProxyPort ?? node.sftpPort ?? 2022;

    const sftpHex = id.replace(/-/g, '').substring(0, 8);
    const username = `${user.email}.${sftpHex}`;

    // Wings SFTP username format: <email>.<first-8-hex-chars-of-uuid>
    // Cuz usernames and shit is not unique enough
    // Hence missleading username LOL
    return {
      host,
      port,
      username,
      proxied: !!node.sftpProxyPort,
    };
  }, { beforeHandle: [authenticate, authorize('servers:read')],
    response: { 200: t.Object({ host: t.String(), port: t.Number(), username: t.String(), proxied: t.Boolean() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }), 500: t.Object({ error: t.String() }) },
    detail: { summary: 'Get SFTP connection info', tags: ['Servers'] }
  });
}