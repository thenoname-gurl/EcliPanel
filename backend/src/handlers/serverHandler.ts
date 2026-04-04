import { WingsApiService } from '../services/wingsApiService';
import { extractStats } from '../services/metricsCollector';
import { nodeService } from '../services/nodeService';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import { AppDataSource } from '../config/typeorm';
import { User } from '../models/user.entity';
import { UserLog } from '../models/userLog.entity';
import { Node } from '../models/node.entity';
import { Egg } from '../models/egg.entity';
import { v4 as uuidv4 } from 'uuid';
import { saveServerConfig, removeServerConfig, signWingsJwt, mergeDuplicateServerConfigs } from './remoteHandler';
import { ServerConfig } from '../models/serverConfig.entity';
import { Mount } from '../models/mount.entity';
import { ServerMount } from '../models/serverMount.entity';
import { In, MoreThanOrEqual } from 'typeorm';
import { SocData } from '../models/socData.entity';
import { ServerMapping } from '../models/serverMapping.entity';
import { createActivityLog } from './logHandler';
import { ServerSubuser } from '../models/serverSubuser.entity';
import { PanelSetting } from '../models/panelSetting.entity';
import { getGeoBlockLevel } from '../utils/eu';
import { t } from 'elysia';
import { DEFAULT_STARTUP_DETECTION_PATTERN, normalizeStartupDonePatterns } from '../utils/startupDetection';

export async function serverRoutes(app: any, prefix = '') {
  const nodeSvc = nodeService;
  const logRepo = () => AppDataSource.getRepository(UserLog);
  const userRepo = () => AppDataSource.getRepository(User);
  const nodeRepo = () => AppDataSource.getRepository(Node);
  const orgMemberRepo = () => AppDataSource.getRepository(require('../models/organisationMember.entity').OrganisationMember);
  const eggRepo = () => AppDataSource.getRepository(Egg);
  const cfgRepo = () => AppDataSource.getRepository(ServerConfig);
  const panelSettingRepo = () => AppDataSource.getRepository(PanelSetting);

  const GAMBLING_THEME_NAMES = new Set(['gambling mode dark', 'gambling mode white']);
  const GAMBLING_BONUS_PERCENT = 0.0015;
  const GAMBLING_DEFAULT_RESOURCE_LUCKY_CHANCE = 0.0777;
  const GAMBLING_DEFAULT_POWER_DENY_CHANCE = 0.5;
  const GAMBLING_BONUS_MS = 24 * 60 * 60 * 1000;
  const POWER_DICE_ACTIONS = new Set(['start', 'stop', 'restart', 'kill']);
  const POWER_DICE_FAILURE_LINES = [
    '🎲 Nuh uh. Dice said no.',
    '🎲 Server shrugged and ignored that command.',
    '🎲 Critical miss. Try again, champion.',
    '🎲 The gremlins stole your power packet.',
    '🎲 Fate says: not today.',
    '🎲 Blahaj refused to hug you.',
  ];

  function isGamblingModeEnabled(user: any): boolean {
    const themeName = String(user?.settings?.theme?.name || '').trim().toLowerCase();
    return GAMBLING_THEME_NAMES.has(themeName);
  }

  function clampInt(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Math.floor(value)));
  }

  function clampChance(value: number, fallback: number): number {
    if (!Number.isFinite(value)) return fallback;
    return Math.max(0, Math.min(1, value));
  }

  function normalizeBadgeList(raw: any): string[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((v) => String(v || '').trim())
      .filter((v) => v.length > 0)
      .slice(0, 128);
  }

  function mergeBadges(existing: any, earned: string[]): string[] {
    const merged = new Set<string>([...normalizeBadgeList(existing), ...normalizeBadgeList(earned)]);
    return Array.from(merged);
  }

  async function getGamblingConfig() {
    const rows = await panelSettingRepo().find({
      where: {
        key: In(['gamblingEnabled', 'gamblingResourceLuckyChance', 'gamblingPowerDenyChance']),
      },
    });
    const map: Record<string, string> = {};
    for (const row of rows) map[row.key] = row.value;

    const enabled = !(map['gamblingEnabled'] === 'false' || map['gamblingEnabled'] === '0');
    const resourceLuckyChance = clampChance(Number(map['gamblingResourceLuckyChance']), GAMBLING_DEFAULT_RESOURCE_LUCKY_CHANCE);
    const powerDenyChance = clampChance(Number(map['gamblingPowerDenyChance']), GAMBLING_DEFAULT_POWER_DENY_CHANCE);

    return {
      enabled,
      resourceLuckyChance,
      powerDenyChance,
      bonusPercent: GAMBLING_BONUS_PERCENT,
    };
  }

  function randomIntInclusive(min: number, max: number): number {
    if (max <= min) return min;
    const rnd = Math.random();
    return Math.floor(rnd * (max - min + 1)) + min;
  }

  function drawBlackjackCardValue(): number {
    const raw = randomIntInclusive(1, 13);
    if (raw === 1) return 11;
    if (raw >= 10) return 10;
    return raw;
  }

  function resolveBlackjackScore(cards: number[]): { score: number; softAces: number } {
    let score = cards.reduce((sum, value) => sum + value, 0);
    let softAces = cards.filter((value) => value === 11).length;

    while (score > 21 && softAces > 0) {
      score -= 10;
      softAces -= 1;
    }

    return { score, softAces };
  }

  function runBlackjackRound(playerStandAt = 17) {
    const standTarget = clampInt(playerStandAt, 12, 20);
    const playerCards = [drawBlackjackCardValue(), drawBlackjackCardValue()];
    const dealerCards = [drawBlackjackCardValue(), drawBlackjackCardValue()];

    while (resolveBlackjackScore(playerCards).score < standTarget) {
      playerCards.push(drawBlackjackCardValue());
    }
    while (resolveBlackjackScore(dealerCards).score < 17) {
      dealerCards.push(drawBlackjackCardValue());
    }

    const playerResult = resolveBlackjackScore(playerCards);
    const dealerResult = resolveBlackjackScore(dealerCards);

    const playerBust = playerResult.score > 21;
    const dealerBust = dealerResult.score > 21;

    let outcome: 'player' | 'dealer' | 'push' = 'push';
    if (playerBust && dealerBust) outcome = 'push';
    else if (playerBust) outcome = 'dealer';
    else if (dealerBust) outcome = 'player';
    else if (playerResult.score > dealerResult.score) outcome = 'player';
    else if (dealerResult.score > playerResult.score) outcome = 'dealer';

    return {
      player: {
        cards: playerCards,
        score: playerResult.score,
      },
      dealer: {
        cards: dealerCards,
        score: dealerResult.score,
      },
      playerStandAt: standTarget,
      outcome,
    };
  }

  function pickRandomFailureLine(): string {
    return POWER_DICE_FAILURE_LINES[randomIntInclusive(0, POWER_DICE_FAILURE_LINES.length - 1)] || '🎲 Nuh uh.';
  }

  function normalizeGamblingStats(raw: any) {
    return {
      gambleCount: Math.max(0, Number(raw?.gambleCount ?? raw?.rollCount ?? 0)),
      rollCount: Math.max(0, Number(raw?.rollCount ?? raw?.gambleCount ?? 0)),
      luckyHits: Math.max(0, Number(raw?.luckyHits ?? 0)),
      bonusActivations: Math.max(0, Number(raw?.bonusActivations ?? 0)),
      wins: Math.max(0, Number(raw?.wins ?? 0)),
      losses: Math.max(0, Number(raw?.losses ?? 0)),
      currentWinStreak: Math.max(0, Number(raw?.currentWinStreak ?? 0)),
      currentLossStreak: Math.max(0, Number(raw?.currentLossStreak ?? 0)),
      bestWinStreak: Math.max(0, Number(raw?.bestWinStreak ?? 0)),
      bestLossStreak: Math.max(0, Number(raw?.bestLossStreak ?? 0)),
      lastRollAt: raw?.lastRollAt ? String(raw.lastRollAt) : undefined,
    };
  }

  function applyGambleOutcome(raw: any, didWin: boolean, meta?: { luckyHit?: boolean; bonusActivated?: boolean }) {
    const stats = normalizeGamblingStats(raw);

    stats.gambleCount += 1;
    stats.rollCount = stats.gambleCount;

    if (didWin) {
      stats.wins += 1;
      stats.currentWinStreak += 1;
      stats.currentLossStreak = 0;
      if (stats.currentWinStreak > stats.bestWinStreak) stats.bestWinStreak = stats.currentWinStreak;
    } else {
      stats.losses += 1;
      stats.currentLossStreak += 1;
      stats.currentWinStreak = 0;
      if (stats.currentLossStreak > stats.bestLossStreak) stats.bestLossStreak = stats.currentLossStreak;
    }

    if (meta?.luckyHit) stats.luckyHits += 1;
    if (meta?.bonusActivated) stats.bonusActivations += 1;
    stats.lastRollAt = new Date().toISOString();

    return stats;
  }

  function buildGamblingBadges(stats: any): string[] {
    const normalized = normalizeGamblingStats(stats);
    const badges: string[] = [];
    if (normalized.gambleCount >= 1) badges.push('Beginner Gambler');
    if (normalized.gambleCount >= 10) badges.push('Dice Rookie');
    if (normalized.gambleCount >= 50) badges.push('Slot Survivor');
    if (normalized.gambleCount >= 150) badges.push('777 Hunter');
    if (normalized.currentWinStreak >= 3) badges.push('Win Streak Initiate');
    if (normalized.bestWinStreak >= 5) badges.push('Hot Hand');
    if (normalized.currentLossStreak >= 3) badges.push('Oops All Losses');
    if (normalized.bestLossStreak >= 5) badges.push('Pain Collector');
    if (normalized.wins >= 5 && normalized.losses >= 5 && normalized.wins === normalized.losses) badges.push('Mr. 50/50');
    if (normalized.luckyHits >= 3) badges.push('Lucky Spark');
    if (normalized.luckyHits >= 15) badges.push('Fortune Engine');
    if (normalized.bonusActivations >= 1) badges.push('Boosted by Fate');
    return badges;
  }

  async function recordPowerGambleOutcome(userId: number, didWin: boolean) {
    const owner = await userRepo().findOneBy({ id: userId });
    if (!owner) return;
    if (!isGamblingModeEnabled(owner)) return;

    const currentSettings = owner.settings && typeof owner.settings === 'object'
      ? { ...owner.settings }
      : {};
    const gamblingSettings = currentSettings.gambling && typeof currentSettings.gambling === 'object'
      ? { ...currentSettings.gambling }
      : {};

    const nextStats = applyGambleOutcome(gamblingSettings.stats, didWin);
    const earnedBadges = buildGamblingBadges(nextStats);
    gamblingSettings.stats = nextStats;
    gamblingSettings.badges = earnedBadges;
    currentSettings.badges = mergeBadges(currentSettings.badges, earnedBadges);
    currentSettings.gambling = gamblingSettings;
    owner.settings = currentSettings;
    await userRepo().save(owner);
  }

  async function serviceFor(serverId: string) {
    return nodeSvc.getServiceForServer(serverId);
  }

  async function pickNode(user: any, preferredNodeId?: number, assignedNodeId?: number): Promise<Node> {
    const isAdmin = user.role === 'admin' || user.role === 'rootAdmin' || user.role === '*';
    const isDemoActive = user.demoExpiresAt && new Date(user.demoExpiresAt) > new Date();
    const effectivePortalType = isDemoActive && (user as any).demoOriginalPortalType ? (user as any).demoOriginalPortalType : user.portalType;
    const portalType = effectivePortalType === 'educational' ? 'paid' : (effectivePortalType || 'free');

    // Enterprise users with assigned nodes must use their assigned node
    // LIKE SERIOUSLY DONT TOUCH POOR USERS ASSIGNED NODES
    // ITS A NIGHTMARE TO SUPPORT OTHERWISE AND THEY PROBABLY 
    // PAID ONLY FOR THE ASSIGNED NODE FEATURE ANYWAY
    if (portalType === 'enterprise' && assignedNodeId) {
      const n = await nodeRepo().findOneBy({ id: assignedNodeId });
      if (!n) throw new Error('Assigned enterprise node not found');
      return n;
    }

    if (preferredNodeId) {
      const n = await nodeRepo().findOne({ where: { id: preferredNodeId }, relations: ['organisation'] });
      if (!n) throw new Error('Specified node not found');

      if (!isAdmin) {
        if (portalType === 'enterprise') {
          const memberships = await orgMemberRepo().find({ where: { userId: user.id } });
          const orgIds = memberships.map((m: any) => Number(m.organisationId)).filter((v: number) => Number.isFinite(v));
          if (!n.organisation?.id || !orgIds.includes(Number(n.organisation.id))) {
            throw new Error('Node not available for your organisation');
          }
        } else {
          const allowedTypes = portalType === 'paid' ? ['paid', 'free_and_paid'] : ['free', 'free_and_paid'];
          if (!allowedTypes.includes(n.nodeType || '')) {
            throw new Error('Node not available for your portal tier');
          }
        }
      }

      return n;
    }

    let types: string[];
    if (portalType === 'enterprise') {
      const memberships = await orgMemberRepo().find({ where: { userId: user.id } });
      const orgIds = memberships.map((m: any) => Number(m.organisationId)).filter((v: number) => Number.isFinite(v));
      if (orgIds.length > 0) {
        const orgNode = await nodeRepo().findOne({ where: { organisation: { id: In(orgIds) } } as any });
        if (orgNode) return orgNode;
      }
      types = ['enterprise', 'free_and_paid', 'paid', 'free'];
    } else if (portalType === 'paid') {
      types = ['paid', 'free_and_paid'];
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
    try { await mergeDuplicateServerConfigs(); } catch (e) { /* skip */ }
    const nodes = await nodeRepo().find();
    const cfgRepo = AppDataSource.getRepository(require('../models/serverConfig.entity').ServerConfig);

    const user = ctx.user;
    const isAdmin = user.role === 'admin' || user.role === 'rootAdmin' || user.role === '*';

    const configs = isAdmin
      ? await cfgRepo.find()
      : await (async () => {
        const subuserEntries = await AppDataSource.getRepository(ServerSubuser).find({ where: { userId: user.id } });
        const subuserUuids = subuserEntries.map(s => s.serverUuid);
        const where: any[] = [{ userId: user.id }];
        if (subuserUuids.length) where.push({ uuid: In(subuserUuids) });
        const found = await cfgRepo.find({ where });
        return found.filter((c: any) => !c.isCodeInstance);
      })();

    const cfgMap = new Map(configs.map((c: any) => [c.uuid, c]));
    let all: any[] = [];

    if (isAdmin) {
      const nodeResults = await Promise.allSettled(nodes.map(async (n) => {
        try {
          const base = (n as any).backendWingsUrl || n.url;
          const svc = new WingsApiService(base, n.token);
          const res = await svc.getServers();
          return { node: n, servers: res.data || [] };
        } catch {
          return null;
        }
      }));

      for (const nodeResult of nodeResults) {
        if (nodeResult.status !== 'fulfilled' || !nodeResult.value) continue;
        const { node, servers } = nodeResult.value;
        for (const s of servers) {
          const uuid: string = s.configuration?.uuid || s.uuid;
          const cfg = cfgMap.get(uuid);
          const norm = applyStartupStatusOverride(
            normalizeServer(s, cfg?.hibernated ? 'hibernated' : undefined),
            cfg,
          );
          all.push({
            ...norm,
            name: cfg?.name || norm.name,
            nodeId: node.id,
            nodeName: node.name,
            userId: cfg?.userId,
          });
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
            userId: c.userId,
          });
        }
      }
    } else {
      const allowedUuids = new Set(configs.map((c: any) => c.uuid));

      const nodeMap = new Map(nodes.map(n => [n.id, n]));

      const configsByNode = new Map<number, any[]>();
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

        const list = configsByNode.get(node.id) ?? [];
        list.push(c);
        configsByNode.set(node.id, list);
      }

      const nodePromises: Promise<void>[] = [];
      for (const [nodeId, cfgList] of configsByNode.entries()) {
        const node = nodeMap.get(nodeId);
        if (!node) continue;
        nodePromises.push((async () => {
          const base = (node as any).backendWingsUrl || node.url;
          const svc = new WingsApiService(base, node.token);
          const promises = cfgList.map(async (c) => {
            try {
              const res = await svc.getServer(c.uuid);
              const s = res.data;
              const norm = applyStartupStatusOverride(
                normalizeServer(s, c.hibernated ? 'hibernated' : undefined),
                c,
              );
              all.push({ ...norm, name: c.name || norm.name, nodeId: node.id, nodeName: node.name, userId: c.userId });
              return;
            } catch {
              // try sync + retry
            }

            try {
              await svc.syncServer(c.uuid, {});
              const retry = await svc.getServer(c.uuid);
              const s2 = retry.data;
              const norm2 = applyStartupStatusOverride(
                normalizeServer(s2, c.hibernated ? 'hibernated' : undefined),
                c,
              );
              all.push({ ...norm2, name: c.name || norm2.name, nodeId: node.id, nodeName: node.name, userId: c.userId });
              return;
            } catch {
              // skip
            }

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
              userId: c.userId,
            });
          });
          await Promise.allSettled(promises);
        })());
      }

      await Promise.allSettled(nodePromises);
    }

    const seen = new Set<string>();
    const unique = all.filter((s: any) => {
      const uuid = String(s?.uuid || s?.id || '');
      if (!uuid) return false;
      if (seen.has(uuid)) return false;
      seen.add(uuid);
      return true;
    });

    return unique;
  }, {
    beforeHandle: [authenticate, authorize('servers:read')],
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

  function applyStartupStatusOverride(server: any, cfg?: any): any {
    if (!server || server.status !== 'starting') return server;

    const processCfg = cfg?.processConfig;
    if (!processCfg || typeof processCfg !== 'object') {
      server.status = 'running';
      server.hibernated = false;
      return server;
    }

    const donePatterns = normalizeStartupDonePatterns(processCfg?.startup?.done);
    if (donePatterns.includes(DEFAULT_STARTUP_DETECTION_PATTERN)) {
      server.status = 'running';
      server.hibernated = false;
    }

    return server;
  }

  app.get(prefix + '/servers/:id', async (ctx: any) => {
    const { id } = ctx.params as any;
    const cfg = await cfgRepo().findOneBy({ uuid: id });

    const user = ctx.user;
    const isAdmin = user?.role === '*' || user?.role === 'rootAdmin' || user?.role === 'admin';
    if (!cfg) {
      ctx.set.status = 404;
      return { error: 'Server not found' };
    }

    if (!isAdmin) {
      const owned = cfg.userId === user?.id;
      const subuser = await AppDataSource.getRepository(require('../models/serverSubuser.entity').ServerSubuser).findOneBy({
        serverUuid: id,
        userId: user?.id,
      });
      if (!owned && !subuser) {
        ctx.set.status = 403;
        return { error: 'Insufficient permissions' };
      }
    }

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
      const norm = applyStartupStatusOverride(
        normalizeServer(res.data, cfg?.hibernated ? 'hibernated' : undefined),
        cfg,
      );
      if (cfg && norm && norm.configuration) {
        norm.configuration.autoSyncOnEggChange = cfg.autoSyncOnEggChange;
      }
      return {
        ...norm,
        node: nodeName,
        sftp: sftpInfo,
        ...(isAdmin
          ? {
              owner: cfg.userId,
              userId: cfg.userId,
              eggId: cfg.eggId ?? null,
              nodeId: cfg.nodeId,
              memory: cfg.memory,
              disk: cfg.disk,
              cpu: cfg.cpu,
              swap: cfg.swap,
              dockerImage: cfg.dockerImage,
              startup: cfg.startup,
              description: cfg.description,
            }
          : {}),
      };
    } catch (e: any) {
      if (cfg) {
        try {
          const svc = await serviceFor(id);
          try {
            await svc.syncServer(id, {});
            const retry = await svc.getServer(id);
            const norm = applyStartupStatusOverride(
              normalizeServer(retry.data, cfg?.hibernated ? 'hibernated' : undefined),
              cfg,
            );
            return {
              ...norm,
              node: nodeName,
              sftp: sftpInfo,
              ...(isAdmin
                ? {
                    owner: cfg.userId,
                    userId: cfg.userId,
                    eggId: cfg.eggId ?? null,
                    nodeId: cfg.nodeId,
                    memory: cfg.memory,
                    disk: cfg.disk,
                    cpu: cfg.cpu,
                    swap: cfg.swap,
                    dockerImage: cfg.dockerImage,
                    startup: cfg.startup,
                    description: cfg.description,
                  }
                : {}),
            };
          } catch {
            // skip
          }
        } catch {
          // skip
        }
        const norm = normalizeServer({
          uuid: cfg.uuid,
          state: cfg.hibernated ? 'hibernated' : 'unknown',
          is_suspended: cfg.suspended,
          configuration: {
            uuid: cfg.uuid,
            meta: { name: cfg.name, description: cfg.description },
            build: { memory_limit: cfg.memory, disk_space: cfg.disk, cpu_limit: cfg.cpu, swap: cfg.swap, io_weight: cfg.ioWeight },
            container: { image: cfg.dockerImage, kvm_passthrough_enabled: cfg.kvmPassthroughEnabled ?? false },
            invocation: cfg.startup,
            environment: cfg.environment,
            allocations: cfg.allocations,
            autoSyncOnEggChange: cfg.autoSyncOnEggChange,
          },
        });
        return {
          ...norm,
          node: nodeName,
          sftp: sftpInfo,
          ...(isAdmin
            ? {
                owner: cfg.userId,
                userId: cfg.userId,
                eggId: cfg.eggId ?? null,
                nodeId: cfg.nodeId,
                memory: cfg.memory,
                disk: cfg.disk,
                cpu: cfg.cpu,
                swap: cfg.swap,
                dockerImage: cfg.dockerImage,
                startup: cfg.startup,
                description: cfg.description,
              }
            : {}),
        };
      }
      ctx.set.status = 502;
      return { error: e.message };
    }
  }, {
    beforeHandle: [authenticate, authorize('servers:read')],
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
          await removeServerConfig(id).catch(() => { });
          await nodeSvc.unmapServer(id).catch(() => { });
        } catch { }
        await createActivityLog({
          userId: user.id,
          action: 'server:delete:force',
          targetId: id,
          targetType: 'server',
          metadata: { serverUuid: id, wingsError: e?.message || String(e), mappingMissing, status },
          ipAddress: ctx.ip,
        });
        return { success: true, note: 'Removed local server config and mapping (force)' };
      }

      ctx.set.status = status === 404 ? 502 : status;
      const msg = e?.response?.data?.error || e?.message || 'Failed to delete server';
      return { error: msg };
    }
  }, {
    beforeHandle: [authenticate, authorize('servers:delete')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 502: t.Object({ error: t.String() }) },
    detail: { summary: 'Delete a server', tags: ['Servers'] }
  });

  app.post(prefix + '/servers', async (ctx: any) => {
    const user = ctx.user;
    const isAdmin = user.role === 'admin' || user.role === 'rootAdmin' || user.role === '*';

    const geoLevel = await getGeoBlockLevel(user.billingCountry);
    if (!isAdmin && geoLevel >= 4) {
      ctx.set.status = 403;
      return { error: 'Server creation is disabled for your country under geo-block policy; you may still use subuser access.' };
    }

    let effectivePortalType = user.portalType;
    const isDemoActive = user.demoExpiresAt && new Date(user.demoExpiresAt) > new Date();
    if (isDemoActive && user.demoOriginalPortalType) {
      effectivePortalType = user.demoOriginalPortalType;
    }

    if (!isAdmin) {
      const passkeyCount = await AppDataSource.getRepository(
        require('../models/passkey.entity').Passkey
      ).count({ where: { user: { id: user.id } } });
      if (passkeyCount === 0) {
        ctx.set.status = 403;
        return { error: 'You must register a passkey before creating servers' };
      }

      if (geoLevel >= 3 && (effectivePortalType === 'free' || effectivePortalType === 'educational')) {
        ctx.set.status = 403;
        return { error: 'Your country is restricted from free and educational portal services.' };
      }
      if (geoLevel >= 2 && effectivePortalType === 'free') {
        ctx.set.status = 403;
        return { error: 'Your country is restricted from free portal services.' };
      }

      if (effectivePortalType !== 'free') {
        if (!user.emailVerified) {
          ctx.set.status = 403;
          return { error: 'You must verify your email before creating servers' };
        }
      }
    }

    const body = ctx.body as any;
    let { eggId, name, nodeId, userId, memory: reqMemory, disk: reqDisk, cpu: reqCpu, kvmPassthroughEnabled } = body;

    const ownerId: number = (userId && isAdmin) ? userId : user.id;

    kvmPassthroughEnabled = Boolean(kvmPassthroughEnabled);

    let limits: { memory?: number; disk?: number; cpu?: number; serverLimit?: number } = {};

    if (!isAdmin) {
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
    }

    let memory = reqMemory != null ? Number(reqMemory) : (limits.memory ?? 1024);
    let disk = reqDisk != null ? Number(reqDisk) : (limits.disk ?? 10240);
    let cpu = reqCpu != null ? Number(reqCpu) : (limits.cpu ?? 100);

    const gamblingConfig = await getGamblingConfig();
    const gamblingRequested = body?.playerStandAt !== undefined;
    const gamblingModeEnabled = gamblingConfig.enabled && (gamblingRequested || (!isAdmin && isGamblingModeEnabled(user)));
    let gamblingResult: {
      enabled: boolean;
      rolled: { memory: number; disk: number; cpu: number };
      luckyRoll: boolean;
      blackjack: {
        player: { cards: number[]; score: number };
        dealer: { cards: number[]; score: number };
        playerStandAt: number;
        outcome: 'player' | 'dealer' | 'push';
      };
      bonusAppliedToLimits: boolean;
      bonusActivated: boolean;
      bonusPercent: number;
      bonusExpiresAt: string | null;
    } | null = null;

    let node: Node;
    try {
      node = await pickNode(user, nodeId, user.nodeId);
    } catch (e: any) {
      ctx.set.status = 503;
      return { error: e.message };
    }

    if (gamblingModeEnabled) {
      const owner = await userRepo().findOneBy({ id: ownerId });
      if (!owner) {
        ctx.set.status = 404;
        return { error: 'Owner user not found' };
      }

      const now = Date.now();
      const currentSettings = owner.settings && typeof owner.settings === 'object'
        ? { ...owner.settings }
        : {};
      const gamblingSettings = currentSettings.gambling && typeof currentSettings.gambling === 'object'
        ? { ...currentSettings.gambling }
        : {};

      const rawBonus = gamblingSettings.bonus && typeof gamblingSettings.bonus === 'object'
        ? { ...gamblingSettings.bonus }
        : {};
      const bonusExpiresAt = rawBonus.expiresAt ? new Date(rawBonus.expiresAt).getTime() : 0;
      const bonusActive = Number.isFinite(bonusExpiresAt) && bonusExpiresAt > now;

      const memoryCapBase = Math.max(1, Math.floor(limits.memory ?? node.memory ?? 1024));
      const diskCapBase = Math.max(1, Math.floor(limits.disk ?? node.disk ?? 10240));
      const cpuCapBase = Math.max(1, Math.floor(limits.cpu ?? node.cpu ?? 100));

      const memoryCap = bonusActive
        ? memoryCapBase + Math.max(1, Math.ceil(memoryCapBase * gamblingConfig.bonusPercent))
        : memoryCapBase;
      const diskCap = bonusActive
        ? diskCapBase + Math.max(1, Math.ceil(diskCapBase * gamblingConfig.bonusPercent))
        : diskCapBase;
      const cpuCap = bonusActive
        ? cpuCapBase + Math.max(1, Math.ceil(cpuCapBase * gamblingConfig.bonusPercent))
        : cpuCapBase;

      const memoryMin = Math.min(128, memoryCap);
      const diskMin = Math.min(1024, diskCap);
      const cpuMin = Math.min(10, cpuCap);

      const blackjack = runBlackjackRound(Number(body.playerStandAt));
      const blackjackWin = blackjack.outcome === 'player';

      const safePlayerScore = blackjack.player.score > 21 ? 0 : blackjack.player.score;
      const scoreRatio = safePlayerScore / 21;
      const outcomeModifier = blackjack.outcome === 'player'
        ? 0.2
        : blackjack.outcome === 'push'
          ? 0
          : -0.2;
      const blackjackRatio = Math.max(0.1, Math.min(1, scoreRatio + outcomeModifier));

      memory = clampInt(Math.floor(memoryCap * blackjackRatio), memoryMin, memoryCap);
      disk = clampInt(Math.floor(diskCap * blackjackRatio), diskMin, diskCap);
      cpu = clampInt(Math.floor(cpuCap * blackjackRatio), cpuMin, cpuCap);

      const luckyRoll = Math.random() < gamblingConfig.resourceLuckyChance;
      let bonusActivated = false;
      let nextBonusExpiresAt: string | null = bonusActive && bonusExpiresAt
        ? new Date(bonusExpiresAt).toISOString()
        : null;

      if (luckyRoll && !bonusActive) {
        const expiresAt = new Date(now + GAMBLING_BONUS_MS).toISOString();
        gamblingSettings.bonus = {
          percent: gamblingConfig.bonusPercent,
          expiresAt,
          source: 'lucky-roll',
          nonStackable: true,
          updatedAt: new Date(now).toISOString(),
        };
        bonusActivated = true;
        nextBonusExpiresAt = expiresAt;
      } else if (!bonusActive && rawBonus && Object.keys(rawBonus).length > 0) {
        gamblingSettings.bonus = null;
      }

      const nextStats = applyGambleOutcome(gamblingSettings.stats, blackjackWin, {
        luckyHit: luckyRoll,
        bonusActivated,
      });
      const earnedBadges = buildGamblingBadges(nextStats);
      gamblingSettings.stats = nextStats;
      gamblingSettings.badges = earnedBadges;
      currentSettings.badges = mergeBadges(currentSettings.badges, earnedBadges);

      currentSettings.gambling = gamblingSettings;
      owner.settings = currentSettings;
      await userRepo().save(owner);

      gamblingResult = {
        enabled: true,
        rolled: { memory, disk, cpu },
        luckyRoll,
        blackjack,
        bonusAppliedToLimits: bonusActive,
        bonusActivated,
        bonusPercent: gamblingConfig.bonusPercent,
        bonusExpiresAt: nextBonusExpiresAt,
      };
    }

    let isCodeInstance = !!body.isCodeInstance || Number(body.eggId) === 264;

    if (isCodeInstance && !isAdmin) {
      const settingRepo = AppDataSource.getRepository(
        require('../models/panelSetting.entity').PanelSetting
      );
      const setting = await settingRepo.findOneBy({ key: 'codeInstancesEnabled' });
      if (setting?.value === 'false') {
        ctx.set.status = 403;
        return { error: 'Code instance creation is temporarily disabled by an administrator.' };
      }
    }

    const allUserServers = !isAdmin
      ? await cfgRepo().find({ where: { userId: ownerId } })
      : [];

    const existingCodeInstances = allUserServers.filter((s: any) => s.isCodeInstance);
    const existingRegularServers = allUserServers.filter((s: any) => !s.isCodeInstance);

    if (isCodeInstance && !isAdmin) {
      const allowedPortalTypes = ['educational', 'paid', 'enterprise'];
      if (!allowedPortalTypes.includes(effectivePortalType)) {
        ctx.set.status = 403;
        return { error: 'Code Instances are available only for educational or higher plans.' };
      }

      if (existingCodeInstances.length >= 2) {
        ctx.set.status = 403;
        return { error: 'Maximum 2 Code Instances are allowed concurrently.' };
      }

      const existingCIMem = existingCodeInstances.reduce((sum: number, i: any) => sum + (i.memory || 0), 0);
      const existingCICpu = existingCodeInstances.reduce((sum: number, i: any) => sum + (i.cpu || 0), 0);
      const existingCIDisk = existingCodeInstances.reduce((sum: number, i: any) => sum + (i.disk || 0), 0);

      if (existingCIMem + memory > 8192) {
        ctx.set.status = 403;
        return { error: 'Total Code Instance memory limit is 8192 MB.' };
      }
      if (existingCICpu + cpu > 6) {
        ctx.set.status = 403;
        return { error: 'Total Code Instance CPU limit is 6 cores.' };
      }
      if (existingCIDisk + disk > 102400) {
        ctx.set.status = 403;
        return { error: 'Total Code Instance disk limit is 100000 MB.' };
      }

      const usedMinutes = existingCodeInstances.reduce(
        (sum: number, i: any) => sum + (i.codeInstanceMinutesUsed || 0), 0
      );
      if (usedMinutes >= 150 * 60) {
        ctx.set.status = 403;
        return { error: 'Monthly Code Instance usage limit of 150 hours reached.' };
      }
    }

    if (!isAdmin) {
      if (limits.serverLimit != null && limits.serverLimit > 0) {
        if (existingRegularServers.length >= limits.serverLimit) {
          ctx.set.status = 403;
          return { error: `Server limit reached (${limits.serverLimit}). Delete an existing server to create a new one.` };
        }
      }

      const existingMemory = existingRegularServers.reduce((sum: number, s: any) => sum + (s.memory || 0), 0);
      const existingDisk = existingRegularServers.reduce((sum: number, s: any) => sum + (s.disk || 0), 0);
      const existingCpu = existingRegularServers.reduce((sum: number, s: any) => sum + (s.cpu || 0), 0);

      if (limits.memory != null && existingMemory + memory > limits.memory) {
        ctx.set.status = 400;
        return { error: `Total account memory limit exceeded. Current: ${existingMemory} MB, requested: ${memory} MB, limit: ${limits.memory} MB.` };
      }
      if (limits.disk != null && existingDisk + disk > limits.disk) {
        ctx.set.status = 400;
        return { error: `Total account disk limit exceeded. Current: ${existingDisk} MB, requested: ${disk} MB, limit: ${limits.disk} MB.` };
      }
      if (limits.cpu != null && existingCpu + cpu > limits.cpu) {
        ctx.set.status = 400;
        return { error: `Total account CPU limit exceeded. Current: ${existingCpu}%, requested: ${cpu}%, limit: ${limits.cpu}%.` };
      }
    }

    if (isCodeInstance) {
      eggId = 264;
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

    if (egg.requiresKvm) {
      kvmPassthroughEnabled = true;
    } else if (kvmPassthroughEnabled && !isAdmin) {
      ctx.set.status = 403;
      return { error: 'Only admins may enable KVM during creation' };
    }

    if (!egg.visible && !isAdmin && egg.id !== 264) {
      ctx.set.status = 403;
      return { error: 'Egg not available' };
    }

    if (!isAdmin && Array.isArray((egg as any).allowedPortals) && (egg as any).allowedPortals.length > 0) {
      const allowed = (egg as any).allowedPortals as string[];
      const isEducational = effectivePortalType === 'educational';
      const isActuallyAllowed = allowed.includes(effectivePortalType) || (isEducational && allowed.includes('paid'));
      if (!isActuallyAllowed) {
        ctx.set.status = 403;
        return { error: 'Egg not available for your portal type' };
      }
    }

    if (!isAdmin) {
      const nodeMemoryLimit = node.memory != null ? Number(node.memory) : undefined;
      const nodeDiskLimit = node.disk != null ? Number(node.disk) : undefined;
      const nodeCpuLimit = node.cpu != null ? Number(node.cpu) : undefined;

      const effectiveMemoryLimit = limits.memory ?? nodeMemoryLimit;
      const effectiveDiskLimit = limits.disk ?? nodeDiskLimit;
      const effectiveCpuLimit = limits.cpu ?? nodeCpuLimit;

      if (effectiveMemoryLimit != null && memory > effectiveMemoryLimit) {
        ctx.set.status = 400;
        return { error: `Requested memory (${memory} MB) exceeds the maximum allowed (${effectiveMemoryLimit} MB).` };
      }
      if (effectiveDiskLimit != null && disk > effectiveDiskLimit) {
        ctx.set.status = 400;
        return { error: `Requested disk (${disk} MB) exceeds the maximum allowed (${effectiveDiskLimit} MB).` };
      }
      if (effectiveCpuLimit != null && cpu > effectiveCpuLimit) {
        ctx.set.status = 400;
        return { error: `Requested CPU (${cpu}%) exceeds the maximum allowed (${effectiveCpuLimit}%).` };
      }
    }

    let autoAllocation: Record<string, any> | null = null;
    if (node.portRangeStart && node.portRangeEnd) {
      const bindIp = node.defaultIp || '0.0.0.0';
      const nodeConfigs = await cfgRepo().find({
        where: { nodeId: node.id },
        select: ['allocations'],
      });

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
          autoAllocation = {
            default: { ip: bindIp, port: p },
            mappings: { [bindIp]: [p] },
            owners: { [`${bindIp}:${p}`]: ownerId },
          };
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
    for (const entry of (egg.envVars || []) as any[]) {
      if (typeof entry === 'string') {
        const [k, ...rest] = entry.split('=');
        if (k) envObject[k.trim()] = rest.join('=').trim();
      } else if (entry && typeof entry === 'object') {
        const k = entry.env_variable || entry.key || entry.name;
        const v = entry.default_value ?? entry.defaultValue ?? entry.value ?? '';
        if (k) envObject[String(k)] = String(v);
      }
    }

    const envOverrides: Record<string, string> = body.environment || {};
    Object.assign(envObject, envOverrides);

    const requestedStartup = typeof body.startup === 'string' ? body.startup.trim() : '';
    const resolvedStartup = requestedStartup || (typeof egg.startup === 'string'
      ? egg.startup.replace(
          /\{\{([^}]+)\}\}/g,
          (_: string, varName: string) => envObject[varName.trim()] ?? '',
        )
      : '');

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
        kvm_passthrough_enabled: kvmPassthroughEnabled,
      },
      ...(name ? { name } : {}),
    };

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
      isCodeInstance,
      kvmPassthroughEnabled,
      lastActivityAt: isCodeInstance ? new Date() : undefined,
      ...(autoAllocation ? { allocations: autoAllocation } : {}),
    });

    const base = (node as any).backendWingsUrl || node.url;
    const svc = new WingsApiService(base, node.token);

    try {
      const res = await svc.createServer(wingsPayload);

      await createActivityLog({
        userId: ownerId,
        action: 'server:create',
        targetId: serverUuid,
        targetType: 'server',
        metadata: { serverName: name, eggId: egg.id, nodeId: node.id, memory, disk, cpu, gamblingMode: !!gamblingResult },
        ipAddress: ctx.ip,
      });

      return { uuid: serverUuid, nodeId: node.id, gambling: gamblingResult, ...res.data };
    } catch (e: any) {
      await Promise.allSettled([
        removeServerConfig(serverUuid),
        nodeSvc.unmapServer(serverUuid),
      ]);
      ctx.set.status = 502;
      return { error: `Wings rejected the create request: ${e.message}` };
    }
  }, {
    beforeHandle: [authenticate, authorize('servers:create')],
    response: {
      200: t.Any(),
      400: t.Object({ error: t.String() }),
      401: t.Object({ error: t.String() }),
      403: t.Object({ error: t.String() }),
      404: t.Object({ error: t.String() }),
      502: t.Object({ error: t.String() }),
      503: t.Object({ error: t.String() }),
    },
    detail: { summary: 'Create a new server', tags: ['Servers'] },
  });

  app.put(prefix + '/servers/:id', async (ctx: any) => {
    const { id } = ctx.params as any;
    const { memory, disk, cpu, swap, environment, name, kvmPassthroughEnabled } = ctx.body as any;

    const user = ctx.user;
    const isAdmin = user.role === 'admin' || user.role === 'rootAdmin' || user.role === '*';

    if (kvmPassthroughEnabled !== undefined && !isAdmin) {
      const cfgRepo = AppDataSource.getRepository(require('../models/serverConfig.entity').ServerConfig);
      const existing = await cfgRepo.findOneBy({ uuid: id });
      const eggRepoInstance = AppDataSource.getRepository(require('../models/egg.entity').Egg);
      const egg = existing?.eggId ? await eggRepoInstance.findOneBy({ id: existing.eggId }) : null;

      if (egg?.requiresKvm) {
        if (!kvmPassthroughEnabled) {
          ctx.set.status = 403;
          return { error: 'This egg requires KVM and it cannot be disabled.' };
        }
      } else {
        ctx.set.status = 403;
        return { error: 'Only admins may modify KVM passthrough on an existing server.' };
      }
    }

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
      if (kvmPassthroughEnabled !== undefined) syncPayload.kvm_passthrough_enabled = Boolean(kvmPassthroughEnabled);

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
        if (kvmPassthroughEnabled !== undefined) existing.kvmPassthroughEnabled = Boolean(kvmPassthroughEnabled);
        await cfgRepo.save(existing);
      }

      const user = ctx.user;
      await createActivityLog({ userId: user.id, action: 'server:update', targetId: id, targetType: 'server', metadata: { changes: { memory, disk, cpu, swap, name, environment: environment ? '(updated)' : undefined } }, ipAddress: ctx.ip });
      return { success: true };
    } catch (e: any) {
      ctx.set.status = 502;
      return { error: e.message };
    }
  }, {
    beforeHandle: [authenticate, authorize('servers:write')],
    response: { 200: t.Object({ success: t.Boolean() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 502: t.Object({ error: t.String() }) },
    detail: { summary: 'Update server settings', tags: ['Servers'] }
  });

  app.post(prefix + '/servers/:id/suspend', async (ctx: any) => {
    const { id } = ctx.params as any;
    try {
      const svc = await serviceFor(id);
      await svc.powerServer(id, 'kill').catch(() => { });
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
  }, {
    beforeHandle: [authenticate, authorize('servers:write')],
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
  }, {
    beforeHandle: [authenticate, authorize('servers:write')],
    response: { 200: t.Object({ success: t.Boolean() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 502: t.Object({ error: t.String() }) },
    detail: { summary: 'Unsuspend a server', tags: ['Servers'] }
  });

  app.post(prefix + '/servers/:id/power', async (ctx: any) => {
    const { id } = ctx.params as any;
    const { action } = ctx.body as any;
    const user = ctx.user;
    const gamblingConfig = await getGamblingConfig();
    const gamblingPowerEnabled = gamblingConfig.enabled && isGamblingModeEnabled(user);
    const cfg = await AppDataSource.getRepository(ServerConfig).findOneBy({ uuid: id });
    if (cfg?.hibernated && (action === 'start' || action === 'restart')) {
      ctx.set.status = 403;
      return { error: 'Server is hibernated and cannot be started or restarted' };
    }

    if (gamblingPowerEnabled && POWER_DICE_ACTIONS.has(String(action || '').toLowerCase())) {
      const roll = randomIntInclusive(1, 6);
      const denied = Math.random() < gamblingConfig.powerDenyChance;
      if (denied) {
        await recordPowerGambleOutcome(Number(user.id), false);
        await createActivityLog({
          userId: user.id,
          action: `server:power:${action}:dice-denied`,
          targetId: id,
          targetType: 'server',
          metadata: { powerAction: action, diceRoll: roll },
          ipAddress: ctx.ip,
        });
        return {
          success: false,
          blockedByDice: true,
          roll,
          message: pickRandomFailureLine(),
        };
      }
    }

    try {
      const svc = await serviceFor(id);
      const res = await svc.powerServer(id, action);
      if (gamblingPowerEnabled) {
        await recordPowerGambleOutcome(Number(user.id), true);
      }
      await createActivityLog({ userId: user.id, action: `server:power:${action}`, targetId: id, targetType: 'server', metadata: { powerAction: action }, ipAddress: ctx.ip });
      return res.data && typeof res.data === 'object' ? res.data : { success: true };
    } catch (e: any) {
      const status = e?.response?.status || 502;
      const msg = e?.response?.data?.error || e?.message || 'Power action failed';
      ctx.set.status = status;
      return { error: msg };
    }
  }, {
    beforeHandle: [authenticate, authorize('servers:power')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Perform power action on server', tags: ['Servers'] }
  });

  app.post(prefix + '/servers/:id/kvm', async (ctx: any) => {
    const { id } = ctx.params as any;
    const { enable } = ctx.body as any;

    const user = ctx.user;
    if (!user || !(user.role === '*' || user.role === 'rootAdmin' || user.role === 'admin')) {
      ctx.set.status = 403;
      return { error: 'Insufficient permissions (admin only)' };
    }

    const cfgRepo = AppDataSource.getRepository(ServerConfig);
    const cfg = await cfgRepo.findOneBy({ uuid: id });
    if (!cfg) {
      ctx.set.status = 404;
      return { error: 'Server not found' };
    }

    cfg.kvmPassthroughEnabled = Boolean(enable);
    await cfgRepo.save(cfg);

    try {
      const svc = await serviceFor(id);
      await svc.syncServer(id, {});
    } catch (e: any) {
      ctx.set.status = 502;
      return { error: `KVM toggle failed: ${e?.message || 'unable to sync to node'}` };
    }

    await createActivityLog({ userId: user.id, action: `server:kvm:${enable ? 'enable' : 'disable'}`, targetId: id, targetType: 'server', metadata: { kvmEnabled: enable }, ipAddress: ctx.ip });
    return { success: true };
  }, {
    beforeHandle: [authenticate, authorize('servers:kvm')],
    response: { 200: t.Object({ success: t.Boolean() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 502: t.Object({ error: t.String() }) },
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
  }, {
    beforeHandle: [authenticate, authorize('files:read')],
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 500: t.Object({ error: t.String() }) },
    detail: { summary: 'List directory contents', tags: ['Servers'] }
  });

  app.get(prefix + '/servers/:id/files/contents', async (ctx: any) => {
    const { id } = ctx.params as any;
    const { path } = ctx.query as any;
    const svc = await serviceFor(id);
    try {
      const res = await svc.readFile(id, path);
      return res.data ?? '';
    } catch (e: any) {
      const status = e?.response?.status || 500;
      const msg = e?.response?.data?.error || e?.message || 'Failed to read file';
      ctx.set.status = status;
      return { error: msg };
    }
  }, {
    beforeHandle: [authenticate, authorize('files:read')],
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 500: t.Object({ error: t.String() }) },
    detail: { summary: 'Read file contents', tags: ['Servers'] }
  });

  app.get(prefix + '/servers/:id/files/download', async (ctx: any) => {
    const { id } = ctx.params;
    const { path } = ctx.query;

    if (!path) {
      ctx.set.status = 400;
      return { error: 'path query param required' };
    }

    const svc = await serviceFor(id);

    try {
      // CRITICAL: downloadFile MUST return ArrayBuffer, not string
      const res = await svc.downloadFile(id, path);
      const filename = path.split('/').pop() || 'download';
      const contentType = res.headers?.['content-type'] || 'application/octet-stream';

      // Ensure we have raw binary bytes
      let body: Uint8Array;

      if (res.data instanceof ArrayBuffer) {
        body = new Uint8Array(res.data);
      } else if (ArrayBuffer.isView(res.data)) {
        // Already a typed array view (Uint8Array, Buffer, etc.)
        body = new Uint8Array(res.data.buffer, res.data.byteOffset, res.data.byteLength);
      } else if (typeof res.data === 'string') {
        // THIS IS THE PROBLEM - if we get here, downloadFile is returning text
        // This will corrupt binary files! Fix downloadFile to use responseType: 'arraybuffer'
        console.error('WARNING: downloadFile returned string instead of ArrayBuffer - binary corruption will occur!');
        // Cannot reliably convert back - the damage is done
        body = new TextEncoder().encode(res.data);
      } else {
        ctx.set.status = 500;
        return { error: 'Unexpected response data type from Wings' };
      }

      return new Response(Buffer.from(body), {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
          'Content-Length': String(body.byteLength),
        },
      });
    } catch (e: any) {
      const status = e?.response?.status || 500;
      const msg = e?.response?.data?.error || e?.message || 'Failed to download file';
      ctx.set.status = status;
      return { error: msg };
    }
  }, {
    beforeHandle: [authenticate, authorize('files:read')],
    query: t.Object({ path: t.String() }),
    response: {
      200: t.Any(),
      400: t.Object({ error: t.String() }),
      401: t.Object({ error: t.String() }),
      403: t.Object({ error: t.String() }),
      500: t.Object({ error: t.String() }),
    },
    detail: { summary: 'Download file', tags: ['Servers'] },
  });

  app.post(prefix + '/servers/:id/files/upload', async (ctx: any) => {
    const { id } = ctx.params;
    const pathParam = String(ctx.query?.path || ctx.request?.headers?.get('x-path') || '').trim();
    if (!pathParam) {
      ctx.set.status = 400;
      return { error: 'path query param required' };
    }

    const svc = await serviceFor(id);

    try {
      const contentType = String(ctx.request?.headers?.get('content-type') || '').toLowerCase();
      if (!contentType || !contentType.includes('octet-stream')) {
        ctx.set.status = 415;
        return { error: 'Unsupported media type; expected application/octet-stream' };
      }

      const rawBody = await ctx.request.arrayBuffer();
      const binaryData = new Uint8Array(rawBody);

      const res = await svc.writeFile(id, pathParam, binaryData);

      const user = (ctx as any).store?.user ?? (ctx as any).user;
      if (user?.id) {
        await createActivityLog({
          userId: user.id,
          action: 'server:file:upload',
          targetId: id,
          targetType: 'server',
          metadata: { filePath: pathParam, size: binaryData.byteLength },
          ipAddress: ctx.ip,
        });
      }

      return res.data && typeof res.data === 'object' ? res.data : { success: true };
    } catch (e: any) {
      const status = e?.response?.status || 500;
      const msg = e?.response?.data?.error || e?.message || 'File upload failed';
      ctx.set.status = status;
      return { error: msg };
    }
  }, {
    beforeHandle: [authenticate, authorize('files:write')],
    response: {
      200: t.Any(),
      400: t.Object({ error: t.String() }),
      401: t.Object({ error: t.String() }),
      403: t.Object({ error: t.String() }),
      415: t.Object({ error: t.String() }),
      500: t.Object({ error: t.String() }),
    },
    detail: { summary: 'Upload a binary file to server path', tags: ['Servers'] },
  });

  app.post(prefix + '/servers/:id/files/write', async (ctx: any) => {
    const { id } = ctx.params;
    const svc = await serviceFor(id);

    try {
      const body = ctx.body as any;
      const user = (ctx as any).store?.user ?? (ctx as any).user;

      // ── Multipart file upload ──
      if (body && (body.file || body.files)) {
        const uploadFile =
          (Array.isArray(body.file) ? body.file[0] : body.file) ||
          (Array.isArray(body.files) ? body.files[0] : body.files);

        if (!uploadFile || typeof uploadFile.arrayBuffer !== 'function') {
          ctx.set.status = 400;
          return { error: 'Invalid or missing file in upload' };
        }

        const destination = (body.path || body.destination || '/').replace(/\/+$/, '');
        const fileName = uploadFile.name || 'upload';
        const filePath = destination.endsWith('/') ? `${destination}${fileName}` : `${destination}/${fileName}`;

        // CRITICAL: Get raw binary as Uint8Array - NOT Buffer
        const arrayBuffer = await uploadFile.arrayBuffer();
        const binaryData = new Uint8Array(arrayBuffer);

        // Pass raw bytes to writeFile
        const res = await svc.writeFile(id, filePath, binaryData);

        if (user?.id) {
          await createActivityLog({
            userId: user.id,
            action: 'server:file:write',
            targetId: id,
            targetType: 'server',
            metadata: { filePath },
            ipAddress: ctx.ip,
          });
        }

        return res.data && typeof res.data === 'object' ? res.data : { success: true };
      }

      // ── JSON body — text content write ──
      const { path: filePath, content } = body;

      if (!filePath) {
        ctx.set.status = 400;
        return { error: 'path is required' };
      }

      // Convert content to raw bytes
      let binaryData: Uint8Array;
      if (typeof content === 'string') {
        binaryData = new TextEncoder().encode(content);
      } else if (content instanceof ArrayBuffer) {
        binaryData = new Uint8Array(content);
      } else if (ArrayBuffer.isView(content)) {
        binaryData = new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
      } else {
        binaryData = new TextEncoder().encode(String(content ?? ''));
      }

      const res = await svc.writeFile(id, filePath, binaryData);

      if (user?.id) {
        await createActivityLog({
          userId: user.id,
          action: 'server:file:write',
          targetId: id,
          targetType: 'server',
          metadata: { filePath },
          ipAddress: ctx.ip,
        });
      }

      return res.data && typeof res.data === 'object' ? res.data : { success: true };
    } catch (e: any) {
      const status = e?.response?.status || 500;
      const msg = e?.response?.data?.error || e?.message || 'File write failed';
      ctx.set.status = status;
      return { error: msg };
    }
  }, {
    beforeHandle: [authenticate, authorize('files:write')],
    response: {
      200: t.Any(),
      400: t.Object({ error: t.String() }),
      401: t.Object({ error: t.String() }),
      403: t.Object({ error: t.String() }),
      500: t.Object({ error: t.String() }),
    },
    detail: { summary: 'Write file', tags: ['Servers'] },
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
  }, {
    beforeHandle: [authenticate, authorize('files:write')],
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
  }, {
    beforeHandle: [authenticate, authorize('files:write')],
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
  }, {
    beforeHandle: [authenticate, authorize('files:write')],
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 500: t.Object({ error: t.String() }) },
    detail: { summary: 'Archive files', tags: ['Servers'] }
  });

  app.put(prefix + '/servers/:id/files/rename', async (ctx: any) => {
    const { id } = ctx.params as any;
    const { root = '/', files } = ctx.body as any;
    if (!Array.isArray(files) || files.length === 0) {
      ctx.set.status = 400;
      return { error: 'files must be a non-empty array' };
    }

    const svc = await serviceFor(id);
    try {
      const res = await svc.serverRequest(id, '/files/rename', 'put', { root, files });
      return res.data && typeof res.data === 'object' ? res.data : { success: true };
    } catch (e: any) {
      const status = e?.response?.status || 500;
      const msg = e?.response?.data?.error || e?.message || 'Rename failed';
      ctx.set.status = status;
      return { error: msg };
    }
  }, {
    beforeHandle: [authenticate, authorize('files:write')],
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 500: t.Object({ error: t.String() }) },
    detail: { summary: 'Rename files', tags: ['Servers'] }
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
  }, {
    beforeHandle: [authenticate, authorize('files:write')],
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 500: t.Object({ error: t.String() }) },
    detail: { summary: 'Move files', tags: ['Servers'] }
  });

  app.post(prefix + '/servers/:id/files/chmod', async (ctx: any) => {
    const { id } = ctx.params as any;
    const { root = '/', files } = ctx.body as any;
    if (!Array.isArray(files) || files.length === 0) {
      ctx.set.status = 400;
      return { error: 'files must be a non-empty array' };
    }

    const normalizedFiles = files.map((f: any) => {
      if (!f || typeof f !== 'object' || typeof f.file !== 'string' || !/^[0-7]{3,4}$/.test(f.mode)) {
        throw new Error('Invalid file entry; expected { file: string, mode: string }');
      }
      const normalized: any = { file: f.file, mode: f.mode };
      if (typeof f.recursive === 'boolean') normalized.recursive = f.recursive;
      return normalized;
    });

    const svc = await serviceFor(id);
    try {
      const res = await svc.chmodFiles(id, root, normalizedFiles);
      return res.data && typeof res.data === 'object' ? res.data : { success: true };
    } catch (e: any) {
      const status = e?.response?.status || 500;
      const msg = e?.response?.data?.error || e?.message || 'chmod failed';
      ctx.set.status = status;
      return { error: msg };
    }
  }, {
    beforeHandle: [authenticate, authorize('files:write')],
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 500: t.Object({ error: t.String() }) },
    detail: { summary: 'Change file permissions', tags: ['Servers'] }
  });

  // yeah so basically wings-rs only cuz wings-go compatibility
  // would be nightmare to add
  // be happy that most shit is already supported and using wings-go is possible
  app.get(prefix + '/servers/:id/backups', async (ctx: any) => {
    const { id } = ctx.params as any;
    try {
      const svc = await serviceFor(id);
      const res = await svc.listServerBackups(id);
      try { (app as any).log?.info?.({ serverUuid: id, remoteCount: Array.isArray(res.data) ? res.data.length : 0 }, 'server: listServerBackups response'); } catch { }
      if (Array.isArray(res.data) && res.data.length) return res.data;
      try {
        const repo = AppDataSource.getRepository(require('../models/serverBackup.entity').ServerBackup);
        const records = await repo.find({ where: { serverUuid: id }, order: { createdAt: 'DESC' } });
        try { (app as any).log?.info?.({ serverUuid: id, localCount: records.length, uuids: records.map((r: any) => r.uuid) }, 'server: falling back to local persisted backup records'); } catch { }
        return records.map((r: any) => ({
          uuid: r.uuid,
          name: r.name,
          display_name: r.displayName,
          bytes: r.bytes,
          created_at: r.createdAt,
          adapter: r.adapter,
          locked: !!r.locked,
          progress: r.progress ?? 0,
          status: r.status ?? null,
        }));
      } catch (e) {
        try { (app as any).log?.warn?.({ err: e, serverUuid: id }, 'server: failed to read local backup records'); } catch { }
        return [];
      }
    } catch (e: any) {
      if (e?.response?.status === 404) return [];
      throw e;
    }
  }, {
    beforeHandle: [authenticate, authorize('backups:read')],
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'List backups', tags: ['Servers'] }
  });

  app.post(prefix + '/servers/:id/backups', async (ctx: any) => {
    const { id } = ctx.params as any;
    const user = ctx.user;
    const accountBackupsLimit = user?.limits && typeof user.limits.backups === 'number' ? user.limits.backups : 0;
    if (accountBackupsLimit > 0) {
      const backupRepo = AppDataSource.getRepository(require('../models/serverBackup.entity').ServerBackup);
      const cfg = await cfgRepo().findOneBy({ uuid: id });
      const ownerId = cfg?.userId || user?.id;
      const ownedServers = ownerId ? await cfgRepo().find({ where: { userId: ownerId }, select: ['uuid'] }) : [];
      const serverUuids = ownedServers.map((s: any) => s.uuid);
      const existingBackups = serverUuids.length > 0 ? await backupRepo.count({ where: { serverUuid: In(serverUuids) } }) : 0;
      if (existingBackups >= accountBackupsLimit) {
        ctx.set.status = 429;
        return { error: `Account backup limit reached (${accountBackupsLimit})` };
      }
    }
    const body = ctx.body || {};
    const adapter = 'wings';
    const uuid = body.uuid || uuidv4();
    const ignore = typeof body.ignore === 'string' ? body.ignore : '';

    try {
      const svc = await serviceFor(id);
      const res = await svc.createServerBackup(id, { adapter, uuid, ignore });
      try {
        const repo = AppDataSource.getRepository(require('../models/serverBackup.entity').ServerBackup);
        const record = repo.create({ uuid, serverUuid: id, adapter, name: (res?.data?.name) || undefined });
        await repo.save(record);
        try { (app as any).log?.info?.({ serverUuid: id, backupUuid: uuid }, 'server: created backup and persisted local record'); } catch { }
      } catch (e) {
        try { (app as any).log?.warn?.({ err: e, serverUuid: id, backupUuid: uuid }, 'server: failed to persist created backup record'); } catch { }
      }
      return res.data && typeof res.data === 'object' ? res.data : { success: true };
    } catch (e: any) {
      if (e?.response?.status === 404) {
        console.log(e)
        ctx.set.status = 400;
        return { error: 'Backups are not supported by this Wings version.' };
      }
      const status = e?.response?.status || 500;
      const msg = e?.response?.data?.error || e?.message || 'Failed to create backup';
      ctx.set.status = status;
      return { error: msg };
    }
  }, {
    beforeHandle: [authenticate, authorize('backups:create')],
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 500: t.Object({ error: t.String() }) },
    detail: { summary: 'Create backup', tags: ['Servers'] }
  });

  app.post(prefix + '/servers/:id/backups/:bid/restore', async (ctx: any) => {
    const { id, bid } = ctx.params as any;
    const body = ctx.body || {};
    const adapter = 'wings';
    const truncate_directory = body.truncate_directory === true;
    const download_url = body.download_url;
    try {
      const svc = await serviceFor(id);
      const res = await svc.restoreServerBackup(id, bid, { adapter, truncate_directory, download_url });
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
  }, {
    beforeHandle: [authenticate, authorize('backups:write')],
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 500: t.Object({ error: t.String() }) },
    detail: { summary: 'Restore backup', tags: ['Servers'] }
  });

  app.delete(prefix + '/servers/:id/backups/:bid', async (ctx: any) => {
    const { id, bid } = ctx.params as any;
    const adapter = 'wings';
    try {
      const svc = await serviceFor(id);
      try {
        const repo = AppDataSource.getRepository(require('../models/serverBackup.entity').ServerBackup);
        const rec = await repo.findOneBy({ uuid: bid });
        if (rec && rec.locked) {
          const force = (ctx.query && (ctx.query.force === '1' || ctx.query.force === 'true')) || (ctx.body && ctx.body.force === true);
          if (!force) {
            ctx.set.status = 403;
            return { error: 'Backup is locked and cannot be deleted' };
          }
        }
      } catch (e) {
        // skip
      }
      try { (app as any).log?.info?.({ serverUuid: id, backupUuid: bid }, 'server: attempting to delete backup on node'); } catch { }
      const res = await svc.serverRequest(id, `/backup/${bid}`, 'delete', { adapter });
      try {
        const repo = AppDataSource.getRepository(require('../models/serverBackup.entity').ServerBackup);
        await repo.delete({ uuid: bid });
        try { (app as any).log?.info?.({ serverUuid: id, backupUuid: bid }, 'server: deleted local persisted backup record'); } catch { }
      } catch (e) {
        try { (app as any).log?.warn?.({ err: e, serverUuid: id, backupUuid: bid }, 'server: failed to delete local persisted backup record'); } catch { }
      }
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
  }, {
    beforeHandle: [authenticate, authorize('backups:write')],
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 500: t.Object({ error: t.String() }) },
    detail: { summary: 'Delete backup', tags: ['Servers'] }
  });

  app.post(prefix + '/servers/:id/backups/:bid/lock', async (ctx: any) => {
    const { id, bid } = ctx.params as any;
    const { lock } = ctx.body || {};
    try {
      const repo = AppDataSource.getRepository(require('../models/serverBackup.entity').ServerBackup);
      const rec = await repo.findOneBy({ uuid: bid });
      if (!rec) {
        ctx.set.status = 404;
        return { error: 'Backup not found' };
      }
      rec.locked = !!lock;
      await repo.save(rec);
      return { success: true, locked: rec.locked };
    } catch (e: any) {
      ctx.set.status = 500;
      return { error: e?.message || 'Failed to update lock' };
    }
  }, { beforeHandle: [authenticate, authorize('backups:write')], response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }), 500: t.Object({ error: t.String() }) }, detail: { summary: 'Lock/unlock a backup', tags: ['Servers'] } });

  app.post(prefix + '/servers/:id/backups/:bid/rename', async (ctx: any) => {
    const { id, bid } = ctx.params as any;
    const { name } = ctx.body || {};
    if (typeof name !== 'string' || !name.trim()) {
      ctx.set.status = 400;
      return { error: 'name is required' };
    }
    try {
      const repo = AppDataSource.getRepository(require('../models/serverBackup.entity').ServerBackup);
      const rec = await repo.findOneBy({ uuid: bid });
      if (!rec) {
        ctx.set.status = 404;
        return { error: 'Backup not found' };
      }
      rec.displayName = name.trim();
      await repo.save(rec);
      return { success: true, display_name: rec.displayName };
    } catch (e: any) {
      ctx.set.status = 500;
      return { error: e?.message || 'Failed to rename backup' };
    }
  }, { beforeHandle: [authenticate, authorize('backups:write')], response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }), 500: t.Object({ error: t.String() }) }, detail: { summary: 'Rename backup display name', tags: ['Servers'] } });

  app.post(prefix + '/servers/:id/commands', async (ctx: any) => {
    const { id } = ctx.params as any;
    const { command } = ctx.body as any;
    const svc = await serviceFor(id);
    const res = await svc.executeServerCommand(id, command);
    const user = ctx.user;
    await createActivityLog({ userId: user.id, action: 'server:console:command', targetId: id, targetType: 'server', metadata: { command }, ipAddress: ctx.ip });
    return res.data && typeof res.data === 'object' ? res.data : { success: true };
  }, {
    beforeHandle: [authenticate, authorize('commands:execute')],
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
  }, {
    beforeHandle: [authenticate, authorize('logs:read')],
    response: { 200: t.Array(t.String()), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Fetch server logs', tags: ['Servers', 'Logs'] }
  });

  app.post(prefix + '/servers/:id/reinstall', async (ctx: any) => {
    const { id } = ctx.params as any;
    const payload = ctx.body;
    const svc = await serviceFor(id);
    const res = await svc.reinstallServer(id, payload);
    const user = ctx.user;
    await createActivityLog({ userId: user.id, action: 'server:reinstall', targetId: id, targetType: 'server', ipAddress: ctx.ip });
    return res.data && typeof res.data === 'object' ? res.data : { success: true };
  }, {
    beforeHandle: [authenticate, authorize('reinstall:execute')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Reinstall server', tags: ['Servers'] }
  });

  app.get(prefix + '/servers/:id/schedules', async (ctx: any) => {
    const { id } = ctx.params as any;
    const cfg = await cfgRepo().findOneBy({ uuid: id });
    return cfg?.schedules ?? [];
  }, {
    beforeHandle: [authenticate, authorize('schedules:read')],
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
  }, {
    beforeHandle: [authenticate, authorize('schedules:create')],
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
  }, {
    beforeHandle: [authenticate, authorize('schedules:write')],
    response: { 200: t.Object({ success: t.Boolean() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Delete schedule', tags: ['Servers'] }
  });

  app.post(prefix + '/servers/:id/sync', async (ctx: any) => {
    const { id } = ctx.params as any;
    const payload = ctx.body;
    const svc = await serviceFor(id);
    const res = await svc.syncServer(id, payload);
    return res.data && typeof res.data === 'object' ? res.data : { success: true };
  }, {
    beforeHandle: [authenticate, authorize('sync:execute')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Sync server', tags: ['Servers'] }
  });

  app.post(prefix + '/servers/:id/transfer', async (ctx: any) => {
    const { id } = ctx.params as any;
    const payload = ctx.body;
    const user = ctx.user;
    let svc = await serviceFor(id);

    if (payload && payload.sourceNodeId && (user.role === 'admin' || user.role === 'rootAdmin' || user.role === '*')) {
      const nodeId = Number(payload.sourceNodeId);
      try {
        const node = await nodeRepo().findOneBy({ id: nodeId });
        if (!node) {
          ctx.set.status = 404;
          return { error: 'Source node not found' };
        }
        svc = new WingsApiService((node as any).backendWingsUrl || node.url, node.token);
      } catch (e: any) {
        ctx.set.status = 500;
        return { error: 'Failed to resolve source node' };
      }
    }

    if (payload && payload.targetNodeId && (user.role === 'admin' || user.role === 'rootAdmin' || user.role === '*')) {
      const targetId = Number(payload.targetNodeId);
      try {
        const targetNode = await nodeRepo().findOneBy({ id: targetId });
        if (!targetNode) {
          ctx.set.status = 404;
          return { error: 'Target node not found' };
        }
        const targetUrl = `${String(targetNode.url).replace(/\/+$/, '')}/api/transfers`;
        const now = Math.floor(Date.now() / 1000);
        const token = signWingsJwt({
          iss: 'eclipanel',
          sub: id,
          aud: [''],
          iat: now,
          nbf: now,
          exp: now + 600,
          jti: uuidv4(),
        }, targetNode.token);

        payload.url = targetUrl;
        payload.token = token;
      } catch (e: any) {
        ctx.set.status = 500;
        return { error: 'Failed to resolve target node' };
      }
    }

    if (payload) {
      delete payload.sourceNodeId;
      delete payload.targetNodeId;
    }

    try {
      const res = await svc.transferServer(id, payload);
      return res.data && typeof res.data === 'object' ? res.data : { success: true };
    } catch (e: any) {
      const status = e?.response?.status || 500;
      const message = e?.response?.data?.error || e?.response?.data || e?.message || 'Transfer failed';
      ctx.set.status = status;
      return { error: message };
    }
  }, {
    beforeHandle: [authenticate, authorize('transfer:execute')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Transfer server', tags: ['Servers'] }
  });

  app.get(prefix + '/servers/:id/version', async (ctx: any) => {
    const { id } = ctx.params as any;
    const svc = await serviceFor(id);
    const res = await svc.getServerVersion(id);
    return res.data ?? {};
  }, {
    beforeHandle: [authenticate, authorize('version:read')],
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
  }, {
    beforeHandle: [authenticate, authorize('servers:console')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Access server console', tags: ['Servers'] }
  });

  app.get(prefix + '/servers/:id/allocations', async (ctx: any) => {
    const { id } = ctx.params as any;
    const cfg = await cfgRepo().findOneBy({ uuid: id });
    const a = cfg?.allocations;
    if (!a) return [];
    const node = cfg?.nodeId ? await nodeRepo().findOneBy({ id: cfg.nodeId }) : null;
    const nodeFqdn = node?.fqdn;
    const fqdns: Record<string, string> = (a as any).fqdns ?? {};
    const result: any[] = [];
    if (a.default) {
      const key = `${a.default.ip}:${a.default.port}`;
      result.push({ ip: a.default.ip, port: a.default.port, fqdn: fqdns[key] || nodeFqdn || null, is_default: true, notes: null });
    }
    const mappings: Record<string, number[]> = a.mappings ?? {};
    for (const [ip, ports] of Object.entries(mappings)) {
      for (const port of (ports as number[]) ?? []) {
        const isDef = a.default?.ip === ip && a.default?.port === port;
        if (!isDef) {
          const key = `${ip}:${port}`;
          result.push({ ip, port, fqdn: fqdns[key] || nodeFqdn || null, is_default: false, notes: null });
        }
      }
    }
    return result;
  }, {
    beforeHandle: [authenticate, authorize('servers:read')],
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'List network allocations', tags: ['Servers'] }
  });

  app.post(prefix + '/servers/:id/allocations', async (ctx: any) => {
    const { id } = ctx.params as any;
    const body = ctx.body as any || {};
    const count = Number(body.count || 1);
    if (count <= 0) {
      ctx.set.status = 400;
      return { error: 'Invalid allocation count' };
    }

    const cfg = await cfgRepo().findOneBy({ uuid: id });
    if (!cfg) {
      ctx.set.status = 404;
      return { error: 'Server not found' };
    }

    const user = ctx.user;
    const isAdmin = user?.role === '*' || user?.role === 'rootAdmin' || user?.role === 'admin';
    if (!isAdmin) {
      const owned = cfg.userId === user?.id;
      const subuser = await AppDataSource.getRepository(require('../models/serverSubuser.entity').ServerSubuser).findOneBy({ serverUuid: id, userId: user?.id });
      if (!owned && !subuser) {
        ctx.set.status = 403;
        return { error: 'Insufficient permissions' };
      }
    }

    const limit = (user?.limits && typeof user.limits.portsPerServer === 'number') ? user.limits.portsPerServer : 3;

    const alloc = cfg.allocations as any || {};
    const owners: Record<string, any> = alloc.owners || {};
    let existingCount = 0;
    for (const [k, v] of Object.entries(owners)) {
      if (v === user.id) existingCount++;
    }
    if (alloc.default) {
      const defKey = `${alloc.default.ip}:${alloc.default.port}`;
      if (!owners[defKey] && cfg.userId === user?.id) {
        existingCount++;
      }
    }
    if (existingCount + count > limit) {
      ctx.set.status = 403;
      return { error: `Per-server port limit exceeded (allowed ${limit}). Currently allocated: ${existingCount}` };
    }

    const node = await nodeRepo().findOneBy({ id: cfg.nodeId });
    if (!node || !node.portRangeStart || !node.portRangeEnd) {
      ctx.set.status = 400;
      return { error: 'Node does not support additional allocations' };
    }

    const bindIp = node.defaultIp || '0.0.0.0';

    const nodeConfigs = await cfgRepo().find({ where: { nodeId: node.id } });
    const takenPorts = new Set<number>();
    for (const c of nodeConfigs) {
      const a = c.allocations as any;
      if (!a) continue;
      if (a.default?.port) takenPorts.add(Number(a.default.port));
      for (const ports of Object.values(a.mappings ?? {}) as number[][]) {
        for (const p of ports) takenPorts.add(Number(p));
      }
      if (a.owners) {
        for (const k of Object.keys(a.owners || {})) {
          const [, pstr] = k.split(':');
          const pnum = Number(pstr);
          if (!Number.isNaN(pnum)) takenPorts.add(pnum);
        }
      }
    }

    const newPorts: { ip: string; port: number }[] = [];
    for (let p = node.portRangeStart; p <= node.portRangeEnd && newPorts.length < count; p++) {
      if (!takenPorts.has(p)) {
        newPorts.push({ ip: bindIp, port: p });
        takenPorts.add(p);
      }
    }

    if (newPorts.length < count) {
      ctx.set.status = 503;
      return { error: 'Not enough free ports available on this node' };
    }

    alloc.mappings = alloc.mappings || {};
    alloc.mappings[bindIp] = alloc.mappings[bindIp] || [];
    alloc.owners = alloc.owners || {};
    for (const np of newPorts) {
      alloc.mappings[bindIp].push(np.port);
      alloc.owners[`${np.ip}:${np.port}`] = user.id;
    }
    cfg.allocations = alloc;
    await cfgRepo().save(cfg);

    return newPorts.map(x => ({ ip: x.ip, port: x.port, is_default: false }));
  }, {
    beforeHandle: [authenticate, authorize('servers:write')],
    response: { 200: t.Array(t.Object({ ip: t.String(), port: t.Number(), is_default: t.Boolean() })), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }), 503: t.Object({ error: t.String() }) },
    detail: { summary: 'Request additional network allocations for server (per-account limit)', tags: ['Servers'] }
  });

  app.delete(prefix + '/servers/:id/allocations', async (ctx: any) => {
    const { id } = ctx.params as any;
    const body = ctx.body as any || {};
    const ip = body.ip;
    const port = Number(body.port || 0);
    if (!ip || !port) {
      ctx.set.status = 400;
      return { error: 'Invalid ip/port' };
    }

    const cfg = await cfgRepo().findOneBy({ uuid: id });
    if (!cfg) {
      ctx.set.status = 404;
      return { error: 'Server not found' };
    }

    const user = ctx.user;
    const isAdmin = user?.role === '*' || user?.role === 'rootAdmin' || user?.role === 'admin';
    if (!isAdmin) {
      const owned = cfg.userId === user?.id;
      const subuser = await AppDataSource.getRepository(require('../models/serverSubuser.entity').ServerSubuser).findOneBy({ serverUuid: id, userId: user?.id });
      if (!owned && !subuser) {
        ctx.set.status = 403;
        return { error: 'Insufficient permissions' };
      }
    }

    const alloc = cfg.allocations as any || {};
    if (alloc.default && alloc.default.ip === ip && Number(alloc.default.port) === port) {
      ctx.set.status = 400;
      return { error: 'Cannot remove default allocation' };
    }

    const key = `${ip}:${port}`;
    if (!isAdmin) {
      const owners: Record<string, any> = alloc.owners || {};
      if (owners[key] !== user.id) {
        ctx.set.status = 403;
        return { error: 'Not owner of this allocation' };
      }
    }

    alloc.mappings = alloc.mappings || {};
    for (const [mip, ports] of Object.entries(alloc.mappings)) {
      if (mip === ip) {
        const idx = (ports as number[]).indexOf(Number(port));
        if (idx !== -1) {
          (ports as number[]).splice(idx, 1);
        }
        if ((ports as number[]).length === 0) delete alloc.mappings[mip];
      }
    }

    if (alloc.owners) {
      delete alloc.owners[key];
    }

    cfg.allocations = alloc;
    await cfgRepo().save(cfg);

    return { success: true };
  }, {
    beforeHandle: [authenticate, authorize('servers:write')],
    response: { 200: t.Object({ success: t.Boolean() }), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Delete a network allocation from a server', tags: ['Servers'] }
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
    }, {
      beforeHandle: [authenticate, authorize('servers:read')],
      response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
      detail: { summary: `Get server ${sub}`, tags: ['Servers'] }
    });
  }

  app.get(prefix + '/servers/:id/stats', async (ctx: any) => {
    const { id } = ctx.params as any;

    const withNetworkRates = async (input: any) => {
      const merged: any = input && typeof input === 'object' ? { ...input } : {};

      const readNumber = (source: any, paths: string[]): number => {
        for (const path of paths) {
          const parts = path.split('.');
          let cur = source;
          for (const p of parts) {
            if (cur == null) break;
            cur = cur[p];
          }
          const num = Number(cur);
          if (Number.isFinite(num)) return num;
        }
        return 0;
      };

      let rxBps = readNumber(merged, ['network.rx_bps', 'network.download_bps']);
      let txBps = readNumber(merged, ['network.tx_bps', 'network.upload_bps']);

      if (rxBps <= 0) {
        const rxMbps = readNumber(merged, ['network.rx_mbps', 'network.rx_mbit', 'network.rx_rate_mbps', 'network.download_mbps']);
        if (rxMbps > 0) rxBps = (rxMbps * 1_000_000) / 8;
      }
      if (txBps <= 0) {
        const txMbps = readNumber(merged, ['network.tx_mbps', 'network.tx_mbit', 'network.tx_rate_mbps', 'network.upload_mbps']);
        if (txMbps > 0) txBps = (txMbps * 1_000_000) / 8;
      }

      if (rxBps <= 0 && txBps <= 0) {
        try {
          const socRepo = AppDataSource.getRepository(SocData);
          const rows = await socRepo.find({ where: { serverId: id }, order: { timestamp: 'DESC' }, take: 2 });
          if (Array.isArray(rows) && rows.length >= 2) {
            const sorted = [...rows].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
            const prev = sorted[0];
            const last = sorted[1];

            const prevTs = new Date(prev.timestamp).getTime();
            const lastTs = new Date(last.timestamp).getTime();
            const deltaSeconds = (lastTs - prevTs) / 1000;

            if (Number.isFinite(deltaSeconds) && deltaSeconds > 0) {
              const prevRx = readNumber(prev.metrics ?? {}, ['network.rx_bytes', 'network.rx', 'network.received']);
              const prevTx = readNumber(prev.metrics ?? {}, ['network.tx_bytes', 'network.tx', 'network.sent']);
              const lastRx = readNumber(last.metrics ?? {}, ['network.rx_bytes', 'network.rx', 'network.received']);
              const lastTx = readNumber(last.metrics ?? {}, ['network.tx_bytes', 'network.tx', 'network.sent']);

              rxBps = Math.max(0, lastRx - prevRx) / deltaSeconds;
              txBps = Math.max(0, lastTx - prevTx) / deltaSeconds;
            }
          }
        } catch {
          // uwu no netwurk fur u
        }
      }

      const network = merged?.network && typeof merged.network === 'object' ? merged.network : {};
      merged.network = {
        ...network,
        rx_bps: Number.isFinite(rxBps) ? rxBps : 0,
        tx_bps: Number.isFinite(txBps) ? txBps : 0,
        rx_kbps: Number.isFinite(rxBps) ? (rxBps * 8) / 1_000 : 0,
        tx_kbps: Number.isFinite(txBps) ? (txBps * 8) / 1_000 : 0,
        rx_mbps: Number.isFinite(rxBps) ? (rxBps * 8) / 1_000_000 : 0,
        tx_mbps: Number.isFinite(txBps) ? (txBps * 8) / 1_000_000 : 0,
      };

      return merged;
    };

    try {
      const svc = await serviceFor(id);
      const res = await svc.serverRequest(id, '/stats');
      if (res?.data && typeof res.data === 'object') {
        return await withNetworkRates(extractStats(res.data));
      }
    } catch (e) {
      // skip
    }

    const socRepo = AppDataSource.getRepository(SocData);
    const latest = await socRepo.findOne({ where: { serverId: id }, order: { timestamp: 'DESC' } });
    return await withNetworkRates(latest?.metrics ?? {});
  }, {
    beforeHandle: [authenticate, authorize('servers:read')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Latest server stats', tags: ['Servers'] }
  });

  app.get(prefix + '/servers/:id/stats/history', async (ctx: any) => {
    const { id } = ctx.params as any;
    const { window: w = '1h', points: p = '60' } = ctx.query as any;
    const points = Math.max(12, Math.min(1440, Number(p) || 60));

    try {
      let rows: Array<{ timestamp: string; metrics: Record<string, any> }> = [];
      let liveData: Record<string, any> | null = null;

      try {
        const svc = await serviceFor(id);
        const res = await svc.serverRequest(id, '/stats');
        if (res?.data && typeof res.data === 'object') {
          liveData = extractStats(res.data);
        }
      } catch {
        // skip
      }

      if (w === 'live') {
        if (liveData) {
          return [{ timestamp: new Date().toISOString(), metrics: liveData }];
        }

        const { fetchHistorical } = await import('../services/metricsService');
        rows = await fetchHistorical(id, '5m', points);
      } else {
        const { fetchHistorical } = await import('../services/metricsService');
        rows = await fetchHistorical(id, w, points);
      }

      if (liveData) {
        if (rows.length === 0) {
          rows.push({ timestamp: new Date().toISOString(), metrics: liveData });
        } else {
          rows[rows.length - 1].metrics = liveData;
          rows[rows.length - 1].timestamp = new Date().toISOString();
        }
      } else if (w === 'live' && rows.length > 0) {
        rows.pop();
      }

      return rows;
    } catch (e: any) {
      console.error('stats history error', e);
      ctx.set.status = 500;
      return { error: 'Unable to build historical stats' };
    }
  }, {
    beforeHandle: [authenticate, authorize('servers:read')],
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 500: t.Object({ error: t.String() }) },
    detail: { summary: 'Historical stats', tags: ['Servers'] }
  });

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
      const svc = new WingsApiService((node as any).backendWingsUrl || node.url, node.token);
      const [infoResult, statsResult] = await Promise.allSettled([
        svc.getSystemInfo(),
        svc.getSystemStats(),
      ]);
      const info = infoResult.status === 'fulfilled' ? (infoResult.value.data ?? {}) : {};
      const statsPayload = statsResult.status === 'fulfilled' ? (statsResult.value.data ?? {}) : {};

      const merged: any = { ...info, ...(statsPayload.stats ?? {}) };

      const readNumber = (source: any, paths: string[]): number => {
        for (const path of paths) {
          const parts = path.split('.');
          let cur = source;
          for (const p of parts) {
            if (cur == null) break;
            cur = cur[p];
          }
          const num = Number(cur);
          if (Number.isFinite(num)) return num;
        }
        return 0;
      };

      let rxBps = readNumber(merged, [
        'network.rx_bps',
        'network.download_bps',
      ]);
      let txBps = readNumber(merged, [
        'network.tx_bps',
        'network.upload_bps',
      ]);

      if (rxBps <= 0) {
        const directMbps = readNumber(merged, ['network.rx_mbps', 'network.rx_mbit', 'network.rx_rate_mbps', 'network.download_mbps']);
        if (directMbps > 0) rxBps = (directMbps * 1_000_000) / 8;
      }
      if (txBps <= 0) {
        const directMbps = readNumber(merged, ['network.tx_mbps', 'network.tx_mbit', 'network.tx_rate_mbps', 'network.upload_mbps']);
        if (directMbps > 0) txBps = (directMbps * 1_000_000) / 8;
      }

      if (rxBps <= 0 && txBps <= 0) {
        try {
          const { fetchHistorical } = await import('../services/metricsService');
          const nodeMetricKey = `node:${mapping.node.id}`;
          const rows = await fetchHistorical(nodeMetricKey, '5m', 5);
          if (Array.isArray(rows) && rows.length >= 2) {
            const sorted = [...rows]
              .filter((row: any) => Number.isFinite(new Date(row?.timestamp).getTime()))
              .sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

            if (sorted.length >= 2) {
              const prev = sorted[sorted.length - 2];
              const last = sorted[sorted.length - 1];
              const prevTs = new Date(prev.timestamp).getTime();
              const lastTs = new Date(last.timestamp).getTime();
              const deltaSeconds = (lastTs - prevTs) / 1000;

              if (Number.isFinite(deltaSeconds) && deltaSeconds > 0) {
                const prevRx = readNumber(prev, ['metrics.network.rx_bytes', 'metrics.network.rx', 'metrics.network.received', 'network.rx_bytes', 'network.rx', 'network.received']);
                const prevTx = readNumber(prev, ['metrics.network.tx_bytes', 'metrics.network.tx', 'metrics.network.sent', 'network.tx_bytes', 'network.tx', 'network.sent']);
                const lastRx = readNumber(last, ['metrics.network.rx_bytes', 'metrics.network.rx', 'metrics.network.received', 'network.rx_bytes', 'network.rx', 'network.received']);
                const lastTx = readNumber(last, ['metrics.network.tx_bytes', 'metrics.network.tx', 'metrics.network.sent', 'network.tx_bytes', 'network.tx', 'network.sent']);

                rxBps = Math.max(0, lastRx - prevRx) / deltaSeconds;
                txBps = Math.max(0, lastTx - prevTx) / deltaSeconds;
              }
            }
          }
        } catch {
          // skippyyyyy
        }
      }

      const network = merged?.network && typeof merged.network === 'object' ? merged.network : {};
      merged.network = {
        ...network,
        rx_bps: Number.isFinite(rxBps) ? rxBps : 0,
        tx_bps: Number.isFinite(txBps) ? txBps : 0,
        rx_kbps: Number.isFinite(rxBps) ? (rxBps * 8) / 1_000 : 0,
        tx_kbps: Number.isFinite(txBps) ? (txBps * 8) / 1_000 : 0,
        rx_mbps: Number.isFinite(rxBps) ? (rxBps * 8) / 1_000_000 : 0,
        tx_mbps: Number.isFinite(txBps) ? (txBps * 8) / 1_000_000 : 0,
      };

      return merged;
    } catch (e: any) {
      ctx.set.status = 502;
      return { error: 'Unable to retrieve node stats' };
    }
  }, {
    beforeHandle: [authenticate, authorize('servers:read')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 502: t.Object({ error: t.String() }) },
    detail: { summary: 'Node-level stats', tags: ['Servers'] }
  });

  app.get(prefix + '/servers/:id/stats/node/history', async (ctx: any) => {
    const { id } = ctx.params as any;
    const { window: w = '24h', points: p = '144' } = ctx.query as any;
    const points = Math.max(12, Math.min(1440, Number(p) || 144));

    try {
      const mappingRepo = AppDataSource.getRepository(ServerMapping);
      const mapping = await mappingRepo.findOne({ where: { uuid: id }, relations: ['node'] });
      if (!mapping) {
        ctx.set.status = 404;
        return { error: 'No node mapping for server' };
      }

      const nodeMetricKey = `node:${mapping.node.id}`;
      const { fetchHistorical } = await import('../services/metricsService');
      let rows = await fetchHistorical(nodeMetricKey, w, points);

      try {
        const node = mapping.node;
        const svc = new WingsApiService((node as any).backendWingsUrl || node.url, node.token);
        const latest = await svc.getSystemStats();
        const liveMetrics = (latest as any)?.data?.stats ?? (latest as any)?.data ?? null;
        if (liveMetrics && typeof liveMetrics === 'object') {
          if (rows.length === 0) {
            rows = [{ timestamp: new Date().toISOString(), metrics: liveMetrics }];
          } else {
            rows[rows.length - 1].metrics = liveMetrics;
            rows[rows.length - 1].timestamp = new Date().toISOString();
          }
        }
      } catch {
        // skip live merge
      }

      return rows;
    } catch (e: any) {
      console.error('node stats history error', e);
      ctx.set.status = 500;
      return { error: 'Unable to build node historical stats' };
    }
  }, {
    beforeHandle: [authenticate, authorize('servers:read')],
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }), 500: t.Object({ error: t.String() }) },
    detail: { summary: 'Node historical stats for server\'s host node', tags: ['Servers'] }
  });

  app.get(prefix + '/servers/:id/configuration', async (ctx: any) => {
    const { id } = ctx.params as any;
    const svc = await serviceFor(id);
    const res = await svc.serverRequest(id, '/configuration');
    return res.data ?? {};
  }, {
    beforeHandle: [authenticate, authorize('configuration:read')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Server configuration', tags: ['Servers'] }
  });

  app.post(prefix + '/servers/:id/script', async (ctx: any) => {
    const { id } = ctx.params as any;
    const svc = await serviceFor(id);
    const res = await svc.serverRequest(id, '/script', 'post', ctx.body);
    return res.data && typeof res.data === 'object' ? res.data : { success: true };
  }, {
    beforeHandle: [authenticate, authorize('servers:write')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Run script', tags: ['Servers'] }
  });

  app.post(prefix + '/servers/:id/ws/permissions', async (ctx: any) => {
    const { id } = ctx.params as any;
    const svc = await serviceFor(id);
    const res = await svc.serverRequest(id, '/ws/permissions', 'post', ctx.body);
    return res.data && typeof res.data === 'object' ? res.data : { success: true };
  }, {
    beforeHandle: [authenticate, authorize('servers:write')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Set WS permissions', tags: ['Servers'] }
  });

  app.post(prefix + '/servers/:id/ws/broadcast', async (ctx: any) => {
    const { id } = ctx.params as any;
    const svc = await serviceFor(id);
    const res = await svc.serverRequest(id, '/ws/broadcast', 'post', ctx.body);
    return res.data && typeof res.data === 'object' ? res.data : { success: true };
  }, {
    beforeHandle: [authenticate, authorize('servers:write')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Broadcast WS message', tags: ['Servers'] }
  });

  app.post(prefix + '/servers/:id/install/abort', async (ctx: any) => {
    const { id } = ctx.params as any;
    const svc = await serviceFor(id);
    const res = await svc.serverRequest(id, '/install/abort', 'post');
    return res.data && typeof res.data === 'object' ? res.data : { success: true };
  }, {
    beforeHandle: [authenticate, authorize('servers:write')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Abort install', tags: ['Servers'] }
  });

  app.get(prefix + '/servers/:id/logs/install', async (ctx: any) => {
    const { id } = ctx.params as any;
    const svc = await serviceFor(id);
    const res = await svc.serverRequest(id, '/logs/install');
    return res.data ?? [];
  }, {
    beforeHandle: [authenticate, authorize('logs:read')],
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Fetch install logs', tags: ['Servers', 'Logs'] }
  });

  app.get(prefix + '/servers/:id/configuration/egg', async (ctx: any) => {
    const { id } = ctx.params as any;
    const svc = await serviceFor(id);
    const res = await svc.serverRequest(id, '/configuration/egg');
    return res.data ?? {};
  }, {
    beforeHandle: [authenticate, authorize('configuration:read')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Egg-specific configuration', tags: ['Servers'] }
  });

  app.put(prefix + '/servers/:id/configuration/egg', async (ctx: any) => {
    const { id } = ctx.params as any;
    const payload = ctx.body;
    const svc = await serviceFor(id);
    const res = await svc.serverRequest(id, '/configuration/egg', 'put', payload);
    return res.data && typeof res.data === 'object' ? res.data : { success: true };
  }, {
    beforeHandle: [authenticate, authorize('configuration:write')],
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

    const selectedDockerImage = cfg.dockerImage || egg?.dockerImage || '';
    const dockerImageOptions: Array<{ label: string; value: string }> = [];

    if (egg?.dockerImages && typeof egg.dockerImages === 'object') {
      for (const [key, value] of Object.entries(egg.dockerImages)) {
        dockerImageOptions.push({ label: String(key), value: String(value) });
      }
    }

    if (egg?.dockerImage) {
      const exists = dockerImageOptions.some((option) => option.value === egg.dockerImage);
      if (!exists) dockerImageOptions.unshift({ label: 'Default', value: egg.dockerImage });
    }

    if (selectedDockerImage && !dockerImageOptions.some((option) => option.value === selectedDockerImage)) {
      dockerImageOptions.unshift({ label: 'Custom', value: selectedDockerImage });
    }

    return {
      environment: cfg.environment || {},
      startup: cfg.startup || '',
      dockerImage: selectedDockerImage,
      dockerImageOptions,
      envVars: egg?.envVars || [],
      eggName: egg?.name || null,
      processConfig: {
        startup: {
          done: normalizeStartupDonePatterns(proc.startup?.done),
          strip_ansi: proc.startup?.strip_ansi ?? false,
        },
        stop: {
          type: proc.stop?.type || 'command',
          value: proc.stop?.value || 'stop',
        },
      },
    };
  }, {
    beforeHandle: [authenticate, authorize('servers:read')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Get startup configuration', tags: ['Servers'] }
  });

  app.put(prefix + '/servers/:id/startup', async (ctx: any) => {
    const { id } = ctx.params as any;
    const { environment, processConfig: incomingProcCfg, dockerImage } = ctx.body as any;
    if (!environment && !incomingProcCfg && dockerImage === undefined) {
      ctx.set.status = 400;
      return { error: 'environment, processConfig, or dockerImage is required' };
    }

    const cfg = await cfgRepo().findOneBy({ uuid: id });
    if (!cfg) {
      ctx.set.status = 404;
      return { error: 'Server not found' };
    }

    const user = ctx.user;
    const isAdmin = user?.role === '*' || user?.role === 'rootAdmin' || user?.role === 'admin';

    const egg = cfg.eggId ? await eggRepo().findOneBy({ id: cfg.eggId }) : null;
    const editableKeys = new Set<string>();
    if (egg?.envVars) {
      for (const v of egg.envVars as any[]) {
        if (v.user_editable) editableKeys.add(v.env_variable || v.key || v.name);
      }
    }

    if (dockerImage !== undefined) {
      const allowedImages = new Set<string>();
      if (egg?.dockerImage) allowedImages.add(String(egg.dockerImage));
      if (egg?.dockerImages && typeof egg.dockerImages === 'object') {
        for (const v of Object.values(egg.dockerImages)) {
          allowedImages.add(String(v));
        }
      }

      if (!isAdmin && allowedImages.size > 0 && !allowedImages.has(String(dockerImage))) {
        ctx.set.status = 403;
        return { error: 'Invalid docker image selection' };
      }

      cfg.dockerImage = String(dockerImage);
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
      updated.startup = {
        ...(updated.startup || {}),
        done: normalizeStartupDonePatterns(updated.startup?.done),
      };
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
  }, {
    beforeHandle: [authenticate, authorize('servers:write')],
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
  }, {
    beforeHandle: [authenticate, authorize('servers:read')],
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

    const normalizeUuid = (value: any) => {
      if (!value) return uuidv4().replace(/-/g, '');
      const s = String(value).toLowerCase().replace(/-/g, '');
      if (/^[0-9a-f]{32}$/.test(s)) return s;
      return uuidv4().replace(/-/g, '');
    };

    const now = Math.floor(Date.now() / 1000);
    const safeUserUuid = normalizeUuid(user?.uuid || user?.id || uuidv4());
    const safeServerUuid = normalizeUuid(id);
    const jti = normalizeUuid(uuidv4());

    console.debug('wings jwt payload lengths', {
      user_uuid: safeUserUuid.length,
      server_uuid: safeServerUuid.length,
      jti: jti.length,
      sub_source: {
        uuid: String(user?.uuid || ''),
        id: (user?.id != null ? String(user.id) : undefined),
      },
    });

    const payload = {
      iss: 'eclipanel',
      sub: safeUserUuid,
      aud: [''],
      iat: now,
      nbf: now,
      exp: now + 600,
      jti,
      user_uuid: safeUserUuid,
      server_uuid: safeServerUuid,
      permissions: ['*'],
      use_console_read_permission: false,
    };

    const token = signWingsJwt(payload, node.token);

    if (process.env.DEBUG_WINGS_JWT === '1') {
      try {
        const parts = token.split('.')
        if (parts.length === 3) {
          const payloadJson = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8')) as any
          ctx.log?.debug?.(
            { payload: { sub: payloadJson.sub, user_uuid: payloadJson.user_uuid, server_uuid: payloadJson.server_uuid, jti: payloadJson.jti } },
            'wings jwt payload decoded from token',
          )
        }
      } catch {
        // skip
      }
    }

    const incomingProto = (ctx.headers['x-forwarded-proto'] as string) || ctx.protocol || 'https';
    const forwardedHost = (ctx.headers['x-forwarded-host'] as string) || (ctx.headers['host'] as string) || ctx.hostname;
    const hostSafe = forwardedHost && forwardedHost !== 'undefined' ? forwardedHost : 'localhost';
    const backendBase = (process.env.BACKEND_URL || `${incomingProto}://${hostSafe}`).replace(/\/+$/, '');
    const socketScheme = backendBase.startsWith('https') || incomingProto === 'https' ? 'wss' : 'ws';

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
    const wsUrl = backendBase.replace(/^https?/, socketScheme) + `/api/servers/${id}/ws/proxy?token=${encodeURIComponent(panelJwt)}`;

    return {
      data: {
        token,
        socket: wsUrl,
      },
    };
  }, {
    beforeHandle: [authenticate, authorize('servers:console')],
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

    const backendBase = (process.env.BACKEND_URL || '').replace(/\/+$/, '');
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
  }, {
    beforeHandle: [authenticate, authorize('servers:read')],
    response: { 200: t.Object({ host: t.String(), port: t.Number(), username: t.String(), proxied: t.Boolean() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }), 500: t.Object({ error: t.String() }) },
    detail: { summary: 'Get SFTP connection info', tags: ['Servers'] }
  });

  app.get(prefix + '/infrastructure/code-instances', async (ctx: any) => {
    const user = ctx.user as User;
    if (!user) {
      ctx.set.status = 401;
      return { error: 'Unauthorized' };
    }

    const instances = await cfgRepo().find({ where: { userId: user.id, isCodeInstance: true } });
    return instances.map((cfg) => ({
      uuid: cfg.uuid,
      name: cfg.name,
      nodeId: cfg.nodeId,
      memory: cfg.memory,
      disk: cfg.disk,
      cpu: cfg.cpu,
      status: cfg.hibernated ? 'hibernated' : 'active',
      lastActivityAt: cfg.lastActivityAt,
      createdAt: cfg.createdAt,
      codeInstanceMinutesUsed: cfg.codeInstanceMinutesUsed,
    }));
  }, {
    beforeHandle: [authenticate],
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }) },
    detail: { summary: 'List code instances for the current user', tags: ['Code Instances'] }
  });

  app.post(prefix + '/infrastructure/code-instances/:uuid/ping', async (ctx: any) => {
    const { uuid } = ctx.params as any;
    const user = ctx.user as User;
    if (!user) {
      ctx.set.status = 401;
      return { error: 'Unauthorized' };
    }

    const cfg = await cfgRepo().findOneBy({ uuid, isCodeInstance: true });
    if (!cfg || cfg.userId !== user.id) {
      ctx.set.status = 404;
      return { error: 'Code Instance not found' };
    }

    cfg.lastActivityAt = new Date();
    await cfgRepo().save(cfg);

    await createActivityLog({ userId: user.id, action: 'codeInstance:ping', targetId: uuid, targetType: 'code-instance', ipAddress: ctx.ip });
    return { success: true };
  }, {
    beforeHandle: [authenticate],
    response: { 200: t.Object({ success: t.Boolean() }), 401: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Ping code instance activity', tags: ['Code Instances'] }
  });

  app.post(prefix + '/infrastructure/code-instances/:uuid/stop', async (ctx: any) => {
    const { uuid } = ctx.params as any;
    const user = ctx.user as User;
    if (!user) {
      ctx.set.status = 401;
      return { error: 'Unauthorized' };
    }

    const cfg = await cfgRepo().findOneBy({ uuid, isCodeInstance: true });
    if (!cfg || cfg.userId !== user.id) {
      ctx.set.status = 404;
      return { error: 'Code Instance not found' };
    }

    try {
      const svc = await serviceFor(uuid);
      await svc.powerServer(uuid, 'stop').catch(() => { });
      await svc.serverRequest(uuid, '', 'delete').catch(() => { });
    } catch (e: any) {
      // skip
    }

    await removeServerConfig(uuid).catch(() => { });
    await nodeSvc.unmapServer(uuid).catch(() => { });

    await createActivityLog({ userId: user.id, action: 'codeInstance:stop', targetId: uuid, targetType: 'code-instance', ipAddress: ctx.ip });
    return { success: true };
  }, {
    beforeHandle: [authenticate],
    response: { 200: t.Object({ success: t.Boolean() }), 401: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Stop and delete code instance', tags: ['Code Instances'] }
  });
}
