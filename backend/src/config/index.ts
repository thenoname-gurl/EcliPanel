import { connectRedis } from './redis';
import { AppDataSource } from './typeorm';
import { initMail } from '../services/mailService';
import { startRetentionJobs } from '../services/retentionService';
import { WingsSocketService } from '../services/wingsSocketService';
import { WingsApiService } from '../services/wingsApiService';
import { restoreDesiredPowerStatesForNode } from '../services/serverDesiredStateService';
import { NodeHeartbeatService } from '../services/nodeHeartbeatService';
import { startAllSftpProxies } from '../services/sftpProxyService';
import fs from 'fs';
import path from 'path';
import { ServerConfig } from '../models/serverConfig.entity';
import { User } from '../models/user.entity';
import { OrganisationMember } from '../models/organisationMember.entity';
import { createActivityLog } from '../handlers/logHandler';

const WINGS_RETRY_INITIAL = 30_000;
const WINGS_RETRY_MAX     = 10 * 60_000;

function connectNodeWithRetry(app: any, node: any, delay = WINGS_RETRY_INITIAL) {
  const base = node.backendWingsUrl || node.url;
  const sock = new WingsSocketService(base, node.token);
  const api = new WingsApiService(base, node.token);
  sock.listenToAll().then(async () => {
    try {
      const res = await api.getServers();
      const servers: any[] = Array.isArray(res.data) ? res.data : (res.data?.servers ?? []);
      for (const s of servers) {
        const id: string = s.uuid || s.id;
        if (!id) continue;
        try {
          await api.syncServer(id, {});
          app.log.info({ node: node.name, server: id }, 'auto-sync initiated on node connect');
        } catch (e: any) {
          app.log.warn({ err: e, node: node.name, server: id }, 'auto-sync failed on node connect');
        }
      }
      try {
        await restoreDesiredPowerStatesForNode(node.id);
      } catch (e: any) {
        app.log.warn({ err: e, node: node.name }, 'failed to restore desired power state on node connect');
      }
    } catch (e: any) {
      app.log.warn({ err: e, node: node.name }, 'failed to list servers for auto-sync on node connect');
    }
  }).catch((e: any) => {
    const isTransient = ['ECONNREFUSED', 'ETIMEDOUT', 'ECONNABORTED', 'ENOTFOUND', 'ECONNRESET'].includes(e?.code);
    if (isTransient) {
      app.log.warn({ node: node.name, code: e.code, url: node.url },
        `wings node unreachable — retrying in ${Math.round(delay / 1000)}s`);
    } else {
      app.log.error({ e, node: node.name }, 'wings socket error');
    }
    const next = Math.min(delay * 2, WINGS_RETRY_MAX);
    setTimeout(() => connectNodeWithRetry(app, node, next), delay);
  });
}

export async function setupConfig(app: any) {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET environment variable must be set in production');
    }
    (app.log ?? console).warn('JWT_SECRET is not set — using insecure default. DO NOT deploy to production without setting this.');
  }
  
  await AppDataSource.initialize().catch((err) => {
    (app.log ?? console).error({ err }, 'Error during Data Source initialization');
    throw err;
  });

  try {
    const userRepo = AppDataSource.getRepository(User);
    const orgMemberRepo = AppDataSource.getRepository(OrganisationMember);
    const users = await userRepo.find({ relations: ['org'] });
    for (const user of users) {
      const org: any = (user as any).org;
      if (!org?.id) continue;
      const existing = await orgMemberRepo.findOne({ where: { userId: user.id, organisationId: org.id } });
      if (existing) continue;
      const inferredRole = user.id === org.ownerId ? 'owner' : ((user as any).orgRole || 'member');
      const link = orgMemberRepo.create({ userId: user.id, organisationId: org.id, user, organisation: org, orgRole: inferredRole as any, createdAt: new Date() });
      await orgMemberRepo.save(link);
    }

    const nullCreatedAtCount = await userRepo.count({ where: { createdAt: null as any } as any });
    if (nullCreatedAtCount > 0) {
      app.log?.info({ count: nullCreatedAtCount }, 'Backfilling missing user createdAt values');
      await userRepo.createQueryBuilder()
        .update(User)
        .set({ createdAt: new Date() })
        .where('createdAt IS NULL')
        .execute();
    }
  } catch (err: any) {
    app.log?.warn({ err }, 'Failed to backfill organisation memberships from legacy user.org relation or createdAt values');
  }

  try {
    const dbType = String(AppDataSource.options.type || '');
    if (dbType === 'mysql' || dbType === 'mariadb') {
      const rows = await AppDataSource.query(
        `SELECT COUNT(1) AS cnt
           FROM information_schema.statistics
          WHERE table_schema = DATABASE()
            AND table_name = 'soc_data'
            AND index_name = 'IDX_soc_data_server_timestamp'`
      );
      const count = Number((rows?.[0] as any)?.cnt ?? 0);
      if (count === 0) {
        await AppDataSource.query('CREATE INDEX IDX_soc_data_server_timestamp ON soc_data (serverId, timestamp)');
      }
    } else if (dbType === 'postgres') {
      await AppDataSource.query('CREATE INDEX IF NOT EXISTS "IDX_soc_data_server_timestamp" ON "soc_data" ("serverId", "timestamp")');
    }
  } catch (err: any) {
    app.log?.warn({ err }, 'Failed to ensure soc_data(serverId,timestamp) index');
  }

  try {
    await connectRedis();
    (app.log ?? console).info('Redis connected');
  } catch (err: any) {
    (app.log ?? console).error({ err }, 'Redis connection error');
  }

  try {
    await initMail();
    app.log.info('Mail transport ready');
  } catch (err: any) {
    app.log.error({ err }, 'Mail initialization failed');
  }

  startRetentionJobs();

  const heartbeatSvc = new NodeHeartbeatService();
  heartbeatSvc.start();

  try {
    await startAllSftpProxies();
  } catch (e: any) {
    app.log.error({ err: e }, 'Failed to start SFTP proxies');
  }

  const uploadDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  try {
    const nodeRepo = AppDataSource.getRepository(require('../models/node.entity').Node);
    const nodes = await nodeRepo.find();
    try {
      const cfgRepo = AppDataSource.getRepository(ServerConfig);
      const duplicates = await cfgRepo.createQueryBuilder('c')
        .select('c.uuid', 'uuid')
        .addSelect('COUNT(*)', 'cnt')
        .groupBy('c.uuid')
        .having('COUNT(*) > 1')
        .getRawMany();
      if (duplicates && duplicates.length > 0) {
        app.log.info({ count: duplicates.length }, 'startup: found duplicate server configs — merging');
        for (const d of duplicates) {
          const uuid = d.uuid;
          try {
            const rows = await cfgRepo.find({ where: { uuid }, order: { createdAt: 'ASC' } });
            if (!rows || rows.length <= 1) continue;
            const keep = rows[0];
            const others = rows.slice(1);
            for (const o of others) {
              keep.nodeId = keep.nodeId ?? o.nodeId;
              keep.userId = keep.userId ?? o.userId;
              keep.name = keep.name || o.name;
              keep.description = keep.description || o.description;
              keep.dockerImage = keep.dockerImage || o.dockerImage;
              keep.startup = keep.startup || o.startup;
              keep.environment = keep.environment && Object.keys(keep.environment || {}).length > 0 ? keep.environment : o.environment;
              keep.memory = keep.memory ?? o.memory;
              keep.disk = keep.disk ?? o.disk;
              keep.cpu = keep.cpu ?? o.cpu;
              keep.swap = keep.swap ?? o.swap;
              keep.ioWeight = keep.ioWeight ?? o.ioWeight;
              keep.hibernated = keep.hibernated ?? o.hibernated;
              keep.eggId = keep.eggId ?? o.eggId;
              keep.skipEggScripts = keep.skipEggScripts ?? o.skipEggScripts;
              keep.allocations = keep.allocations && Object.keys(keep.allocations || {}).length > 0 ? keep.allocations : o.allocations;
              keep.processConfig = keep.processConfig && Object.keys(keep.processConfig || {}).length > 0 ? keep.processConfig : o.processConfig;
            }
            await cfgRepo.save(keep);
            const toDelete = others.map(r => ({ uuid: r.uuid, createdAt: r.createdAt }));
            await cfgRepo.delete(toDelete as any).catch(() => {});
            app.log.info({ uuid, kept: { uuid: keep.uuid, createdAt: keep.createdAt }, removed: toDelete }, 'startup: merged duplicate server configs');
            try { await createActivityLog({ userId: 0, action: 'servers:merge-duplicates-startup', targetId: uuid, targetType: 'server', metadata: { kept: { uuid: keep.uuid, createdAt: keep.createdAt }, removed: toDelete }, ipAddress: '' }); } catch (e) {}
          } catch (e) {
            app.log.warn({ err: e, uuid }, 'startup: failed to merge duplicate server configs for uuid');
          }
        }
      }
    } catch (e) {
      app.log.warn({ err: e }, 'startup: duplicate server config merge check failed');
    }
    if (nodes.length > 0) {
      for (const n of nodes) {
        connectNodeWithRetry(app, n);
      }
    } else {
      app.log.info('no wings nodes configured, skipping socket listeners');
    }
  } catch (e) {
    app.log.error({ e }, 'error checking nodes for wings socket startup');
  }
}