/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Wings Remote API — called by the Wings daemon back to the panel.
 *
 * Both the Go Wings (Pterodactyl v1.12.x) and the Rust Wings (Calagopus)
 * share the same HTTP contract.  This handler implements every endpoint that
 * Wings explicitly invokes at startup, during operation, and on shutdown.
 *
 * Authentication
 * ──────────────
 * Wings sends:  Authorization: Bearer {token_id}.{token}
 * (e.g. "Bearer eclipanel.abc123def…")
 * We split on the FIRST dot and look up the node by the part after it.
 * If there is no dot we try the whole value (backwards compat).
 *
 * Pagination (GET /api/remote/servers)
 * ────────────────────────────────────
 * Go Wings expects   meta.pagination.{ total, count, per_page, current_page, total_pages }
 * Rust Wings expects meta.{ current_page, last_page, total }
 * We return both so either flavour works.
 *
 * Server Configuration Format
 * ───────────────────────────
 * Go:   { uuid, settings: ServerConfiguration, process_configuration }
 * Rust: { settings: ServerConfiguration, process_configuration }
 * We include `uuid` at top level (Go needs it; Rust ignores it).
 * ─────────────────────────────────────────────────────────────────────────────
 * Thanks Claude Opus 4.6 for documentation assistance!
 * Warnign: This code is probably worst code in the history of code, 
 * please forgive me, I am a bad programmer and I have no shame.
 * (And yet I somehow graduated academy :sob:)
 */
import crypto from 'crypto';
import { In } from 'typeorm';
import { AppDataSource } from '../config/typeorm';
import { Node } from '../models/node.entity';
import { ServerConfig } from '../models/serverConfig.entity';
import { UserLog } from '../models/userLog.entity';
import { User } from '../models/user.entity';
import { parseSshPublicKey, fingerprintSshPublicKey, isSupportedSshKeyType } from '../utils/sshKey';
import { Egg } from '../models/egg.entity';
import { Mount } from '../models/mount.entity';
import { ServerMount } from '../models/serverMount.entity';
import { t } from 'elysia';
import { createActivityLog } from './logHandler';
import { nodeService } from '../services/nodeService';
import { normalizeProcessConfig, normalizeStartupDonePatterns } from '../utils/startupDetection';

// ─── Auth middleware ──────────────────────────────────────────────────────────

async function authenticateWings(ctx: any): Promise<unknown> {
  const headers: any = ctx.request.headers || {};
  const getHeader = (name: string) => {
    if (typeof headers.get === 'function') return headers.get(name);
    return headers[name.toLowerCase()] || headers[name];
  };

  const authHeader = (getHeader('authorization') || getHeader('Authorization') || '') as string;
  let raw = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!raw) {
    const q = (ctx.query as any)?.token || (ctx.query as any)?.access_token || (ctx.query as any)?.api_key;
    if (typeof q === 'string') raw = q.trim();
  }

  if (!raw) {
    ctx.set.status = 401;
    return { errors: [{ code: 'Unauthorized', detail: 'Missing bearer token' }] };
  }

  // Wings usually sends "{token_id}.{token}" 
  const dotIdx = raw.indexOf('.');
  const tokenPart = dotIdx >= 0 ? raw.substring(dotIdx + 1) : raw;

  const nodeRepo = AppDataSource.getRepository(Node);
  let node = await nodeRepo.findOneBy({ token: tokenPart });

  if (!node && tokenPart !== raw) {
    node = await nodeRepo.findOneBy({ token: raw });
  }

  if (!node && dotIdx >= 0) {
    const prefix = raw.substring(0, dotIdx);
    node = await nodeRepo.findOneBy({ token: prefix });
  }
  if (!node) {
    try {
      const headers = Object.keys(ctx.request.headers || {}).slice(0, 20).join(', ');
      const redact = (s: string) => (s ? `***${s.slice(-6)}` : s);
      const tried = [tokenPart, raw, dotIdx >= 0 ? raw.substring(0, dotIdx) : ''].map(redact).join(', ');
      (ctx.app as any)?.log?.warn?.({ headers, tried }, 'Wings auth failed: token lookup mismatch');
    } catch (e) {
      // skip
    }
    ctx.set.status = 401;
    return { errors: [{ code: 'Unauthorized', detail: 'Invalid node token' }] };
  }
  (ctx as any).wingNode = node;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a numeric egg ID into a deterministic UUID-v4-like string.
 * Cuz wings want that and we did not do that properly before
 * No shame, we will never delete this function, it is a part of our legacy now.
 */
function eggIdToUuid(id?: number): string {
  if (!id) return '00000000-0000-4000-8000-000000000000';
  // No I won't call same fucntion from this function to "optimise" it
  const hex = id.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
}

/** Build the full server config object in the format Wings expects. */
function buildServerObject(cfg: ServerConfig, egg?: Egg | null, mounts?: Mount[]): object {
  const env: Record<string, any> = cfg.environment || {};
  const alloc = cfg.allocations || {};

  const eggProc = egg?.processConfig || {};
  const cfgProc = cfg.processConfig || {};
  const proc: Record<string, any> = { ...eggProc, ...cfgProc };

  const image = cfg.dockerImage || egg?.dockerImage || 'ghcr.io/pterodactyl/yolks:nodejs_18';

  const fileDenylist: string[] = egg?.fileDenylist ?? [];

  // On god I hate this messy formatting, but wings is very particular
  // about it and changing it would break compatibility with both Go and Rust wings,
  // which would be a nightmare to coordinate and support, so here we are, 
  // in this beautiful mess of code, forever.
  // KILL ME
  return {
    uuid: cfg.uuid,
    settings: {
      uuid: cfg.uuid,
      start_on_completion: true,
      meta: {
        name: cfg.name || cfg.uuid,
        description: cfg.description || '',
      },
      suspended: cfg.suspended || cfg.dmca,
      invocation: cfg.startup || egg?.startup || '',
      skip_egg_scripts: cfg.skipEggScripts || false,
      environment: env,
      labels: {},
      backups: [],
      schedules: [],
      allocations: {
        force_outgoing_ip: alloc.force_outgoing_ip ?? false,
        default: alloc.default || { ip: '0.0.0.0', port: 0 },
        mappings: alloc.mappings || {},
      },
      build: {
        memory_limit: cfg.memory,
        swap: cfg.swap,
        io_weight: cfg.ioWeight,
        cpu_limit: cfg.cpu,
        disk_space: cfg.disk,
        threads: null,
        oom_disabled: cfg.oomDisabled,
      },
      mounts: (mounts || []).map(m => ({
        source: m.source,
        target: m.target,
        read_only: m.read_only,
      })),
      egg: {
        id: eggIdToUuid(cfg.eggId),
        file_denylist: fileDenylist,
      },
      container: {
        image,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        hugepages_passthrough_enabled: false,
        kvm_passthrough_enabled: cfg.kvmPassthroughEnabled || false,
        seccomp: { remove_allowed: [] },
        rootless: !!(egg?.rootless ?? false),
      },
      auto_kill: { enabled: false, seconds: 0 },
      auto_start_behavior: 'unless_stopped',
    },
    process_configuration: {
      startup: {
        done: normalizeStartupDonePatterns(proc.startup?.done),
        user_interaction: proc.startup?.user_interaction ?? proc.startup?.userInteraction ?? [],
        strip_ansi: proc.startup?.strip_ansi ?? false,
      },
      stop: {
        type: proc.stop?.type || 'command',
        value: proc.stop?.value || 'stop',
      },
      configs: proc.configs || [],
    },
  };
}

// ─── JWT helpers for WebSocket auth ───────────────────────────────────────────

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function signWingsJwt(payload: object, secret: string): string {
  const header = base64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = base64url(Buffer.from(JSON.stringify(payload)));
  const sig = base64url(
    crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest(),
  );
  return `${header}.${body}.${sig}`;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function remoteRoutes(app: any, prefix: string) {
  const repo = () => AppDataSource.getRepository(ServerConfig);

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /api/remote/servers  — Wings fetches all its server configs at startup
  // ═══════════════════════════════════════════════════════════════════════════
  app.get(prefix + '/remote/servers', async (ctx) => {
    const node = (ctx as any).wingNode as Node;
    const { page = '0', per_page = '50' } = ctx.query as any;

    const pageNum = Math.max(0, Number(page));
    const perPage = Math.min(100, Math.max(1, Number(per_page)));

    const [configs, total] = await repo().findAndCount({
      where: { nodeId: node.id },
      skip: pageNum * perPage,
      take: perPage,
      order: { createdAt: 'ASC' },
    });

    const eggIds = [...new Set(configs.map(c => c.eggId).filter(Boolean))] as number[];
    const eggMap: Record<number, Egg> = {};
    if (eggIds.length) {
      const eggs = await AppDataSource.getRepository(Egg).findBy({ id: In(eggIds) });
      for (const e of eggs) eggMap[e.id] = e;
    }

    const totalPages = Math.max(1, Math.ceil(total / perPage));

    // TODO: Check if moutns work
    const serverUuids = configs.map(c => c.uuid);
    const mountMap: Record<string, Mount[]> = {};
    if (serverUuids.length) {
      const serverMounts = await AppDataSource.getRepository(ServerMount).find({
        where: { serverUuid: In(serverUuids) },
      });
      const mountIds = [...new Set(serverMounts.map(sm => sm.mountId))];
      const allMounts: Record<number, Mount> = {};
      if (mountIds.length) {
        const mounts = await AppDataSource.getRepository(Mount).findBy({ id: In(mountIds) });
        for (const m of mounts) allMounts[m.id] = m;
      }
      for (const sm of serverMounts) {
        const mount = allMounts[sm.mountId];
        if (mount) {
          (mountMap[sm.serverUuid] ??= []).push(mount);
        }
      }
    }

    return {
      data: configs.map(cfg => buildServerObject(cfg, eggMap[cfg.eggId ?? -1] ?? null, mountMap[cfg.uuid])),
      meta: {
        current_page: pageNum + 1,
        last_page: totalPages,
        total,
        pagination: {
          total,
          count: configs.length,
          per_page: perPage,
          current_page: pageNum + 1,
          total_pages: totalPages,
          links: {},
        },
      },
    };
  }, {
    beforeHandle: authenticateWings,
    detail: { summary: 'List all servers for a node (Wings callback)', tags: ['Remote'] },
    response: { 200: t.Any(), 401: t.Object({ errors: t.Array(t.Any()) }) }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /api/remote/servers/:uuid  — single server config
  // ═══════════════════════════════════════════════════════════════════════════
  app.get(prefix + '/remote/servers/:uuid', async (ctx) => {
    const { uuid } = ctx.params as any;
    const node = (ctx as any).wingNode as Node;
    const cfg = await repo().findOneBy({ uuid, nodeId: node.id });
    if (!cfg) {
      ctx.set.status = 404;
      return { errors: [{ code: 'NotFound', detail: `Server ${uuid} not found` }] };
    }
    let egg: Egg | null = null;
    if (cfg.eggId) egg = await AppDataSource.getRepository(Egg).findOneBy({ id: cfg.eggId });

    const serverMounts = await AppDataSource.getRepository(ServerMount).findBy({ serverUuid: uuid });
    const mountIds = serverMounts.map(sm => sm.mountId);
    const mounts = mountIds.length
      ? await AppDataSource.getRepository(Mount).findBy({ id: In(mountIds) })
      : [];

    try {
      const obj = buildServerObject(cfg, egg, mounts);
      return obj;
    } catch (err: any) {
      (app as any).log?.error?.({ err, uuid, nodeId: node.id }, 'Failed to build server object for Wings');
      ctx.set.status = 500;
      return { errors: [{ code: 'ServerError', detail: 'Failed to build server configuration' }] };
    }
  }, {
    beforeHandle: authenticateWings,
    detail: { summary: 'Get a single server config (Wings callback)', tags: ['Remote'] },
    response: { 200: t.Any(), 401: t.Object({ errors: t.Array(t.Any()) }), 404: t.Object({ errors: t.Array(t.Any()) }), 500: t.Object({ errors: t.Array(t.Any()) }) }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /api/remote/servers/reset  — Wings tells us it (re)started
  // ═══════════════════════════════════════════════════════════════════════════
  app.post(prefix + '/remote/servers/reset', async (ctx) => {
    ctx.set.status = 204;

    void (async () => {
      try {
        const node = (ctx as any).wingNode as Node;
        if (!node) return;

        const nodeSvc = nodeService;
        const svc = await nodeSvc.getServiceForNode(node.id);
        const configs = await repo().findBy({ nodeId: node.id });
        for (const cfg of configs) {
          try {
            await svc.syncServer(cfg.uuid, {});
          } catch (e: any) {
            (app as any).log?.warn?.({ err: e, server: cfg.uuid, nodeId: node.id }, 'auto-sync failed for server');
          }
        }
      } catch (e: any) {
        (app as any).log?.warn?.({ err: e }, 'auto-sync failed after wings reset');
      }
    })();

    return;
  }, {
    beforeHandle: authenticateWings,
    detail: { summary: 'Notify panel that Wings has restarted', tags: ['Remote'] },
    response: { 204: t.Any(), 401: t.Object({ errors: t.Array(t.Any()) }) }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /api/remote/servers/:uuid/install  — install script for a new server
  // Wings uses this when a server is first created / reinstalled.
  // ═══════════════════════════════════════════════════════════════════════════
  app.get(prefix + '/remote/servers/:uuid/install', async (ctx) => {
    const { uuid } = ctx.params as any;
    const node = (ctx as any).wingNode as Node;
    const cfg = await repo().findOneBy({ uuid, nodeId: node.id });
    if (!cfg) {
      ctx.set.status = 404;
      return { errors: [{ code: 'NotFound', detail: `Server ${uuid} not found` }] };
    }

    let egg: Egg | null = null;
    if (cfg.eggId) {
      egg = await AppDataSource.getRepository(Egg).findOneBy({ id: cfg.eggId });
    }

    const installScript = egg?.installScript;

    return {
      container_image: installScript?.container
        ?? egg?.dockerImage
        ?? cfg.dockerImage
        ?? 'ghcr.io/pterodactyl/installers:debian',
      entrypoint: installScript?.entrypoint ?? 'bash',
      script: installScript?.script
        ?? '#!/bin/bash\necho "EcliPanel: no install script configured for this egg."\nexit 0\n',
      environment: cfg.environment || {},
    };
  }, {
    beforeHandle: authenticateWings,
    detail: { summary: 'Get install script for a server (Wings callback)', tags: ['Remote'] },
    response: { 200: t.Any(), 401: t.Object({ errors: t.Array(t.Any()) }), 404: t.Object({ errors: t.Array(t.Any()) }) }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /api/remote/servers/:uuid/install  — Wings reports install completion
  // body: { successful: boolean, reinstall: boolean }
  // ═══════════════════════════════════════════════════════════════════════════
  app.post(prefix + '/remote/servers/:uuid/install', async (ctx) => {
    const { uuid } = ctx.params as any;
    const node = (ctx as any).wingNode as Node;
    const { successful } = ctx.body as any;
    const cfg = await repo().findOneBy({ uuid, nodeId: node.id });
    if (cfg) {
      await AppDataSource.getRepository(UserLog).save(
        AppDataSource.getRepository(UserLog).create({
          userId: cfg.userId,
          action: successful ? 'wings:install:complete' : 'wings:install:failed',
          timestamp: new Date(),
        }),
      );
    }
    ctx.set.status = 204;
    return;
  }, {
    beforeHandle: authenticateWings,
    detail: { summary: 'Report install completion (Wings callback)', tags: ['Remote'] },
    response: { 204: t.Any(), 401: t.Object({ errors: t.Array(t.Any()) }) }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /api/remote/servers/:uuid/sync  — Wings pulls updated config
  // ═══════════════════════════════════════════════════════════════════════════
  app.post(prefix + '/remote/servers/:uuid/sync', async (ctx) => {
    const { uuid } = ctx.params as any;
    const node = (ctx as any).wingNode as Node;
    const cfg = await repo().findOneBy({ uuid, nodeId: node.id });
    if (!cfg) {
      ctx.set.status = 404;
      return { errors: [{ code: 'NotFound', detail: `Server ${uuid} not found` }] };
    }
    let egg: Egg | null = null;
    if (cfg.eggId) egg = await AppDataSource.getRepository(Egg).findOneBy({ id: cfg.eggId });

    const serverMounts = await AppDataSource.getRepository(ServerMount).findBy({ serverUuid: uuid });
    const mountIds = serverMounts.map(sm => sm.mountId);
    const mounts = mountIds.length
      ? await AppDataSource.getRepository(Mount).findBy({ id: In(mountIds) })
      : [];

    ctx.set.status = 200;
    return buildServerObject(cfg, egg, mounts);
  }, {
    beforeHandle: authenticateWings,
    detail: { summary: 'Sync server config (Wings callback)', tags: ['Remote'] },
    response: { 200: t.Any(), 401: t.Object({ errors: t.Array(t.Any()) }), 404: t.Object({ errors: t.Array(t.Any()) }) }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /api/remote/servers/:uuid/ws/denied  — WS token denied by Wings
  // ═══════════════════════════════════════════════════════════════════════════
  app.post(prefix + '/remote/servers/:uuid/ws/denied', async (ctx) => {
    ctx.set.status = 204;
    return;
  }, {
    beforeHandle: authenticateWings,
    detail: { summary: 'Wings reports WS token denied', tags: ['Remote'] },
    response: { 204: t.Any(), 401: t.Object({ errors: t.Array(t.Any()) }) }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /api/remote/activity  — Wings reports lifecycle events
  // body: { data: [ApiActivity, ...] }
  // ═══════════════════════════════════════════════════════════════════════════
  app.post(prefix + '/remote/activity', async (ctx) => {
    const node = (ctx as any).wingNode as Node;
    const body = ctx.body as any;
    const events: any[] = Array.isArray(body) ? body : (body.data ?? [body]);
    for (const evt of events) {
      const uuid = evt.server ?? evt.uuid ?? '';
      if (!uuid) continue;
      const cfg = await repo().findOneBy({ uuid, nodeId: node.id });
      if (!cfg) continue;
      try {
        await createActivityLog({
          userId: cfg.userId,
          action: `wings:${evt.event ?? 'activity'}`,
          targetId: uuid,
          targetType: 'server',
          metadata: { event: evt.event, payload: evt, nodeId: node.id, nodeName: node.name },
          ipAddress: ctx.ip,
          notify: false,
        });
      } catch (e) {
        // skip
      }
    }
    ctx.set.status = 204;
    return;
  }, {
    beforeHandle: authenticateWings,
    detail: { summary: 'Log Wings lifecycle activity', tags: ['Remote'] },
    response: { 204: t.Any(), 401: t.Object({ errors: t.Array(t.Any()) }) }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /api/remote/sftp/auth  — Wings validates SFTP login credentials
  // body: { type: "password"|"public_key", username: "email.8hexchars", password: "..." }
  // ═══════════════════════════════════════════════════════════════════════════
  app.post(prefix + '/remote/sftp/auth', async (ctx) => {
    try {
      const node = (ctx as any).wingNode as Node;
      if (!node) {
        ctx.set.status = 401;
        return { errors: [{ code: 'Unauthorized', detail: 'Invalid node token' }] };
      }

      const { type: authType, username, password } = ctx.body as any;

      if (!username || !password) {
        ctx.set.status = 403;
        return { errors: [{ code: 'Forbidden', detail: 'Invalid credentials' }] };
      }

      // Username format: <user-identifier>.<first-8-hex-of-server-uuid>
      // Learnt hard way of using entire server uuid and then wondering why it did not work
      // HEAVENS FORBID WE CHANGE THIS FORMAT NOW, WINGS DEPENDS ON IT, 
      // AND CHANGING IT WOULD BREAK COMPATIBILITY WITH BOTH GO AND RUST WINGS, 
      // WHICH WOULD BE A NIGHTMARE TO COORDINATE AND SUPPORT
      const lastDot = username.lastIndexOf('.');
      if (lastDot < 1) {
        ctx.set.status = 403;
        return { errors: [{ code: 'Forbidden', detail: 'Invalid username format' }] };
      }

      const userPart = username.substring(0, lastDot);
      const serverHex = username.substring(lastDot + 1);

      if (!/^[a-f0-9]{8}$/i.test(serverHex)) {
        ctx.set.status = 403;
        return { errors: [{ code: 'Forbidden', detail: 'Invalid server identifier in username' }] };
      }

      // Find user by email cuz im afraid to do another identifier type 
      // and also email is unique so it works
      // DISPLAYNAMES ARE NOT UNIQUE SO NO, ALSO LEGAL NAMES ARE NOT UNIQUE SO NO
      // ID LOOKS UGLY SO LETS JUST USE EMAIL, ALSO USERNAME IS A BIT MISLEADING BECAUSE 
      // ITS NOT REALLY A USERNAME ITS AN EMAIL BUT WHATEVER
      const userRepo = AppDataSource.getRepository(User);
      const user = await userRepo
        .createQueryBuilder('user')
        .where('LOWER(user.email) = LOWER(:email)', { email: userPart })
        .getOne();
      if (!user) {
        ctx.set.status = 403;
        return { errors: [{ code: 'Forbidden', detail: 'Unknown user' }] };
      }

      if (authType === 'password') {
        const bcrypt = require('bcryptjs');
        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
          ctx.set.status = 403;
          return { errors: [{ code: 'Forbidden', detail: 'Invalid password' }] };
        }
      } else if (authType === 'public_key') {
        const { SshKey } = require('../models/sshKey.entity');
        const sshKeyRepo = AppDataSource.getRepository(SshKey);
        const userKeys = await sshKeyRepo.find({ where: { userId: user.id } });

        const submittedKey = password.trim();
        const parsedSubmitted = parseSshPublicKey(submittedKey);

        if (!parsedSubmitted || !isSupportedSshKeyType(parsedSubmitted.type)) {
          ctx.set.status = 403;
          return { errors: [{ code: 'Forbidden', detail: 'Invalid public key format' }] };
        }

        const submittedFinger = fingerprintSshPublicKey(submittedKey);

        const matched = userKeys.some((k: any) => {
          const storedKey = (k.publicKey ?? '').trim();
          const parsedStored = parseSshPublicKey(storedKey);
          if (!parsedStored) return false;

          if (k.fingerprint && submittedFinger && k.fingerprint === submittedFinger) {
            return true;
          }

          return parsedStored.type === parsedSubmitted.type && parsedStored.material === parsedSubmitted.material;
        });

        if (!matched) {
          ctx.set.status = 403;
          return { errors: [{ code: 'Forbidden', detail: 'Public key not recognised' }] };
        }
      } else {
        ctx.set.status = 403;
        return { errors: [{ code: 'Forbidden', detail: 'Unsupported authentication type' }] };
      }

      const configs = await repo().find({ where: { nodeId: node.id } });
      let cfg = configs.find(c => c.uuid.replace(/-/g, '').substring(0, 8).toLowerCase() === serverHex.toLowerCase());
      if (!cfg) {
        ctx.set.status = 403;
        return { errors: [{ code: 'Forbidden', detail: 'Server not found' }] };
      }

      const isOwner = cfg.userId === user.id;
      let isSubuser = false;
      if (!isOwner) {
        const { ServerSubuser } = require('../models/serverSubuser.entity');
        const subuserRepo = AppDataSource.getRepository(ServerSubuser);
        const sub = await subuserRepo.findOne({ where: { serverUuid: cfg.uuid, userId: user.id, accepted: true } });
        if (sub && Array.isArray(sub.permissions) && (sub.permissions.includes('*') || sub.permissions.includes('files') || sub.permissions.includes('console'))) {
          isSubuser = true;
        }
      }

      if (!isOwner && !isSubuser) {
        ctx.set.status = 403;
        return { errors: [{ code: 'Forbidden', detail: 'Server not found or not authorized for user' }] };
      }

      if (cfg.suspended || cfg.dmca) {
        const actor = String(cfg.dmca ? cfg.dmcaBy : cfg.suspendedBy || 'system').trim() || 'system';
        const reason = String(cfg.dmca ? cfg.dmcaReason : cfg.suspendedReason || 'No reason provided').trim() || 'No reason provided';
        ctx.set.status = 403;
        return {
          errors: [{
            code: 'Forbidden',
            detail: cfg.dmca
              ? `This server has been placed under a DMCA takedown by ${actor} for reason: ${reason}. Please contact support.`
              : `This server was suspended by ${actor} for reason: ${reason}. Please contact support.`,
          }],
        };
      }

      ctx.set.status = 200;
      return {
        user: crypto.createHash('sha256').update(String(user.id)).digest('hex').slice(0, 32),
        server: cfg.uuid,
        permissions: ['*'],
        ignored_files: [],
      };
    } catch (err) {
      try {
        (ctx.app as any)?.log?.error?.({ err }, 'SFTP auth handler error');
      } catch { }
      ctx.set.status = 500;
      return { errors: [{ code: 'InternalServerError', detail: 'Unexpected error' }] };
    }
  }, {
    beforeHandle: authenticateWings,
    detail: { summary: 'Authenticate SFTP login from Wings', tags: ['Remote'] },
    response: { 200: t.Any(), 401: t.Object({ errors: t.Array(t.Any()) }), 403: t.Object({ errors: t.Array(t.Any()) }) }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /api/remote/servers/:uuid/backups — Wings requests a backup slot
  // Returns: { adapter: "wings", uuid: "<new-backup-uuid>" }
  // ═══════════════════════════════════════════════════════════════════════════
  app.post(prefix + '/remote/servers/:uuid/backups', async (ctx) => {
    const { uuid } = ctx.params as any;
    const backupUuid = crypto.randomUUID();
    try {
      const repo = AppDataSource.getRepository(require('../models/serverBackup.entity').ServerBackup);
      await repo.save(repo.create({ uuid: backupUuid, serverUuid: uuid, adapter: 'wings' }));
      (app as any).log?.info?.({ serverUuid: uuid, backupUuid }, 'remote: reserved backup slot and persisted');
    } catch (e) {
      (app as any).log?.warn?.({ err: e, serverUuid: uuid, backupUuid }, 'remote: failed to persist reserved backup slot');
    }
    ctx.set.status = 201;
    return { adapter: 'wings', uuid: backupUuid };
  }, {
    beforeHandle: authenticateWings,
    detail: { summary: 'Request a new backup slot (Wings callback)', tags: ['Remote'] },
    response: { 201: t.Object({ adapter: t.String(), uuid: t.String() }), 401: t.Object({ errors: t.Array(t.Any()) }) }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /api/remote/backups/:uuid — S3 multipart upload URLs (wings adapter = noop)
  // POST /api/remote/backups/:uuid — Wings reports backup completion
  // DELETE /api/remote/backups/:uuid — Wings reports backup deletion
  // POST /api/remote/backups/:uuid/restore — Wings reports restore completion
  // ═══════════════════════════════════════════════════════════════════════════
  app.get(prefix + '/remote/backups/:uuid', async (ctx) => {
    ctx.set.status = 200;
    return { parts: [], part_size: 0 };
  }, {
    beforeHandle: authenticateWings,
    detail: { summary: 'Get S3 multipart upload info for a backup (Wings callback)', tags: ['Remote'] },
    response: { 200: t.Object({ parts: t.Array(t.Any()), part_size: t.Number() }), 401: t.Object({ errors: t.Array(t.Any()) }) }
  });

  app.post(prefix + '/remote/backups/:uuid', async (ctx) => {
    const id = ctx.params?.uuid as string;
    const body = ctx.body as any;
    (app as any).log?.info?.({ backupUuid: id, body }, 'remote: backup completion callback received');
    try {
      const repo = AppDataSource.getRepository(require('../models/serverBackup.entity').ServerBackup);
      let rec = await repo.findOneBy({ uuid: id });
      const payload: any = {
        name: body?.name ?? body?.uuid ?? undefined,
        bytes: Number(body?.bytes || body?.size || 0) || 0,
        checksum: body?.checksum || body?.sha1 || body?.sha256 || undefined,
        checksumType: body?.checksum_type || body?.checksumType || undefined,
        browsable: !!body?.browsable,
        streaming: !!body?.streaming,
        parts: body?.parts ?? undefined,
        raw: body ?? undefined,
        progress: Number(body?.progress ?? body?.percent ?? 0) || 0,
        status: body?.status ?? undefined,
      };
      if (rec) {
        Object.assign(rec, payload);
        await repo.save(rec);
        (app as any).log?.info?.({ backupUuid: id }, 'remote: updated persisted backup record');
      } else {
        const newRec = repo.create({ uuid: id, adapter: body?.adapter || 'wings', ...payload });
        await repo.save(newRec);
        (app as any).log?.info?.({ backupUuid: id }, 'remote: created persisted backup record (no prior reservation)');
      }
    } catch (e) {
      (app as any).log?.warn?.({ err: e, backupUuid: id }, 'remote: failed to persist backup completion');
    }
    ctx.set.status = 204;
    return;
  }, {
    beforeHandle: authenticateWings,
    detail: { summary: 'Report backup completion (Wings callback)', tags: ['Remote'] },
    response: { 204: t.Any(), 401: t.Object({ errors: t.Array(t.Any()) }) }
  });

  app.delete(prefix + '/remote/backups/:uuid', async (ctx) => {
    const id = ctx.params?.uuid as string;
    (app as any).log?.info?.({ backupUuid: id }, 'remote: delete backup callback received');
    try {
      const repo = AppDataSource.getRepository(require('../models/serverBackup.entity').ServerBackup);
      await repo.delete({ uuid: id });
      (app as any).log?.info?.({ backupUuid: id }, 'remote: deleted persisted backup record');
    } catch (e) {
      (app as any).log?.warn?.({ err: e, backupUuid: id }, 'remote: failed to delete persisted backup record');
    }
    ctx.set.status = 204;
    return;
  }, {
    beforeHandle: authenticateWings,
    detail: { summary: 'Report backup deletion (Wings callback)', tags: ['Remote'] },
    response: { 204: t.Any(), 401: t.Object({ errors: t.Array(t.Any()) }) }
  });

  app.post(prefix + '/remote/backups/:uuid/restore', async (ctx) => {
    const id = ctx.params?.uuid as string;
    const body = ctx.body as any;
    try {
      const repo = AppDataSource.getRepository(require('../models/serverBackup.entity').ServerBackup);
      const rec = await repo.findOneBy({ uuid: id });
      if (rec) {
        rec.status = body?.status ?? 'restored';
        rec.progress = Number(body?.progress ?? 100) || 100;
        await repo.save(rec);
        (app as any).log?.info?.({ backupUuid: id }, 'remote: backup restore callback updated record');
      }
    } catch (e) {
      (app as any).log?.warn?.({ err: e, backupUuid: id }, 'remote: failed to update backup restore status');
    }
    ctx.set.status = 204;
    return;
  }, {
    beforeHandle: authenticateWings,
    detail: { summary: 'Report backup restore completion (Wings callback)', tags: ['Remote'] },
    response: { 204: t.Any(), 401: t.Object({ errors: t.Array(t.Any()) }) }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PUT /api/remote/servers/:uuid/startup/variables — schedule updates env var
  // PUT /api/remote/servers/:uuid/startup/command   — schedule updates startup
  // PUT /api/remote/servers/:uuid/startup/docker-image — schedule changes image
  // ═══════════════════════════════════════════════════════════════════════════
  app.put(prefix + '/remote/servers/:uuid/startup/variables', async (ctx) => {
    const { uuid } = ctx.params as any;
    const node = (ctx as any).wingNode as Node;
    const { env_variable, value } = ctx.body as any;
    const cfg = await repo().findOneBy({ uuid, nodeId: node.id });
    if (cfg && env_variable) {
      const env = cfg.environment || {};
      env[env_variable] = value;
      cfg.environment = env;
      await repo().save(cfg);
    }
    ctx.set.status = 204;
    return;
  }, {
    beforeHandle: authenticateWings,
    detail: { summary: 'Schedule environment variable update (Wings callback)', tags: ['Remote'] },
    response: { 204: t.Any(), 401: t.Object({ errors: t.Array(t.Any()) }) }
  });

  app.put(prefix + '/remote/servers/:uuid/startup/command', async (ctx) => {
    const { uuid } = ctx.params as any;
    const node = (ctx as any).wingNode as Node;
    const { command } = ctx.body as any;
    const cfg = await repo().findOneBy({ uuid, nodeId: node.id });
    if (cfg && command !== undefined) {
      cfg.startup = command;
      await repo().save(cfg);
    }
    ctx.set.status = 204;
    return;
  }, {
    beforeHandle: authenticateWings,
    detail: { summary: 'Schedule startup command update (Wings callback)', tags: ['Remote'] },
    response: { 204: t.Any(), 401: t.Object({ errors: t.Array(t.Any()) }) }
  });

  app.put(prefix + '/remote/servers/:uuid/startup/docker-image', async (ctx) => {
    const { uuid } = ctx.params as any;
    const node = (ctx as any).wingNode as Node;
    const { image } = ctx.body as any;
    const cfg = await repo().findOneBy({ uuid, nodeId: node.id });
    if (cfg && image) {
      cfg.dockerImage = image;
      await repo().save(cfg);
    }
    ctx.set.status = 204;
    return;
  }, {
    beforeHandle: authenticateWings,
    detail: { summary: 'Schedule docker image update (Wings callback)', tags: ['Remote'] },
    response: { 204: t.Any(), 401: t.Object({ errors: t.Array(t.Any()) }) }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /api/remote/servers/:uuid/transfer/success
  // POST /api/remote/servers/:uuid/transfer/failure
  // ═══════════════════════════════════════════════════════════════════════════
  app.post(prefix + '/remote/servers/:uuid/transfer/success', async (ctx) => {
    ctx.set.status = 204;
    return;
  }, {
    beforeHandle: authenticateWings,
    detail: { summary: 'Notify transfer success (Wings callback)', tags: ['Remote'] },
    response: { 204: t.Any(), 401: t.Object({ errors: t.Array(t.Any()) }) }
  });

  app.post(prefix + '/remote/servers/:uuid/transfer/failure', async (ctx) => {
    ctx.set.status = 204;
    return;
  }, {
    beforeHandle: authenticateWings,
    detail: { summary: 'Notify transfer failure (Wings callback)', tags: ['Remote'] },
    response: { 204: t.Any(), 401: t.Object({ errors: t.Array(t.Any()) }) }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /api/remote/schedule — Wings reports schedule step completion
  // body: { data: [{ uuid, successful, errors, timestamp }] }
  // ═══════════════════════════════════════════════════════════════════════════
  app.post(prefix + '/remote/schedule', async (ctx) => {
    ctx.set.status = 204;
    return;
  }, {
    beforeHandle: authenticateWings,
    detail: { summary: 'Wings schedule callback (noop)', tags: ['Remote'] },
    response: { 204: t.Any(), 401: t.Object({ errors: t.Array(t.Any()) }) }
  });
}

// ─── Helpers exported for use by serverHandler / adminHandler ─────────────────

/**
 * Persist a server configuration to the DB so Wings can fetch it via the remote API.
 */
export async function saveServerConfig(params: {
  uuid: string;
  nodeId: number;
  userId: number;
  name?: string;
  description?: string;
  dockerImage: string;
  startup: string;
  environment: Record<string, string>;
  memory: number;
  disk: number;
  cpu: number;
  swap?: number;
  ioWeight?: number;
  eggId?: number;
  skipEggScripts?: boolean;
  kvmPassthroughEnabled?: boolean;
  allocations?: Record<string, any>;
  processConfig?: Record<string, any>;
  lastActivityAt?: Date;
  hibernated?: boolean;
}): Promise<ServerConfig> {
  if (!Number.isFinite(params.memory) || params.memory < 0) throw new Error('Invalid memory value');
  if (!Number.isFinite(params.disk) || params.disk < 0) throw new Error('Invalid disk value');
  if (!Number.isFinite(params.cpu) || params.cpu < 0) throw new Error('Invalid cpu value');
  const r = AppDataSource.getRepository(ServerConfig);
  const existing = await r.find({ where: { uuid: params.uuid }, order: { createdAt: 'ASC' } });
  if (!existing || existing.length === 0) {
    const cfg = r.create({
      uuid: params.uuid,
      nodeId: params.nodeId,
      userId: params.userId,
      name: params.name,
      description: params.description,
      dockerImage: params.dockerImage,
      startup: params.startup,
      environment: params.environment,
      memory: params.memory,
      disk: params.disk,
      cpu: params.cpu,
      swap: params.swap ?? 0,
      ioWeight: params.ioWeight ?? 500,
      oomDisabled: false,
      suspended: false,
      hibernated: params.hibernated ?? false,
      eggId: params.eggId,
      skipEggScripts: params.skipEggScripts ?? false,
      kvmPassthroughEnabled: params.kvmPassthroughEnabled ?? false,
      allocations: params.allocations ?? null,
      processConfig: normalizeProcessConfig(params.processConfig ?? null),
      lastActivityAt: params.lastActivityAt ?? null,
    });
    return r.save(cfg);
  }

  const keep = existing[0];
  keep.nodeId = params.nodeId;
  keep.userId = params.userId;
  keep.name = params.name ?? keep.name;
  keep.description = params.description ?? keep.description;
  keep.dockerImage = params.dockerImage ?? keep.dockerImage;
  keep.startup = params.startup ?? keep.startup;
  keep.environment = params.environment ?? keep.environment;
  keep.kvmPassthroughEnabled = params.kvmPassthroughEnabled ?? keep.kvmPassthroughEnabled;
  keep.memory = params.memory;
  keep.disk = params.disk;
  keep.cpu = params.cpu;
  keep.swap = params.swap ?? keep.swap ?? 0;
  keep.lastActivityAt = params.lastActivityAt ?? keep.lastActivityAt;
  keep.hibernated = params.hibernated ?? keep.hibernated ?? false;
  keep.eggId = params.eggId ?? keep.eggId;
  keep.skipEggScripts = params.skipEggScripts ?? keep.skipEggScripts ?? false;
  keep.allocations = params.allocations ?? keep.allocations ?? null;
  keep.processConfig = normalizeProcessConfig(params.processConfig ?? keep.processConfig ?? null);

  await r.save(keep);

  if (existing.length > 1) {
    const toDelete = existing.slice(1).map((x: any) => ({ uuid: x.uuid, createdAt: x.createdAt }));
    await r.delete(toDelete as any).catch(() => { });
    try {
      await createActivityLog({ userId: 0, action: 'servers:merge-duplicates', targetId: params.uuid, targetType: 'server', metadata: { kept: { uuid: keep.uuid, createdAt: keep.createdAt }, removed: toDelete }, ipAddress: '' });
    } catch (e) {
      // skip
    }
    console.debug('remote: merged duplicate server configs', { uuid: params.uuid, kept: { uuid: keep.uuid, createdAt: keep.createdAt }, removed: toDelete });
  }

  return keep;
}

/**
 * Merge duplicate ServerConfig rows for a given uuid or all uuids.
 * This mirrors the startup merge behavior and is safe to call on-demand.
 */
export async function mergeDuplicateServerConfigs(targetUuid?: string): Promise<void> {
  const r = AppDataSource.getRepository(ServerConfig);
  const normalize = (u: string | null | undefined) => (u || '').toString().replace(/-/g, '').toLowerCase();

  const groups: Map<string, ServerConfig[]> = new Map();

  if (targetUuid) {
    const allMatches = await r.find();
    const tgtNorm = normalize(targetUuid);
    for (const row of allMatches) {
      if (normalize(row.uuid) === tgtNorm) {
        const arr = groups.get(tgtNorm) || [];
        arr.push(row);
        groups.set(tgtNorm, arr);
      }
    }
  } else {
    const all = await r.find();
    for (const row of all) {
      const key = normalize(row.uuid);
      if (!key) continue;
      const arr = groups.get(key) || [];
      arr.push(row);
      groups.set(key, arr);
    }
  }

  for (const [norm, rows] of groups.entries()) {
    if (!rows || rows.length <= 1) continue;
    try {
      rows.sort((a: any, b: any) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return aTime - bTime;
      });
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
      await r.save(keep);
      const toDelete = others.map(rw => ({ uuid: rw.uuid, createdAt: rw.createdAt }));
      await r.delete(toDelete as any).catch(() => { });
      try { await createActivityLog({ userId: 0, action: 'servers:merge-duplicates-on-list', targetId: keep.uuid, targetType: 'server', metadata: { kept: { uuid: keep.uuid, createdAt: keep.createdAt }, removed: toDelete }, ipAddress: '' }); } catch (e) { }
      console.info('remote: merged duplicate server configs (on-list)', { normalized: norm, kept: { uuid: keep.uuid, createdAt: keep.createdAt }, removed: toDelete });
    } catch (e) {
      console.warn('remote: failed to merge duplicate server configs (on-list)', { err: e, normalized: norm });
    }
  }
}

export async function removeServerConfig(uuid: string): Promise<void> {
  await AppDataSource.getRepository(ServerConfig).delete({ uuid });
}
