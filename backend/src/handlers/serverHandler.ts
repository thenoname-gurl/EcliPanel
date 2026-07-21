import { WingsApiService } from '../services/wingsApiService';
import { ProxmoxApiService } from '../services/proxmoxApiService';
import { extractStats } from '../services/metricsCollector';
import { nodeService, type ProviderService } from '../services/nodeService';
import {
  listSftpFiles,
  readSftpFile,
  writeSftpFile,
  deleteSftpFiles,
  mkdirSftp,
  renameSftp,
  moveSftpFiles,
  chmodSftp,
  validateSftpCredentials,
} from '../services/sftpClientService';
import { authenticate } from '../middleware/auth';
import { authorize, hasPermissionSync } from '../middleware/authorize';
import { AppDataSource } from '../config/typeorm';
import { User } from '../models/user.entity';
import { UserLog } from '../models/userLog.entity';
import { Node } from '../models/node.entity';
import { Egg } from '../models/egg.entity';
import {
  saveServerConfig,
  removeServerConfig,
  signWingsJwt,
  mergeDuplicateServerConfigs,
} from './remoteHandler';
import { ServerConfig } from '../models/serverConfig.entity';
import { Mount } from '../models/mount.entity';
import { ServerMount } from '../models/serverMount.entity';
import { ApplicationForm } from '../models/applicationForm.entity';
import { ApplicationSubmission } from '../models/applicationSubmission.entity';
import { In, IsNull, LessThan, MoreThanOrEqual, Not } from 'typeorm';
import { EloProject } from '../models/eloProject.entity';
import { EloDevlog } from '../models/eloDevlog.entity';
import { EloVote } from '../models/eloVote.entity';
import { getUnhealthyNodeIds } from '../utils/nodeHealth';
import { SocData } from '../models/socData.entity';
import { ServerMapping } from '../models/serverMapping.entity';
import { createActivityLog } from './logHandler';
import { ServerSubuser } from '../models/serverSubuser.entity';
import { PanelSetting } from '../models/panelSetting.entity';
import { getGeoBlockLevel, requiresKyc, isKycVerified } from '../utils/eu';
import {
  notifyServerOwnerDmca,
  notifyServerOwnerSuspended,
  notifyServerOwnerUnsuspended,
} from '../utils/suspensionNotice';
import {
  isValidIpv6,
  isIpv6InSubnet,
  getNextFreeIpv6Address,
  parseIpv6,
  formatIpv6,
  parseIpv6Cidr,
} from '../utils/ipv6';
import { t } from 'elysia';
import { httpRequest } from '../utils/http';
import {
  DEFAULT_STARTUP_DETECTION_PATTERN,
  normalizeStartupDonePatterns,
} from '../utils/startupDetection';
import { sanitizeError } from '../utils/sanitizeError';
import { withRedisCache, redisDel } from '../config/redis';
import type { AuthenticatedHandlerContext, ServerApp } from '../types';
import type {
  MetricsData,
  MetricsRow,
  ServerAllocationLike,
  ServerAllocationOwners,
  ServerProcessConfigLike,
  ServerSftpInfo,
  ServerBoostPayload,
  BoostInfo,
} from '../types/server';

export async function serverRoutes(app: ServerApp, prefix = '') {
  const nodeSvc = nodeService;
  const logRepo = () => AppDataSource.getRepository(UserLog);
  const userRepo = () => AppDataSource.getRepository(User);
  const nodeRepo = () => AppDataSource.getRepository(Node);
  const orgMemberRepo = () =>
    AppDataSource.getRepository(require('../models/organisationMember.entity').OrganisationMember);
  const eggRepo = () => AppDataSource.getRepository(Egg);
  const cfgRepo = () => AppDataSource.getRepository(ServerConfig);
  const applicationFormRepo = () => AppDataSource.getRepository(ApplicationForm);
  const applicationSubmissionRepo = () => AppDataSource.getRepository(ApplicationSubmission);
  const panelSettingRepo = () => AppDataSource.getRepository(PanelSetting);
  const eloProjectRepo = () => AppDataSource.getRepository(EloProject);
  const eloDevlogRepo = () => AppDataSource.getRepository(EloDevlog);
  const eloVoteRepo = () => AppDataSource.getRepository(EloVote);
  const SERVER_LIST_SELECT = [
    'ServerConfig.uuid', 'ServerConfig.nodeId', 'ServerConfig.userId',
    'ServerConfig.name', 'ServerConfig.description', 'ServerConfig.suspended',
    'ServerConfig.suspendedBy', 'ServerConfig.suspendedReason', 'ServerConfig.suspendedAt',
    'ServerConfig.dmca', 'ServerConfig.ignoreAntiAbuse', 'ServerConfig.hibernated',
    'ServerConfig.desiredPowerState', 'ServerConfig.dockerImage', 'ServerConfig.startup',
    'ServerConfig.memory', 'ServerConfig.disk', 'ServerConfig.cpu', 'ServerConfig.swap',
    'ServerConfig.ioWeight', 'ServerConfig.oomDisabled', 'ServerConfig.eggId',
    'ServerConfig.skipEggScripts', 'ServerConfig.installing', 'ServerConfig.lastActivityAt',
    'ServerConfig.maxDatabases', 'ServerConfig.maxBackups', 'ServerConfig.createdAt',
    'ServerConfig.environment', 'ServerConfig.vmType', 'ServerConfig.vmid',
    'ServerConfig.template', 'ServerConfig.isoFile', 'ServerConfig.cores',
    'ServerConfig.sockets', 'ServerConfig.ostemplate', 'ServerConfig.rootfs',
    'ServerConfig.netif', 'ServerConfig.nameserver', 'ServerConfig.searchdomain',
    'ServerConfig.autoSyncOnEggChange', 'ServerConfig.kvmPassthroughEnabled',
    'ServerConfig.dmcaBy', 'ServerConfig.dmcaReason', 'ServerConfig.dmcaAt',
    'ServerConfig.dmcaDeletionAt',
  ];

  const getOrCreateIpRequestForm = async () => {
    let form = await applicationFormRepo().findOneBy({ slug: 'ip-request' });
    if (form) {
      if (form.kind !== 'staff_application') {
        form.kind = 'staff_application';
        form = await applicationFormRepo().save(form);
      }
      return form;
    }

    form = applicationFormRepo().create({
      title: 'IP Request',
      description: 'Request an IPv4 or IPv6 allocation for your server.',
      kind: 'staff_application',
      slug: 'ip-request',
      visibility: 'public_users',
      status: 'active',
      schema: {
        title: 'IP Request',
        description: 'Request an IPv4 or IPv6 allocation for your server.',
        questions: [
          {
            id: 'type',
            label: 'Allocation type',
            type: 'short_text',
            required: true,
            placeholder: 'IPv4 or IPv6',
          },
          {
            id: 'reason',
            label: 'Reason',
            type: 'long_text',
            required: true,
            placeholder: 'Why do you need this allocation?',
          },
        ],
      },
      active: true,
      requiresAccount: true,
      maxSubmissionsPerUser: 5,
      ipCooldownSeconds: 0,
      createdBy: 0,
    });
    return await applicationFormRepo().save(form);
  };

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

  function isGamblingModeEnabled(user: User): boolean {
    const themeName = String(user?.settings?.theme?.name || '')
      .trim()
      .toLowerCase();
    return GAMBLING_THEME_NAMES.has(themeName);
  }

  function clampInt(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Math.floor(value)));
  }

  function clampChance(value: number, fallback: number): number {
    if (!Number.isFinite(value)) return fallback;
    return Math.max(0, Math.min(1, value));
  }

  function normalizeBadgeList(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .map(v => String(v || '').trim())
      .filter(v => v.length > 0)
      .slice(0, 128);
  }

  function parsePortList(raw: unknown): Set<number> {
    const ports = new Set<number>();
    if (raw == null) return ports;
    const values = Array.isArray(raw) ? raw : String(raw).split(/[\s,]+/);
    for (const value of values) {
      const port = Number(String(value).trim());
      if (Number.isInteger(port) && port > 0 && port <= 65535) {
        ports.add(port);
      }
    }
    return ports;
  }

  function parseVmPorts(raw: unknown): Set<number> {
    const ports = new Set<number>();
    if (raw == null) return ports;
    const values = Array.isArray(raw) ? raw : String(raw).split(/\s*,\s*/);
    for (const value of values) {
      const entry = String(value).trim();
      if (!entry) continue;
      const match = entry.match(/^(\d{1,5})(?::\d{1,5})?(?:\/(?:tcp|udp))?$/i);
      if (!match) continue;
      const port = Number(match[1]);
      if (Number.isInteger(port) && port >= 1 && port <= 65535) ports.add(port);
    }
    return ports;
  }

  function normalizeIpv6Host(value: unknown): string {
    const raw = String(value ?? '').trim();
    if (raw.startsWith('[') && raw.endsWith(']')) {
      return raw.slice(1, -1).trim();
    }
    return raw;
  }

  function isReservedIpv6(address: string, subnet: string, reservedCount?: number): boolean {
    if (!reservedCount || reservedCount <= 0) return false;
    const addr = parseIpv6(address);
    const { network, prefix } = parseIpv6Cidr(subnet);
    const first = prefix === 128 ? network : network + 1n;
    const reservedEnd = first + BigInt(reservedCount) - 1n;
    return addr >= first && addr <= reservedEnd;
  }

  function mergeBadges(existing: unknown, earned: string[]): string[] {
    const merged = new Set<string>([
      ...normalizeBadgeList(existing),
      ...normalizeBadgeList(earned),
    ]);
    return Array.from(merged);
  }

  async function resolveSftpAccess(serverUuid: string, ctx: AuthenticatedHandlerContext) {
    const user = ctx.user;
    if (!user) {
      ctx.set.status = 401;
      return { error: ctx.t('auth.unauthorized') };
    }

    const cfg = await cfgRepo().findOneBy({ uuid: serverUuid });
    if (!cfg) {
      ctx.set.status = 404;
      return { error: ctx.t('server.notFound') };
    }

    if (!cfg.kvmPassthroughEnabled) {
      ctx.set.status = 400;
      return { error: ctx.t('server.sftpOnlyKvm') };
    }

    const node = cfg.nodeId ? await nodeRepo().findOneBy({ id: cfg.nodeId }) : null;
    if (!node) {
      ctx.set.status = 503;
      return { error: ctx.t('server.serverNodeNotFound') };
    }

    const isOwner = cfg.userId === user.id;
    let isSubuser = false;
    if (!isOwner) {
      const sub = await AppDataSource.getRepository(ServerSubuser).findOne({
        where: { serverUuid: cfg.uuid, userId: user.id, accepted: true },
      });
      if (
        sub &&
        Array.isArray(sub.permissions) &&
        (sub.permissions.includes('*') ||
          sub.permissions.includes('files') ||
          sub.permissions.includes('console'))
      ) {
        isSubuser = true;
      }
    }

    if (!isOwner && !isSubuser) {
      ctx.set.status = 403;
      return { error: ctx.t('common.forbidden') };
    }

    if (cfg.suspended || cfg.dmca) {
      ctx.set.status = 403;
      return {
        error: cfg.dmca ? 'Server placed under DMCA takedown' : 'Server suspended',
      };
    }

    const password = String(
      ctx.request?.headers?.get('x-sftp-password') || (String((ctx.body as Record<string, unknown>)?.password ?? '')) || ''
    ).trim();

    if (!password) {
      ctx.set.status = 401;
      return { error: ctx.t('server.sftpPasswordRequired') };
    }

    const kvmEndpoint = (() => {
      const alloc = cfg.allocations;
      if (!alloc?.default || !alloc.default.ip) return null;
      const ip = String(alloc.default.ip);
      const port = Number(alloc.default.port ?? 2022);
      if (!Number.isFinite(port) || port <= 0) return null;
      const legacyKey = `${ip}:${port}`;
      const bracketKey = ip.includes(':') ? `[${ip}]:${port}` : legacyKey;
      const host = alloc.fqdns?.[bracketKey] || alloc.fqdns?.[legacyKey] || ip;
      return { host, port };
    })();

    if (!kvmEndpoint) {
      ctx.set.status = 503;
      return { error: ctx.t('server.kvmOnly') };
    }

    return { cfg, node, username: 'root', password, endpoint: kvmEndpoint };
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
    const resourceLuckyChance = clampChance(
      Number(map['gamblingResourceLuckyChance']),
      GAMBLING_DEFAULT_RESOURCE_LUCKY_CHANCE
    );
    const powerDenyChance = clampChance(
      Number(map['gamblingPowerDenyChance']),
      GAMBLING_DEFAULT_POWER_DENY_CHANCE
    );

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

  function buildSuspendedServerMessage(cfg: ServerConfig): string {
    if (cfg.dmca) {
      const actor = String(cfg.dmcaBy || cfg.suspendedBy || 'system').trim() || 'system';
      const reason =
        String(cfg.dmcaReason || cfg.suspendedReason || 'No reason provided').trim() ||
        'No reason provided';
      const deletionAt = cfg.dmcaDeletionAt
        ? ` It is scheduled for deletion on ${cfg.dmcaDeletionAt.toISOString()}.`
        : ' It is scheduled for deletion in 30 days.';
      return `This server has been placed under a DMCA takedown by ${actor} for reason: ${reason}.${deletionAt} You may submit a counter-notice with support.`;
    }
    const actor = String(cfg.suspendedBy || 'system').trim() || 'system';
    const reason =
      String(cfg.suspendedReason || 'No reason provided').trim() || 'No reason provided';
    return `This server was suspended by ${actor} for reason: ${reason}. Please contact support.`;
  }

  function drawBlackjackCardValue(): number {
    const raw = randomIntInclusive(1, 13);
    if (raw === 1) return 11;
    if (raw >= 10) return 10;
    return raw;
  }

  function resolveBlackjackScore(cards: number[]): { score: number; softAces: number } {
    let score = cards.reduce((sum, value) => sum + value, 0);
    let softAces = cards.filter(value => value === 11).length;

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
    return (
      POWER_DICE_FAILURE_LINES[randomIntInclusive(0, POWER_DICE_FAILURE_LINES.length - 1)] ||
      '🎲 Nuh uh.'
    );
  }

  function normalizeGamblingStats(raw: Record<string, unknown> | null | undefined) {
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

  function applyGambleOutcome(
    raw: Record<string, unknown> | null | undefined,
    didWin: boolean,
    meta?: { luckyHit?: boolean; bonusActivated?: boolean }
  ) {
    const stats = normalizeGamblingStats(raw);

    stats.gambleCount += 1;
    stats.rollCount = stats.gambleCount;

    if (didWin) {
      stats.wins += 1;
      stats.currentWinStreak += 1;
      stats.currentLossStreak = 0;
      if (stats.currentWinStreak > stats.bestWinStreak)
        stats.bestWinStreak = stats.currentWinStreak;
    } else {
      stats.losses += 1;
      stats.currentLossStreak += 1;
      stats.currentWinStreak = 0;
      if (stats.currentLossStreak > stats.bestLossStreak)
        stats.bestLossStreak = stats.currentLossStreak;
    }

    if (meta?.luckyHit) stats.luckyHits += 1;
    if (meta?.bonusActivated) stats.bonusActivations += 1;
    stats.lastRollAt = new Date().toISOString();

    return stats;
  }

  function buildGamblingBadges(stats: Record<string, unknown> | null | undefined): string[] {
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
    if (normalized.wins >= 5 && normalized.losses >= 5 && normalized.wins === normalized.losses)
      badges.push('Mr. 50/50');
    if (normalized.luckyHits >= 3) badges.push('Lucky Spark');
    if (normalized.luckyHits >= 15) badges.push('Fortune Engine');
    if (normalized.bonusActivations >= 1) badges.push('Boosted by Fate');
    return badges;
  }

  async function recordPowerGambleOutcome(userId: number, didWin: boolean) {
    const owner = await userRepo().findOneBy({ id: userId });
    if (!owner) return;
    if (!isGamblingModeEnabled(owner)) return;

    const currentSettings =
      owner.settings && typeof owner.settings === 'object' ? { ...owner.settings } : {};
    const gamblingSettings =
      currentSettings.gambling && typeof currentSettings.gambling === 'object'
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

  function requireProvider(expected: 'wings' | 'proxmox') {
    return async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      if (!id) return;
      try {
        const svc = await serviceFor(id);
        const isProxmox = svc instanceof ProxmoxApiService;
        if (expected === 'wings' && isProxmox) {
          ctx.set.status = 400;
          return { error: ctx.t('server.this_endpoint_is_only_available_for_wings_nodes') };
        }
        if (expected === 'proxmox' && !isProxmox) {
          ctx.set.status = 400;
          return { error: ctx.t('server.this_endpoint_is_only_available_for_proxmox_nodes') };
        }
      } catch {
        ctx.set.status = 404;
        return { error: ctx.t('server.server_not_found') };
      }
    };
  }

  async function requireEloDevlog(ctx: AuthenticatedHandlerContext) {
    if (ctx.user?.role === '*' || ctx.user?.role === 'rootAdmin' || ctx.user?.role === 'admin') return;
    const { id } = (ctx.params ?? {}) as Record<string, string>;
    if (!id) return;
    const action: string | undefined = (ctx.body as Record<string, unknown> | undefined)?.action as string | undefined;
    if (action !== 'start' && action !== 'restart') return;
    const project = await eloProjectRepo().findOneBy({ serverId: id });
    if (!project) return;
    const DEVLOG_GRACE_DAYS = 7;
    const graceCutoff = new Date(Date.now() - DEVLOG_GRACE_DAYS * 24 * 60 * 60 * 1000);
    const recentDevlog = await eloDevlogRepo().findOne({
      where: { projectId: project.id, publishedAt: MoreThanOrEqual(graceCutoff) },
      order: { publishedAt: 'DESC' },
    });
    if (recentDevlog) return;
    if (project.skipTokensRemaining > 0) {
      project.skipTokensRemaining -= 1;
      await eloProjectRepo().save(project);
      return;
    }
    ctx.set.status = 200;
    return {
      success: false,
      needsDevlog: true,
      projectId: project.id,
      skipTokensRemaining: 0,
      message: 'This server needs a recent devlog to start. Publish a devlog or use a skip token.',
    };
  }

  async function requireEloVote(ctx: AuthenticatedHandlerContext) {
    if (ctx.user?.role === '*' || ctx.user?.role === 'rootAdmin' || ctx.user?.role === 'admin') return;
    const { id } = (ctx.params ?? {}) as Record<string, string>;
    if (!id) return;
    const action: string | undefined = (ctx.body as Record<string, unknown> | undefined)?.action as string | undefined;
    if (action !== 'start' && action !== 'restart') return;
    const project = await eloProjectRepo().findOneBy({ serverId: id });
    if (!project) return;
    const VOTE_REQUIREMENT_DAYS = 7;
    const cutoff = new Date(Date.now() - VOTE_REQUIREMENT_DAYS * 24 * 60 * 60 * 1000);
    const recentVote = await eloVoteRepo().findOne({
      where: { voterId: ctx.user.id, createdAt: MoreThanOrEqual(cutoff) },
      order: { createdAt: 'DESC' },
    });
    if (recentVote) return;
    ctx.set.status = 400;
    return {
      success: false,
      needsVote: true,
      message: 'You must cast at least one vote in the last ' + VOTE_REQUIREMENT_DAYS + ' days to start this server. Visit the ELO Voting page.',
    };
  }

  async function requireEloProjectDetails(ctx: AuthenticatedHandlerContext) {
    const { id } = (ctx.params ?? {}) as Record<string, string>;
    if (!id) return;
    const action: string | undefined = (ctx.body as Record<string, unknown> | undefined)?.action as string | undefined;
    if (action !== 'start' && action !== 'restart') return;
    const project = await eloProjectRepo().findOneBy({ serverId: id });
    if (!project) return;
    const missing: string[] = [];
    if (!project.title?.trim()) missing.push('Title');
    if (!project.description?.trim() || project.description.trim().split(/\s+/).length < 15) {
      if (!project.description?.trim()) missing.push('Description (min 15 words)');
      else missing.push('Description (min 15 words, got ' + project.description.trim().split(/\s+/).length + ')');
    }
    if (!project.githubUrl?.trim()) missing.push('GitHub URL');
    if (!project.readme?.trim()) missing.push('README');
    if (!project.screenshots?.length) missing.push('Screenshots (at least 1)');
    if (missing.length === 0) return;
    ctx.set.status = 400;
    return {
      success: false,
      needsProjectDetails: true,
      projectId: project.id,
      missing,
      message: 'Complete your ELO Project Details before starting: ' + missing.join(', ') + '.',
    };
  }

  async function pickNode(
    ctx: AuthenticatedHandlerContext,
    user: User,
    preferredNodeId?: number,
    assignedNodeId?: number
  ): Promise<Node> {
    const isAdmin = hasPermissionSync(ctx, 'admin:access');
    const effectivePortalType = user.portalType;
    const portalType =
      effectivePortalType === 'educational' ? 'free' : effectivePortalType || 'free';
    const unhealthyNodeIds = await getUnhealthyNodeIds();

    // Enterprise users with assigned nodes must use their assigned node
    // LIKE SERIOUSLY DONT TOUCH POOR USERS ASSIGNED NODES
    // ITS A NIGHTMARE TO SUPPORT OTHERWISE AND THEY PROBABLY
    // PAID ONLY FOR THE ASSIGNED NODE FEATURE ANYWAY
    if (portalType === 'enterprise' && assignedNodeId) {
      const n = await nodeRepo().findOneBy({ id: assignedNodeId });
      if (!n) throw new Error('Assigned enterprise node not found');
      if (n.deploymentsDisabled) {
        throw new Error(
          n.deploymentNotice || 'This node is temporarily unavailable for deployments'
        );
      }
      if (unhealthyNodeIds.includes(n.id)) {
        throw new Error('Assigned node is currently unavailable');
      }
      return n;
    }

    if (preferredNodeId) {
      const n = await nodeRepo().findOne({
        where: { id: preferredNodeId },
        relations: { organisation: true },
      });
      if (!n) throw new Error('Specified node not found');

      if (!isAdmin) {
        if (portalType === 'enterprise') {
          const memberships = await orgMemberRepo().find({ where: { userId: user.id } });
          const orgIds = memberships
            .map((m: { organisationId: number }) => Number(m.organisationId))
            .filter((v: number) => Number.isFinite(v));
          if (!n.organisation?.id || !orgIds.includes(Number(n.organisation.id))) {
            throw new Error('Node not available for your organisation');
          }
        } else {
          const allowedTypes =
            portalType === 'paid' ? ['paid', 'free_and_paid'] : ['free', 'free_and_paid'];
          if (!allowedTypes.includes(n.nodeType || '')) {
            throw new Error('Node not available for your portal tier');
          }
        }
      }

      if (n.deploymentsDisabled) {
        throw new Error(
          n.deploymentNotice || 'This node is temporarily unavailable for deployments'
        );
      }

      if (unhealthyNodeIds.includes(n.id)) {
        throw new Error('Preferred node is currently unavailable');
      }
      return n;
    }

    let types: string[];
    if (portalType === 'enterprise') {
      const memberships = await orgMemberRepo().find({ where: { userId: user.id } });
      const orgIds = memberships
        .map((m: { organisationId: number }) => Number(m.organisationId))
        .filter((v: number) => Number.isFinite(v));
      if (orgIds.length > 0) {
        const where: Record<string, unknown> = { organisation: { id: In(orgIds) } };
        if (unhealthyNodeIds.length) {
          where.id = Not(In(unhealthyNodeIds));
        }
        const orgNode = (await nodeRepo().findOne({ where })) as Node | null;
        if (orgNode) return orgNode;
      }
      types = ['enterprise', 'free_and_paid', 'paid', 'free'];
    } else if (portalType === 'paid') {
      types = ['paid', 'free_and_paid'];
    } else {
      types = ['free', 'free_and_paid'];
    }

    for (const t of types) {
      const where: Record<string, unknown> = { nodeType: t };
      if (unhealthyNodeIds.length) {
        where.id = Not(In(unhealthyNodeIds));
      }
      where.deploymentsDisabled = false;
      const n = await nodeRepo().findOne({ where });
      if (n) return n;
    }

    const fallback = unhealthyNodeIds.length
      ? await nodeRepo().findOne({
          where: { id: Not(In(unhealthyNodeIds)), deploymentsDisabled: false },
        })
      : await nodeRepo().findOneBy({ deploymentsDisabled: false });
    if (!fallback) throw new Error('No nodes available');
    return fallback;
  }
  async function clearServerListCache(userId: number) {
    try {
      await Promise.allSettled([
        redisDel(`servers:list:admin`),
        redisDel(`servers:list:user:${userId}`),
      ]);
    } catch {
      // uwu
    }
  }

  app.get(
    prefix + '/servers',
    async (ctx: AuthenticatedHandlerContext) => {
      const user = ctx.user;
      const isAdmin = hasPermissionSync(ctx, 'servers:list');
      const cacheKey = `servers:list:${isAdmin ? 'admin' : `user:${user.id}`}`;

      const result = await withRedisCache(cacheKey, 30, async () => {
        try {
          await mergeDuplicateServerConfigs();
        } catch (e) {
          /* skip */
        }
        const nodes = await nodeRepo().find();
        const cfgRepo = AppDataSource.getRepository(ServerConfig);

        const configs = (isAdmin
          ? await cfgRepo.createQueryBuilder('ServerConfig').select(SERVER_LIST_SELECT).getMany()
          : await (async () => {
              const subuserEntries = await AppDataSource.getRepository(ServerSubuser).find({
                where: { userId: user.id },
              });
              const subuserUuids = subuserEntries.map(s => s.serverUuid);
              const where: Record<string, unknown>[] = [{ userId: user.id }];
              if (subuserUuids.length) where.push({ uuid: In(subuserUuids) });
              const qb = cfgRepo.createQueryBuilder('ServerConfig').select(SERVER_LIST_SELECT);
              if (where.length === 1) qb.where('ServerConfig.userId = :uid', { uid: user.id });
              else qb.where('ServerConfig.userId = :uid OR ServerConfig.uuid IN (:...uuids)', { uid: user.id, uuids: subuserUuids.length ? subuserUuids : [''] });
              const found = await qb.getMany();
              return found;
            })()) as any[];

        const cfgMap = new Map(configs.map((c: ServerConfig) => [c.uuid, c]));
        const all: Record<string, unknown>[] = [];

        if (isAdmin) {
          const unhealthyNodeIds = await getUnhealthyNodeIds();
          const nodeResults = await Promise.allSettled(
            nodes.map(async n => {
              if (unhealthyNodeIds.includes(n.id)) return null;
              try {
                const svc = await nodeService.getServiceForNode(n.id);
                if (svc instanceof ProxmoxApiService) {
                  const res = await svc.getServers();
                  return { node: n, servers: res.data || [] };
                }
                const wsvc = svc as WingsApiService;
                const res = await wsvc.getServers();
                return { node: n, servers: res.data || [] };
              } catch {
                return null;
              }
            })
          );

          for (const nodeResult of nodeResults) {
            if (nodeResult.status !== 'fulfilled' || !nodeResult.value) continue;
            const { node, servers } = nodeResult.value;
            for (const s of servers) {
              const uuid: string = s.configuration?.uuid || s.uuid;
              const cfg = cfgMap.get(uuid);
              const norm = applyStartupStatusOverride(
                normalizeServer(s, cfg?.hibernated ? 'hibernated' : undefined, cfg),
                cfg
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
            if (!all.some((s: Record<string, unknown>) => s.uuid === c.uuid)) {
              all.push({
                uuid: c.uuid,
                name: c.name || c.uuid,
                status: c.dmca ? 'dmca' : c.hibernated ? 'hibernated' : unhealthyNodeIds.includes(c.nodeId) ? 'unavailable' : 'unknown',
                hibernated: !!c.hibernated,
                is_suspended: c.suspended || c.dmca,
                is_dmca: !!c.dmca,
                resources: null,
                build: { memory_limit: c.memory, disk_space: c.disk, cpu_limit: c.cpu },
                container: { image: c.dockerImage },
                nodeId: c.nodeId,
                userId: c.userId,
              });
            }
          }
        } else {
          const allowedUuids = new Set(configs.map((c: ServerConfig) => c.uuid));

          const nodeMap = new Map(nodes.map(n => [n.id, n]));
          const unhealthyNodeIds = await getUnhealthyNodeIds();

          const configsByNode = new Map<number, ServerConfig[]>();
          for (const c of configs) {
            if (!allowedUuids.has(c.uuid)) continue;
            const node = nodeMap.get(c.nodeId);
            if (!node) {
              all.push({
                uuid: c.uuid,
                name: c.name || c.uuid,
                status: c.dmca ? 'dmca' : c.hibernated ? 'hibernated' : 'unknown',
                hibernated: !!c.hibernated,
                is_suspended: c.suspended || c.dmca,
                is_dmca: !!c.dmca,
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
                if (unhealthyNodeIds.includes(nodeId)) {
                  for (const c of cfgList) {
                    all.push({
                      uuid: c.uuid,
                      name: c.name || c.uuid,
                      status: c.dmca ? 'dmca' : c.hibernated ? 'hibernated' : 'unavailable',
                  hibernated: !!c.hibernated,
                  is_suspended: c.suspended || c.dmca,
                  is_dmca: !!c.dmca,
                  resources: null,
                  build: { memory_limit: c.memory, disk_space: c.disk, cpu_limit: c.cpu },
                  container: { image: c.dockerImage },
                  nodeId: c.nodeId,
                  nodeName: node.name,
                  userId: c.userId,
                });
              }
              continue;
            }

            nodePromises.push(
              (async () => {
                let svc: ProviderService;
                try {
                  svc = await nodeService.getServiceForNode(node.id);
                } catch {
                  for (const c of cfgList) {
                    all.push({ uuid: c.uuid, name: c.name || c.uuid, status: c.hibernated ? 'hibernated' : 'unknown', hibernated: !!c.hibernated, is_suspended: c.suspended, resources: null, build: { memory_limit: c.memory, disk_space: c.disk, cpu_limit: c.cpu }, container: { image: c.dockerImage }, nodeId: c.nodeId, userId: c.userId });
                  }
                  return;
                }
                const promises = cfgList.map(async c => {
                  try {
                    const res = await svc.getServer(c.uuid);
                    const s = res.data as Record<string, unknown>;
                    const norm = applyStartupStatusOverride(
                      normalizeServer(s, c.hibernated ? 'hibernated' : undefined, c) ?? {},
                      c
                    );
                    all.push({
                      ...norm,
                      name: c.name || (norm.name as string),
                      nodeId: node.id,
                      nodeName: node.name,
                      userId: c.userId,
                    });
                    return;
                  } catch {
                    // try sync + retry
                  }

                  try {
                    await svc.syncServer(c.uuid, {});
                    const retry = await svc.getServer(c.uuid);
                    const s2 = retry.data as Record<string, unknown>;
                    const norm2 = applyStartupStatusOverride(
                      normalizeServer(s2, c.hibernated ? 'hibernated' : undefined, c) ?? {},
                      c
                    );
                    all.push({
                      ...norm2,
                      name: c.name || (norm2.name as string),
                      nodeId: node.id,
                      nodeName: node.name,
                      userId: c.userId,
                    });
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
              })()
            );
          }

          await Promise.allSettled(nodePromises);
        }

        const seen = new Set<string>();
        const unique = all.filter((s: Record<string, unknown>) => {
          const uuid = String(s?.uuid || s?.id || '');
          if (!uuid) return false;
          if (seen.has(uuid)) return false;
          seen.add(uuid);
          return true;
        });

        return unique;
      });

      const page = Math.max(1, Number(ctx.query?.page) || 1);
      const perPage = Math.min(200, Math.max(1, Number(ctx.query?.per_page) || Number(ctx.query?.limit) || 100));
      const total = result.length;
      const paginated = result.slice((page - 1) * perPage, page * perPage);

      return Object.assign(paginated, {
        total,
        page,
        per_page: perPage,
        total_pages: Math.ceil(total / perPage),
      }) as any;
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('servers:read')],
      response: {
        200: t.Any(),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
      },
      detail: { summary: 'List all servers', tags: ['Servers'] },
    }
  );

  app.get(
    prefix + '/servers/stream',
    async (ctx: AuthenticatedHandlerContext) => {
      const user = ctx.user;
      const isAdmin = hasPermissionSync(ctx, 'servers:list');

      const cfgRepo = () => AppDataSource.getRepository(ServerConfig);
      const nodes = await nodeRepo().find();
      const nodeMap = new Map(nodes.map(n => [n.id, n]));

      const configs = (isAdmin
        ? await cfgRepo().createQueryBuilder('ServerConfig').select(SERVER_LIST_SELECT).getMany()
        : await (async () => {
            const subuserEntries = await AppDataSource.getRepository(ServerSubuser).find({
              where: { userId: user.id },
            });
            const subuserUuids = subuserEntries.map(s => s.serverUuid);
            if (subuserUuids.length) {
              return await cfgRepo().createQueryBuilder('ServerConfig').select(SERVER_LIST_SELECT)
                .where('ServerConfig.userId = :uid OR ServerConfig.uuid IN (:...uuids)', { uid: user.id, uuids: subuserUuids })
                .getMany();
            }
            return await cfgRepo().createQueryBuilder('ServerConfig').select(SERVER_LIST_SELECT)
              .where('ServerConfig.userId = :uid', { uid: user.id }).getMany();
          })()) as any[];

      const cfgMap = new Map(configs.map(c => [c.uuid, c]));

      return new Response(
        new ReadableStream({
          async start(controller) {
            const enc = (data: unknown, event?: string) => {
              const lines = [`data: ${JSON.stringify(data)}`];
              if (event) lines.unshift(`event: ${event}`);
              controller.enqueue(new TextEncoder().encode(lines.join('\n') + '\n\n'));
            };

            const sendServer = (s: Record<string, unknown>) => enc(s, 'server');

            const initial = configs.map(c => ({
              uuid: c.uuid,
              name: c.name || c.uuid,
              status: c.dmca ? 'dmca' : c.hibernated ? 'hibernated' : 'loading',
              hibernated: !!c.hibernated,
              is_suspended: c.suspended || c.dmca,
              is_dmca: !!c.dmca,
              resources: null,
              build: { memory_limit: c.memory, disk_space: c.disk, cpu_limit: c.cpu },
              container: { image: c.dockerImage },
              nodeId: c.nodeId,
              userId: c.userId,
              nodeName: nodeMap.get(c.nodeId)?.name || null,
              provider: 'wings',
            }));

            for (const s of initial) sendServer(s as any);

            const unhealthyNodeIds = await getUnhealthyNodeIds();

            if (isAdmin) {
              const batches = nodes
                .filter(n => !unhealthyNodeIds.includes(n.id))
                .map(async n => {
                  try {
                    const svc = await nodeService.getServiceForNode(n.id);
                    const res = svc instanceof ProxmoxApiService
                      ? await svc.getServers()
                      : await (svc as WingsApiService).getServers();
                    const servers = (res.data || []) as Record<string, unknown>[];
                    for (const s of servers) {
                      const uuid: string = ((s.configuration as Record<string, unknown>)?.uuid as string) || (s.uuid as string) || '';
                      const cfg = cfgMap.get(uuid);
                      const ownerId = Number(s.owner ?? s.ownerId ?? s.user ?? s.userId ?? NaN);
                      const norm = applyStartupStatusOverride(
                        normalizeServer(s, cfg?.hibernated ? 'hibernated' : undefined, cfg) ?? {},
                        cfg
                      );
                      sendServer({
                        ...norm,
                        name: cfg?.name || norm.name,
                        nodeId: n.id,
                        nodeName: n.name,
                        userId: cfg?.userId ?? (Number.isNaN(ownerId) ? undefined : ownerId),
                      });
                    }
                  } catch { /* blah blah blah */ }
                });
              await Promise.allSettled(batches);
            } else {
              const nodeMap2 = new Map(nodes.map(n => [n.id, n]));
              const configsByNode = new Map<number, ServerConfig[]>();
              for (const c of configs) {
                const list = configsByNode.get(c.nodeId) ?? [];
                list.push(c);
                configsByNode.set(c.nodeId, list);
              }

              const nodePromises: Promise<void>[] = [];
              for (const [nodeId, cfgList] of configsByNode.entries()) {
                if (unhealthyNodeIds.includes(nodeId)) {
                  for (const c of cfgList) {
                    sendServer({
                      uuid: c.uuid,
                      name: c.name || c.uuid,
                      status: c.dmca ? 'dmca' : c.hibernated ? 'hibernated' : 'unavailable',
                      hibernated: !!c.hibernated,
                      is_suspended: c.suspended || c.dmca,
                      is_dmca: !!c.dmca,
                      resources: null,
                      build: { memory_limit: c.memory, disk_space: c.disk, cpu_limit: c.cpu },
                      container: { image: c.dockerImage },
                      nodeId: c.nodeId,
                      nodeName: nodeMap2.get(nodeId)?.name || null,
                      userId: c.userId,
                    });
                  }
                  continue;
                }
                const node = nodeMap2.get(nodeId);
                if (!node) continue;

                nodePromises.push(
                  (async () => {
                    let svc: ProviderService;
                    try {
                      svc = await nodeService.getServiceForNode(node.id);
                    } catch {
                      for (const c of cfgList) {
                        sendServer({
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
                      return;
                    }
                    const promises = cfgList.map(async c => {
                      try {
                        const res = await svc.getServer(c.uuid);
                        const s = res.data as Record<string, unknown>;
                        const norm = applyStartupStatusOverride(
                          normalizeServer(s, c.hibernated ? 'hibernated' : undefined, c) ?? {},
                          c
                        );
                        sendServer({
                          ...norm,
                          name: c.name || (norm.name as string),
                          nodeId: node.id,
                          nodeName: node.name,
                          userId: c.userId,
                        });
                        return;
                      } catch {
                        /* skip */
                      }

                      try {
                        await svc.syncServer(c.uuid, {});
                        const retry = await svc.getServer(c.uuid);
                        const s2 = retry.data as Record<string, unknown>;
                        const norm2 = applyStartupStatusOverride(
                          normalizeServer(s2, c.hibernated ? 'hibernated' : undefined, c) ?? {},
                          c
                        );
                        sendServer({
                          ...norm2,
                          name: c.name || (norm2.name as string),
                          nodeId: node.id,
                          nodeName: node.name,
                          userId: c.userId,
                        });
                        return;
                      } catch {
                        /* skip */
                      }

                      sendServer({
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
                  })()
                );
              }
              await Promise.allSettled(nodePromises);
            }
            enc({ complete: true }, 'done');
            controller.close();
          },
        }),
        {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        }
      );
    },
    {
      beforeHandle: [authenticate, authorize('servers:read')],
      detail: { summary: 'Stream servers progressively', tags: ['Servers'] },
    }
  );

  app.post(
    prefix + '/servers/v1/:id/files/write',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const svc = await serviceFor(id);
      try {
        const body = ctx.body as Record<string, unknown>;
        const { path: filePath, content } = body;
        const fPath = String(filePath ?? '');

        if (!fPath) {
          ctx.set.status = 400;
          return { error: ctx.t('validation.pathRequired') };
        }

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

        const res = await svc.writeFile(id, fPath, binaryData);

        const user = (ctx.store?.user as User) ?? ctx.user;
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
      } catch (e: unknown) {
        const err = e as Record<string, unknown>;
        const errResponse = err?.response as Record<string, unknown> | undefined;
        const status = (errResponse?.status as number) || 500;
        const errData = errResponse?.data as Record<string, unknown> | undefined;
        const msg = (errData?.error as string) || (err instanceof Error ? err.message : '') || 'File write failed';
        ctx.set.status = status;
        return { error: msg };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('files:write')],
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        500: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Write file content', tags: ['Servers'] },
    }
  );

  function normalizeServer(raw: Record<string, unknown> | null | undefined, overrideStatus?: string, persistedCfg?: ServerConfig): Record<string, unknown> | null | undefined {
    if (!raw) return raw;
    const r = raw as Record<string, unknown>;
    const cfg = (r.configuration as Record<string, unknown>) || {};
    const meta = (cfg.meta as Record<string, unknown>) || {};
    const build = (cfg.build as Record<string, unknown>) || {};
    const ctr = (cfg.container as Record<string, unknown>) || (cfg.docker as Record<string, unknown>) || {};
    const isSuspended = Boolean(
      r.is_suspended ?? r.suspended ?? cfg.suspended ?? persistedCfg?.suspended ?? false
    );
    const isDmca = Boolean(r.is_dmca ?? r.dmca ?? cfg.dmca ?? persistedCfg?.dmca ?? false);
    const baseStatus = (overrideStatus ?? r.state ?? r.status ?? 'unknown') as string;

    const installingOverride = persistedCfg?.installing ?? false;
    const wingsReportsAlive =
      baseStatus === 'running' || baseStatus === 'starting' || baseStatus === 'online';

    const status = isDmca
      ? 'dmca'
      : isSuspended
        ? 'suspended'
        : installingOverride && !wingsReportsAlive
          ? 'installing'
          : baseStatus;
    return {
      uuid: cfg.uuid || r.uuid,
      name: meta.name || r.name || cfg.uuid || r.uuid,
      description: meta.description as string | undefined,
      provider: 'wings',
      status,
      installing: persistedCfg?.installing ?? false,
      hibernated: status === 'hibernated',
      is_suspended: isSuspended || isDmca,
      is_dmca: isDmca,
      dmcaAt: cfg.dmcaAt ?? persistedCfg?.dmcaAt ?? null,
      dmcaDeletionAt: cfg.dmcaDeletionAt ?? persistedCfg?.dmcaDeletionAt ?? null,
      dmcaReason: cfg.dmcaReason ?? persistedCfg?.dmcaReason ?? null,
      dmcaBy: cfg.dmcaBy ?? persistedCfg?.dmcaBy ?? null,
      suspendedAt: cfg.suspendedAt ?? persistedCfg?.suspendedAt ?? null,
      suspendedReason: cfg.suspendedReason ?? persistedCfg?.suspendedReason ?? null,
      suspendedBy: cfg.suspendedBy ?? persistedCfg?.suspendedBy ?? null,
      resources: r.utilization || r.resources || null,
      build: {
        memory_limit: (build.memory_limit as number) ?? persistedCfg?.memory ?? 0,
        disk_space: (build.disk_space as number) ?? persistedCfg?.disk ?? 0,
        cpu_limit: (build.cpu_limit as number) ?? persistedCfg?.cpu ?? 0,
        swap: (build.swap as number) ?? persistedCfg?.swap ?? 0,
        io_weight: (build.io_weight as number) ?? persistedCfg?.ioWeight ?? 500,
        oom_disabled: (build.oom_disabled as boolean) ?? false,
      },
      container: {
        image: (ctr.image as string) || ((ctr.images as string[])?.[0]) || null,
        startup: (cfg.invocation as string) || (r.invocation as string) || null,
      },
      invocation: (cfg.invocation as string) || (r.invocation as string) || null,
      environment: (cfg.environment as Record<string, string>) || (r.environment as Record<string, string>) || {},
      configuration: cfg,
    };
  }

  function applyStartupStatusOverride(server: Record<string, unknown>, cfg?: ServerConfig): Record<string, unknown> {
    if (!server || server.status !== 'starting') return server;

    const processCfg = cfg?.processConfig as Record<string, unknown> | undefined;
    if (!processCfg || typeof processCfg !== 'object') {
      server.status = 'running';
      server.hibernated = false;
      return server;
    }

    const startup = processCfg.startup as Record<string, unknown> | undefined;
    const donePatterns = normalizeStartupDonePatterns(startup?.done);
    if (donePatterns.includes(DEFAULT_STARTUP_DETECTION_PATTERN)) {
      server.status = 'running';
      server.hibernated = false;
    }

    return server;
  }

  function getBoostFromUserLimits(limits: Record<string, unknown> | null | undefined): BoostInfo {
    if (!limits || typeof limits !== 'object') return { active: false, percent: 0, expiresAt: null, reason: null };
    const percent = Number(limits.boostPercent) || 0;
    if (percent <= 0) return { active: false, percent: 0, expiresAt: null, reason: null };
    const rawStartsAt = limits.boostStartsAt;
    const rawExpiresAt = limits.boostExpiresAt;
    const startsAt = typeof rawStartsAt === 'string' || typeof rawStartsAt === 'number' ? new Date(rawStartsAt).getTime() : 0;
    const expiresAt = typeof rawExpiresAt === 'string' || typeof rawExpiresAt === 'number' ? new Date(rawExpiresAt).getTime() : 0;
    const now = Date.now();
    const active = startsAt > 0 && expiresAt > 0 && now >= startsAt && now <= expiresAt;
    return {
      active,
      percent,
      expiresAt: active && expiresAt > 0 ? new Date(expiresAt).toISOString() : null,
      reason: typeof limits.boostReason === 'string' ? limits.boostReason : null,
    };
  }

  app.get(
    prefix + '/servers/:id',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const cfg = await cfgRepo().findOneBy({ uuid: id });

      const user = ctx.user;
      const isAdmin = hasPermissionSync(ctx, 'servers:list');
      if (!cfg) {
        ctx.set.status = 404;
        return { error: ctx.t('server.notFound') };
      }

      if (!isAdmin) {
        const owned = cfg.userId === user?.id;
        const subuser = await AppDataSource.getRepository(
          require('../models/serverSubuser.entity').ServerSubuser
        ).findOneBy({
          serverUuid: id,
          userId: user?.id,
          accepted: true,
        });
        if (!owned && !subuser) {
          ctx.set.status = 403;
          return { error: ctx.t('common.insufficientPermissions') };
        }
      }

      let nodeName: string | null = null;
      let sftpInfo: ServerSftpInfo | null = null;
      let node: Node | null = null;
      if (cfg?.nodeId) {
        node = await nodeRepo().findOneBy({ id: cfg.nodeId });
        if (node) {
          nodeName = node.name;
          const urlObj = (() => {
            try {
              return new URL(node.url);
            } catch {
              return null;
            }
          })();
          const nodeHost = urlObj?.hostname || node.url;
          const backendBase = (process.env.BACKEND_URL || '').replace(/\/+$/, '');
          const backendHost = backendBase
            ? (() => {
                try {
                  return new URL(backendBase).hostname;
                } catch {
                  return backendBase;
                }
              })()
            : null;
          const host = node.sftpProxyPort && backendHost ? backendHost : nodeHost;
          const port = node.sftpProxyPort ?? node.sftpPort ?? 2022;
          const sftpUser = ctx.user;
          const sftpHex = id.replace(/-/g, '').substring(0, 8);
          const username = sftpUser ? `${sftpUser.email}.${sftpHex}` : undefined;
          sftpInfo = { host, port, proxied: !!node.sftpProxyPort, username };
        }
      }

      const userLimits: Record<string, unknown> | null = cfg.userId
        ? (await AppDataSource.getRepository(User).findOneBy({ id: cfg.userId }))?.limits ?? null
        : null;
      const boostInfo = userLimits ? getBoostFromUserLimits(userLimits) : { active: false as const, percent: 0, expiresAt: null, reason: null };
      const boostPayload: ServerBoostPayload | null = boostInfo.active && cfg
        ? {
            boost: boostInfo,
            virtualResources: {
              memory: Math.ceil((cfg.memory ?? 0) * (1 + boostInfo.percent / 100)),
              disk: Math.ceil((cfg.disk ?? 0) * (1 + boostInfo.percent / 100)),
              cpu: Math.ceil((cfg.cpu ?? 0) * (1 + boostInfo.percent / 100)),
            },
          }
        : null;

      const unhealthyNodeIds = await getUnhealthyNodeIds();
      if (node && unhealthyNodeIds.includes(node.id)) {
        const norm = normalizeServer(
          {
            uuid: cfg.uuid,
            state: cfg.hibernated ? 'hibernated' : 'unavailable',
            is_suspended: cfg.suspended,
            is_dmca: cfg.dmca,
            dmca: cfg.dmca,
            configuration: {
              uuid: cfg.uuid,
              meta: { name: cfg.name, description: cfg.description },
              build: {
                memory_limit: cfg.memory,
                disk_space: cfg.disk,
                cpu_limit: cfg.cpu,
                swap: cfg.swap,
                io_weight: cfg.ioWeight,
              },
              container: {
                image: cfg.dockerImage,
                kvm_passthrough_enabled: cfg.kvmPassthroughEnabled ?? false,
              },
              invocation: cfg.startup,
              environment: cfg.environment,
              allocations: cfg.allocations,
              autoSyncOnEggChange: cfg.autoSyncOnEggChange,
            },
          },
          cfg?.hibernated ? 'hibernated' : undefined,
          cfg
        );

        return {
          ...norm,
          node: nodeName,
          sftp: sftpInfo,
          isOwner: cfg.userId === user?.id,
          userId: cfg.userId,
          ...(boostPayload ?? {}),
          ...(isAdmin
            ? {
                owner: cfg.userId,
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

      try {
        const svc = await serviceFor(id);
        const res = await svc.getServer(id);
        const norm = applyStartupStatusOverride(
          normalizeServer(res.data, cfg?.hibernated ? 'hibernated' : undefined, cfg),
          cfg
        );
        if (cfg && norm && norm.configuration) {
          const normCfg = norm.configuration as Record<string, unknown>;
          normCfg.autoSyncOnEggChange = cfg.autoSyncOnEggChange;
          const dbAlloc = cfg.allocations;
          if (dbAlloc?.dedicatedIps) {
            normCfg.allocations = {
              ...((normCfg.allocations as Record<string, unknown>) || {}),
              dedicatedIps: dbAlloc.dedicatedIps,
            };
          }
        }
        return {
          ...norm,
          node: nodeName,
          sftp: sftpInfo,
          isOwner: cfg.userId === user?.id,
          userId: cfg.userId,
          ignoreAntiAbuse: cfg.ignoreAntiAbuse ?? false,
          ...(boostPayload ?? {}),
          ...(isAdmin
            ? {
                owner: cfg.userId,
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
      } catch (e: unknown) {
        if (cfg) {
          try {
            const svc = await serviceFor(id);
            await svc.syncServer(id, {});
            const retry = await svc.getServer(id);
            const norm = applyStartupStatusOverride(
              normalizeServer(retry.data, cfg?.hibernated ? 'hibernated' : undefined, cfg),
              cfg
            );
            if (norm?.configuration) {
              const normCfg = norm.configuration as Record<string, unknown>;
              const dbAlloc = cfg.allocations;
              if (dbAlloc?.dedicatedIps) {
                normCfg.allocations = {
                  ...((normCfg.allocations as Record<string, unknown>) || {}),
                  dedicatedIps: dbAlloc.dedicatedIps,
                };
              }
            }
            return {
              ...norm,
              node: nodeName,
              sftp: sftpInfo,
              ignoreAntiAbuse: cfg.ignoreAntiAbuse ?? false,
              ...(boostPayload ?? {}),
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

          const norm = normalizeServer({
            uuid: cfg.uuid,
            state: cfg.hibernated ? 'hibernated' : 'unknown',
            is_suspended: cfg.suspended,
            is_dmca: cfg.dmca,
            dmca: cfg.dmca,
            configuration: {
              uuid: cfg.uuid,
              meta: { name: cfg.name, description: cfg.description },
              build: {
                memory_limit: cfg.memory,
                disk_space: cfg.disk,
                cpu_limit: cfg.cpu,
                swap: cfg.swap,
                io_weight: cfg.ioWeight,
              },
              container: {
                image: cfg.dockerImage,
                kvm_passthrough_enabled: cfg.kvmPassthroughEnabled ?? false,
              },
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
            ignoreAntiAbuse: cfg.ignoreAntiAbuse ?? false,
            ...(boostPayload ?? {}),
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
        return { error: (e instanceof Error ? e.message : '') || 'Server fetch failed' };
      }
    },
    {
      beforeHandle: [authenticate, authorize('servers:read')],
      response: {
        200: t.Any(),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        502: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Get server details by id', tags: ['Servers'] },
    }
  );

  app.post(
    prefix + '/servers',
    async (ctx: AuthenticatedHandlerContext) => {
      const user = ctx.user;
      const isAdmin = hasPermissionSync(ctx, 'admin:access');

      const geoLevel = await getGeoBlockLevel(user.billingCountry);
      if (!isAdmin && geoLevel >= 4) {
        ctx.set.status = 403;
        return { error: ctx.t('user.serverCreationDisabled') };
      }

      if (!isAdmin && await requiresKyc(user.billingCountry) && !(await isKycVerified(user.id))) {
        ctx.set.status = 403;
        return { error: ctx.t('server.kyc_verification_required_for_your_country_please_verify_you') };
      }

      const effectivePortalType = user.portalType;

      if (!isAdmin) {
        const passkeyCount = await AppDataSource.getRepository(
          require('../models/passkey.entity').Passkey
        ).count({ where: { user: { id: user.id } } });
        const hasSecurityMethod = passkeyCount > 0 || !!user.twoFactorEnabled;
        if (!hasSecurityMethod) {
          ctx.set.status = 403;
          return { error: ctx.t('user.mustEnable2fa') };
        }

        if (
          geoLevel >= 3 &&
          (effectivePortalType === 'free' || effectivePortalType === 'educational')
        ) {
          ctx.set.status = 403;
          return { error: ctx.t('plan.restrictedCountryEdu') };
        }
        if (geoLevel >= 2 && effectivePortalType === 'free') {
          ctx.set.status = 403;
          return { error: ctx.t('plan.restrictedCountry') };
        }

        if (effectivePortalType !== 'free') {
          if (!user.emailVerified) {
            ctx.set.status = 403;
            return { error: ctx.t('user.mustVerifyEmail') };
          }
        }

        if (effectivePortalType === 'free') {
          ctx.set.status = 403;
          return { error: ctx.t('plan.freeEloServersOnly') };
        }
      }

      const body = ctx.body as Record<string, unknown>;
      const {
        eggId,
        name,
        nodeId,
        userId,
        memory: reqMemory,
        disk: reqDisk,
        cpu: reqCpu,
      } = body as {
        eggId?: number;
        name?: string;
        nodeId?: number;
        userId?: number;
        memory?: number;
        disk?: number;
        cpu?: number;
      };
      let kvmPassthroughEnabled = Boolean(body.kvmPassthroughEnabled);

      if (body.requestIpv6 === true || String(body.requestIpv6) === 'true') {
        ctx.set.status = 400;
        return { error: ctx.t('server.ipv6AllocationNoLongerAutomatic') };
      }

      const ownerId: number = userId && isAdmin ? userId : user.id;

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

      if (!isAdmin) {
        if (memory < 1) {
          ctx.set.status = 400;
          return { error: ctx.t('server.memoryMinimum') };
        }
        if (disk < 1) {
          ctx.set.status = 400;
          return { error: ctx.t('server.diskMinimum') };
        }
        if (cpu < 1) {
          ctx.set.status = 400;
          return { error: ctx.t('server.cpuMinimum') };
        }
      }

      const gamblingConfig = await getGamblingConfig();
      const gamblingRequested = body?.playerStandAt !== undefined;
      const gamblingModeEnabled =
        gamblingConfig.enabled && (gamblingRequested || (!isAdmin && isGamblingModeEnabled(user)));
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
        node = await pickNode(ctx, user, nodeId, user.nodeId);
      } catch (e: unknown) {
        ctx.set.status = 503;
        return { error: sanitizeError(e, 'serverHandler:pick-node') };
      }

      if (gamblingModeEnabled) {
        const owner = await userRepo().findOneBy({ id: ownerId });
        if (!owner) {
          ctx.set.status = 404;
          return { error: ctx.t('user.ownerUserNotFound') };
        }

        const now = Date.now();
        const currentSettings =
          owner.settings && typeof owner.settings === 'object' ? { ...owner.settings } : {};
        const gamblingSettings =
          currentSettings.gambling && typeof currentSettings.gambling === 'object'
            ? { ...currentSettings.gambling }
            : {};

        const rawBonus =
          gamblingSettings.bonus && typeof gamblingSettings.bonus === 'object'
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
        const outcomeModifier =
          blackjack.outcome === 'player' ? 0.2 : blackjack.outcome === 'push' ? 0 : -0.2;
        const blackjackRatio = Math.max(0.1, Math.min(1, scoreRatio + outcomeModifier));

        memory = clampInt(Math.floor(memoryCap * blackjackRatio), memoryMin, memoryCap);
        disk = clampInt(Math.floor(diskCap * blackjackRatio), diskMin, diskCap);
        cpu = clampInt(Math.floor(cpuCap * blackjackRatio), cpuMin, cpuCap);

        const luckyRoll = Math.random() < gamblingConfig.resourceLuckyChance;
        let bonusActivated = false;
        let nextBonusExpiresAt: string | null =
          bonusActive && bonusExpiresAt ? new Date(bonusExpiresAt).toISOString() : null;

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

      const existingRegularServers = !isAdmin
        ? await cfgRepo().find({ where: { userId: ownerId } })
        : [];

      if (!isAdmin) {
        const eloUuids = (await eloProjectRepo().find({ where: { userId: ownerId, serverId: Not(IsNull()) } }))
          .map((p: EloProject) => p.serverId)
          .filter(Boolean) as string[];
        const eloSet = new Set(eloUuids);
        const nonEloServers = existingRegularServers.filter((s: ServerConfig) => !eloSet.has(s.uuid));

        if (limits.serverLimit != null && limits.serverLimit > 0) {
          if (nonEloServers.length >= limits.serverLimit) {
            ctx.set.status = 403;
            return {
              error: `Server limit reached (${limits.serverLimit}). Delete an existing server to create a new one.`,
            };
          }
        }

        const existingMemory = nonEloServers.reduce(
          (sum: number, s: ServerConfig) => sum + (s.memory || 0),
          0
        );
        const existingDisk = nonEloServers.reduce(
          (sum: number, s: ServerConfig) => sum + (s.disk || 0),
          0
        );
        const existingCpu = nonEloServers.reduce(
          (sum: number, s: ServerConfig) => sum + (s.cpu || 0),
          0
        );

        if (limits.memory != null && existingMemory + memory > limits.memory) {
          ctx.set.status = 400;
          return {
            error: `Total account memory limit exceeded. Current: ${existingMemory} MB, requested: ${memory} MB, limit: ${limits.memory} MB.`,
          };
        }
        if (limits.disk != null && existingDisk + disk > limits.disk) {
          ctx.set.status = 400;
          return {
            error: `Total account disk limit exceeded. Current: ${existingDisk} MB, requested: ${disk} MB, limit: ${limits.disk} MB.`,
          };
        }
        if (limits.cpu != null && existingCpu + cpu > limits.cpu) {
          ctx.set.status = 400;
          return {
            error: `Total account CPU limit exceeded. Current: ${existingCpu}%, requested: ${cpu}%, limit: ${limits.cpu}%.`,
          };
        }
      }

      if (!eggId) {
        ctx.set.status = 400;
        return { error: ctx.t('validation.eggIdRequired') };
      }

      const egg = await eggRepo().findOneBy({ id: eggId });
      if (!egg) {
        ctx.set.status = 404;
        return { error: ctx.t('server.eggNotFound') };
      }

      if (egg.requiresKvm) {
        kvmPassthroughEnabled = true;
      } else if (kvmPassthroughEnabled && !isAdmin) {
        ctx.set.status = 403;
        return { error: ctx.t('server.kvmDisabled') };
      }

      if (!egg.visible && !isAdmin && egg.id !== 264) {
        ctx.set.status = 403;
        return { error: ctx.t('server.eggNotAvailable') };
      }

      if (
        !isAdmin &&
        Array.isArray(egg.allowedPortals) &&
        egg.allowedPortals.length > 0
      ) {
        const allowed = egg.allowedPortals as string[];
        const isEducational = effectivePortalType === 'educational';
        const isActuallyAllowed =
          allowed.includes(effectivePortalType) || (isEducational && allowed.includes('paid'));
        if (!isActuallyAllowed) {
          ctx.set.status = 403;
          return { error: ctx.t('server.eggNotAvailableForPortal') };
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
          return {
            error: `Requested memory (${memory} MB) exceeds the maximum allowed (${effectiveMemoryLimit} MB).`,
          };
        }
        if (effectiveDiskLimit != null && disk > effectiveDiskLimit) {
          ctx.set.status = 400;
          return {
            error: `Requested disk (${disk} MB) exceeds the maximum allowed (${effectiveDiskLimit} MB).`,
          };
        }
        if (effectiveCpuLimit != null && cpu > effectiveCpuLimit) {
          ctx.set.status = 400;
          return {
            error: `Requested CPU (${cpu}%) exceeds the maximum allowed (${effectiveCpuLimit}%).`,
          };
        }
      }

      if (node.deploymentsDisabled) {
        ctx.set.status = 403;
        return {
          error:
            node.deploymentNotice ||
            'This node is temporarily unavailable for deployments',
        };
      }

      let autoAllocation: ServerAllocationLike | null = null;
      const assignedIpv6: string | null = null;
      if (node.portRangeStart != null && node.portRangeEnd != null) {
        if (node.portRangeStart > node.portRangeEnd) {
          ctx.set.status = 500;
          return { error: ctx.t('node.portRangeMisconfigured') };
        }
        const bindIp = node.defaultIp || '0.0.0.0';
        const excludedIpv6Ports = parsePortList(node.ipv6ExcludedPorts);
        const nodeConfigs = await cfgRepo().find({
          where: { nodeId: node.id },
          select: { allocations: true },
        });

        const takenPorts = new Set<number>();
        for (const c of nodeConfigs) {
          const alloc = c.allocations;
          if (!alloc) continue;
          if (alloc.default?.port) {
            const p = Number(alloc.default.port);
            if (p >= 1 && p <= 65535) takenPorts.add(p);
          }
          for (const ports of Object.values(alloc.mappings ?? {}) as number[][]) {
            for (const p of ports) {
              const pn = Number(p);
              if (pn >= 1 && pn <= 65535) takenPorts.add(pn);
            }
          }
          if (alloc.owners) {
            for (const k of Object.keys(alloc.owners)) {
              const idx = k.lastIndexOf(':');
              const pstr = idx >= 0 ? k.slice(idx + 1) : '';
              const pnum = Number(pstr);
              if (!Number.isNaN(pnum) && pnum >= 1 && pnum <= 65535) takenPorts.add(pnum);
            }
          }
        }

        for (let p = node.portRangeStart; p <= node.portRangeEnd; p++) {
          if (!takenPorts.has(p) && !excludedIpv6Ports.has(p)) {
            autoAllocation = {
              default: { ip: bindIp, port: p },
              mappings: { [bindIp]: [p] },
              owners: { [`${bindIp}:${p}`]: ownerId },
            };
            break;
          }
        }

        if (!autoAllocation) {
          const rangeSize = node.portRangeEnd - node.portRangeStart + 1;
          const takenCount = takenPorts.size;
          const excludedCount = excludedIpv6Ports.size;
          const takenInRange = [...takenPorts].filter(
            p => p >= node.portRangeStart && p <= node.portRangeEnd
          ).length;
          ctx.set.status = 503;
          return {
            error: `No free ports available on this node (range ${node.portRangeStart}-${node.portRangeEnd}, ${rangeSize} total, ${takenInRange} taken in range, ${takenCount} taken overall, ${excludedCount} excluded). Contact an administrator.`,
          };
        }
      }

      const serverUuid = crypto.randomUUID();

      const envObject: Record<string, string> = {};
      for (const entry of (egg.envVars || [])) {
        if (typeof entry === 'string') {
          const [k, ...rest] = (entry as string).split('=');
          if (k) envObject[k.trim()] = rest.join('=').trim();
        } else if (entry && typeof entry === 'object') {
          const k = entry.env_variable || entry.key || entry.name;
          const v = entry.default_value ?? entry.defaultValue ?? entry.value ?? '';
          if (k) envObject[String(k)] = String(v);
        }
      }

      const DENIED_ENV_KEYS = new Set([
        'LD_PRELOAD',
        'LD_LIBRARY_PATH',
        'LD_AUDIT',
        'LD_DEBUG',
        'LD_ORIGIN_PATH',
        'SHELL',
        'BASH_ENV',
        'BASH_FUNC_mc',
      ]);
      const envOverrides: Record<string, string> = (body.environment as Record<string, string>) || {};
      for (const key of Object.keys(envOverrides)) {
        if (!DENIED_ENV_KEYS.has(key)) {
          envObject[key] = envOverrides[key];
        }
      }

      const requestedStartup = typeof body.startup === 'string' ? body.startup.trim() : '';
      const resolvedStartup =
        requestedStartup ||
        (typeof egg.startup === 'string'
          ? egg.startup.replace(
              /\{\{([^}]+)\}\}/g,
              (_: string, varName: string) => envObject[varName.trim()] ?? ''
            )
          : '');

      const hasInstallScript = !!(
        egg.installScript &&
        (egg.installScript.script || egg.installScript.container || egg.installScript.entrypoint)
      );

      const isProxmoxNode = nodeService.isProxmoxNode(node);

      const bodyVmType = (ctx.body as Record<string, unknown>).vmType as string || 'lxc';
      const bodyTemplate = (ctx.body as Record<string, unknown>).template as string || '';
      const bodyIsoFile = (ctx.body as Record<string, unknown>).isoFile as string || '';

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
        kvmPassthroughEnabled,
        installing: hasInstallScript,
        vmType: isProxmoxNode ? (bodyVmType as 'lxc' | 'qemu') : undefined,
        template: isProxmoxNode ? bodyTemplate : undefined,
        isoFile: isProxmoxNode ? bodyIsoFile : undefined,
        ...(autoAllocation ? { allocations: autoAllocation } : {}),
      });

      if (isProxmoxNode) {
        const svc = await nodeService.getProxmoxService(node.id);
        try {
          const result = await svc.createServer({
            uuid: serverUuid,
            name,
            memory,
            disk,
            cpu,
            vmType: (bodyVmType as 'lxc' | 'qemu') || 'lxc',
            template: bodyTemplate,
            isoFile: bodyIsoFile,
            cores: eggId ? undefined : 1,
            startOnCompletion: hasInstallScript,
          });

          await createActivityLog({
            userId: ownerId,
            action: 'server:create',
            targetId: serverUuid,
            targetType: 'server',
            metadata: { serverName: name, eggId: egg.id, nodeId: node.id, memory, disk, cpu, provider: 'proxmox', vmType: bodyVmType },
            ipAddress: ctx.ip,
          });

          await clearServerListCache(ownerId);
          return { uuid: serverUuid, nodeId: node.id, vmid: result.vmid, provider: 'proxmox', gambling: gamblingResult };
        } catch (e: unknown) {
          await Promise.allSettled([removeServerConfig(serverUuid), nodeSvc.unmapServer(serverUuid)]);
          ctx.set.status = 502;
          console.error('[serverHandler:create-server] Proxmox error:', e);
          return { error: sanitizeError(e, 'serverHandler:create-server:proxmox') };
        }
      }

      const wingsPayload = {
        uuid: serverUuid,
        start_on_completion: hasInstallScript,
        skip_scripts: false,
      };

      const hasEulaFeature =
        Array.isArray(egg.features) &&
        egg.features.some((feature: string) => feature.toLowerCase() === 'eula');

      const base = node.backendWingsUrl || node.url;
      const svc = new WingsApiService(base, node.token);

      try {
        const res = await svc.createServer(wingsPayload);

        if (hasEulaFeature) {
          try {
            await svc.writeFile(serverUuid, 'eula.txt', 'EULA=true');
          } catch (fileErr: unknown) {
            console.error(`[serverHandler:create-server] failed to write eula.txt ${fileErr}`);
          }
        }

        await createActivityLog({
          userId: ownerId,
          action: 'server:create',
          targetId: serverUuid,
          targetType: 'server',
          metadata: {
            serverName: name,
            eggId: egg.id,
            nodeId: node.id,
            memory,
            disk,
            cpu,
            gamblingMode: !!gamblingResult,
          },
          ipAddress: ctx.ip,
        });

        await clearServerListCache(ownerId);
        return { uuid: serverUuid, nodeId: node.id, gambling: gamblingResult, ...res.data };
      } catch (e: unknown) {
        await Promise.allSettled([removeServerConfig(serverUuid), nodeSvc.unmapServer(serverUuid)]);
        ctx.set.status = 502;
        console.error('[serverHandler:create-server]', e);
        return { error: sanitizeError(e, 'serverHandler:create-server') };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('servers:create')],
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
    }
  );

  app.put(
    prefix + '/servers/:id',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const { memory, disk, cpu, swap, ioWeight, environment, name, kvmPassthroughEnabled } =
        ctx.body as Record<string, unknown>;

      const user = ctx.user;
      const isAdmin = hasPermissionSync(ctx, 'admin:access');

      if (kvmPassthroughEnabled !== undefined && !isAdmin) {
        const cfgRepo = AppDataSource.getRepository(
          require('../models/serverConfig.entity').ServerConfig
        );
        const existing = await cfgRepo.findOneBy({ uuid: id });
        const eggRepoInstance = AppDataSource.getRepository(require('../models/egg.entity').Egg);
        const egg = existing?.eggId
          ? await eggRepoInstance.findOneBy({ id: existing.eggId })
          : null;

        if (egg?.requiresKvm) {
          if (!kvmPassthroughEnabled) {
            ctx.set.status = 403;
            return { error: ctx.t('server.eggRequiresKvm') };
          }
        } else {
          ctx.set.status = 403;
          return { error: ctx.t('server.kvmPassthroughAdminsOnly') };
        }
      }

      if (ioWeight !== undefined && !isAdmin) {
        ctx.set.status = 403;
        return { error: ctx.t('server.ioWeightAdminsOnly') };
      }

      if (!isAdmin) {
        if (memory !== undefined && Number(memory) < 1) {
          ctx.set.status = 400;
          return { error: ctx.t('server.memoryMinimum') };
        }
        if (disk !== undefined && Number(disk) < 1) {
          ctx.set.status = 400;
          return { error: ctx.t('server.diskMinimum') };
        }
        if (cpu !== undefined && Number(cpu) < 1) {
          ctx.set.status = 400;
          return { error: ctx.t('server.cpuMinimum') };
        }
      }

      try {
        const svc = await serviceFor(id);

        const build: Record<string, unknown> = {};
        if (memory !== undefined) build.memory_limit = Number(memory);
        if (disk !== undefined) build.disk_space = Number(disk);
        if (cpu !== undefined) build.cpu_limit = Number(cpu);
        if (swap !== undefined) build.swap = Number(swap);
        if (ioWeight !== undefined) build.io_weight = Number(ioWeight);
        const syncPayload: Record<string, unknown> = {};
        if (Object.keys(build).length) syncPayload.build = build;
        if (environment !== undefined) syncPayload.environment = environment;
        if (name !== undefined) syncPayload.name = name;
        if (kvmPassthroughEnabled !== undefined)
          syncPayload.kvm_passthrough_enabled = Boolean(kvmPassthroughEnabled);

        await svc.syncServer(id, syncPayload);

        const cfgRepo = AppDataSource.getRepository(
          require('../models/serverConfig.entity').ServerConfig
        );
        const existing = await cfgRepo.findOneBy({ uuid: id });
        if (existing) {
          if (memory !== undefined) existing.memory = Number(memory);
          if (disk !== undefined) existing.disk = Number(disk);
          if (cpu !== undefined) existing.cpu = Number(cpu);
          if (swap !== undefined) existing.swap = Number(swap);
          if (ioWeight !== undefined) existing.ioWeight = Number(ioWeight);
          if (environment !== undefined) Object.assign((existing.environment ??= {}), environment);
          if (name !== undefined) existing.name = name;
          if (kvmPassthroughEnabled !== undefined)
            existing.kvmPassthroughEnabled = Boolean(kvmPassthroughEnabled);
          await cfgRepo.save(existing);
        }

        const user = ctx.user;
        await createActivityLog({
          userId: user.id,
          action: 'server:update',
          targetId: id,
          targetType: 'server',
          metadata: {
            changes: {
              memory,
              disk,
              cpu,
              swap,
              ioWeight,
              name,
              environment: environment ? '(updated)' : undefined,
            },
          },
          ipAddress: ctx.ip,
        });
        return { success: true };
      } catch (e: unknown) {
        ctx.set.status = 502;
        console.error('[serverHandler:update-server]', e);
        return { error: sanitizeError(e, 'serverHandler:update-server') };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('servers:write')],
      response: {
        200: t.Object({ success: t.Boolean() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        502: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Update server settings', tags: ['Servers'] },
    }
  );

  app.delete(
    prefix + '/servers/:id',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const cfg = await cfgRepo().findOneBy({ uuid: id });

      const user = ctx.user;
      if (!cfg) {
        ctx.set.status = 404;
        return { error: ctx.t('server.notFound') };
      }

      const isAdmin = hasPermissionSync(ctx, 'servers:list');
      if (!isAdmin) {
        const owned = cfg.userId === user?.id;
        const subuser = await AppDataSource.getRepository(ServerSubuser).findOneBy({
          serverUuid: id,
          userId: user?.id,
          accepted: true,
        });
        if (!owned && !subuser) {
          ctx.set.status = 403;
          return { error: ctx.t('common.insufficientPermissions') };
        }
      }

      try {
        const svc = await serviceFor(id);
        if (svc instanceof ProxmoxApiService) {
          await svc.deleteServer(id);
        } else {
          await svc.serverRequest(id, '', 'delete');
        }
        await removeServerConfig(id);

        await eloProjectRepo().update({ serverId: id }, { serverId: null, orphanedAt: new Date() });

        await createActivityLog({
          userId: user.id,
          action: 'server:delete',
          targetId: id,
          targetType: 'server',
          ipAddress: ctx.ip,
        });

        await clearServerListCache(user.id);
        return { success: true };
      } catch (e: unknown) {
        ctx.set.status = 502;
        console.error('[serverHandler:delete-server]', e);
        return { error: sanitizeError(e, 'serverHandler:delete-server') };
      }
    },
    {
      beforeHandle: [authenticate, authorize('servers:write')],
      schema: {
        params: t.Object({ id: t.String() }),
        response: {
          200: t.Object({ success: t.Boolean() }),
          401: t.Object({ error: t.String() }),
          403: t.Object({ error: t.String() }),
          404: t.Object({ error: t.String() }),
          502: t.Object({ error: t.String() }),
        },
      },
      detail: { summary: 'Delete a server', tags: ['Servers'] },
    }
  );

  app.post(
    prefix + '/servers/v1/:id/ipv6',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const { action, ipv6Address } = (ctx.body as Record<string, unknown>) || {};
      const user = ctx.user;
      const isAdmin = hasPermissionSync(ctx, 'admin:access');

      if (!isAdmin) {
        ctx.set.status = 403;
        return { error: ctx.t('server.ipv6AdminsOnly') };
      }

      if (action !== 'assign' && action !== 'deassign') {
        ctx.set.status = 400;
        return { error: ctx.t('validation.invalidAction') };
      }

      const cfgRepo = AppDataSource.getRepository(ServerConfig);
      const cfg = await cfgRepo.findOneBy({ uuid: id });
      if (!cfg) {
        ctx.set.status = 404;
        return { error: ctx.t('server.notFound') };
      }

      if (!cfg.kvmPassthroughEnabled) {
        ctx.set.status = 400;
        return { error: ctx.t('server.ipv6AssignmentKvmOnly') };
      }

      const node = cfg.nodeId ? await nodeRepo().findOneBy({ id: cfg.nodeId }) : null;
      if (!node || !node.ipv6Subnet) {
        ctx.set.status = 400;
        return { error: ctx.t('server.ipv6NoSubnet') };
      }

      const alloc = (cfg.allocations) || { mappings: {}, owners: {} };
      alloc.mappings = alloc.mappings || {};
      alloc.owners = alloc.owners || {};
      const existingIpv6Address =
        typeof alloc.ipv6Address === 'string' && isValidIpv6(alloc.ipv6Address)
          ? formatIpv6(parseIpv6(alloc.ipv6Address))
          : null;

      if (action === 'assign') {
        if (existingIpv6Address) {
          return {
            success: true,
            ipv6: existingIpv6Address,
            message: ctx.t('server.ipv6AlreadyAssigned'),
          };
        }

        let candidateIpv6: string | null = null;
        if (ipv6Address) {
          const normalized = String(ipv6Address).trim();
          if (!isValidIpv6(normalized) || !isIpv6InSubnet(normalized, node.ipv6Subnet)) {
            ctx.set.status = 400;
            return { error: ctx.t('node.ipv6SubnetInvalid') };
          }
          if (isReservedIpv6(normalized, node.ipv6Subnet, node.ipv6ReservedCount)) {
            ctx.set.status = 400;
            return { error: ctx.t('server.ipv6AddressReserved') };
          }
          const usedAddresses = new Set<string>();
          const nodeConfigs = await cfgRepo.find({
            where: { nodeId: node.id },
            select: { allocations: true },
          });
          for (const c of nodeConfigs) {
            const entry = c.allocations;
            if (!entry) continue;
            if (entry.default?.ip && isValidIpv6(String(entry.default.ip))) {
              usedAddresses.add(formatIpv6(parseIpv6(String(entry.default.ip))));
            }
            for (const ip of Object.keys(entry.mappings || {})) {
              if (isValidIpv6(ip)) usedAddresses.add(formatIpv6(parseIpv6(ip)));
            }
          }
          if (usedAddresses.has(formatIpv6(parseIpv6(normalized)))) {
            ctx.set.status = 400;
            return { error: ctx.t('server.ipv6AlreadyInUse') };
          }
          candidateIpv6 = normalized;
        } else {
          const used = new Set<string>();
          const nodeConfigs = await cfgRepo.find({
            where: { nodeId: node.id },
            select: { allocations: true },
          });
          for (const c of nodeConfigs) {
            const entry = c.allocations;
            if (!entry) continue;
            if (entry.default?.ip && isValidIpv6(String(entry.default.ip))) {
              used.add(formatIpv6(parseIpv6(String(entry.default.ip))));
            }
            for (const ip of Object.keys(entry.mappings || {})) {
              if (isValidIpv6(ip)) used.add(formatIpv6(parseIpv6(ip)));
            }
          }
          candidateIpv6 = getNextFreeIpv6Address(
            node.ipv6Subnet,
            used,
            BigInt(node.ipv6ReservedCount ?? 0)
          );
        }

        if (!candidateIpv6) {
          ctx.set.status = 503;
          return { error: ctx.t('server.ipv6NoFreeAddress') };
        }

        alloc.ipv6Address = candidateIpv6;
        cfg.allocations = alloc;
        await cfgRepo.save(cfg);

        const svc = await serviceFor(id);
        await svc.syncServer(id, { allocations: alloc });

        await createActivityLog({
          userId: user.id,
          action: 'server:ipv6:assign',
          targetId: id,
          targetType: 'server',
          metadata: { ipv6: candidateIpv6 },
          ipAddress: ctx.ip,
        });

        return { success: true, ipv6: candidateIpv6 };
      }

      const currentIpv6Address =
        typeof alloc.ipv6Address === 'string' && isValidIpv6(alloc.ipv6Address)
          ? formatIpv6(parseIpv6(alloc.ipv6Address))
          : null;
      const ipv6Keys = Object.keys(alloc.mappings).filter(ip =>
        currentIpv6Address
          ? isValidIpv6(ip) && formatIpv6(parseIpv6(ip)) === currentIpv6Address
          : isValidIpv6(ip)
      );
      if (!currentIpv6Address) {
        return { success: true, message: ctx.t('server.noIpv6Assigned') };
      }

      delete alloc.ipv6Address;

      for (const ipv6 of ipv6Keys) delete alloc.mappings[ipv6];

      if (alloc.owners) {
        for (const ownerKey of Object.keys(alloc.owners)) {
          const idx = ownerKey.lastIndexOf(':');
          const ipPart = idx >= 0 ? ownerKey.slice(0, idx) : ownerKey;
          if (isValidIpv6(ipPart)) delete alloc.owners[ownerKey];
        }
      }

      if (alloc.default && isValidIpv6(String(alloc.default.ip))) {
        const fallbackIp = Object.keys(alloc.mappings).find(ip => !isValidIpv6(ip));
        const fallbackPort = fallbackIp ? alloc.mappings[fallbackIp]?.[0] : undefined;
        if (fallbackIp && fallbackPort != null) {
          alloc.default = { ip: fallbackIp, port: Number(fallbackPort) };
        } else {
          alloc.default = null as unknown as Record<string, unknown>;
        }
      }

      cfg.allocations = alloc;
      await cfgRepo.save(cfg);

      const svc = await serviceFor(id);
      await svc.syncServer(id, { allocations: alloc });

      await createActivityLog({
        userId: user.id,
        action: 'server:ipv6:deassign',
        targetId: id,
        targetType: 'server',
        metadata: { removed: ipv6Keys },
        ipAddress: ctx.ip,
      });

      return { success: true, removed: ipv6Keys };
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('servers:write')],
      body: t.Object({ action: t.String(), ipv6Address: t.Optional(t.String()) }),
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
        503: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Assign or remove an IPv6 address from a server', tags: ['Servers'] },
    }
  );

  app.post(
    prefix + '/servers/v1/:id/suspend',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      try {
        const body = (ctx.body || {}) as Record<string, unknown>;
        const providedReason = typeof body.reason === 'string' ? body.reason.trim() : '';
        const providedSource = typeof body.source === 'string' ? body.source.trim() : '';
        const dmcaMark = Boolean(body.dmca);
        const user = ctx.user;
        const userName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
        const actor = providedSource || userName || user?.email || 'system';
        const reason =
          providedReason || (dmcaMark ? 'DMCA takedown' : 'Suspended by panel moderation action');
        const dmcaAt = dmcaMark ? new Date() : undefined;
        const dmcaDeletionAt = dmcaMark
          ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          : undefined;

        const svc = await serviceFor(id);
        const cfgRepo = AppDataSource.getRepository(
          require('../models/serverConfig.entity').ServerConfig
        );
        const existingCfg = await cfgRepo.findOneBy({ uuid: id });
        const alreadySuspended = !!existingCfg?.suspended;
        const updateData: Record<string, unknown> = {
          suspended: true,
          suspendedBy: actor,
          suspendedReason: reason,
          suspendedAt: new Date(),
        };
        if (dmcaMark) {
          updateData.dmca = true;
          updateData.dmcaBy = actor;
          updateData.dmcaReason = reason;
          updateData.dmcaAt = dmcaAt;
          updateData.dmcaDeletionAt = dmcaDeletionAt;
        }
        await cfgRepo.update({ uuid: id }, updateData);
        await svc.powerServer(id, 'kill').catch(() => {});
        await svc.syncServer(id, {});

        let notice: {
          sent: boolean;
          skipped: boolean;
          reason?: string;
          recipient?: string;
        } = {
          sent: false,
          skipped: true,
          reason: 'owner notification not attempted',
          recipient: undefined,
        };

        if (existingCfg) {
          const shouldSendDmcaNotice = dmcaMark && !existingCfg.dmca;
          if (shouldSendDmcaNotice) {
            notice = await notifyServerOwnerDmca({
              cfg: existingCfg,
              actor,
              reason,
              dmcaAt,
              deletionAt: dmcaDeletionAt,
            });
          } else if (!alreadySuspended) {
            notice = await notifyServerOwnerSuspended({
              cfg: existingCfg,
              actor,
              reason,
              suspendedAt: new Date(),
            });
          } else {
            notice.reason = dmcaMark ? 'server already marked DMCA' : 'server already suspended';
          }

          if (!notice.sent && !notice.skipped) {
            console.warn(
              '[server:suspend] failed to notify owner by email:',
              notice.reason || 'unknown error'
            );
          }
        }

        if (user?.id) {
          await createActivityLog({
            userId: user.id,
            action: 'server:suspend',
            targetId: id,
            targetType: 'server',
            metadata: { reason, suspendedBy: actor, dmca: dmcaMark },
            ipAddress: ctx.ip,
          });
        }
        return {
          success: true,
          emailSent: notice.sent,
          emailSkipped: notice.skipped,
          emailReason: notice.reason || null,
          emailRecipient: notice.recipient || null,
        };
      } catch (e: unknown) {
        ctx.set.status = 502;
        console.error('[serverHandler:suspend-server]', e);
        return { error: sanitizeError(e, 'serverHandler:suspend-server') };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('servers:write')],
      body: t.Optional(
        t.Object({
          reason: t.Optional(t.String()),
          source: t.Optional(t.String()),
          dmca: t.Optional(t.Boolean()),
        })
      ),
      response: {
        200: t.Object({
          success: t.Boolean(),
          emailSent: t.Boolean(),
          emailSkipped: t.Boolean(),
          emailReason: t.Nullable(t.String()),
          emailRecipient: t.Nullable(t.String()),
        }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        502: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Suspend a server', tags: ['Servers'] },
    }
  );

  app.post(
    prefix + '/servers/v1/:id/unsuspend',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      try {
        const cfgRepo = AppDataSource.getRepository(
          require('../models/serverConfig.entity').ServerConfig
        );
        const existingCfg = await cfgRepo.findOneBy({ uuid: id });
        await cfgRepo.update(
          { uuid: id },
          {
            suspended: false,
            suspendedBy: null,
            suspendedReason: null,
            suspendedAt: null,
            dmca: false,
            dmcaBy: null,
            dmcaReason: null,
            dmcaAt: null,
            dmcaDeletionAt: null,
          }
        );
        const svc = await serviceFor(id);
        await svc.syncServer(id, {});
        const user = ctx.user;
        const alreadySuspended = !!existingCfg?.suspended || !!existingCfg?.dmca;
        if (!alreadySuspended && existingCfg) {
          await notifyServerOwnerUnsuspended({
            cfg: existingCfg,
            actor: user?.email || 'system',
            unsuspendedAt: new Date(),
          });
        } else if (alreadySuspended && existingCfg) {
          await notifyServerOwnerUnsuspended({
            cfg: existingCfg,
            actor: user?.email || 'system',
            unsuspendedAt: new Date(),
          });
        }
        await createActivityLog({
          userId: user.id,
          action: 'server:unsuspend',
          targetId: id,
          targetType: 'server',
          ipAddress: ctx.ip,
        });
        return { success: true };
      } catch (e: unknown) {
        ctx.set.status = 502;
        console.error('[serverHandler:unsuspend-server]', e);
        return { error: sanitizeError(e, 'serverHandler:unsuspend-server') };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('servers:write')],
      response: {
        200: t.Object({ success: t.Boolean() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        502: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Unsuspend a server', tags: ['Servers'] },
    }
  );

  app.post(
    prefix + '/servers/:id/power',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const { action } = ctx.body as Record<string, unknown>;
      const user = ctx.user;
      const gamblingConfig = await getGamblingConfig();
      const gamblingPowerEnabled = gamblingConfig.enabled && isGamblingModeEnabled(user);
      const cfg = await AppDataSource.getRepository(ServerConfig).findOneBy({ uuid: id });
      if (cfg?.hibernated && (action === 'start' || action === 'restart')) {
        ctx.set.status = 403;
        return { error: ctx.t('server.hibernated') };
      }

      if (cfg?.suspended || cfg?.dmca) {
        ctx.set.status = 403;
        return { error: buildSuspendedServerMessage(cfg) };
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

      const handlePowerSuccess = async () => {
        if (gamblingPowerEnabled) {
          await recordPowerGambleOutcome(Number(user.id), true);
        }
        if (action === 'start' || action === 'restart') {
          await cfgRepo().update({ uuid: id }, { desiredPowerState: true });
        } else if (action === 'stop' || action === 'kill') {
          await cfgRepo().update({ uuid: id }, { desiredPowerState: false });
        }
        await createActivityLog({
          userId: user.id,
          action: `server:power:${action}`,
          targetId: id,
          targetType: 'server',
          metadata: { powerAction: action },
          ipAddress: ctx.ip,
        });
      };

      try {
        const svc = await serviceFor(id);
        if ((action === 'start' || action === 'restart') && cfg?.environment?.MINECRAFT_VERSION) {
          try {
            await (svc as WingsApiService).writeFile(id, 'eula.txt', 'eula=true');
          } catch (e: unknown) {
            console.warn('[power] failed to write eula.txt:', e);
          }
        }
        try {
          const res = await svc.powerServer(id, action as 'start' | 'stop' | 'restart' | 'shutdown' | 'kill');
          await handlePowerSuccess();
          return res.data && typeof res.data === 'object' ? res.data : { success: true };
        } catch (firstErr: any) {
          if (firstErr?.response?.status === 404) {
            await svc.syncServer(id, {}).catch(e =>
              console.warn('[power] sync failed', e?.message || e)
            );
              for (const delay of [2000, 4000, 8000]) {
              await new Promise(r => setTimeout(r, delay));
              try {
                if ((action === 'start' || action === 'restart') && cfg?.environment?.MINECRAFT_VERSION) {
                  try {
                    await (svc as WingsApiService).writeFile(id, 'eula.txt', 'eula=true');
                  } catch {}
                }
                const retryRes = await svc.powerServer(id, action as 'start' | 'stop' | 'restart' | 'shutdown' | 'kill');
                await handlePowerSuccess();
                const result = retryRes.data && typeof retryRes.data === 'object' ? retryRes.data : { success: true };
                (result as any).synced = true;
                return result;
              } catch {}
            }
            ctx.set.status = 404;
            return { error: ctx.t('server.server_not_found_on_node_after_sync_attempt') };
          }
          throw firstErr;
        }
      } catch (e: unknown) {
        const err = e as Record<string, unknown>;
        const errResponse = err?.response as Record<string, unknown> | undefined;
        const status = (errResponse?.status as number) || 502;
        const errData = errResponse?.data as Record<string, unknown> | undefined;
        const msg = (errData?.error as string) || (err instanceof Error ? err.message : '') || 'Power action failed';
        ctx.set.status = status;
        return { error: msg };
      }
    },
    {
      beforeHandle: [authenticate, authorize('servers:power'), requireEloProjectDetails, requireEloVote, requireEloDevlog],
      response: {
        200: t.Any(),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Perform power action on server', tags: ['Servers'] },
    }
  );

  app.post(
    prefix + '/servers/v1/:id/kvm',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      try {
        const svc = await serviceFor(id);
        const body = ctx.body as Record<string, unknown>;
        const enable = Boolean(body?.enable ?? body?.enabled ?? false);
        if (svc instanceof WingsApiService) {
          await svc.toggleKvm(id, enable);
        } else {
          await svc.serverRequest(id, '/kvm', 'post', body);
        }
        const cfgRepo = AppDataSource.getRepository(
          require('../models/serverConfig.entity').ServerConfig
        );
        const existing = await cfgRepo.findOneBy({ uuid: id });
        if (existing) {
          existing.kvmPassthroughEnabled = enable;
          await cfgRepo.save(existing);
        }
        const user = ctx.user;
        await createActivityLog({
          userId: user.id,
          action: `server:kvm:${enable ? 'enable' : 'disable'}`,
          targetId: id,
          targetType: 'server',
          ipAddress: ctx.ip,
        });
        return { success: true };
      } catch (e: unknown) {
        const err = e as Record<string, unknown>;
        const errResponse = err?.response as Record<string, unknown> | undefined;
        const status = (errResponse?.status as number) || 500;
        const errData = errResponse?.data as Record<string, unknown> | undefined;
        const msg = (errData?.error as string) || (err instanceof Error ? err.message : '') || 'KVM action failed';
        ctx.set.status = status;
        return { error: msg };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('servers:kvm')],
      response: {
        200: t.Object({ success: t.Boolean() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        502: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Toggle server KVM', tags: ['Servers'] },
    }
  );

  app.get(
    prefix + '/servers/v1/:id/files',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const path = ctx.query.path as string;
      const dir = path || '/';
      try {
        const svc = await serviceFor(id);
        let res: Record<string, unknown>;
        try {
          res = await svc.serverRequest(
            id,
            `/files/list-directory?directory=${encodeURIComponent(dir)}`
          );
        } catch (e1: unknown) {
          const e1Err = e1 as Record<string, unknown>;
          const e1Response = e1Err?.response as Record<string, unknown> | undefined;
          if (e1Response?.status === 404) {
            res = await svc.serverRequest(id, `/files/list?directory=${encodeURIComponent(dir)}`);
          } else {
            throw e1;
          }
        }
        const data = res.data;
        const dataObj = data as Record<string, unknown>;
        const entries =
          (Array.isArray(data) ? data : null) ??
          (Array.isArray(dataObj?.entries) ? dataObj.entries : null) ??
          (Array.isArray(dataObj?.data) ? dataObj.data : null) ??
          (Array.isArray(dataObj?.files) ? dataObj.files : null) ??
          [];
        return entries;
      } catch (e: unknown) {
        const err = e as Record<string, unknown>;
        const errResponse = err?.response as Record<string, unknown> | undefined;
        if (errResponse?.status === 404) return [];
        const status = (errResponse?.status as number) || 500;
        const errData = errResponse?.data as Record<string, unknown> | undefined;
        const msg = (errData?.error as string) || (err instanceof Error ? err.message : '') || 'Failed to list files';
        ctx.set.status = status;
        return { error: msg };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('files:read')],
      response: {
        200: t.Array(t.Any()),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        500: t.Object({ error: t.String() }),
      },
      detail: { summary: 'List directory contents', tags: ['Servers'] },
    }
  );

  app.get(
    prefix + '/servers/v1/:id/files/contents',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const path = ctx.query.path as string;
      if (!path) {
        ctx.set.status = 400;
        return { error: ctx.t('validation.pathQueryParamRequired') };
      }

      if (/\.qcow2$/i.test(String(path))) {
        ctx.set.status = 403;
        return { error: ctx.t('server.qcow2NotAllowed') };
      }

      const svc = await serviceFor(id);
      try {
        const res = await svc.readFile(id, path);
        return res.data ?? '';
      } catch (e: unknown) {
        const err = e as Record<string, unknown>;
        const errResponse = err?.response as Record<string, unknown> | undefined;
        const status = (errResponse?.status as number) || 500;
        const errData = errResponse?.data as Record<string, unknown> | undefined;
        const msg = (errData?.error as string) || (err instanceof Error ? err.message : '') || 'Failed to read file';
        ctx.set.status = status;
        return { error: msg };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('files:read')],
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        500: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Read file contents', tags: ['Servers'] },
    }
  );

  app.get(
    prefix + '/servers/v1/:id/files/download',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = ctx.params;
      const path = ctx.query.path as string;

      if (!path) {
        ctx.set.status = 400;
        return { error: ctx.t('validation.pathQueryParamRequired') };
      }

      const svc = await serviceFor(id);

      try {
        const res = await svc.downloadFile(id, path);
        const filename = path.split('/').pop() || 'download';
        const contentType = String(res.headers?.['content-type'] ?? 'application/octet-stream');

        let body: Uint8Array;

        if (res.data instanceof ArrayBuffer) {
          body = new Uint8Array(res.data);
        } else if (ArrayBuffer.isView(res.data)) {
          body = new Uint8Array(res.data.buffer, res.data.byteOffset, res.data.byteLength);
        } else if (typeof res.data === 'string') {
          console.error(
            'WARNING: downloadFile returned string instead of ArrayBuffer - binary corruption will occur!'
          );
          body = new TextEncoder().encode(res.data);
        } else {
          ctx.set.status = 500;
          return { error: ctx.t('server.wingsUnexpectedResponse') };
        }

        return new Response(Buffer.from(body), {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
            'Content-Length': String(body.byteLength),
          },
        });
      } catch (e: unknown) {
        const err = e as Record<string, unknown>;
        const errResponse = err?.response as Record<string, unknown> | undefined;
        const status = (errResponse?.status as number) || 500;
        const errData = errResponse?.data as Record<string, unknown> | undefined;
        const msg = (errData?.error as string) || (err instanceof Error ? err.message : '') || 'Failed to download file';
        ctx.set.status = status;
        return { error: msg };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('files:read')],
      query: t.Object({ path: t.String() }),
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        500: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Download file', tags: ['Servers'] },
    }
  );

  app.post(
    prefix + '/servers/v1/:id/files/upload',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = ctx.params;
      const pathParam = String(ctx.query?.path || ctx.request?.headers?.get('x-path') || '').trim();
      if (!pathParam) {
        ctx.set.status = 400;
        return { error: ctx.t('validation.pathQueryParamRequired') };
      }

      const svc = await serviceFor(id);

      try {
        const contentType = String(ctx.request?.headers?.get('content-type') || '').toLowerCase();
        if (!contentType || !contentType.includes('octet-stream')) {
          ctx.set.status = 415;
          return { error: ctx.t('validation.unsupportedMediaType') };
        }

        let binaryData: Uint8Array;
        if (ctx.body instanceof Uint8Array) {
          binaryData = ctx.body;
        } else if (ctx.body instanceof ArrayBuffer) {
          binaryData = new Uint8Array(ctx.body);
        } else if (Buffer.isBuffer(ctx.body)) {
          binaryData = new Uint8Array(ctx.body);
        } else {
          const rawBody = await (ctx.request as unknown as Request).arrayBuffer();
          binaryData = new Uint8Array(rawBody);
        }

        const res = await svc.writeFile(id, pathParam, binaryData);

        const user = (ctx.store?.user as User) ?? ctx.user;
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
      } catch (e: unknown) {
        const err = e as Record<string, unknown>;
        const errResponse = err?.response as Record<string, unknown> | undefined;
        const status = (errResponse?.status as number) || 500;
        const errData = errResponse?.data as Record<string, unknown> | undefined;
        const msg = (errData?.error as string) || (err instanceof Error ? err.message : '') || 'File upload failed';
        ctx.set.status = status;
        return { error: msg, detail: err instanceof Error ? err.message : String(e) };
      }
    },
    {
      body: t.Object({ file: t.File(), path: t.String() }),
      beforeHandle: [authenticate, requireProvider('wings'), authorize('files:write')],
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        415: t.Object({ error: t.String() }),
        500: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Upload a binary file to server path', tags: ['Servers'] },
    }
  );

  app.get(
    prefix + '/servers/v1/:id/files/upload-token',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const cfg = await cfgRepo().findOneBy({ uuid: id });
      const node = cfg?.nodeId ? await nodeRepo().findOneBy({ id: cfg.nodeId }) : null;
      if (!node) {
        ctx.set.status = 500;
        return { error: ctx.t('system.targetNodeFailed') };
      }
      const svc = await serviceFor(id);
      const baseUrl = svc.getBaseWingsUrl();
      const uploadUrl = node.fqdn
        ? (() => {
            try {
              const u = new URL(baseUrl);
              u.hostname = node.fqdn;
              return u.toString().replace(/\/$/, '');
            } catch {
              return baseUrl;
            }
          })()
        : baseUrl;
      const user = (ctx.store?.user as User) ?? ctx.user;
      const now = Math.floor(Date.now() / 1000);
      const normalizeUuid = (value: unknown) => {
        if (!value) return crypto.randomUUID().replace(/-/g, '');
        const s = String(value).toLowerCase().replace(/-/g, '');
        if (/^[0-9a-f]{32}$/.test(s)) return s;
        return crypto.randomUUID().replace(/-/g, '');
      };
      const token = signWingsJwt(
        {
          iss: process.env.APP_URL || 'eclipanel',
          sub: normalizeUuid(user?.id),
          aud: [''],
          iat: now,
          nbf: now,
          exp: now + 3600,
          jti: normalizeUuid(crypto.randomUUID()),
          scope: 'file-upload',
          server_uuid: normalizeUuid(id),
          user_uuid: normalizeUuid(user?.id),
          unique_id: normalizeUuid(crypto.randomUUID()),
          ignored_files: [],
        },
        node.token
      );
      return {
        token,
        url: `${uploadUrl}/upload/file`,
      };
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('files:write')],
      response: {
        200: t.Object({ token: t.String(), url: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        500: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Get direct file upload token for Wings', tags: ['Servers'] },
    }
  );

  app.get(
    prefix + '/servers/v1/:id/files/download-token',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const filePath = ctx.query.path as string;
      if (!filePath) {
        ctx.set.status = 400;
        return { error: ctx.t('validation.pathQueryParamRequired') };
      }
      const cfg = await cfgRepo().findOneBy({ uuid: id });
      const node = cfg?.nodeId ? await nodeRepo().findOneBy({ id: cfg.nodeId }) : null;
      if (!node) {
        ctx.set.status = 500;
        return { error: ctx.t('system.targetNodeFailed') };
      }
      const svc = await serviceFor(id);
      const baseUrl = svc.getBaseWingsUrl();
      const downloadUrl = node.fqdn
        ? (() => {
            try {
              const u = new URL(baseUrl);
              u.hostname = node.fqdn;
              return u.toString().replace(/\/$/, '');
            } catch {
              return baseUrl;
            }
          })()
        : baseUrl;
      const user = (ctx.store?.user as User) ?? ctx.user;
      const now = Math.floor(Date.now() / 1000);
      const normalizeUuid = (value: unknown) => {
        if (!value) return crypto.randomUUID().replace(/-/g, '');
        const s = String(value).toLowerCase().replace(/-/g, '');
        if (/^[0-9a-f]{32}$/.test(s)) return s;
        return crypto.randomUUID().replace(/-/g, '');
      };
      const token = signWingsJwt(
        {
          iss: process.env.APP_URL || 'eclipanel',
          sub: normalizeUuid(user?.id),
          aud: [''],
          iat: now,
          nbf: now,
          exp: now + 3600,
          jti: normalizeUuid(crypto.randomUUID()),
          scope: 'file-download',
          server_uuid: normalizeUuid(id),
          file_path: filePath,
          unique_id: normalizeUuid(crypto.randomUUID()),
        },
        node.token
      );
      return {
        token,
        url: `${downloadUrl}/download/file`,
      };
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('files:read')],
      query: t.Object({ path: t.String() }),
      response: {
        200: t.Object({ token: t.String(), url: t.String() }),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        500: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Get direct file download token for Wings', tags: ['Servers'] },
    }
  );

  app.post(
    prefix + '/servers/v1/:id/files/delete',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const { path: filePath, files, bulk } = ctx.body as Record<string, unknown>;
      let root = '/';
      let targetFiles: string[] = [];

      const fPath = filePath as string;
      if (bulk && Array.isArray(files)) {
        root = typeof fPath === 'string' && fPath.length > 0 ? fPath : '/';
        targetFiles = files.filter((f: unknown) => typeof f === 'string' && f.trim().length > 0);
      } else {
        const lastSlash = fPath.lastIndexOf('/');
        root = lastSlash > 0 ? fPath.substring(0, lastSlash) : '/';
        const fileName = fPath.substring(lastSlash + 1);
        targetFiles = fileName ? [fileName] : [];
      }

      if (targetFiles.length === 0) {
        ctx.set.status = 400;
        return { error: ctx.t('validation.noFilesSpecified') };
      }

      const svc = await serviceFor(id);
      try {
        const res = await svc.deleteFile(id, root, targetFiles);
        const user = ctx.user;
        await createActivityLog({
          userId: user.id,
          action: 'server:file:delete',
          targetId: id,
          targetType: 'server',
          metadata: { root, files: targetFiles },
          ipAddress: ctx.ip,
        });
        return res.data && typeof res.data === 'object' ? res.data : { success: true };
      } catch (e: unknown) {
        const err = e as Record<string, unknown>;
        const errResponse = err?.response as Record<string, unknown> | undefined;
        const status = (errResponse?.status as number) || 500;
        const errData = errResponse?.data as Record<string, unknown> | undefined;
        const msg = (errData?.error as string) || (err instanceof Error ? err.message : '') || 'File delete failed';
        ctx.set.status = status;
        return { error: msg };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('files:write')],
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        500: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Delete file(s)', tags: ['Servers'] },
    }
  );

  app.post(
    prefix + '/servers/v1/:id/files/create-directory',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const { path: dirPath } = ctx.body as Record<string, unknown>;
      const dirPathStr = String(dirPath ?? '');
      // Wings expects { root: "<parent-dir>", name: "<new-dir-name>" }
      // Learnt it hard way, dont change it :x
      const lastSlash = dirPathStr.lastIndexOf('/');
      const root = lastSlash > 0 ? dirPathStr.substring(0, lastSlash) : '/';
      const name = dirPathStr.substring(lastSlash + 1);
      const svc = await serviceFor(id);
      try {
        const res = await svc.createDirectory(id, root, name);
        return res.data && typeof res.data === 'object' ? res.data : { success: true };
      } catch (e: unknown) {
        const err = e as Record<string, unknown>;
        const errResponse = err?.response as Record<string, unknown> | undefined;
        const status = (errResponse?.status as number) || 500;
        const errData = errResponse?.data as Record<string, unknown> | undefined;
        const msg = (errData?.error as string) || (err instanceof Error ? err.message : '') || 'Create directory failed';
        ctx.set.status = status;
        return { error: msg };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('files:write')],
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        500: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Create directory', tags: ['Servers'] },
    }
  );

  app.post(
    prefix + '/servers/v1/:id/files/archive',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const { root = '/', files } = ctx.body as Record<string, unknown>;
      if (!Array.isArray(files) || files.length === 0) {
        ctx.set.status = 400;
        return { error: ctx.t('validation.filesMustBeArray') };
      }
      const svc = await serviceFor(id);
      try {
        const res = await svc.archiveFiles(id, root as string, files);
        return res.data && typeof res.data === 'object' ? res.data : { success: true };
      } catch (e: unknown) {
        const err = e as Record<string, unknown>;
        const errResponse = err?.response as Record<string, unknown> | undefined;
        const status = (errResponse?.status as number) || 500;
        const errData = errResponse?.data as Record<string, unknown> | undefined;
        const msg = (errData?.error as string) || (err instanceof Error ? err.message : '') || 'Archive failed';
        ctx.set.status = status;
        return { error: msg };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('files:write')],
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        500: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Archive files', tags: ['Servers'] },
    }
  );

  app.post(
    prefix + '/servers/v1/:id/files/decompress',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const { root = '/', file } = ctx.body as Record<string, unknown>;
      if (!file || typeof file !== 'string') {
        ctx.set.status = 400;
        return { error: ctx.t('validation.fileMustBeString') };
      }
      const svc = await serviceFor(id);
      try {
        const res = await svc.decompressFile(id, root as string, file as string);
        return res.data && typeof res.data === 'object' ? res.data : { success: true };
      } catch (e: unknown) {
        const err = e as Record<string, unknown>;
        const errResponse = err?.response as Record<string, unknown> | undefined;
        const status = (errResponse?.status as number) || 500;
        const errData = errResponse?.data as Record<string, unknown> | undefined;
        const msg = (errData?.error as string) || (err instanceof Error ? err.message : '') || 'Decompression failed';
        ctx.set.status = status;
        return { error: msg };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('files:write')],
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        500: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Decompress archive file', tags: ['Servers'] },
    }
  );

  app.put(
    prefix + '/servers/v1/:id/files/rename',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const { root = '/', files } = ctx.body as Record<string, unknown>;
      if (!Array.isArray(files) || files.length === 0) {
        ctx.set.status = 400;
        return { error: ctx.t('validation.filesMustBeArray') };
      }

      const svc = await serviceFor(id);
      try {
        const res = await svc.serverRequest(id, '/files/rename', 'put', { root, files });
        return res.data && typeof res.data === 'object' ? res.data : { success: true };
      } catch (e: unknown) {
        const err = e as Record<string, unknown>;
        const errResponse = err?.response as Record<string, unknown> | undefined;
        const status = (errResponse?.status as number) || 500;
        const errData = errResponse?.data as Record<string, unknown> | undefined;
        const msg = (errData?.error as string) || (err instanceof Error ? err.message : '') || 'Rename failed';
        ctx.set.status = status;
        return { error: msg };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('files:write')],
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        500: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Rename files', tags: ['Servers'] },
    }
  );

  app.post(
    prefix + '/servers/v1/:id/files/move',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const { root = '/', files, destination } = ctx.body as Record<string, unknown>;
      if (!Array.isArray(files) || files.length === 0) {
        ctx.set.status = 400;
        return { error: ctx.t('validation.filesMustBeArray') };
      }
      if (!destination || typeof destination !== 'string') {
        ctx.set.status = 400;
        return { error: ctx.t('validation.destinationRequired') };
      }

      const dest = destination.replace(/^\/+|\/+$/g, '');
      const mappings = files.map((name: string) => ({
        from: name,
        to: dest ? `${dest}/${name}` : name,
      }));

      const svc = await serviceFor(id);
      try {
        const res = await svc.moveFiles(id, root as string, mappings);
        return res.data && typeof res.data === 'object' ? res.data : { success: true };
      } catch (e: unknown) {
        const err = e as Record<string, unknown>;
        const errResponse = err?.response as Record<string, unknown> | undefined;
        const status = (errResponse?.status as number) || 500;
        const errData = errResponse?.data as Record<string, unknown> | undefined;
        const msg = (errData?.error as string) || (err instanceof Error ? err.message : '') || 'Move failed';
        ctx.set.status = status;
        return { error: msg };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('files:write')],
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        500: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Move files', tags: ['Servers'] },
    }
  );

  app.post(
    prefix + '/servers/v1/:id/files/chmod',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const { root = '/', files } = ctx.body as Record<string, unknown>;
      if (!Array.isArray(files) || files.length === 0) {
        ctx.set.status = 400;
        return { error: ctx.t('validation.filesMustBeArray') };
      }

      const normalizedFiles = files.map((f: Record<string, unknown>) => {
        if (
          !f ||
          typeof f !== 'object' ||
          typeof f.file !== 'string' ||
          !/^[0-7]{3,4}$/.test(f.mode as string)
        ) {
          throw new Error('Invalid file entry; expected { file: string, mode: string }');
        }
        const normalized: { file: string; mode: string; recursive?: boolean } = { file: f.file as string, mode: f.mode as string };
        if (typeof f.recursive === 'boolean') normalized.recursive = f.recursive;
        return normalized;
      });

      const svc = await serviceFor(id);
      try {
        const res = await svc.chmodFiles(id, root as string, normalizedFiles);
        return res.data && typeof res.data === 'object' ? res.data : { success: true };
      } catch (e: unknown) {
        const err = e as Record<string, unknown>;
        const errResponse = err?.response as Record<string, unknown> | undefined;
        const status = (errResponse?.status as number) || 500;
        const errData = errResponse?.data as Record<string, unknown> | undefined;
        const msg = (errData?.error as string) || (err instanceof Error ? err.message : '') || 'chmod failed';
        ctx.set.status = status;
        return { error: msg };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('files:write')],
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        500: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Change file permissions', tags: ['Servers'] },
    }
  );

  app.get(
    prefix + '/servers/v1/:id/files/revisions',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const path = String(ctx.query?.file || '');
      if (!path) {
        ctx.set.status = 400;
        return { error: ctx.t('validation.pathQueryParamRequired') };
      }
      const svc = await serviceFor(id);
      try {
        const res = await svc.getFileRevisions(id, path);
        return res.data || res;
      } catch (e: unknown) {
        const err = e as Record<string, unknown>;
        const errResponse = err?.response as Record<string, unknown> | undefined;
        const status = (errResponse?.status as number) || 500;
        const errData = errResponse?.data as Record<string, unknown> | undefined;
        ctx.set.status = status;
        return { error: (errData?.error as string) || (err instanceof Error ? err.message : '') || 'Failed to get revisions' };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('files:read')],
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        500: t.Object({ error: t.String() }),
      },
      detail: { summary: 'List file revisions (history)', tags: ['Servers'] },
    }
  );

  app.get(
    prefix + '/servers/v1/:id/files/revisions/:revisionId',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id, revisionId } = ctx.params as Record<string, string>;
      const svc = await serviceFor(id);
      try {
        const res = await svc.getRevisionContent(id, Number(revisionId));
        const content = (res as any)?.data ?? res;
        ctx.set.headers['Content-Type'] = 'text/plain; charset=utf-8';
        return content;
      } catch (e: unknown) {
        const err = e as Record<string, unknown>;
        const errResponse = err?.response as Record<string, unknown> | undefined;
        const status = (errResponse?.status as number) || 500;
        const errData = errResponse?.data as Record<string, unknown> | undefined;
        ctx.set.status = status;
        return { error: (errData?.error as string) || (err instanceof Error ? err.message : '') || 'Failed to get revision content' };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('files:read')],
      response: {
        200: t.Any(),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
        500: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Get file revision content', tags: ['Servers'] },
    }
  );

  app.get(
    prefix + '/servers/v1/:id/files/largest-directories',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const directory = String(ctx.query?.directory || '/');
      const svc = await serviceFor(id);
      try {
        const res = await svc.getLargestDirectories(id, directory);
        return res.data || res;
      } catch (e: unknown) {
        const err = e as Record<string, unknown>;
        const errResponse = err?.response as Record<string, unknown> | undefined;
        const status = (errResponse?.status as number) || 500;
        const errData = errResponse?.data as Record<string, unknown> | undefined;
        ctx.set.status = status;
        return { error: (errData?.error as string) || (err instanceof Error ? err.message : '') || 'Failed to get largest directories' };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('files:read')],
      response: {
        200: t.Any(),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        500: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Get largest directories by size', tags: ['Servers'] },
    }
  );

  app.post(
    prefix + '/servers/v1/:id/sftp/validate',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const auth = await resolveSftpAccess(id, ctx);
      if ('error' in auth) {
        ctx.set.status = 401;
        ctx.log?.warn?.(
          { serverId: id, error: auth.error, path: ctx.query?.path ?? '/' },
          'sftp.validate.access-denied'
        );
        return { error: auth.error };
      }

      const filePath = String(ctx.query?.path || '/');
      const start = Date.now();
      ctx.log?.info?.(
        {
          serverId: id,
          nodeId: auth.node?.id,
          nodeName: auth.node?.name,
          path: filePath,
          username: auth.username,
        },
        'sftp.validate.start'
      );

      try {
        await validateSftpCredentials(
          auth.node,
          { username: auth.username, password: auth.password },
          filePath,
          auth.endpoint
        );
        ctx.log?.info?.(
          { serverId: id, nodeId: auth.node?.id, durationMs: Date.now() - start },
          'sftp.validate.success'
        );
        return { success: true };
      } catch (e: unknown) {
        const err = e as { code?: string; message?: string };
        const status = err.code === 'ENOTFOUND' ? 404 : err.code === 'EACCES' ? 403 : 401;
        ctx.set.status = status;
        ctx.log?.warn?.(
          {
            serverId: id,
            nodeId: auth.node?.id,
            durationMs: Date.now() - start,
            code: err.code,
            message: err.message,
          },
          'sftp.validate.failed'
        );
        return { error: err.message || 'Failed to validate SFTP credentials' };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('files:read')],
      detail: { summary: 'Validate KVM SFTP credentials', tags: ['Servers'] },
    }
  );

  app.get(
    prefix + '/servers/v1/:id/sftp/files',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const auth = await resolveSftpAccess(id, ctx);
      if ('error' in auth) {
        ctx.set.status = 401;
        return { error: auth.error };
      }

      try {
        return await listSftpFiles(
          auth.node,
          { username: auth.username, password: auth.password },
          (ctx.query?.path as string) ?? '/',
          auth.endpoint
        );
      } catch (e: unknown) {
        const err = e as { code?: string; message?: string };
        const status = err.code === 'ENOTFOUND' ? 404 : err.code === 'EACCES' ? 403 : 500;
        ctx.set.status = status;
        return { error: err.message || 'Failed to list SFTP directory' };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('files:read')],
      detail: { summary: 'List KVM SFTP directory contents', tags: ['Servers'] },
    }
  );

  app.get(
    prefix + '/servers/v1/:id/sftp/contents',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const auth = await resolveSftpAccess(id, ctx);
      if ('error' in auth) {
        ctx.set.status = 401;
        return { error: auth.error };
      }

      const filePath = String(ctx.query?.path || '/');
      try {
        const data = await readSftpFile(
          auth.node,
          { username: auth.username, password: auth.password },
          filePath,
          auth.endpoint
        );
        return data.toString('utf-8');
      } catch (e: unknown) {
        const err = e as { code?: string; message?: string };
        const status = err.code === 'ENOENT' ? 404 : err.code === 'EACCES' ? 403 : 500;
        ctx.set.status = status;
        return { error: err.message || 'Failed to read SFTP file' };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('files:read')],
      detail: { summary: 'Read KVM SFTP file contents', tags: ['Servers'] },
    }
  );

  app.get(
    prefix + '/servers/v1/:id/sftp/download',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = ctx.params;
      const filePath = String(ctx.query?.path || '');
      if (!filePath) {
        ctx.set.status = 400;
        return { error: ctx.t('validation.pathQueryParamRequired') };
      }

      const auth = await resolveSftpAccess(id, ctx);
      if ('error' in auth) {
        ctx.set.status = 401;
        return { error: auth.error };
      }

      try {
        const data = await readSftpFile(
          auth.node,
          { username: auth.username, password: auth.password },
          filePath,
          auth.endpoint
        );
        const filename = filePath.split('/').pop() || 'download';
        return new Response(Buffer.from(data), {
          status: 200,
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
            'Content-Length': String(data.length),
          },
        });
      } catch (e: unknown) {
        const err = e as { code?: string; message?: string };
        const status = err.code === 'ENOENT' ? 404 : err.code === 'EACCES' ? 403 : 500;
        ctx.set.status = status;
        return { error: err.message || 'Failed to download SFTP file' };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('files:read')],
      query: t.Object({ path: t.String() }),
      detail: { summary: 'Download KVM SFTP file', tags: ['Servers'] },
    }
  );

  app.post(
    prefix + '/servers/v1/:id/sftp/upload',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = ctx.params;
      const pathParam = String(ctx.query?.path || ctx.request?.headers?.get('x-path') || '').trim();
      if (!pathParam) {
        ctx.set.status = 400;
        return { error: ctx.t('validation.pathQueryParamRequired') };
      }

      const auth = await resolveSftpAccess(id, ctx);
      if ('error' in auth) {
        ctx.set.status = 401;
        return { error: auth.error };
      }

      try {
        let binaryData: Uint8Array;
        if (ctx.body instanceof Uint8Array) {
          binaryData = ctx.body;
        } else if (ctx.body instanceof ArrayBuffer) {
          binaryData = new Uint8Array(ctx.body);
        } else if (Buffer.isBuffer(ctx.body)) {
          binaryData = new Uint8Array(ctx.body);
        } else {
          const rawBody = await (ctx.request as unknown as Request).arrayBuffer();
          binaryData = new Uint8Array(rawBody);
        }
        await writeSftpFile(
          auth.node,
          { username: auth.username, password: auth.password },
          pathParam,
          Buffer.from(binaryData),
          auth.endpoint
        );
        return { success: true };
      } catch (e: unknown) {
        const err = e as { code?: string; message?: string };
        const status = err.code === 'EACCES' ? 403 : 500;
        ctx.set.status = status;
        return { error: err.message || 'SFTP upload failed' };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('files:write')],
      detail: { summary: 'Upload a file to KVM SFTP path', tags: ['Servers'] },
    }
  );

  app.post(
    prefix + '/servers/v1/:id/sftp/write',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = ctx.params;
      const auth = await resolveSftpAccess(id, ctx);
      if ('error' in auth) {
        ctx.set.status = 401;
        return { error: auth.error };
      }

      try {
        const body = ctx.body as Record<string, unknown>;
        const filePath = String(body?.path || '');
        if (!filePath) {
          ctx.set.status = 400;
          return { error: ctx.t('validation.pathRequired') };
        }

        const rawContent = body?.content;
        let content: string;
        if (typeof rawContent === 'string') {
          content = rawContent;
        } else {
          content = String(rawContent ?? '');
        }

        await writeSftpFile(
          auth.node,
          { username: auth.username, password: auth.password },
          filePath,
          Buffer.from(content, 'utf-8'),
          auth.endpoint
        );
        return { success: true };
      } catch (e: unknown) {
        const err = e as { code?: string; message?: string };
        const status = err.code === 'EACCES' ? 403 : 500;
        ctx.set.status = status;
        return { error: err.message || 'SFTP write failed' };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('files:write')],
      detail: { summary: 'Write a KVM SFTP file', tags: ['Servers'] },
    }
  );

  app.post(
    prefix + '/servers/v1/:id/sftp/delete',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const { path: root = '/', files, bulk } = ctx.body as Record<string, unknown>;

      const auth = await resolveSftpAccess(id, ctx);
      if ('error' in auth) {
        ctx.set.status = 401;
        return { error: auth.error };
      }

      let targetFiles: string[] = [];
      const rootStr = root as string;
      let baseDir: string = rootStr;

      if (bulk && Array.isArray(files)) {
        targetFiles = files.filter((f: unknown) => typeof f === 'string' && f.trim().length > 0);
      } else {
        const filePath = String(rootStr || '');
        if (!filePath) {
          ctx.set.status = 400;
          return { error: ctx.t('validation.pathRequired_1') };
        }
        const lastSlash = filePath.lastIndexOf('/');
        baseDir = filePath.substring(0, lastSlash) || '/';
        const filename = filePath.substring(lastSlash + 1);
        targetFiles = filename ? [filename] : [];
      }

      if (targetFiles.length === 0) {
        ctx.set.status = 400;
        return { error: ctx.t('validation.noFilesSpecified') };
      }

      try {
        await deleteSftpFiles(
          auth.node,
          { username: auth.username, password: auth.password },
          baseDir,
          targetFiles,
          auth.endpoint
        );
        return { success: true };
      } catch (e: unknown) {
        const err = e as { code?: string; message?: string };
        const status = err.code === 'EACCES' ? 403 : 500;
        ctx.set.status = status;
        return { error: err.message || 'SFTP delete failed' };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('files:write')],
      detail: { summary: 'Delete file(s) over KVM SFTP', tags: ['Servers'] },
    }
  );

  app.post(
    prefix + '/servers/v1/:id/sftp/create-directory',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const { path: dirPath } = ctx.body as Record<string, unknown>;
      if (!dirPath || typeof dirPath !== 'string') {
        ctx.set.status = 400;
        return { error: ctx.t('validation.pathRequired_1') };
      }

      const auth = await resolveSftpAccess(id, ctx);
      if ('error' in auth) {
        ctx.set.status = 401;
        return { error: auth.error };
      }

      try {
        await mkdirSftp(
          auth.node,
          { username: auth.username, password: auth.password },
          dirPath,
          auth.endpoint
        );
        return { success: true };
      } catch (e: unknown) {
        const err = e as { code?: string; message?: string };
        const status = err.code === 'EACCES' ? 403 : 500;
        ctx.set.status = status;
        return { error: err.message || 'SFTP create directory failed' };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('files:write')],
      detail: { summary: 'Create directory over KVM SFTP', tags: ['Servers'] },
    }
  );

  app.put(
    prefix + '/servers/v1/:id/sftp/rename',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const { root = '/', files } = ctx.body as Record<string, unknown>;
      if (!Array.isArray(files) || files.length === 0) {
        ctx.set.status = 400;
        return { error: ctx.t('validation.filesMustBeArray') };
      }

      const auth = await resolveSftpAccess(id, ctx);
      if ('error' in auth) {
        ctx.set.status = 401;
        return { error: auth.error };
      }

      try {
        const rootStr = root as string;
        const base = rootStr.replace(/\/+$/, '') || '/';
        for (const entry of files) {
          if (!entry || typeof entry.from !== 'string' || typeof entry.to !== 'string') {
            throw new Error('Invalid file mapping entry');
          }
          const fromPath = `${base}/${entry.from}`.replace(/\/+/g, '/');
          const toPath = `${base}/${entry.to}`.replace(/\/+/g, '/');
          await renameSftp(
            auth.node,
            { username: auth.username, password: auth.password },
            fromPath,
            toPath,
            auth.endpoint
          );
        }
        return { success: true };
      } catch (e: unknown) {
        const err = e as { code?: string; message?: string };
        const status = err.code === 'EACCES' ? 403 : 500;
        ctx.set.status = status;
        return { error: err.message || 'SFTP rename failed' };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('files:write')],
      detail: { summary: 'Rename files over KVM SFTP', tags: ['Servers'] },
    }
  );

  app.post(
    prefix + '/servers/v1/:id/sftp/move',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const { root = '/', files, destination } = ctx.body as Record<string, unknown>;
      if (!Array.isArray(files) || files.length === 0) {
        ctx.set.status = 400;
        return { error: ctx.t('validation.filesMustBeArray') };
      }
      if (!destination || typeof destination !== 'string') {
        ctx.set.status = 400;
        return { error: ctx.t('validation.destinationRequired') };
      }

      const auth = await resolveSftpAccess(id, ctx);
      if ('error' in auth) {
        ctx.set.status = 401;
        return { error: auth.error };
      }

      const dest = ('/' + destination).replace(/\/+/g, '/').replace(/\/+$/, '') || '/';
      const mappings = files.map((name: string) => ({
        from: name,
        to: `${dest}/${name}`.replace(/\/+/g, '/'),
      }));

      try {
        await moveSftpFiles(
          auth.node,
          { username: auth.username, password: auth.password },
          String(root || '/'),
          mappings,
          auth.endpoint
        );
        return { success: true };
      } catch (e: unknown) {
        const err = e as { code?: string; message?: string };
        const status = err.code === 'EACCES' ? 403 : 500;
        ctx.set.status = status;
        return { error: err.message || 'SFTP move failed' };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('files:write')],
      detail: { summary: 'Move files over KVM SFTP', tags: ['Servers'] },
    }
  );

  app.post(
    prefix + '/servers/v1/:id/sftp/chmod',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const { root = '/', files } = ctx.body as Record<string, unknown>;
      if (!Array.isArray(files) || files.length === 0) {
        ctx.set.status = 400;
        return { error: ctx.t('validation.filesMustBeArray') };
      }

      const auth = await resolveSftpAccess(id, ctx);
      if ('error' in auth) {
        ctx.set.status = 401;
        return { error: auth.error };
      }

      try {
        const rootStr = root as string;
        const base = rootStr.replace(/\/+$/, '') || '/';
        for (const entry of files) {
          if (!entry || typeof entry.file !== 'string' || typeof entry.mode !== 'string') {
            throw new Error('Invalid chmod entry');
          }
          const mode = parseInt(entry.mode, 8);
          if (Number.isNaN(mode)) throw new Error(`Invalid mode: ${entry.mode}`);
          const target = `${base}/${entry.file}`.replace(/\/+/g, '/');
          await chmodSftp(
            auth.node,
            { username: auth.username, password: auth.password },
            target,
            mode,
            auth.endpoint
          );
        }
        return { success: true };
      } catch (e: unknown) {
        const err = e as { code?: string; message?: string };
        const status = err.code === 'EACCES' ? 403 : 500;
        ctx.set.status = status;
        return { error: err.message || 'SFTP chmod failed' };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('files:write')],
      detail: { summary: 'Change permissions over KVM SFTP', tags: ['Servers'] },
    }
  );

  // yeah so basically wings-rs only cuz wings-go compatibility
  // would be nightmare to add
  // be happy that most shit is already supported and using wings-go is possible
  app.get(
    prefix + '/servers/v1/:id/backups',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      try {
        const svc = await serviceFor(id);
        const res = await svc.listServerBackups(id);
        try {
          app.log?.info?.(
            { serverUuid: id, remoteCount: Array.isArray(res.data) ? res.data.length : 0 },
            'server: listServerBackups response'
          );
        } catch {}
        if (Array.isArray(res.data) && res.data.length) return res.data;
        try {
          const repo = AppDataSource.getRepository(
            require('../models/serverBackup.entity').ServerBackup
          );
          const records = await repo.find({
            where: { serverUuid: id },
            order: { createdAt: 'DESC' },
          });
          try {
            app.log?.info?.(
              {
                serverUuid: id,
                localCount: records.length,
                uuids: records.map((r: Record<string, unknown>) => r.uuid),
              },
              'server: falling back to local persisted backup records'
            );
          } catch {}
          return records.map((r: Record<string, unknown>) => ({
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
          try {
            app.log?.warn?.(
              { err: e, serverUuid: id },
              'server: failed to read local backup records'
            );
          } catch {}
          return [];
        }
      } catch (e: unknown) {
        const err = e as Record<string, unknown>;
        const errResponse = err?.response as Record<string, unknown> | undefined;
        if (errResponse?.status === 404) return [];
        throw e;
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('backups:read')],
      response: {
        200: t.Array(t.Any()),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
      },
      detail: { summary: 'List backups', tags: ['Servers'] },
    }
  );

  app.post(
    prefix + '/servers/v1/:id/backups',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const user = ctx.user;
      const accountBackupsLimit =
        user?.limits && typeof user.limits.backups === 'number' ? user.limits.backups : 0;
      if (accountBackupsLimit > 0) {
        const backupRepo = AppDataSource.getRepository(
          require('../models/serverBackup.entity').ServerBackup
        );
        const cfg = await cfgRepo().findOneBy({ uuid: id });
        const ownerId = cfg?.userId || user?.id;
        const ownedServers = ownerId
          ? await cfgRepo().find({ where: { userId: ownerId }, select: { uuid: true } })
          : [];
        const serverUuids = ownedServers.map((s: ServerConfig) => s.uuid);
        const existingBackups =
          serverUuids.length > 0
            ? await backupRepo.count({ where: { serverUuid: In(serverUuids) } })
            : 0;
        if (existingBackups >= accountBackupsLimit) {
          ctx.set.status = 429;
          return { error: `Account backup limit reached (${accountBackupsLimit})` };
        }
      }
      const body = (ctx.body as Record<string, unknown>) || {};
      const adapter = 'wings';
      const uuid = body.uuid || crypto.randomUUID();
      const ignore = typeof body.ignore === 'string' ? body.ignore : '';
      const compressionType = typeof body.compression_type === 'string' ? body.compression_type : undefined;
      const backupGroupUuid = typeof body.backup_group_uuid === 'string' ? body.backup_group_uuid : undefined;

      try {
        const svc = await serviceFor(id);
        const payload: Record<string, unknown> = { adapter, uuid, ignore };
        if (compressionType) payload.compression_type = compressionType;
        if (backupGroupUuid) payload.backup_group_uuid = backupGroupUuid;
        const res = await svc.createServerBackup(id, payload);
        try {
          const repo = AppDataSource.getRepository(
            require('../models/serverBackup.entity').ServerBackup
          );
          const record = repo.create({
            uuid,
            serverUuid: id,
            adapter,
            name: res?.data?.name || undefined,
          });
          await repo.save(record);
          try {
            app.log?.info?.(
              { serverUuid: id, backupUuid: uuid },
              'server: created backup and persisted local record'
            );
          } catch {}
        } catch (e) {
          try {
            app.log?.warn?.(
              { err: e, serverUuid: id, backupUuid: uuid },
              'server: failed to persist created backup record'
            );
          } catch {}
        }
        return res.data && typeof res.data === 'object' ? res.data : { success: true };
      } catch (e: unknown) {
        const err = e as Record<string, unknown>;
        const errResponse = err?.response as Record<string, unknown> | undefined;
        if (errResponse?.status === 404) {
          console.log(e);
          ctx.set.status = 400;
          return { error: ctx.t('server.backupNotSupported') };
        }
        const status = (errResponse?.status as number) || 500;
        const errData = errResponse?.data as Record<string, unknown> | undefined;
        const msg = (errData?.error as string) || (err instanceof Error ? err.message : '') || 'Failed to create backup';
        ctx.set.status = status;
        return { error: msg };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('backups:create')],
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        500: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Create backup', tags: ['Servers'] },
    }
  );

  app.post(
    prefix + '/servers/v1/:id/backups/:bid/restore',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id, bid } = ctx.params as Record<string, string>;
      const body = (ctx.body as Record<string, unknown>) || {};
      const adapter = 'wings';
      const truncate_directory = body.truncate_directory === true;
      const download_url = body.download_url;
      try {
        const svc = await serviceFor(id);
        const res = await svc.restoreServerBackup(id, bid, {
          adapter,
          truncate_directory,
          download_url,
        });
        return res.data && typeof res.data === 'object' ? res.data : { success: true };
      } catch (e: unknown) {
        const err = e as Record<string, unknown>;
        const errResponse = err?.response as Record<string, unknown> | undefined;
        if (errResponse?.status === 404) {
          ctx.set.status = 400;
          return { error: ctx.t('server.backupNotSupported') };
        }
        const status = (errResponse?.status as number) || 500;
        const errData = errResponse?.data as Record<string, unknown> | undefined;
        const msg = (errData?.error as string) || (err instanceof Error ? err.message : '') || 'Failed to restore backup';
        ctx.set.status = status;
        return { error: msg };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('backups:write')],
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        500: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Restore backup', tags: ['Servers'] },
    }
  );

  app.delete(
    prefix + '/servers/v1/:id/backups/:bid',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id, bid } = ctx.params as Record<string, string>;
      const adapter = 'wings';
      try {
        const svc = await serviceFor(id);
        try {
          const repo = AppDataSource.getRepository(
            require('../models/serverBackup.entity').ServerBackup
          );
          const rec = await repo.findOneBy({ uuid: bid });
          if (rec && rec.locked) {
            const force =
              (ctx.query && (ctx.query.force === '1' || ctx.query.force === 'true')) ||
              (ctx.body && (ctx.body as Record<string, unknown>).force === true);
            if (!force) {
              ctx.set.status = 403;
              return { error: ctx.t('server.backupLocked') };
            }
          }
        } catch (e) {
          // skip
        }
        try {
          app.log?.info?.(
            { serverUuid: id, backupUuid: bid },
            'server: attempting to delete backup on node'
          );
        } catch {}
        const res = await svc.serverRequest(id, `/backup/${bid}`, 'delete', { adapter });
        try {
          const repo = AppDataSource.getRepository(
            require('../models/serverBackup.entity').ServerBackup
          );
          await repo.delete({ uuid: bid });
          try {
            app.log?.info?.(
              { serverUuid: id, backupUuid: bid },
              'server: deleted local persisted backup record'
            );
          } catch {}
        } catch (e) {
          try {
            app.log?.warn?.(
              { err: e, serverUuid: id, backupUuid: bid },
              'server: failed to delete local persisted backup record'
            );
          } catch {}
        }
        return res.data && typeof res.data === 'object' ? res.data : { success: true };
      } catch (e: unknown) {
        const err = e as Record<string, unknown>;
        const errResponse = err?.response as Record<string, unknown> | undefined;
        if (errResponse?.status === 404) {
          ctx.set.status = 400;
          return { error: ctx.t('server.backupNotSupported') };
        }
        const status = (errResponse?.status as number) || 500;
        const errData = errResponse?.data as Record<string, unknown> | undefined;
        const msg = (errData?.error as string) || (err instanceof Error ? err.message : '') || 'Failed to delete backup';
        ctx.set.status = status;
        return { error: msg };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('backups:write')],
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        500: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Delete backup', tags: ['Servers'] },
    }
  );

  app.post(
    prefix + '/servers/v1/:id/backups/:bid/lock',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id, bid } = ctx.params as Record<string, string>;
      const { lock } = (ctx.body as Record<string, unknown>) || {};
      try {
        const repo = AppDataSource.getRepository(
          require('../models/serverBackup.entity').ServerBackup
        );
        const rec = await repo.findOneBy({ uuid: bid });
        if (!rec) {
          ctx.set.status = 404;
          return { error: ctx.t('server.backupNotFound') };
        }
        rec.locked = !!lock;
        await repo.save(rec);
        return { success: true, locked: rec.locked };
      } catch (e: unknown) {
        ctx.set.status = 500;
        return { error: (e instanceof Error ? e.message : '') || 'Failed to update lock' };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('backups:write')],
      response: {
        200: t.Any(),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
        500: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Lock/unlock a backup', tags: ['Servers'] },
    }
  );

  app.post(
    prefix + '/servers/v1/:id/backups/:bid/rename',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id, bid } = ctx.params as Record<string, string>;
      const { name } = (ctx.body as Record<string, unknown>) || {};
      if (typeof name !== 'string' || !name.trim()) {
        ctx.set.status = 400;
        return { error: ctx.t('validation.nameRequired') };
      }
      try {
        const repo = AppDataSource.getRepository(
          require('../models/serverBackup.entity').ServerBackup
        );
        const rec = await repo.findOneBy({ uuid: bid });
        if (!rec) {
          ctx.set.status = 404;
          return { error: ctx.t('server.backupNotFound') };
        }
        rec.displayName = name.trim();
        await repo.save(rec);
        return { success: true, display_name: rec.displayName };
      } catch (e: unknown) {
        ctx.set.status = 500;
        return { error: (e instanceof Error ? e.message : '') || 'Failed to rename backup' };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('backups:write')],
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
        500: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Rename backup display name', tags: ['Servers'] },
    }
  );

  app.post(
    prefix + '/servers/v1/:id/commands',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const { command } = ctx.body as Record<string, unknown>;
      const svc = await serviceFor(id);
      const res = await svc.executeServerCommand(id, command as string);
      const user = ctx.user;
      await createActivityLog({
        userId: user.id,
        action: 'server:console:command',
        targetId: id,
        targetType: 'server',
        metadata: { command },
        ipAddress: ctx.ip,
      });
      return res.data && typeof res.data === 'object' ? res.data : { success: true };
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('commands:execute')],
      response: {
        200: t.Any(),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Execute server command', tags: ['Servers'] },
    }
  );

  app.get(
    prefix + '/servers/v1/:id/logs',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
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
          lines = raw.map((l: unknown) => (typeof l === 'string' ? l : JSON.stringify(l)));
        } else if (raw && typeof raw === 'object') {
          const inner = raw.logs ?? raw.data ?? raw.output;
          if (typeof inner === 'string') {
            lines = inner.split('\n').filter(Boolean);
          } else if (Array.isArray(inner)) {
            lines = inner.map((l: unknown) => (typeof l === 'string' ? l : JSON.stringify(l)));
          } else {
            lines = [JSON.stringify(raw)];
          }
        } else {
          lines = raw ? [String(raw)] : [];
        }
        return lines;
      } catch (e: unknown) {
        const err = e as Record<string, unknown>;
        const errResponse = err?.response as Record<string, unknown> | undefined;
        if (errResponse?.status === 404) return [];
        throw e;
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('logs:read')],
      response: {
        200: t.Array(t.String()),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Fetch server logs', tags: ['Servers', 'Logs'] },
    }
  );

  app.post(
    prefix + '/servers/v1/:id/reinstall',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const svc = await serviceFor(id);
      const body = (ctx.body as Record<string, unknown>) || {};
      const truncateDirectory =
        typeof body.truncate_directory === 'boolean' ? body.truncate_directory : true;
      const cfg = await cfgRepo().findOneBy({ uuid: id });
      let installationScript: Record<string, any> | null = null;
      if (cfg?.eggId) {
        const egg = await eggRepo().findOneBy({ id: cfg.eggId });
        const eggScript = egg?.installScript;
        if (eggScript?.script) {
          installationScript = {
            container_image:
              eggScript.container ??
              egg?.dockerImage ??
              cfg.dockerImage ??
              'ghcr.io/pterodactyl/installers:debian',
            entrypoint: eggScript.entrypoint ?? 'bash',
            script: eggScript.script,
            environment: cfg.environment || {},
          };
        }
      }

      const payload: Record<string, unknown> = {
        truncate_directory: truncateDirectory,
        ...(installationScript ? { installation_script: installationScript } : {}),
      };

      await cfgRepo().update({ uuid: id }, { installing: true });
      const res = await svc.reinstallServer(id, payload);
      const user = ctx.user;
      await createActivityLog({
        userId: user.id,
        action: 'server:reinstall',
        targetId: id,
        targetType: 'server',
        ipAddress: ctx.ip,
      });
      return res.data && typeof res.data === 'object' ? res.data : { success: true };
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('reinstall:execute')],
      response: {
        200: t.Any(),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Reinstall server', tags: ['Servers'] },
    }
  );

  // ─── Server sync ─────────────────────────────────────────────────────────
  app.post(
    prefix + '/servers/v1/:id/sync',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const payload = ctx.body as Record<string, unknown>;
      const svc = await serviceFor(id);
      const res = await svc.syncServer(id, payload);
      return res.data && typeof res.data === 'object' ? res.data : { success: true };
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('sync:execute')],
      response: {
        200: t.Any(),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Sync server', tags: ['Servers'] },
    }
  );

  const seenTransferring = new Set<string>();

  app.post(
    prefix + '/servers/v1/:id/transfer',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const payload = (ctx.body || {}) as Record<string, unknown>;
      const cfg = await cfgRepo().findOneBy({ uuid: id });
      if (!cfg) { ctx.set.status = 404; return { error: 'Server not found' }; }
      if (cfg.destinationNodeId != null) {
        ctx.set.status = 409;
        return { error: 'Server is already being transferred' };
      }
      let svc: WingsApiService;
      try { svc = await serviceFor(id) as WingsApiService; } catch {
        ctx.set.status = 500; return { error: 'Failed to resolve source node' };
      }
      const targetNodeId = payload.node_uuid != null ? Number(payload.node_uuid) : (payload.targetNodeId != null ? Number(payload.targetNodeId) : undefined);
      if (!targetNodeId) {
        ctx.set.status = 400; return { error: 'node_uuid (target) is required' };
      }
      if (targetNodeId === cfg.nodeId) {
        ctx.set.status = 409; return { error: 'Cannot transfer server to the same node' };
      }

      const targetNode = await nodeRepo().findOneBy({ id: targetNodeId });
      if (!targetNode) { ctx.set.status = 404; return { error: 'Target node not found' }; }

      const targetIp = targetNode.defaultIp || targetNode.fqdn || null;
      const oldNodeId = cfg.nodeId;
      if (targetIp) {
        try {
          if (cfg.allocations && typeof cfg.allocations === 'object') {
            const alloc = { ...cfg.allocations } as Record<string, any>;
            const oldMappings: Record<string, number[]> = alloc.mappings || {};
            const newMappings: Record<string, number[]> = {};
            for (const [, ports] of Object.entries(oldMappings)) {
              const portList = Array.isArray(ports) ? ports.map(Number).filter(p => Number.isInteger(p) && p > 0 && p <= 65535) : [];
              if (portList.length > 0) newMappings[targetIp] = [...(newMappings[targetIp] || []), ...portList];
            }
            if (newMappings[targetIp]) newMappings[targetIp] = [...new Set(newMappings[targetIp])].sort((a, b) => a - b);
            if (alloc.default && typeof alloc.default === 'object') alloc.default.ip = targetIp;
            const newFqdns: Record<string, string> = {};
            for (const [oldKey, fqdn] of Object.entries(alloc.fqdns || {})) {
              const m = String(oldKey).match(/:(\d+)$/);
              if (m) newFqdns[`${targetIp}:${m[1]}`] = String(fqdn);
            }
            alloc.mappings = newMappings;
            alloc.fqdns = newFqdns;
            cfg.allocations = alloc;
          }
        } catch (e) { app.log?.warn?.({ err: e, uuid: id }, 'transfer: failed to reassign allocations'); }
      }

      cfg.destinationNodeId = targetNodeId;
      cfg.nodeId = oldNodeId;
      await cfgRepo().save(cfg);

      const targetUrl = `${String(targetNode.url).replace(/\/+$/, '')}/api/transfers`;
      const now = Math.floor(Date.now() / 1000);
      const token = signWingsJwt({
        iss: 'eclipanel', sub: id, aud: '', iat: now, nbf: now, exp: now + 600,
        jti: crypto.randomUUID(), scope: 'transfer',
      }, targetNode.token);

      const wingsPayload: Record<string, unknown> = { url: targetUrl, token };

      if (payload.archive_format != null) wingsPayload.archive_format = payload.archive_format;
      if (payload.compression_level != null) wingsPayload.compression_level = payload.compression_level;
      if (Array.isArray(payload.backups) && (payload.backups as any[]).length > 0) {
        wingsPayload.backups = payload.backups;
        wingsPayload.delete_backups = Boolean(payload.delete_source_backups ?? payload.delete_backups);
      }
      if (payload.multiplex_channels != null || payload.multiplex_streams != null) {
        const n = Number(payload.multiplex_channels ?? payload.multiplex_streams);
        if (Number.isInteger(n) && n >= 0 && n <= 16) wingsPayload.multiplex_streams = n;
      }

      try {
        app.log?.info?.({ serverId: id, targetNodeId, wingsPayload }, '[transfer] INIT sending to Wings');
        const res = await svc.transferServer(id, wingsPayload);
        app.log?.info?.({ serverId: id, response: res?.data }, '[transfer] INIT Wings accepted');
        seenTransferring.add(id);
        return res.data && typeof res.data === 'object' ? res.data : { accepted: true };
      } catch (e: unknown) {
        cfg.destinationNodeId = undefined;
        await cfgRepo().save(cfg).catch(() => {});
        const err = e as Record<string, unknown>;
        const errResponse = err?.response as Record<string, unknown> | undefined;
        const status = (errResponse?.status as number) || 500;
        const errData = errResponse?.data;
        const message = (errData as any)?.error || (err instanceof Error ? err.message : '') || 'Transfer failed';
        ctx.set.status = status;
        return { error: message as string };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('transfer:execute')],
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Transfer server to another node', tags: ['Servers'] },
    },
  );

  app.delete(
    prefix + '/servers/v1/:id/transfer',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const svc = await serviceFor(id);
      try {
        const res = await svc.cancelTransfer(id);
        return res.data && typeof res.data === 'object' ? res.data : { success: true };
      } catch (e: unknown) {
        const err = e as Record<string, unknown>;
        const errResponse = err?.response as Record<string, unknown> | undefined;
        const status = (errResponse?.status as number) || 500;
        const errData = errResponse?.data;
        const message =
          (errData as Record<string, unknown> | undefined)?.error as string || errData ||
          (err instanceof Error ? err.message : '') ||
          'Cancel transfer failed';
        ctx.set.status = status;
        return { error: message as string };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('transfer:execute')],
      response: {
        200: t.Any(),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        500: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Cancel active server transfer', tags: ['Servers'] },
    },
  );

  app.get(
    prefix + '/servers/v1/:id/transfer',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      try {
        const svc = await serviceFor(id) as WingsApiService;
        const all = await svc.getTransfers();
        const data = (all as any)?.data ?? all;
        const progress = (data as Record<string, unknown>)?.[id] ?? null;
        if (progress) {
          seenTransferring.add(id);
          app.log?.info?.({ serverId: id, progress }, '[transfer] PROGRESS poll');
        } else if (seenTransferring.has(id)) {
          // Transfer was in Wings' map but is now gone → likely completed.
          // Auto-complete: move server to destination node
          seenTransferring.delete(id);
          app.log?.info?.({ serverId: id }, '[transfer] AUTO-COMPLETING — vanished from Wings map');
          try {
            const cfg = await cfgRepo().findOneBy({ uuid: id });
            if (cfg && cfg.destinationNodeId) {
              const destNodeId = cfg.destinationNodeId;
              await cfgRepo().update({ uuid: id }, { nodeId: destNodeId, destinationNodeId: undefined as any });
              try { await nodeService.unmapServer(id); } catch {}
              await nodeService.mapServer(id, destNodeId);
              app.log?.info?.({ serverId: id, newNode: destNodeId }, '[transfer] AUTO-COMPLETE done');
            }
          } catch (e) { app.log?.error?.({ err: e, serverId: id }, '[transfer] AUTO-COMPLETE failed'); }
        }
        return { progress };
      } catch {
        return { progress: null };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings')],
      response: {
        200: t.Object({ progress: t.Any() }),
        401: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Get server transfer progress', tags: ['Servers'] },
    },
  );

  app.post(
    prefix + '/servers/v1/:id/force-transfer',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const payload = (ctx.body || {}) as Record<string, unknown>;
      const user = ctx.user;

      const cfg = await cfgRepo().findOneBy({ uuid: id });
      if (!cfg) {
        ctx.set.status = 404;
        return { error: ctx.t('server.serverNotFound') || 'Server not found' };
      }

      const sourceNodeId = cfg.nodeId;

      let sourceSvc: WingsApiService;
      try {
        sourceSvc = await serviceFor(id) as WingsApiService;
      } catch {
        ctx.set.status = 404;
        return { error: ctx.t('server.serverNotFound') || 'Server not found' };
      }

      const targetNodeId = payload.targetNodeId != null ? Number(payload.targetNodeId) : undefined;
      if (!targetNodeId) {
        ctx.set.status = 400;
        return { error: 'targetNodeId is required' };
      }

      let targetNode: Node;
      try {
        const found = await nodeRepo().findOneBy({ id: targetNodeId });
        if (!found) {
          ctx.set.status = 404;
          return { error: ctx.t('node.targetNotFound') || 'Target node not found' };
        }
        targetNode = found;
      } catch {
        ctx.set.status = 500;
        return { error: ctx.t('node.resolveTargetFailed') || 'Failed to resolve target node' };
      }

      if (targetNode.id === sourceNodeId) {
        ctx.set.status = 400;
        return { error: 'Source and target nodes must be different' };
      }

      try {
        const targetSvc = new WingsApiService(
          targetNode.backendWingsUrl || targetNode.url,
          targetNode.token,
        );

        try {
          await sourceSvc.serverRequest(id, '', 'delete');
        } catch (e) {
          app.log?.warn?.({ err: e, uuid: id }, 'force-transfer: source delete failed (may already be gone)');
        }

        await nodeSvc.unmapServer(id);
        nodeSvc.invalidateNode(sourceNodeId);

        cfg.nodeId = targetNode.id;
        if (cfg.allocations && typeof cfg.allocations === 'object') {
          const existingAlloc = cfg.allocations as Record<string, any>;
          cfg.allocations = {
            ...existingAlloc,
            default: undefined,
            mappings: {},
            fqdns: {},
          };
        } else {
          cfg.allocations = { mappings: {}, fqdns: {} };
        }
        await cfgRepo().save(cfg);

        await nodeSvc.mapServer(id, targetNode.id);
        nodeSvc.invalidateNode(targetNode.id);

        await targetSvc.createServer({
          uuid: id,
          start_on_completion: true,
          skip_scripts: false,
        });

        await createActivityLog({
          userId: user.id,
          action: 'server:force-transfer:complete',
          targetId: id,
          targetType: 'server',
          metadata: { sourceNodeId, targetNodeId: targetNode.id },
          ipAddress: ctx.clientIP,
        });

        return { success: true, message: 'Server force transferred successfully' };
      } catch (e: unknown) {
        app.log?.error?.({ err: e, uuid: id }, 'force-transfer: failed');

        try {
          if (cfg) {
            cfg.nodeId = sourceNodeId;
            await cfgRepo().save(cfg);
          }
          await nodeSvc.unmapServer(id);
          await nodeSvc.mapServer(id, sourceNodeId);
        } catch (rollbackErr) {
          app.log?.error?.({ err: rollbackErr, uuid: id }, 'force-transfer: rollback failed');
        }

        const err = e as Record<string, unknown>;
        const errResponse = err?.response as Record<string, unknown> | undefined;
        const status = (errResponse?.status as number) || 502;
        const errData = errResponse?.data;
        const message =
          (errData as Record<string, unknown> | undefined)?.error as string || errData ||
          (err instanceof Error ? err.message : '') ||
          'Force transfer failed';
        ctx.set.status = status;
        return { error: message as string };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('transfer:execute')],
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Force transfer server (delete on source, recreate on target with new ports)', tags: ['Servers'] },
    },
  );

  app.get(
    prefix + '/servers/v1/:id/version',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const svc = await serviceFor(id);
      const res = await svc.getServerVersion(id);
      return res.data ?? {};
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('version:read')],
      response: {
        200: t.Any(),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Get server software version', tags: ['Servers'] },
    }
  );

  app.get(
    prefix + '/servers/v1/:id/console',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const cfg = await cfgRepo().findOneBy({ uuid: id });
      if (cfg?.suspended || cfg?.dmca) {
        ctx.set.status = 403;
        return { error: buildSuspendedServerMessage(cfg) };
      }
      try {
        const svc = await serviceFor(id);
        const res = await svc.serverRequest(id, '/console');
        return res.data && typeof res.data === 'object' ? res.data : { success: true };
      } catch (e: unknown) {
        const err = e as Record<string, unknown>;
        const errResponse = err?.response as Record<string, unknown> | undefined;
        if (errResponse?.status === 404) return { error: ctx.t('common.notSupported') };
        throw e;
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('servers:console')],
      response: {
        200: t.Any(),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Access server console', tags: ['Servers'] },
    }
  );

  app.get(
    prefix + '/servers/v1/:id/allocations',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const cfg = await cfgRepo().findOneBy({ uuid: id });
      const a = cfg?.allocations;
      if (!a) return [];
      const node = cfg?.nodeId ? await nodeRepo().findOneBy({ id: cfg.nodeId }) : null;
      const nodeFqdn = node?.fqdn;
      const allocRecord = a as Record<string, unknown>;
      const fqdns: Record<string, string> = (allocRecord.fqdns as Record<string, string>) ?? {};
      const resolveFqdn = (ip: string, key: string) =>
        fqdns[key] || (isValidIpv6(ip) ? null : nodeFqdn || null);
      const result: Record<string, unknown>[] = [];
      const ipv6Address =
        typeof allocRecord.ipv6Address === 'string' && isValidIpv6(allocRecord.ipv6Address as string)
          ? formatIpv6(parseIpv6(allocRecord.ipv6Address as string))
          : null;
      const ipv6Ports =
        ipv6Address && Array.isArray(allocRecord.ipv6Ports)
          ? [
              ...new Set(
                (allocRecord.ipv6Ports as number[])
                  .map((p: unknown) => Number(p))
                  .filter((p: number) => Number.isInteger(p) && p > 0)
              ),
            ].sort((x: number, y: number) => x - y)
          : [];

      if (a.default && !isValidIpv6(String(a.default.ip))) {
        const key = `${a.default.ip}:${a.default.port}`;
        result.push({
          ip: a.default.ip,
          port: a.default.port,
          fqdn: resolveFqdn(a.default.ip, key),
          is_default: true,
          notes: null,
        });
      }
      const mappings: Record<string, number[]> = a.mappings ?? {};
      for (const [ip, ports] of Object.entries(mappings)) {
        if (isValidIpv6(ip)) continue;
        for (const port of (ports as number[]) ?? []) {
          const isDef = a.default?.ip === ip && a.default?.port === port;
          if (!isDef) {
            const key = `${ip}:${port}`;
            result.push({ ip, port, fqdn: resolveFqdn(ip, key), is_default: false, notes: null });
          }
        }
      }
      return result;
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('servers:read')],
      response: {
        200: t.Array(t.Any()),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
      },
      detail: { summary: 'List network allocations', tags: ['Servers'] },
    }
  );

  app.post(
    prefix + '/servers/v1/:id/allocations',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const body = (ctx.body as Record<string, unknown>) || {};
      const count = Number(body.count || 1);
      const requestIpv6 = body.requestIpv6 === true || String(body.requestIpv6) === 'true';
      if (count <= 0) {
        ctx.set.status = 400;
        return { error: ctx.t('server.allocationInvalidCount') };
      }
      if (requestIpv6 && count !== 1) {
        ctx.set.status = 400;
        return { error: ctx.t('server.ipv6AllocationOnePort') };
      }

      const cfg = await cfgRepo().findOneBy({ uuid: id });
      if (!cfg) {
        ctx.set.status = 404;
        return { error: ctx.t('server.notFound') };
      }

      const user = ctx.user;
      const isAdmin = hasPermissionSync(ctx, 'admin:access');
      if (!isAdmin) {
        const owned = cfg.userId === user?.id;
        const subuser = await AppDataSource.getRepository(
          require('../models/serverSubuser.entity').ServerSubuser
        ).findOneBy({ serverUuid: id, userId: user?.id, accepted: true });
        if (!owned && !subuser) {
          ctx.set.status = 403;
          return { error: ctx.t('common.insufficientPermissions') };
        }
      }

      const limit =
        user?.limits && typeof user.limits.portsPerServer === 'number'
          ? user.limits.portsPerServer
          : user?.limits && typeof user.limits.portCount === 'number'
            ? user.limits.portCount
            : 3;

      const alloc = (cfg.allocations) || {};
      const owners: ServerAllocationOwners = (alloc.owners as ServerAllocationOwners) || {};
      const existingIpv6Allocations: string[] = [];
      if (typeof alloc.ipv6Address === 'string' && isValidIpv6(alloc.ipv6Address)) {
        existingIpv6Allocations.push(formatIpv6(parseIpv6(alloc.ipv6Address)));
      }
      if (alloc.default?.ip && isValidIpv6(String(alloc.default.ip))) {
        existingIpv6Allocations.push(formatIpv6(parseIpv6(String(alloc.default.ip))));
      }
      for (const ip of Object.keys(alloc.mappings || {})) {
        if (isValidIpv6(ip)) {
          const normalized = formatIpv6(parseIpv6(ip));
          if (!existingIpv6Allocations.includes(normalized))
            existingIpv6Allocations.push(normalized);
        }
      }
      const portSet = new Set<string>();
      for (const [ip, ports] of Object.entries(alloc.mappings || {}) as Array<[string, number[]]>) {
        for (const port of ports) {
          portSet.add(`${ip}:${port}`);
        }
      }

      let existingCount = 0;
      const stales: string[] = [];
      for (const [k, v] of Object.entries(owners)) {
        if (v === user.id) {
          if (portSet.has(k)) {
            existingCount++;
          } else {
            stales.push(k);
          }
        }
      }
      if (stales.length > 0) {
        for (const k of stales) delete owners[k];
        alloc.owners = owners;
        cfg.allocations = alloc;
        await cfgRepo().save(cfg);
      }
      if (alloc.default) {
        const defKey = `${alloc.default.ip}:${alloc.default.port}`;
        if (!owners[defKey] && cfg.userId === user?.id) {
          existingCount++;
        }
      }
      if (!requestIpv6 && existingCount + count > limit) {
        ctx.set.status = 403;
        return {
          error: `Per-server port limit exceeded (allowed ${limit}). Currently allocated: ${existingCount}`,
        };
      }

      const node = await nodeRepo().findOneBy({ id: cfg.nodeId });
      if (!node) {
        ctx.set.status = 400;
        return { error: ctx.t('server.allocationNotFound') };
      }
      if (!requestIpv6 && (node.portRangeStart == null || node.portRangeEnd == null)) {
        ctx.set.status = 400;
        return { error: ctx.t('server.allocationNotFound') };
      }
      if (
        node.portRangeStart != null &&
        node.portRangeEnd != null &&
        node.portRangeStart > node.portRangeEnd
      ) {
        ctx.set.status = 500;
        return { error: ctx.t('node.portRangeMisconfigured') };
      }

      const excludedPorts = parsePortList(node.ipv6ExcludedPorts);
      const nodeConfigs = await cfgRepo().find({ where: { nodeId: node.id } });
      const takenPorts = new Set<number>();
      for (const c of nodeConfigs) {
        const a = c.allocations;
        if (!a) continue;
        if (a.default?.port) {
          const p = Number(a.default.port);
          if (p >= 1 && p <= 65535) takenPorts.add(p);
        }
        for (const ports of Object.values(a.mappings ?? {}) as number[][]) {
          for (const p of ports) {
            const pn = Number(p);
            if (pn >= 1 && pn <= 65535) takenPorts.add(pn);
          }
        }
      }

      if (requestIpv6) {
        ctx.set.status = 400;
        return { error: ctx.t('server.ipv6AllocationRequestRequired') };
      }

      const bindIp = node.defaultIp || '0.0.0.0';

      const newPorts: { ip: string; port: number }[] = [];
      for (let p = node.portRangeStart; p <= node.portRangeEnd && newPorts.length < count; p++) {
        if (!takenPorts.has(p) && !excludedPorts.has(p)) {
          newPorts.push({ ip: bindIp, port: p });
          takenPorts.add(p);
        }
      }

      if (newPorts.length < count) {
        ctx.set.status = 503;
        return { error: ctx.t('node.noFreePorts') };
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
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('servers:write')],
      response: {
        200: t.Array(t.Object({ ip: t.String(), port: t.Number(), is_default: t.Boolean() })),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
        409: t.Object({ error: t.String() }),
        503: t.Object({ error: t.String() }),
      },
      detail: {
        summary: 'Request additional network allocations for server (per-account limit)',
        tags: ['Servers'],
      },
    }
  );

  app.post(
    prefix + '/servers/v1/:id/ip-request',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const { type, reason } = (ctx.body as Record<string, unknown>) || {};
      const user = ctx.user;
      const isAdmin = hasPermissionSync(ctx, 'admin:access');

      if (!type || (type !== 'ipv4' && type !== 'ipv6')) {
        ctx.set.status = 400;
        return { error: ctx.t('validation.ipv4OrIpv6') };
      }
      if (!reason || typeof reason !== 'string' || !reason.trim()) {
        ctx.set.status = 400;
        return { error: ctx.t('validation.aReasonForTheIPRequestIsRequired') };
      }

      const cfg = await cfgRepo().findOneBy({ uuid: id });
      if (!cfg) {
        ctx.set.status = 404;
        return { error: ctx.t('server.notFound') };
      }

      if (!isAdmin) {
        const owned = cfg.userId === user?.id;
        const subuser = await AppDataSource.getRepository(
          require('../models/serverSubuser.entity').ServerSubuser
        ).findOneBy({ serverUuid: id, userId: user?.id, accepted: true });
        if (!owned && !subuser) {
          ctx.set.status = 403;
          return { error: ctx.t('common.insufficientPermissions') };
        }
      }

      const form = await getOrCreateIpRequestForm();
      const submission = applicationSubmissionRepo().create({
        formId: form.id,
        userId: user?.id,
        ipAddress: ctx.ip,
        status: 'pending',
        content: `IP request for server ${id} (${type}): ${reason.trim()}`,
        meta: {
          serverUuid: id,
          nodeId: cfg.nodeId,
          requestType: type,
          reason: reason.trim(),
        },
      });
      const saved = await applicationSubmissionRepo().save(submission);

      await createActivityLog({
        userId: user?.id || 0,
        action: 'server:ip_request',
        targetId: id,
        targetType: 'server',
        metadata: { requestType: type, submissionId: saved.id },
        ipAddress: ctx.ip,
      });

      return { success: true, submissionId: saved.id };
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('servers:write')],
      response: {
        200: t.Object({ success: t.Boolean(), submissionId: t.Number() }),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Request an IPv4 or IPv6 allocation via application', tags: ['Servers'] },
    }
  );

  app.delete(
    prefix + '/servers/v1/:id/allocations',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const body = (ctx.body as Record<string, unknown>) || {};
      const ip = body.ip;
      const port = Number(body.port || 0);
      if (!ip || !port) {
        ctx.set.status = 400;
        return { error: ctx.t('server.invalidIpPort') };
      }

      const cfg = await cfgRepo().findOneBy({ uuid: id });
      if (!cfg) {
        ctx.set.status = 404;
        return { error: ctx.t('server.notFound') };
      }

      const user = ctx.user;
      const isAdmin = hasPermissionSync(ctx, 'admin:access');
      if (!isAdmin) {
        const owned = cfg.userId === user?.id;
        const subuser = await AppDataSource.getRepository(
          require('../models/serverSubuser.entity').ServerSubuser
        ).findOneBy({ serverUuid: id, userId: user?.id, accepted: true });
        if (!owned && !subuser) {
          ctx.set.status = 403;
          return { error: ctx.t('common.insufficientPermissions') };
        }
      }

      const alloc = (cfg.allocations) || {};
      if (alloc.default && alloc.default.ip === ip && Number(alloc.default.port) === port) {
        ctx.set.status = 400;
        return { error: ctx.t('server.allocationDefaultCannotRemove') };
      }

      const key = `${ip}:${port}`;
      if (!isAdmin) {
        const owners: ServerAllocationOwners = (alloc.owners as ServerAllocationOwners) || {};
        if (owners[key] !== user.id) {
          ctx.set.status = 403;
          return { error: ctx.t('server.allocationNotOwner') };
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
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('servers:write')],
      response: {
        200: t.Object({ success: t.Boolean() }),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Delete a network allocation from a server', tags: ['Servers'] },
    }
  );

  app.delete(
    prefix + '/servers/v1/:id/allocations/secondary',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const cfg = await cfgRepo().findOneBy({ uuid: id });
      if (!cfg) {
        ctx.set.status = 404;
        return { error: ctx.t('server.notFound') };
      }

      const user = ctx.user;
      const isAdmin = hasPermissionSync(ctx, 'admin:access');
      const owned = cfg.userId === user?.id;
      if (!isAdmin) {
        const subuser = await AppDataSource.getRepository(
          require('../models/serverSubuser.entity').ServerSubuser
        ).findOneBy({ serverUuid: id, userId: user?.id, accepted: true });
        if (!owned && !subuser) {
          ctx.set.status = 403;
          return { error: ctx.t('common.insufficientPermissions') };
        }
      }

      const alloc = (cfg.allocations) || {};
      const defaultKey = alloc.default ? `${alloc.default.ip}:${Number(alloc.default.port)}` : null;
      const owners: ServerAllocationOwners = (alloc.owners as ServerAllocationOwners) || {};
      const removed: Array<{ ip: string; port: number }> = [];

      alloc.mappings = alloc.mappings || {};
      for (const [ip, ports] of Object.entries(alloc.mappings) as Array<[string, number[]]>) {
        for (const port of [...ports]) {
          const key = `${ip}:${Number(port)}`;
          if (defaultKey && key === defaultKey) continue;
          if (!isAdmin && !owned && owners[key] !== user?.id) continue;
          const idx = ports.indexOf(Number(port));
          if (idx !== -1) ports.splice(idx, 1);
          delete owners[key];
          removed.push({ ip, port: Number(port) });
        }
        if (ports.length === 0) delete alloc.mappings[ip];
      }

      alloc.owners = owners;
      cfg.allocations = alloc;
      await cfgRepo().save(cfg);

      return { success: true, removedCount: removed.length, removed };
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('servers:write')],
      response: {
        200: t.Object({
          success: t.Boolean(),
          removedCount: t.Number(),
          removed: t.Array(t.Object({ ip: t.String(), port: t.Number() })),
        }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
      detail: {
        summary: 'Delete all secondary network allocations from a server',
        tags: ['Servers'],
      },
    }
  );

  app.get(
      prefix + '/servers/v1/:id/network',
      async (ctx: AuthenticatedHandlerContext) => {
        const { id } = (ctx.params ?? {}) as Record<string, string>;
        try {
          const svc = await serviceFor(id);
          const res = await svc.serverRequest(id, '/network');
          return res.data ?? [];
        } catch (e: unknown) {
          const err = e as Record<string, unknown>;
          const errResponse = err?.response as Record<string, unknown> | undefined;
          if (errResponse?.status === 404) return [];
          throw e;
        }
      },
      {
      beforeHandle: [authenticate, authorize('servers:read')],
        response: {
          200: t.Array(t.Any()),
          401: t.Object({ error: t.String() }),
          403: t.Object({ error: t.String() }),
        },
        detail: { summary: 'Get server network', tags: ['Servers'] },
      }
    );

    app.get(
      prefix + '/servers/:id/location',
      async (ctx: AuthenticatedHandlerContext) => {
        const { id } = (ctx.params ?? {}) as Record<string, string>;
        try {
          const svc = await serviceFor(id);
          const res = await svc.serverRequest(id, '/location');
          return res.data ?? [];
        } catch (e: unknown) {
          const err = e as Record<string, unknown>;
          const errResponse = err?.response as Record<string, unknown> | undefined;
          if (errResponse?.status === 404) return [];
          throw e;
        }
      },
      {
        beforeHandle: [authenticate, authorize('servers:read')],
        response: {
          200: t.Array(t.Any()),
          401: t.Object({ error: t.String() }),
          403: t.Object({ error: t.String() }),
        },
        detail: { summary: 'Get server location', tags: ['Servers'] },
      }
    );

  app.get(
    prefix + '/servers/:id/stats',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;

      const mappingRepo = AppDataSource.getRepository(ServerMapping);
      const mapping = await mappingRepo.findOne({ where: { uuid: id }, relations: { node: true } });
      const unhealthyNodeIds = await getUnhealthyNodeIds();
      const nodeIsUnhealthy = mapping?.node && unhealthyNodeIds.includes(mapping.node.id);

      const withNetworkRates = async (input: Record<string, unknown> | null) => {
        const merged: Record<string, unknown> = input && typeof input === 'object' ? { ...input } : {};

        const readNumber = (source: Record<string, unknown>, paths: string[]): number => {
          for (const path of paths) {
            const parts = path.split('.');
            let cur: unknown = source;
            for (const p of parts) {
              if (cur == null) break;
              cur = (cur as Record<string, unknown>)[p];
            }
            const num = Number(cur);
            if (Number.isFinite(num)) return num;
          }
          return 0;
        };

        let rxBps = readNumber(merged, ['network.rx_bps', 'network.download_bps']);
        let txBps = readNumber(merged, ['network.tx_bps', 'network.upload_bps']);

        if (rxBps <= 0) {
          const rxMbps = readNumber(merged, [
            'network.rx_mbps',
            'network.rx_mbit',
            'network.rx_rate_mbps',
            'network.download_mbps',
          ]);
          if (rxMbps > 0) rxBps = (rxMbps * 1_000_000) / 8;
        }
        if (txBps <= 0) {
          const txMbps = readNumber(merged, [
            'network.tx_mbps',
            'network.tx_mbit',
            'network.tx_rate_mbps',
            'network.upload_mbps',
          ]);
          if (txMbps > 0) txBps = (txMbps * 1_000_000) / 8;
        }

        if (rxBps <= 0 && txBps <= 0) {
          try {
            const socRepo = AppDataSource.getRepository(SocData);
            const rows = await socRepo.find({
              where: { serverId: id },
              order: { timestamp: 'DESC' },
              take: 2,
            });
            if (Array.isArray(rows) && rows.length >= 2) {
              const sorted = [...rows].sort(
                (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
              );
              const prev = sorted[0];
              const last = sorted[1];

              const prevTs = new Date(prev.timestamp).getTime();
              const lastTs = new Date(last.timestamp).getTime();
              const deltaSeconds = (lastTs - prevTs) / 1000;

              if (Number.isFinite(deltaSeconds) && deltaSeconds > 0) {
                const prevRx = readNumber(prev.metrics ?? {}, [
                  'network.rx_bytes',
                  'network.rx',
                  'network.received',
                ]);
                const prevTx = readNumber(prev.metrics ?? {}, [
                  'network.tx_bytes',
                  'network.tx',
                  'network.sent',
                ]);
                const lastRx = readNumber(last.metrics ?? {}, [
                  'network.rx_bytes',
                  'network.rx',
                  'network.received',
                ]);
                const lastTx = readNumber(last.metrics ?? {}, [
                  'network.tx_bytes',
                  'network.tx',
                  'network.sent',
                ]);

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

      if (nodeIsUnhealthy) {
        const socRepo = AppDataSource.getRepository(SocData);
        const latest = await socRepo.findOne({
          where: { serverId: id },
          order: { timestamp: 'DESC' },
        });
        return await withNetworkRates(latest?.metrics ?? {});
      }

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
      const latest = await socRepo.findOne({
        where: { serverId: id },
        order: { timestamp: 'DESC' },
      });
      return await withNetworkRates(latest?.metrics ?? {});
    },
    {
      beforeHandle: [authenticate, authorize('servers:read')],
      response: {
        200: t.Any(),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Latest server stats', tags: ['Servers'] },
    }
  );

  app.get(
    prefix + '/servers/:id/stats/history',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const { window: w = '1h', points: p = '60' } = ctx.query ?? {};

      const points = Math.max(12, Math.min(1440, Number(p) || 60));
      try {
        const mappingRepo = AppDataSource.getRepository(ServerMapping);
        const mapping = await mappingRepo.findOne({
          where: { uuid: id },
          relations: { node: true },
        });
        const unhealthyNodeIds = await getUnhealthyNodeIds();
        const nodeIsUnhealthy = mapping?.node && unhealthyNodeIds.includes(mapping.node.id);

        let rows: MetricsRow[] = [];
        let liveData: MetricsData | null = null;

        if (!nodeIsUnhealthy) {
          try {
            const svc = await serviceFor(id);
            const res = await svc.serverRequest(id, '/stats');
            if (res?.data && typeof res.data === 'object') {
              liveData = extractStats(res.data);
            }
          } catch {
            // skip
          }
        }

        if (w === 'live') {
          if (liveData) {
            return [{ timestamp: new Date().toISOString(), metrics: liveData }];
          }

          const { fetchHistorical } = await import('../services/metricsService');
          rows = await fetchHistorical(id, '5m', points);
          if (rows.length > 0) {
            return rows;
          }
        } else {
          const { fetchHistorical } = await import('../services/metricsService');
          rows = await fetchHistorical(id, w as string, points);
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
      } catch (e: unknown) {
        console.error('stats history error', e);
        ctx.set.status = 500;
        return { error: ctx.t('server.statsFailed') };
      }
    },
    {
      beforeHandle: [authenticate, authorize('servers:read')],
      response: {
        200: t.Array(t.Any()),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        500: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Historical stats', tags: ['Servers'] },
    }
  );

  app.get(
    prefix + '/servers/:id/stats/node',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      try {
        const mappingRepo = AppDataSource.getRepository(ServerMapping);
        const mapping = await mappingRepo.findOne({
          where: { uuid: id },
          relations: { node: true },
        });
        if (!mapping) {
          ctx.set.status = 404;
          return { error: ctx.t('server.nodeMappingNotFound') };
        }
        const unhealthyNodeIds = await getUnhealthyNodeIds();
        const node = mapping.node;
        if (unhealthyNodeIds.includes(node.id)) {
          const { fetchHistorical } = await import('../services/metricsService');
          const rows = await fetchHistorical(`node:${node.id}`, '5m', 5);
          return rows.length > 0 ? rows[rows.length - 1].metrics : {};
        }
        const svc = new WingsApiService(node.backendWingsUrl || node.url, node.token);
        const [infoResult, statsResult] = await Promise.allSettled([
          svc.getSystemInfo(),
          svc.getSystemStats(),
        ]);
        const info = infoResult.status === 'fulfilled' ? (infoResult.value.data ?? {}) : {};
        const statsPayload =
          statsResult.status === 'fulfilled' ? (statsResult.value.data ?? {}) : {};

        const merged: Record<string, unknown> = { ...info, ...(statsPayload.stats ?? {}) };

        const readNumber = (source: Record<string, unknown>, paths: string[]): number => {
          for (const path of paths) {
            const parts = path.split('.');
            let cur: unknown = source;
            for (const p of parts) {
              if (cur == null) break;
              cur = (cur as Record<string, unknown>)[p];
            }
            const num = Number(cur);
            if (Number.isFinite(num)) return num;
          }
          return 0;
        };

        let rxBps = readNumber(merged, ['network.rx_bps', 'network.download_bps']);
        let txBps = readNumber(merged, ['network.tx_bps', 'network.upload_bps']);

        if (rxBps <= 0) {
          const directMbps = readNumber(merged, [
            'network.rx_mbps',
            'network.rx_mbit',
            'network.rx_rate_mbps',
            'network.download_mbps',
          ]);
          if (directMbps > 0) rxBps = (directMbps * 1_000_000) / 8;
        }
        if (txBps <= 0) {
          const directMbps = readNumber(merged, [
            'network.tx_mbps',
            'network.tx_mbit',
            'network.tx_rate_mbps',
            'network.upload_mbps',
          ]);
          if (directMbps > 0) txBps = (directMbps * 1_000_000) / 8;
        }

        if (rxBps <= 0 && txBps <= 0) {
          try {
            const { fetchHistorical } = await import('../services/metricsService');
            const nodeMetricKey = `node:${mapping.node.id}`;
            const rows = await fetchHistorical(nodeMetricKey, '5m', 5);
            if (Array.isArray(rows) && rows.length >= 2) {
              const sorted = [...rows]
                .filter((row: Record<string, unknown>) => Number.isFinite(new Date(row?.timestamp as string).getTime()))
                .sort(
                  (a: Record<string, unknown>, b: Record<string, unknown>) =>
                    new Date(a.timestamp as string).getTime() - new Date(b.timestamp as string).getTime()
                );

              if (sorted.length >= 2) {
                const prev = sorted[sorted.length - 2];
                const last = sorted[sorted.length - 1];
                const prevTs = new Date(prev.timestamp).getTime();
                const lastTs = new Date(last.timestamp).getTime();
                const deltaSeconds = (lastTs - prevTs) / 1000;

                if (Number.isFinite(deltaSeconds) && deltaSeconds > 0) {
                  const prevRx = readNumber(prev, [
                    'metrics.network.rx_bytes',
                    'metrics.network.rx',
                    'metrics.network.received',
                    'network.rx_bytes',
                    'network.rx',
                    'network.received',
                  ]);
                  const prevTx = readNumber(prev, [
                    'metrics.network.tx_bytes',
                    'metrics.network.tx',
                    'metrics.network.sent',
                    'network.tx_bytes',
                    'network.tx',
                    'network.sent',
                  ]);
                  const lastRx = readNumber(last, [
                    'metrics.network.rx_bytes',
                    'metrics.network.rx',
                    'metrics.network.received',
                    'network.rx_bytes',
                    'network.rx',
                    'network.received',
                  ]);
                  const lastTx = readNumber(last, [
                    'metrics.network.tx_bytes',
                    'metrics.network.tx',
                    'metrics.network.sent',
                    'network.tx_bytes',
                    'network.tx',
                    'network.sent',
                  ]);

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
      } catch (e: unknown) {
        ctx.set.status = 502;
        return { error: ctx.t('node.statsRetrieveFailed') };
      }
    },
    {
      beforeHandle: [authenticate, authorize('servers:read')],
      response: {
        200: t.Any(),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        502: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Node-level stats', tags: ['Servers'] },
    }
  );

  app.get(
    prefix + '/servers/:id/stats/node/history',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const { window: w = '24h', points: p = '144' } = ctx.query ?? {};
      const points = Math.max(12, Math.min(1440, Number(p) || 144));

      try {
        const mappingRepo = AppDataSource.getRepository(ServerMapping);
        const mapping = await mappingRepo.findOne({
          where: { uuid: id },
          relations: { node: true },
        });
        if (!mapping) {
          ctx.set.status = 404;
          return { error: ctx.t('server.nodeMappingNotFound') };
        }

        const nodeMetricKey = `node:${mapping.node.id}`;
        const unhealthyNodeIds = await getUnhealthyNodeIds();
        const nodeIsUnhealthy = unhealthyNodeIds.includes(mapping.node.id);
        const { fetchHistorical } = await import('../services/metricsService');
        let rows = await fetchHistorical(nodeMetricKey, w as string, points);

        if (!nodeIsUnhealthy) {
          try {
            const node = mapping.node;
            const svc = new WingsApiService(node.backendWingsUrl || node.url, node.token);
            const latest = await svc.getSystemStats();
            const latestData = latest as { data?: Record<string, unknown> };
            const liveMetrics = latestData?.data?.stats ?? latestData?.data ?? null;
            if (liveMetrics && typeof liveMetrics === 'object') {
              if (rows.length === 0) {
                rows = [{ timestamp: new Date().toISOString(), metrics: liveMetrics }];
              } else {
                rows[rows.length - 1].metrics = liveMetrics;
                rows[rows.length - 1].timestamp = new Date().toISOString();
              }
            }
          } catch {
            // skip
          }
        }

        return rows;
      } catch (e: unknown) {
        console.error('node stats history error', e);
        ctx.set.status = 500;
        return { error: ctx.t('server.nodeStatsFailed') };
      }
    },
    {
      beforeHandle: [authenticate, authorize('servers:read')],
      response: {
        200: t.Array(t.Any()),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
        500: t.Object({ error: t.String() }),
      },
      detail: { summary: "Node historical stats for server's host node", tags: ['Servers'] },
    }
  );

  app.get(
    prefix + '/servers/v1/:id/configuration',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const svc = await serviceFor(id);
      const res = await svc.serverRequest(id, '/configuration');
      return res.data ?? {};
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('configuration:read')],
      response: {
        200: t.Any(),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Server configuration', tags: ['Servers'] },
    }
  );

  app.post(
    prefix + '/servers/v1/:id/script',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const svc = await serviceFor(id);
      const res = await svc.serverRequest(id, '/script', 'post', ctx.body);
      return res.data && typeof res.data === 'object' ? res.data : { success: true };
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('servers:write')],
      response: {
        200: t.Any(),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Run script', tags: ['Servers'] },
    }
  );

  app.post(
    prefix + '/servers/v1/:id/ws/permissions',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const svc = await serviceFor(id);
      const res = await svc.serverRequest(id, '/ws/permissions', 'post', ctx.body);
      return res.data && typeof res.data === 'object' ? res.data : { success: true };
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('servers:write')],
      response: {
        200: t.Any(),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Set WS permissions', tags: ['Servers'] },
    }
  );

  app.post(
    prefix + '/servers/v1/:id/ws/broadcast',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const svc = await serviceFor(id);
      const res = await svc.serverRequest(id, '/ws/broadcast', 'post', ctx.body);
      return res.data && typeof res.data === 'object' ? res.data : { success: true };
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('servers:write')],
      response: {
        200: t.Any(),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Broadcast WS message', tags: ['Servers'] },
    }
  );

  app.post(
    prefix + '/servers/v1/:id/install/abort',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const svc = await serviceFor(id);
      const res = await svc.serverRequest(id, '/install/abort', 'post');
      return res.data && typeof res.data === 'object' ? res.data : { success: true };
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('servers:write')],
      response: {
        200: t.Any(),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Abort install', tags: ['Servers'] },
    }
  );

  app.get(
    prefix + '/servers/v1/:id/configuration/egg',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const svc = await serviceFor(id);
      const res = await svc.serverRequest(id, '/configuration/egg');
      return res.data ?? {};
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('configuration:read')],
      response: {
        200: t.Any(),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Egg-specific configuration', tags: ['Servers'] },
    }
  );

  app.put(
    prefix + '/servers/v1/:id/configuration/egg',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const payload = ctx.body as Record<string, unknown>;
      const svc = await serviceFor(id);
      const res = await svc.serverRequest(id, '/configuration/egg', 'put', payload);
      return res.data && typeof res.data === 'object' ? res.data : { success: true };
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('configuration:write')],
      response: {
        200: t.Any(),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Update egg configuration', tags: ['Servers'] },
    }
  );

  app.get(
    prefix + '/servers/v1/:id/startup',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const cfg = await cfgRepo().findOneBy({ uuid: id });
      if (!cfg) {
        ctx.set.status = 404;
        return { error: ctx.t('server.notFound') };
      }
      const egg = cfg.eggId ? await eggRepo().findOneBy({ id: cfg.eggId }) : null;
      const eggProc = egg?.processConfig || {};
      const cfgProc = cfg.processConfig || {};
      const proc: ServerProcessConfigLike = { ...eggProc, ...cfgProc };

      const selectedDockerImage = cfg.dockerImage || egg?.dockerImage || '';
      const dockerImageOptions: Array<{ label: string; value: string }> = [];

      if (egg?.dockerImages && typeof egg.dockerImages === 'object') {
        for (const [key, value] of Object.entries(egg.dockerImages)) {
          dockerImageOptions.push({ label: String(key), value: String(value) });
        }
      }

      if (egg?.dockerImage) {
        const exists = dockerImageOptions.some(option => option.value === egg.dockerImage);
        if (!exists) dockerImageOptions.unshift({ label: 'Default', value: egg.dockerImage });
      }

      if (
        selectedDockerImage &&
        !dockerImageOptions.some(option => option.value === selectedDockerImage)
      ) {
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
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('servers:read')],
      response: {
        200: t.Any(),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Get startup configuration', tags: ['Servers'] },
    }
  );

  app.put(
    prefix + '/servers/v1/:id/startup',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const { environment, processConfig: incomingProcCfg, dockerImage, startup } = ctx.body as Record<string, unknown>;
      if (!environment && !incomingProcCfg && dockerImage === undefined && startup === undefined) {
        ctx.set.status = 400;
        return { error: ctx.t('validation.environmentRequired') };
      }

      const cfg = await cfgRepo().findOneBy({ uuid: id });
      if (!cfg) {
        ctx.set.status = 404;
        return { error: ctx.t('server.notFound') };
      }

      const user = ctx.user;
      const isAdmin = hasPermissionSync(ctx, 'servers:list');
      let nextEnvironment: Record<string, string> | null = null;

      const egg = cfg.eggId ? await eggRepo().findOneBy({ id: cfg.eggId }) : null;
      const editableKeys = new Set<string>();
      const definedKeys = new Set<string>();
      if (egg?.envVars) {
        for (const v of (egg.envVars || []) as Record<string, unknown>[]) {
          const key = String(v.env_variable ?? v.key ?? v.name ?? '');
          if (!key) continue;
          definedKeys.add(key);
          if (v.user_editable) editableKeys.add(key);
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
          return { error: ctx.t('server.invalidDockerImage') };
        }

        cfg.dockerImage = String(dockerImage);
      }

      if (startup !== undefined && typeof startup === 'string') {
        cfg.startup = startup;
      }

      if (environment && typeof environment === 'object') {
        nextEnvironment = {};
        for (const [key, val] of Object.entries(environment)) {
          if (!key) continue;
          if (definedKeys.has(key) && editableKeys.size > 0 && !editableKeys.has(key)) continue;
          nextEnvironment[key] = String(val);
        }
        cfg.environment = nextEnvironment;
      }

      if (incomingProcCfg && typeof incomingProcCfg === 'object') {
        const existing = cfg.processConfig || {};
        const updated = { ...existing };
        if ((incomingProcCfg as Record<string, unknown>)?.startup) {
          updated.startup = { ...(existing.startup || {}), ...(incomingProcCfg as Record<string, unknown>).startup as Record<string, unknown> };
        }
        if ((incomingProcCfg as Record<string, unknown>)?.stop) {
          updated.stop = { ...(existing.stop || {}), ...(incomingProcCfg as Record<string, unknown>).stop as Record<string, unknown> };
        }
        updated.startup = {
          ...(updated.startup || {}),
          done: normalizeStartupDonePatterns(updated.startup?.done),
        };
        cfg.processConfig = updated;
      }

      const requestedHostAddr =
        normalizeIpv6Host(nextEnvironment?.VM_HOSTADDR) ||
        normalizeIpv6Host((cfg.allocations)?.ipv6Address) ||
        '';
      const requestedVmPorts = nextEnvironment?.VM_PORTS ?? '';
      if (nextEnvironment && requestedHostAddr && isValidIpv6(requestedHostAddr)) {
        const alloc = (cfg.allocations) || { mappings: {}, owners: {} };
        const ipv6Address = formatIpv6(parseIpv6(requestedHostAddr));
        const existingMappings: Record<string, number[]> = alloc.mappings || {};
        const parsedPorts = parseVmPorts(requestedVmPorts);

        for (const key of Object.keys(existingMappings)) {
          const normalizedKey = normalizeIpv6Host(key);
          if (
            normalizedKey !== ipv6Address &&
            isValidIpv6(normalizedKey) &&
            formatIpv6(parseIpv6(normalizedKey)) === ipv6Address
          ) {
            delete existingMappings[key];
          }
        }

        const currentIpv6 = normalizeIpv6Host(alloc.ipv6Address);
        if (
          currentIpv6 &&
          isValidIpv6(currentIpv6) &&
          formatIpv6(parseIpv6(currentIpv6)) !== ipv6Address
        ) {
          const oldIpv6 = formatIpv6(parseIpv6(currentIpv6));
          delete existingMappings[oldIpv6];
          if (alloc.owners) {
            for (const ownerKey of Object.keys(alloc.owners)) {
              const idx = ownerKey.lastIndexOf(':');
              const ipPart = idx >= 0 ? ownerKey.slice(0, idx) : ownerKey;
              if (isValidIpv6(ipPart) && formatIpv6(parseIpv6(ipPart)) === oldIpv6)
                delete alloc.owners[ownerKey];
            }
          }
        }

        if (parsedPorts.size > 0) {
          const ports = Array.from(parsedPorts).sort((a, b) => a - b);
          existingMappings[ipv6Address] = ports;
          (alloc as Record<string, unknown>).ipv6Ports = ports;
        } else if (existingMappings[ipv6Address]) {
          delete existingMappings[ipv6Address];
          delete (alloc as Record<string, unknown>).ipv6Ports;
        }

        alloc.ipv6Address = ipv6Address;
        alloc.mappings = existingMappings;
        cfg.allocations = alloc;
      }

      try {
        const svc = await serviceFor(id);
        await svc.syncServer(id, {});
      } catch {
        // continue
      }

      await cfgRepo().save(cfg);
      return {
        success: true,
        environment: cfg.environment,
        processConfig: cfg.processConfig,
        startup: cfg.startup,
      };
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('servers:write')],
      response: {
         200: t.Object({ success: t.Boolean(), environment: t.Any(), processConfig: t.Any(), startup: t.Optional(t.String()) }),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Update startup configuration', tags: ['Servers'] },
    }
  );

  app.get(
    prefix + '/servers/v1/:id/paper/versions',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const query = (ctx.query ?? {}) as Record<string, string>;
      const requestedVersion = query.version;

      const cfg = await cfgRepo().findOneBy({ uuid: id });
      if (!cfg) {
        ctx.set.status = 404;
        return { error: ctx.t('server.notFound') };
      }

      const currentVersion = cfg.environment?.MINECRAFT_VERSION ?? '';
      const currentBuild = cfg.environment?.BUILD_NUMBER ?? '';

      if (requestedVersion) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
          const res = await fetch(
            `https://api.papermc.io/v2/projects/paper/versions/${encodeURIComponent(requestedVersion)}/builds`,
            { signal: controller.signal }
          );
          if (!res.ok) {
            ctx.set.status = 502;
            return { error: ctx.t('server.failed_to_fetch_paper_builds') };
          }
          const data = await res.json();
          const raw = Array.isArray(data) ? data : (Array.isArray(data.builds) ? data.builds : []);
          return {
            version: requestedVersion,
            builds: raw,
            currentVersion,
            currentBuild,
          };
        } catch {
          ctx.set.status = 502;
          return { error: ctx.t('server.failed_to_fetch_paper_builds') };
        } finally {
          clearTimeout(timeout);
        }
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const res = await fetch('https://api.papermc.io/v2/projects/paper', {
          signal: controller.signal,
        });
        if (!res.ok) {
          ctx.set.status = 502;
          return { error: ctx.t('server.failed_to_fetch_paper_versions') };
        }
        const data = (await res.json()) as Record<string, unknown>;
        return {
          versions: data.versions ?? [],
          currentVersion,
          currentBuild,
        };
      } catch {
        ctx.set.status = 502;
        return { error: ctx.t('server.failed_to_fetch_paper_versions') };
      } finally {
        clearTimeout(timeout);
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('servers:read')],
      response: {
        200: t.Any(),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
        502: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Get Paper versions and builds', tags: ['Servers'] },
    }
  );

  app.post(
    prefix + '/servers/v1/:id/paper/apply',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const { version, build } = ctx.body as Record<string, unknown>;

      if (!version) {
        ctx.set.status = 400;
        return { error: ctx.t('server.version_is_required') };
      }

      const cfg = await cfgRepo().findOneBy({ uuid: id });
      if (!cfg) {
        ctx.set.status = 404;
        return { error: ctx.t('server.notFound') };
      }

      const env = { ...(cfg.environment ?? {}) };
      const isLatest = String(version) === 'latest';

      if (isLatest) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
        try {
          const projRes = await fetch('https://api.papermc.io/v2/projects/paper', {
            signal: controller.signal,
          });
          if (!projRes.ok) throw new Error('project fetch failed');
          const projData = (await projRes.json()) as Record<string, unknown>;
          const versionList = (projData.versions as string[]) ?? [];
          if (versionList.length === 0) throw new Error('no versions');
          const latestVer = versionList[versionList.length - 1];

          const buildsRes = await fetch(
            `https://api.papermc.io/v2/projects/paper/versions/${encodeURIComponent(latestVer)}/builds`,
            { signal: controller.signal }
          );
          if (!buildsRes.ok) throw new Error('builds fetch failed');
          const buildsBody = await buildsRes.json();
          const rawBuilds: unknown[] = Array.isArray(buildsBody) ? buildsBody : (Array.isArray((buildsBody as Record<string, unknown>).builds) ? (buildsBody as Record<string, unknown>).builds as unknown[] : []);
          if (rawBuilds.length === 0) throw new Error('no builds');

          const lastBuild = rawBuilds[rawBuilds.length - 1] as Record<string, unknown>;
          const buildNum = lastBuild?.build;
          if (buildNum === undefined || buildNum === null) throw new Error('missing build number');

          const buildNumStr = String(buildNum);
          const dl = (lastBuild.downloads as Record<string, unknown>) ?? {};
          const appDl = (dl.application as Record<string, unknown>) ?? (dl['server:default'] as Record<string, unknown>) ?? {};
          const jarName = (appDl.name as string) ?? `paper-${latestVer}-${buildNumStr}.jar`;

          env.MINECRAFT_VERSION = latestVer;
          env.BUILD_NUMBER = buildNumStr;
          env.SERVER_JARFILE = jarName;
          env.DL_PATH = `https://api.papermc.io/v2/projects/paper/versions/${latestVer}/builds/${buildNumStr}/downloads/${jarName}`;
        } catch (e) {
          ctx.set.status = 502;
          return { error: e instanceof Error ? e.message : 'Failed to resolve latest Paper version' };
        } finally {
          clearTimeout(timeout);
        }
      } else {
        if (build === undefined || build === null) {
          ctx.set.status = 400;
          return { error: ctx.t('server.build_is_required_for_specific_versions') };
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        let jarName: string;
        try {
          const res = await fetch(
            `https://api.papermc.io/v2/projects/paper/versions/${encodeURIComponent(String(version))}/builds/${encodeURIComponent(String(build))}`,
            { signal: controller.signal }
          );
          if (!res.ok) {
            ctx.set.status = 400;
            return { error: ctx.t('server.invalid_version_or_build_number') };
          }
          const buildData = (await res.json()) as Record<string, unknown>;
          const downloads = (buildData.downloads as Record<string, unknown>) ?? {};
          const appDownload = (downloads.application as Record<string, unknown>) ?? {};
          jarName = (appDownload.name as string) ?? `paper-${version}-${build}.jar`;
        } catch {
          ctx.set.status = 502;
          return { error: ctx.t('server.failed_to_validate_paper_build') };
        } finally {
          clearTimeout(timeout);
        }

        env.MINECRAFT_VERSION = String(version);
        env.BUILD_NUMBER = String(build);
        env.SERVER_JARFILE = jarName;
        env.DL_PATH = `https://api.papermc.io/v2/projects/paper/versions/${version}/builds/${build}/downloads/${jarName}`;
      }

      cfg.environment = env;

      try {
        const svc = await serviceFor(id);
        await svc.syncServer(id, {});
      } catch {
        // buh!
      }

      await cfgRepo().save(cfg);

      return {
        success: true,
        environment: cfg.environment,
      };
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('servers:write')],
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
        502: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Apply Paper version build', tags: ['Servers'] },
    }
  );

  app.get(
    prefix + '/servers/v1/:id/versions/vanilla',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const cfg = await cfgRepo().findOneBy({ uuid: id });
      if (!cfg) {
        ctx.set.status = 404;
        return { error: ctx.t('server.notFound') };
      }
      const currentVersion = cfg.environment?.MINECRAFT_VERSION ?? '';

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const res = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest.json', {
          signal: controller.signal,
        });
        if (!res.ok) {
          ctx.set.status = 502;
          return { error: ctx.t('server.failed_to_fetch_vanilla_versions') };
        }
        const data = (await res.json()) as Record<string, unknown>;
        return {
          versions: data.versions ?? [],
          currentVersion,
        };
      } catch {
        ctx.set.status = 502;
        return { error: ctx.t('server.failed_to_fetch_vanilla_versions') };
      } finally {
        clearTimeout(timeout);
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('servers:read')],
      response: {
        200: t.Any(),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
        502: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Get Vanilla versions', tags: ['Servers'] },
    }
  );

  app.post(
    prefix + '/servers/v1/:id/versions/vanilla/apply',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const { version } = ctx.body as Record<string, unknown>;

      if (!version) {
        ctx.set.status = 400;
        return { error: ctx.t('server.version_is_required') };
      }

      const cfg = await cfgRepo().findOneBy({ uuid: id });
      if (!cfg) {
        ctx.set.status = 404;
        return { error: ctx.t('server.notFound') };
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        let targetVersion = String(version);

        const manifestRes = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest.json', {
          signal: controller.signal,
        });
        if (!manifestRes.ok) throw new Error('Failed to fetch version manifest');
        const manifest = (await manifestRes.json()) as Record<string, unknown>;

        if (targetVersion === 'latest') {
          const latest = (manifest.latest as Record<string, unknown>) ?? {};
          targetVersion = (latest.release as string) || '';
          if (!targetVersion) throw new Error('Failed to resolve latest version');
        }

        const versions = (manifest.versions as Array<Record<string, unknown>>) ?? [];
        const versionEntry = versions.find(v => v.id === targetVersion);
        if (!versionEntry || !versionEntry.url) {
          ctx.set.status = 400;
          return { error: ctx.t('server.invalid_minecraft_version') };
        }

        const versionRes = await fetch(versionEntry.url as string, { signal: controller.signal });
        if (!versionRes.ok) throw new Error('Failed to fetch version details');
        const versionData = (await versionRes.json()) as Record<string, unknown>;
        const downloads = (versionData.downloads as Record<string, unknown>) ?? {};
        const serverDl = (downloads.server as Record<string, unknown>) ?? {};
        const dlUrl = serverDl.url as string;
        if (!dlUrl) {
          ctx.set.status = 502;
          return { error: ctx.t('server.no_server_download_available_for_this_version') };
        }

        const env = { ...(cfg.environment ?? {}) };
        env.MINECRAFT_VERSION = targetVersion;
        env.SERVER_JARFILE = 'server.jar';
        env.DL_PATH = dlUrl;
        delete env.BUILD_NUMBER;
        delete env.FORGE_VERSION;
        cfg.environment = env;

        const svc = await serviceFor(id);
        await svc.syncServer(id, {});

        await cfgRepo().save(cfg);
        return { success: true, environment: cfg.environment };
      } catch (e) {
        ctx.set.status = 502;
        return { error: e instanceof Error ? e.message : 'Failed to apply Vanilla version' };
      } finally {
        clearTimeout(timeout);
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('servers:write')],
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
        502: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Apply Vanilla version', tags: ['Servers'] },
    }
  );

  app.get(
    prefix + '/servers/v1/:id/mounts',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const mountRepo = AppDataSource.getRepository(Mount);
      const smRepo = AppDataSource.getRepository(ServerMount);
      const links = await smRepo.findBy({ serverUuid: id });
      if (links.length === 0) return [];
      const mountIds = links.map(l => l.mountId);
      const mounts = await mountRepo.findBy({ id: In(mountIds) });
      return mounts;
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('servers:read')],
      response: {
        200: t.Array(t.Any()),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
      },
      detail: { summary: 'List server mounts', tags: ['Servers'] },
    }
  );

  app.get(
    prefix + '/servers/v1/:id/websocket',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const user = ctx.user;

      const cfgRepo = AppDataSource.getRepository(ServerConfig);
      const cfg = await cfgRepo.findOneBy({ uuid: id });
      if (!cfg) {
        ctx.set.status = 404;
        return { error: ctx.t('server.notFound') };
      }

      if (cfg.suspended || cfg.dmca) {
        ctx.set.status = 403;
        return { error: buildSuspendedServerMessage(cfg) };
      }

      const node = await nodeRepo().findOneBy({ id: cfg.nodeId });
      if (!node) {
        ctx.set.status = 500;
        return { error: ctx.t('system.targetNodeFailed') };
      }

      const normalizeUuid = (value: unknown) => {
        if (!value) return crypto.randomUUID().replace(/-/g, '');
        const s = String(value).toLowerCase().replace(/-/g, '');
        if (/^[0-9a-f]{32}$/.test(s)) return s;
        return crypto.randomUUID().replace(/-/g, '');
      };

      const now = Math.floor(Date.now() / 1000);
      const userWithUuid = user as { uuid?: string; id: number };
      const safeUserUuid = normalizeUuid(userWithUuid.uuid || user.id || crypto.randomUUID());
      const safeServerUuid = normalizeUuid(id);
      const jti = normalizeUuid(crypto.randomUUID());

      console.debug('wings jwt payload lengths', {
        user_uuid: safeUserUuid.length,
        server_uuid: safeServerUuid.length,
        jti: jti.length,
        sub_source: {
          uuid: String(userWithUuid.uuid || ''),
          id: user.id != null ? String(user.id) : undefined,
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
        scope: 'websocket',
        use_console_read_permission: false,
      };

      const token = signWingsJwt(payload, node.token);

      if (process.env.DEBUG_WINGS_JWT === '1') {
        try {
          const parts = token.split('.');
          if (parts.length === 3) {
            const payloadJson = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8')) as Record<string, unknown>;
            ctx.log?.debug?.(
              {
                payload: {
                  sub: payloadJson.sub as string,
                  user_uuid: payloadJson.user_uuid as string,
                  server_uuid: payloadJson.server_uuid as string,
                  jti: payloadJson.jti as string,
                },
              },
              'wings jwt payload decoded from token'
            );
          }
        } catch {
          // skip
        }
      }

      const incomingProto = (ctx.headers['x-forwarded-proto'] as string) || ctx.protocol || 'https';
      const forwardedHost =
        (ctx.headers['x-forwarded-host'] as string) ||
        (ctx.headers['host'] as string) ||
        ctx.hostname;
      const hostSafe =
        forwardedHost &&
        forwardedHost !== 'undefined' &&
        typeof forwardedHost === 'string' &&
        /^[a-zA-Z0-9.:\-[\]]+$/.test(forwardedHost.split(':')[0])
          ? forwardedHost
          : 'localhost';
      const backendBase = (process.env.BACKEND_URL || `${incomingProto}://${hostSafe}`).replace(
        /\/+$/,
        ''
      );
      const socketScheme =
        backendBase.startsWith('https') || incomingProto === 'https' ? 'wss' : 'ws';

      const cookieName = process.env.JWT_COOKIE_NAME || 'token';
      const getCookieToken = () => {
        const cookieValue = (ctx.cookie &&
          ctx.cookie[cookieName] &&
          ctx.cookie[cookieName].value) as string | undefined;
        if (cookieValue) return cookieValue;
        const raw = (ctx.headers && (ctx.headers.cookie as string)) || '';
        const parts = String(raw)
          .split(';')
          .map((s: string) => s.trim());
        const pair = parts.find(p => p.startsWith(cookieName + '='));
        if (pair) return pair.split('=')[1];
        return '';
      };

      const panelJwt =
        getCookieToken() ||
        ((ctx.headers['authorization'] as string) || '').replace(/^Bearer\s+/i, '');
      const wsUrl =
        backendBase.replace(/^https?/, socketScheme) +
        `/api/servers/v1/${id}/ws/proxy?token=${encodeURIComponent(panelJwt)}`;

      const nodeUrl = String((node as any).backendWingsUrl || node.url).replace(/\/+$/, '');
      const nodeProtocol = node.useSSL === false ? 'ws:' : 'wss:';

      let directSocket: string;
      const fqdn = (node as any).fqdn;
      if (fqdn) {
        try {
          const u = new URL(nodeUrl);
          u.protocol = nodeProtocol;
          u.hostname = fqdn;
          directSocket = u.toString().replace(/\/+$/, '') + `/api/servers/${id}/ws`;
        } catch {
          directSocket = nodeProtocol + '//' + fqdn + `/api/servers/${id}/ws`;
        }
      } else {
        directSocket = nodeUrl.replace(/^https?:/, nodeProtocol) + `/api/servers/${id}/ws`;
      }

      return {
        data: {
          token,
          socket: wsUrl,
          direct_socket: directSocket,
          direct: true,
        },
      };
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('servers:console')],
      response: {
        200: t.Object({ data: t.Object({ token: t.String(), socket: t.String(), direct_socket: t.String(), direct: t.Boolean() }) }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
        500: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Websocket auth token', tags: ['Servers'] },
    }
  );

  app.get(
    prefix + '/servers/v1/:id/logs/install',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const cfg = await cfgRepo().findOneBy({ uuid: id });
      if (!cfg) { ctx.set.status = 404; return { error: ctx.t('server.notFound') }; }
      if (cfg.suspended || cfg.dmca) { ctx.set.status = 403; return { error: buildSuspendedServerMessage(cfg) }; }

      const node = await nodeRepo().findOneBy({ id: cfg.nodeId });
      if (!node) { ctx.set.status = 500; return { error: ctx.t('node.notFound') }; }

      const svc = new WingsApiService(node.backendWingsUrl || node.url, node.token);
      try {
        const res = await svc.getInstallLogs(id);
        return res.data;
      } catch {
        ctx.set.status = 404;
        return { error: ctx.t('server.install_log_not_found_or_install_not_running') };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('servers:console')],
      detail: { summary: 'Get install logs', tags: ['Servers'] },
    }
  );

  app.get(
    prefix + '/servers/v1/:id/sftp',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const user = ctx.user;

      const cfg = await cfgRepo().findOneBy({ uuid: id });
      if (!cfg) {
        ctx.set.status = 404;
        return { error: ctx.t('server.notFound') };
      }

      if (cfg.suspended || cfg.dmca) {
        ctx.set.status = 403;
        return { error: buildSuspendedServerMessage(cfg) };
      }

      const node = await nodeRepo().findOneBy({ id: cfg.nodeId });
      if (!node) {
        ctx.set.status = 500;
        return { error: ctx.t('node.notFound') };
      }

      const urlObj = (() => {
        try {
          return new URL(node.url);
        } catch {
          return null;
        }
      })();
      const nodeHost = urlObj?.hostname || node.url;

      const backendBase = (process.env.BACKEND_URL || '').replace(/\/+$/, '');
      const backendHost = backendBase
        ? (() => {
            try {
              return new URL(backendBase).hostname;
            } catch {
              return backendBase;
            }
          })()
        : null;

      const host = node.sftpProxyPort && backendHost ? backendHost : nodeHost;
      const port = node.sftpProxyPort || node.sftpPort || 2022;

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
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('servers:read')],
      response: {
        200: t.Object({
          host: t.String(),
          port: t.Number(),
          username: t.String(),
          proxied: t.Boolean(),
        }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
        500: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Get SFTP connection info', tags: ['Servers'] },
    }
  );

  // ─── v2 Proxmox-specific routes ──────────────────────────────────────────────

  app.get(
    prefix + '/servers/v2/:id',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      try {
        const svc = await serviceFor(id);
        const res = await svc.getServer(id);
        return res.data;
      } catch (e: unknown) {
        ctx.set.status = 500;
        return { error: ctx.t('server.failed_to_get_server_info') };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('proxmox')],
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        500: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Get Proxmox server info', tags: ['Servers'] },
    }
  );

  app.post(
    prefix + '/servers/v2/:id/power',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const { action } = ctx.body as Record<string, unknown>;
      try {
        const svc = await serviceFor(id);
        const res = await svc.powerServer(id, action as 'start' | 'stop' | 'restart' | 'shutdown' | 'kill');
        return res.data && typeof res.data === 'object' ? res.data : { success: true };
      } catch (e: unknown) {
        ctx.set.status = 502;
        return { error: ctx.t('server.power_action_failed') };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('proxmox')],
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        502: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Perform power action on Proxmox server', tags: ['Servers'] },
    }
  );

  app.get(
    prefix + '/servers/v2/:id/stats',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      try {
        const svc = await serviceFor(id);
        const stats = await svc.getStats(id);
        return stats;
      } catch {
        return {
          memory: { used: 0, total: 0 },
          cpu: { used: 0, total: 0 },
          disk: { used: 0, total: 0 },
          network: { rx: 0, tx: 0 },
        };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('proxmox')],
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Get Proxmox server stats', tags: ['Servers'] },
    }
  );

  app.get(
    prefix + '/servers/v2/:id/configuration',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      try {
        const svc = await serviceFor(id);
        const res = await svc.getServer(id);
        return res.data;
      } catch {
        ctx.set.status = 500;
        return { error: ctx.t('server.failed_to_get_configuration') };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('proxmox')],
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        500: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Get Proxmox server configuration', tags: ['Servers'] },
    }
  );

  function isMcUser(v: string) {
    return /^[a-zA-Z0-9_]{1,16}$/.test(v);
  }

  async function mcExecCmd(svc: WingsApiService, id: string, cmd: string) {
    try {
      await svc.executeServerCommand(id, cmd);
      return true;
    } catch {
      return false;
    }
  }

  async function mcReadJson(svc: WingsApiService, id: string, path: string) {
    try {
      const res = await svc.readFile(id, path);
      const raw = res.data ?? res ?? '';
      return JSON.parse(typeof raw === 'string' ? raw : String(raw));
    } catch { return null; }
  }

  async function mcWriteJson(svc: WingsApiService, id: string, path: string, data: any) {
    await svc.writeFile(id, path, JSON.stringify(data, null, 2));
  }

  function mcNames(data: any): { name: string; uuid?: string }[] {
    if (!Array.isArray(data)) return [];
    return data.map((e: any) => ({ name: String(e.name || ''), uuid: e.uuid ? String(e.uuid) : undefined })).filter(p => p.name);
  }

  async function mcExec(id: string, cmd: string, ctx: AuthenticatedHandlerContext) {
    const svc = await serviceFor(id);
    if (svc instanceof ProxmoxApiService) {
      ctx.set.status = 400;
      return { error: ctx.t('server.player_management_not_supported_for_proxmox_nodes') };
    }
    if (!(await mcExecCmd(svc as WingsApiService, id, cmd))) {
      ctx.set.status = 400;
      return { error: ctx.t('server.server_must_be_online_for_console_commands') };
    }
    return { success: true, method: 'console' };
  }

  async function mcPingServer(ip: string, port: number): Promise<{ players: { name: string; uuid?: string }[]; online: number; max: number }> {
    const { createConnection } = await import('net');
    return new Promise((resolve, reject) => {
      const socket = createConnection(port, ip, () => {
        const wv = (v: number) => { const b: number[] = []; do { let t = v & 127; v >>>= 7; if (v) t |= 128; b.push(t); } while (v); return Buffer.from(b); };

        const hostB = Buffer.from(ip, 'utf8');
        const pBE = Buffer.alloc(2); pBE.writeUInt16BE(port, 0);
        const handshake = Buffer.concat([wv(0), wv(767), wv(hostB.length), hostB, pBE, wv(1)]);
        socket.write(Buffer.concat([wv(handshake.length), handshake]));
        socket.write(Buffer.concat([wv(1), wv(0)]));
      });

      const to = setTimeout(() => { socket.destroy(); reject(new Error('timeout')); }, 5000);
      socket.setTimeout(5000);
      socket.on('error', (e) => { clearTimeout(to); reject(e); });
      socket.on('timeout', () => { clearTimeout(to); reject(new Error('timeout')); });

      let buf = Buffer.alloc(0);
      socket.on('data', (data: Buffer) => {
        buf = Buffer.concat([buf, data]);
        try {
          const rv = (off: number) => { let v = 0, b = 0; while (true) { const byte = buf[off + b]; v |= (byte & 127) << (b * 7); b++; if (!(byte & 128)) break; } return { v, b }; };
          let off = rv(0).b;
          off += rv(off).b;
          const sl = rv(off); off += sl.b;
          const json = buf.subarray(off, off + sl.v).toString('utf8');
          clearTimeout(to); socket.destroy();
          const d = JSON.parse(json);
          const sample = d?.players?.sample;
          const players = Array.isArray(sample)
            ? sample.map((p: any) => ({ name: String(p.name || ''), uuid: p.id ? String(p.id) : undefined })).filter(p => p.name)
            : [];
          resolve({ players, online: d?.players?.online ?? 0, max: d?.players?.max ?? 0 });
        } catch { /* creeper */ }
      });
    });
  }

  async function mcListFromLog(svc: WingsApiService, id: string): Promise<{ players: { name: string; uuid?: string }[]; online: number; max: number }> {
    const fileLines = async () => {
      const res = await svc.readFile(id, 'logs/latest.log');
      const text = typeof res.data === 'string' ? res.data : String(res.data ?? '');
      return text.split('\n');
    };

    let existingLines: string[];
    try { existingLines = await fileLines(); } catch { existingLines = []; }
    const beforeLen = existingLines.length;

    await svc.executeServerCommand(id, 'list');

    let fullLines: string[] = [];
    for (const delay of [600, 900, 1200]) {
      await new Promise(r => setTimeout(r, delay));
      try {
        const lines = await fileLines();
        const newCount = lines.length - beforeLen;
        if (newCount > 0) {
          fullLines = lines;
          break;
        }
      } catch {}
    }
    if (!fullLines.length) fullLines = existingLines;

    const newLines = fullLines.slice(Math.max(0, beforeLen - 1));
    const listLine = newLines.find(l => l.includes('of a max of') && l.includes('players online'))
      || fullLines.slice(-20).reverse().find(l => l.includes('of a max of') && l.includes('players online'));

    if (!listLine) throw new Error('Could not find /list output in server log');

    const m = listLine.match(/There are (\d+) of a max of (\d+) players online:?\s*(.*)/);
    if (!m) throw new Error('Could not parse /list output');

    const online = parseInt(m[1], 10);
    const mx = parseInt(m[2], 10);
    const playerStr = m[3].trim();
    const names = playerStr ? playerStr.split(/,\s*/).filter(Boolean) : [];
    return { players: names.map(n => ({ name: n })), online, max: mx };
  }

  app.get(
    prefix + '/servers/:id/players',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const svc = await serviceFor(id);
      if (svc instanceof ProxmoxApiService) { ctx.set.status = 400; return { error: ctx.t('server.not_supported_for_proxmox_nodes') }; }
      const wings = svc as WingsApiService;

      const cfg = await cfgRepo().findOneBy({ uuid: id });
      if (!cfg) { ctx.set.status = 404; return { error: ctx.t('server.notFound') }; }

      let isRunning = false;
      try {
        const info = await wings.getServer(id);
        const body = info?.data;
        const rawStatus = body?.status ?? body?.state ?? body?.attributes?.status ?? body?.server_state ?? '';
        isRunning = ['running', 'online', 'up', 'active'].includes(String(rawStatus).toLowerCase().trim());
      } catch {}

      if (!isRunning) return { players: [], online: 0, max: 0, reachable: false, reason: 'Server is not running' };

      const alloc = (cfg.allocations || {}) as Record<string, any>;
      const ip = alloc.default?.ip;
      const port = alloc.default?.port;

      if (ip && port) {
        try {
          return await mcPingServer(ip, Number(port));
        } catch {
          // mcdonalds
        }
      }

      try {
        return await mcListFromLog(wings, id);
      } catch {
        return { players: [], online: 0, max: 0, reachable: false, reason: 'Could not reach server port or read server log' };
      }
    },
    {
      beforeHandle: [authenticate, authorize('servers:read')],
      response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
      detail: { summary: 'List online Minecraft players via server ping', tags: ['Servers', 'Minecraft'] },
    }
  );

  app.get(
    prefix + '/servers/:id/players/whitelist',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const svc = await serviceFor(id);
      if (svc instanceof ProxmoxApiService) { ctx.set.status = 400; return { error: ctx.t('server.not_supported_for_proxmox_nodes') }; }
      const data = await mcReadJson(svc as WingsApiService, id, 'whitelist.json');
      return { players: mcNames(data) };
    },
    {
      beforeHandle: [authenticate, authorize('servers:read')],
      response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
      detail: { summary: 'List whitelisted players', tags: ['Servers', 'Minecraft'] },
    }
  );

  app.get(
    prefix + '/servers/:id/players/whitelist/status',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const svc = await serviceFor(id);
      if (svc instanceof ProxmoxApiService) { ctx.set.status = 400; return { error: ctx.t('server.not_supported_for_proxmox_nodes') }; }
      try {
        const res = await (svc as WingsApiService).readFile(id, 'server.properties');
        const text = typeof res.data === 'string' ? res.data : String(res.data ?? '');
        const lines = text.split('\n');
        for (const line of lines) {
          const m = line.trim().match(/^white-list\s*=\s*(true|false)\s*$/i);
          if (m) return { enabled: m[1].toLowerCase() === 'true' };
        }
      } catch {}
      return { enabled: false };
    },
    {
      beforeHandle: [authenticate, authorize('servers:read')],
      response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
      detail: { summary: 'Check if whitelist is enabled', tags: ['Servers', 'Minecraft'] },
    }
  );

  app.post(
    prefix + '/servers/:id/players/whitelist/toggle',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const { enabled } = ctx.body as Record<string, boolean>;
      const svc = await serviceFor(id);
      if (svc instanceof ProxmoxApiService) { ctx.set.status = 400; return { error: ctx.t('server.not_supported_for_proxmox_nodes') }; }
      return mcExec(id, enabled ? 'whitelist on' : 'whitelist off', ctx);
    },
    {
      beforeHandle: [authenticate, authorize('servers:console')],
      response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
      detail: { summary: 'Toggle whitelist on/off', tags: ['Servers', 'Minecraft'] },
    }
  );

  app.get(
    prefix + '/servers/:id/players/bans',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const svc = await serviceFor(id);
      if (svc instanceof ProxmoxApiService) { ctx.set.status = 400; return { error: ctx.t('server.not_supported_for_proxmox_nodes') }; }
      const data = await mcReadJson(svc as WingsApiService, id, 'banned-players.json');
      return { players: mcNames(data) };
    },
    {
      beforeHandle: [authenticate, authorize('servers:read')],
      response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
      detail: { summary: 'List banned players', tags: ['Servers', 'Minecraft'] },
    }
  );

  app.post(
    prefix + '/servers/:id/players/whitelist',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const { player } = ctx.body as Record<string, string>;
      if (!player || !isMcUser(player)) { ctx.set.status = 400; return { error: ctx.t('server.invalid_minecraft_username') }; }
      const svc = await serviceFor(id);
      if (svc instanceof ProxmoxApiService) { ctx.set.status = 400; return { error: ctx.t('server.not_supported_for_proxmox_nodes') }; }
      const ws = svc as WingsApiService;

      if (await mcExecCmd(ws, id, `whitelist add ${player}`)) {
        try { let d = await mcReadJson(ws, id, 'whitelist.json'); if (!Array.isArray(d)) d = []; if (!d.some((e: any) => e.name === player)) d.push({ name: player, uuid: '' }); await mcWriteJson(ws, id, 'whitelist.json', d); } catch {}
        return { success: true, method: 'console' };
      }
      let data = await mcReadJson(ws, id, 'whitelist.json');
      if (!Array.isArray(data)) data = [];
      if (!data.some((e: any) => e.name === player)) data.push({ name: player, uuid: '' });
      await mcWriteJson(ws, id, 'whitelist.json', data);
      return { success: true, method: 'file' };
    },
    {
      beforeHandle: [authenticate, authorize('servers:console')],
      response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
      detail: { summary: 'Add player to whitelist', tags: ['Servers', 'Minecraft'] },
    }
  );

  app.delete(
    prefix + '/servers/:id/players/whitelist/:player',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id, player } = (ctx.params ?? {}) as Record<string, string>;
      if (!player || !isMcUser(player)) { ctx.set.status = 400; return { error: ctx.t('server.invalid_minecraft_username') }; }
      const svc = await serviceFor(id);
      if (svc instanceof ProxmoxApiService) { ctx.set.status = 400; return { error: ctx.t('server.not_supported_for_proxmox_nodes') }; }
      const ws = svc as WingsApiService;

      if (await mcExecCmd(ws, id, `whitelist remove ${player}`)) {
        try { let d = await mcReadJson(ws, id, 'whitelist.json'); if (Array.isArray(d)) { d = d.filter((e: any) => e.name !== player); await mcWriteJson(ws, id, 'whitelist.json', d); } } catch {}
        return { success: true, method: 'console' };
      }
      let data = await mcReadJson(ws, id, 'whitelist.json');
      if (!Array.isArray(data)) data = [];
      data = data.filter((e: any) => e.name !== player);
      await mcWriteJson(ws, id, 'whitelist.json', data);
      return { success: true, method: 'file' };
    },
    {
      beforeHandle: [authenticate, authorize('servers:console')],
      response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
      detail: { summary: 'Remove player from whitelist', tags: ['Servers', 'Minecraft'] },
    }
  );

  app.post(
    prefix + '/servers/:id/players/ban',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const { player, reason } = ctx.body as Record<string, string>;
      if (!player || !isMcUser(player)) { ctx.set.status = 400; return { error: ctx.t('server.invalid_minecraft_username') }; }
      const svc = await serviceFor(id);
      if (svc instanceof ProxmoxApiService) { ctx.set.status = 400; return { error: ctx.t('server.not_supported_for_proxmox_nodes') }; }
      const ws = svc as WingsApiService;

      if (await mcExecCmd(ws, id, reason ? `ban ${player} ${reason}` : `ban ${player}`)) {
        try { let d = await mcReadJson(ws, id, 'banned-players.json'); if (!Array.isArray(d)) d = []; if (!d.some((e: any) => e.name === player)) d.push({ name: player, uuid: '', reason: reason || 'Banned by panel', created: new Date().toISOString(), source: 'Panel', expires: 'forever' }); await mcWriteJson(ws, id, 'banned-players.json', d); } catch {}
        return { success: true, method: 'console' };
      }
      let data = await mcReadJson(ws, id, 'banned-players.json');
      if (!Array.isArray(data)) data = [];
      if (!data.some((e: any) => e.name === player)) {
        data.push({ name: player, uuid: '', reason: reason || 'Banned by panel', created: new Date().toISOString(), source: 'Panel', expires: 'forever' });
      }
      await mcWriteJson(ws, id, 'banned-players.json', data);
      return { success: true, method: 'file' };
    },
    {
      beforeHandle: [authenticate, authorize('servers:console')],
      response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
      detail: { summary: 'Ban a player', tags: ['Servers', 'Minecraft'] },
    }
  );

  app.post(
    prefix + '/servers/:id/players/pardon',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const { player } = ctx.body as Record<string, string>;
      if (!player || !isMcUser(player)) { ctx.set.status = 400; return { error: ctx.t('server.invalid_minecraft_username') }; }
      const svc = await serviceFor(id);
      if (svc instanceof ProxmoxApiService) { ctx.set.status = 400; return { error: ctx.t('server.not_supported_for_proxmox_nodes') }; }
      const ws = svc as WingsApiService;

      if (await mcExecCmd(ws, id, `pardon ${player}`)) {
        try { let d = await mcReadJson(ws, id, 'banned-players.json'); if (Array.isArray(d)) { d = d.filter((e: any) => e.name !== player); await mcWriteJson(ws, id, 'banned-players.json', d); } } catch {}
        return { success: true, method: 'console' };
      }
      let data = await mcReadJson(ws, id, 'banned-players.json');
      if (!Array.isArray(data)) data = [];
      data = data.filter((e: any) => e.name !== player);
      await mcWriteJson(ws, id, 'banned-players.json', data);
      return { success: true, method: 'file' };
    },
    {
      beforeHandle: [authenticate, authorize('servers:console')],
      response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
      detail: { summary: 'Pardon/unban a player', tags: ['Servers', 'Minecraft'] },
    }
  );

  app.post(
    prefix + '/servers/:id/players/kick',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const { player, reason } = ctx.body as Record<string, string>;
      if (!player || !isMcUser(player)) { ctx.set.status = 400; return { error: ctx.t('server.invalid_minecraft_username') }; }
      const svc = await serviceFor(id);
      if (svc instanceof ProxmoxApiService) { ctx.set.status = 400; return { error: ctx.t('server.not_supported_for_proxmox_nodes') }; }
      return mcExec(id, reason ? `kick ${player} ${reason}` : `kick ${player}`, ctx);
    },
    {
      beforeHandle: [authenticate, authorize('servers:console')],
      response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
      detail: { summary: 'Kick a player', tags: ['Servers', 'Minecraft'] },
    }
  );

  app.get(
    prefix + '/servers/:id/players/ops',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const svc = await serviceFor(id);
      if (svc instanceof ProxmoxApiService) { ctx.set.status = 400; return { error: ctx.t('server.not_supported_for_proxmox_nodes') }; }
      const data = await mcReadJson(svc as WingsApiService, id, 'ops.json');
      return { players: mcNames(data) };
    },
    {
      beforeHandle: [authenticate, authorize('servers:read')],
      response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
      detail: { summary: 'List opped players', tags: ['Servers', 'Minecraft'] },
    }
  );

  app.post(
    prefix + '/servers/:id/players/op',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const { player } = ctx.body as Record<string, string>;
      if (!player || !isMcUser(player)) { ctx.set.status = 400; return { error: ctx.t('server.invalid_minecraft_username') }; }
      const svc = await serviceFor(id);
      if (svc instanceof ProxmoxApiService) { ctx.set.status = 400; return { error: ctx.t('server.not_supported_for_proxmox_nodes') }; }
      const ws = svc as WingsApiService;

      if (await mcExecCmd(ws, id, `op ${player}`)) {
        try { let d = await mcReadJson(ws, id, 'ops.json'); if (!Array.isArray(d)) d = []; if (!d.some((e: any) => e.name === player)) d.push({ name: player, uuid: '', level: 4, bypassesPlayerLimit: false }); await mcWriteJson(ws, id, 'ops.json', d); } catch {}
        return { success: true, method: 'console' };
      }
      let data = await mcReadJson(ws, id, 'ops.json');
      if (!Array.isArray(data)) data = [];
      if (!data.some((e: any) => e.name === player)) {
        data.push({ name: player, uuid: '', level: 4, bypassesPlayerLimit: false });
      }
      await mcWriteJson(ws, id, 'ops.json', data);
      return { success: true, method: 'file' };
    },
    {
      beforeHandle: [authenticate, authorize('servers:console')],
      response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
      detail: { summary: 'Op a player', tags: ['Servers', 'Minecraft'] },
    }
  );

  app.post(
    prefix + '/servers/:id/players/deop',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const { player } = ctx.body as Record<string, string>;
      if (!player || !isMcUser(player)) { ctx.set.status = 400; return { error: ctx.t('server.invalid_minecraft_username') }; }
      const svc = await serviceFor(id);
      if (svc instanceof ProxmoxApiService) { ctx.set.status = 400; return { error: ctx.t('server.not_supported_for_proxmox_nodes') }; }
      const ws = svc as WingsApiService;

      if (await mcExecCmd(ws, id, `deop ${player}`)) {
        try { let d = await mcReadJson(ws, id, 'ops.json'); if (Array.isArray(d)) { d = d.filter((e: any) => e.name !== player); await mcWriteJson(ws, id, 'ops.json', d); } } catch {}
        return { success: true, method: 'console' };
      }
      let data = await mcReadJson(ws, id, 'ops.json');
      if (!Array.isArray(data)) data = [];
      data = data.filter((e: any) => e.name !== player);
      await mcWriteJson(ws, id, 'ops.json', data);
      return { success: true, method: 'file' };
    },
    {
      beforeHandle: [authenticate, authorize('servers:console')],
      response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
      detail: { summary: 'Deop a player', tags: ['Servers', 'Minecraft'] },
    }
  );

  app.get(
    prefix + '/servers/:id/players/settings',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const svc = await serviceFor(id);
      if (svc instanceof ProxmoxApiService) { ctx.set.status = 400; return { error: ctx.t('server.not_supported_for_proxmox_nodes') }; }
      const ws = svc as WingsApiService;
      try {
        const res = await ws.readFile(id, 'server.properties');
        const text = typeof res.data === 'string' ? res.data : String(res.data ?? '');
        const lines = text.split('\n');
        const entries: { key: string; value: string }[] = [];
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) continue;
          const eq = trimmed.indexOf('=');
          if (eq > 0) entries.push({ key: trimmed.slice(0, eq).trim(), value: trimmed.slice(eq + 1).trim() });
        }
        return { entries, raw: text };
      } catch (e: any) {
        ctx.set.status = 500;
        return { error: e?.message || 'Failed to read server.properties' };
      }
    },
    {
      beforeHandle: [authenticate, authorize('servers:read')],
      response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
      detail: { summary: 'Read Minecraft server.properties', tags: ['Servers', 'Minecraft'] },
    }
  );

  app.post(
    prefix + '/servers/:id/players/settings',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const { entries } = ctx.body as { entries: { key: string; value: string }[] };
      if (!Array.isArray(entries)) { ctx.set.status = 400; return { error: ctx.t('server.invalid_entries') }; }
      const svc = await serviceFor(id);
      if (svc instanceof ProxmoxApiService) { ctx.set.status = 400; return { error: ctx.t('server.not_supported_for_proxmox_nodes') }; }
      const ws = svc as WingsApiService;

      try {
        const res = await ws.readFile(id, 'server.properties');
        const text = typeof res.data === 'string' ? res.data : String(res.data ?? '');
        const lines = text.split('\n');
        const updated = new Set(entries.map(e => e.key));
        const out = lines.map(line => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) return line;
          const eq = trimmed.indexOf('=');
          if (eq > 0) {
            const k = trimmed.slice(0, eq).trim();
            if (updated.has(k)) {
              const v = entries.find(e => e.key === k)?.value ?? '';
              return `${k}=${v}`;
            }
          }
          return line;
        });
        const existingKeys = new Set(lines.map(l => { const t = l.trim(); const e = t.indexOf('='); return e > 0 && !t.startsWith('#') && !t.startsWith('!') ? t.slice(0, e).trim() : null; }).filter(Boolean));
        for (const e of entries) {
          if (!existingKeys.has(e.key)) out.push(`${e.key}=${e.value}`);
        }
        await ws.writeFile(id, 'server.properties', out.join('\n'));
        return { success: true };
      } catch (e: any) {
        ctx.set.status = 500;
        return { error: e?.message || 'Failed to write server.properties' };
      }
    },
    {
      beforeHandle: [authenticate, authorize('servers:console')],
      response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
      detail: { summary: 'Write Minecraft server.properties', tags: ['Servers', 'Minecraft'] },
    }
  );

  app.get(
    prefix + '/servers/:id/plugins',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const ws = await serviceFor(id) as WingsApiService;
      try {
        const [listRes, metaRes] = await Promise.all([
          ws.listServerFiles(id, 'plugins/'),
          ws.readFile(id, 'plugins/.plugins.json').catch(() => ({ data: null })),
        ]);
        const files = Array.isArray(listRes?.data) ? listRes.data : Array.isArray(listRes) ? listRes : [];

        let meta: Record<string, any> = {};
        try { meta = JSON.parse(typeof metaRes?.data === 'string' ? metaRes.data : String(metaRes?.data ?? '{}')); } catch { meta = {}; }

        const jars = files
          .filter((f: any) => f.name?.endsWith('.jar'))
          .map((f: any) => {
            const name = f.name?.replace(/\.jar$/, '');
            const entry = meta?.[name];
            return {
              name,
              filename: f.name,
              size: f.size ?? f.file_size ?? 0,
              lastModified: f.modified ?? f.last_modified ?? null,
              slug: entry?.slug ?? null,
              version: entry?.version ?? null,
              versionId: entry?.versionId ?? null,
              installedAt: entry?.installedAt ?? null,
            };
          });
        return { plugins: jars };
      } catch {
        return { plugins: [] };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('servers:read')],
      response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
      detail: { summary: 'List installed Minecraft plugins', tags: ['Servers', 'Minecraft'] },
    }
  );

  app.get(
    prefix + '/servers/:id/plugins/search',
    async (ctx: AuthenticatedHandlerContext) => {
      const { q } = (ctx.query ?? {}) as Record<string, string>;
      if (!q || q.length < 2) { ctx.set.status = 400; return { error: ctx.t('server.query_too_short') }; }

      try {
        const url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(q)}&facets=${encodeURIComponent('[["project_type:plugin"]]')}&limit=20`;
        const res = await httpRequest<any>(url, { timeoutMs: 10000 });
        const hits = res?.data?.hits ?? [];
        const plugins = hits.map((h: any) => ({
          name: h.title,
          slug: h.slug,
          description: h.description,
          author: h.author,
          downloads: h.downloads,
          version: h.latest_version,
          iconUrl: h.icon_url,
          source: 'modrinth' as const,
          downloadUrl: `https://api.modrinth.com/v2/project/${h.slug}/version`,
          projectId: h.project_id,
        }));
        return { plugins };
      } catch (e: any) {
        ctx.set.status = 502;
        return { error: e?.message || 'Failed to search plugins' };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('servers:read')],
      response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
      detail: { summary: 'Search Minecraft plugins from Modrinth', tags: ['Servers', 'Minecraft'] },
    }
  );

  app.get(
    prefix + '/servers/:id/plugins/preview/:slug',
    async (ctx: AuthenticatedHandlerContext) => {
      const { slug } = (ctx.params ?? {}) as Record<string, string>;
      if (!slug) { ctx.set.status = 400; return { error: ctx.t('server.missing_slug') }; }
      try {
        const [projRes, verRes] = await Promise.all([
          httpRequest<any>(`https://api.modrinth.com/v2/project/${encodeURIComponent(slug)}`, { timeoutMs: 10000 }),
          httpRequest<any>(`https://api.modrinth.com/v2/project/${encodeURIComponent(slug)}/version`, { timeoutMs: 10000 }),
        ]);
        const p = projRes?.data;
        const versions = Array.isArray(verRes?.data) ? verRes.data : [];
        return {
          name: p?.title ?? slug,
          slug: p?.slug ?? slug,
          description: p?.description ?? '',
          body: p?.body ?? '',
          author: p?.author ?? '',
          downloads: p?.downloads ?? 0,
          iconUrl: p?.icon_url ?? null,
          issuesUrl: p?.issues_url ?? null,
          sourceUrl: p?.source_url ?? null,
          wikiUrl: p?.wiki_url ?? null,
          discordUrl: p?.discord_url ?? null,
          versions: versions.map((v: any) => ({
            id: v.id,
            name: v.name,
            versionNumber: v.version_number,
            gameVersions: v.game_versions ?? [],
            loaders: v.loaders ?? [],
            datePublished: v.date_published,
            downloadUrl: v.files?.find((f: any) => f.primary)?.url ?? v.files?.[0]?.url ?? null,
          })),
        };
      } catch (e: any) {
        ctx.set.status = 502;
        return { error: e?.message || 'Failed to load plugin details' };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('servers:read')],
      response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
      detail: { summary: 'Get full Modrinth project details for a plugin', tags: ['Servers', 'Minecraft'] },
    }
  );

  app.post(
    prefix + '/servers/:id/plugins/install',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const { slug, filename, versionId } = (ctx.body ?? {}) as { slug: string; filename: string; versionId?: string };
      if (!slug || !filename) { ctx.set.status = 400; return { error: ctx.t('server.missing_slug_or_filename') }; }

      const ws = await serviceFor(id) as WingsApiService;

      try {
        let jarUrl: string;
        if (versionId) {
          const verRes = await httpRequest<any>(`https://api.modrinth.com/v2/version/${encodeURIComponent(versionId)}`, { timeoutMs: 10000 });
          const v = verRes?.data;
          const file = v?.files?.find((f: any) => f.primary) || v?.files?.[0];
          if (!file?.url) { ctx.set.status = 502; return { error: ctx.t('server.could_not_resolve_download_url_for_this_version') }; }
          jarUrl = file.url;
        } else {
          const verRes = await httpRequest<any>(`https://api.modrinth.com/v2/project/${encodeURIComponent(slug)}/version`, { timeoutMs: 10000 });
          const versions = Array.isArray(verRes?.data) ? verRes.data : [];
          const primary = versions.find((v: any) => v.files?.some((f: any) => f.primary)) || versions[0];
          const file = primary?.files?.find((f: any) => f.primary) || primary?.files?.[0];
          if (!file?.url) { ctx.set.status = 502; return { error: ctx.t('server.could_not_resolve_download_url') }; }
          jarUrl = file.url;
        }

        const jarRes = await httpRequest<ArrayBuffer>(jarUrl, { responseType: 'arraybuffer', timeoutMs: 30000 });
        const jarData = jarRes.data;
        if (!jarData) { ctx.set.status = 502; return { error: ctx.t('server.failed_to_download_plugin') }; }

        try { await ws.createDirectory(id, '/', 'plugins'); } catch {}

        let versionNumber = '';
        let resolvedVersionId = versionId || '';
        try {
          const vRes = await httpRequest<any>(`https://api.modrinth.com/v2/version/${encodeURIComponent(resolvedVersionId)}`, { timeoutMs: 5000 });
          versionNumber = vRes?.data?.version_number ?? '';
        } catch {}
        if (!resolvedVersionId) {
          try {
            const vRes = await httpRequest<any>(`https://api.modrinth.com/v2/project/${encodeURIComponent(slug)}/version`, { timeoutMs: 5000 });
            const versions = Array.isArray(vRes?.data) ? vRes.data : [];
            const primary = versions[0];
            if (primary) {
              resolvedVersionId = primary.id;
              versionNumber = primary.version_number;
            }
          } catch {}
        }

        await ws.writeFile(id, `plugins/${filename}`, new Uint8Array(jarData as ArrayBuffer));

        const name = filename.replace(/\.jar$/, '');
        try {
          const metaRes = await ws.readFile(id, 'plugins/.plugins.json').catch(() => ({ data: null }));
          let meta: Record<string, any> = {};
          try { meta = JSON.parse(typeof metaRes?.data === 'string' ? metaRes.data : String(metaRes?.data ?? '{}')); } catch {}
          meta[name] = { slug, version: versionNumber, versionId: resolvedVersionId, installedAt: new Date().toISOString(), filename };
          await ws.writeFile(id, 'plugins/.plugins.json', JSON.stringify(meta, null, 2));
        } catch {}

        return { success: true, filename, version: versionNumber };
      } catch (e: any) {
        ctx.set.status = 500;
        return { error: e?.message || 'Failed to install plugin' };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('servers:files')],
      response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
      detail: { summary: 'Install a Minecraft plugin from Modrinth', tags: ['Servers', 'Minecraft'] },
    }
  );

  app.delete(
    prefix + '/servers/:id/plugins/:filename',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id, filename } = (ctx.params ?? {}) as Record<string, string>;
      const ws = await serviceFor(id) as WingsApiService;
      try {
        await ws.deleteFile(id, '/', [`plugins/${filename}`]);

        const name = filename.replace(/\.jar$/, '');
        try {
          const metaRes = await ws.readFile(id, 'plugins/.plugins.json').catch(() => ({ data: null }));
          let meta: Record<string, any> = {};
          try { meta = JSON.parse(typeof metaRes?.data === 'string' ? metaRes.data : String(metaRes?.data ?? '{}')); } catch {}
          if (meta[name]) {
            delete meta[name];
            await ws.writeFile(id, 'plugins/.plugins.json', JSON.stringify(meta, null, 2));
          }
        } catch {}

        return { success: true };
      } catch (e: any) {
        ctx.set.status = 500;
        return { error: e?.message || 'Failed to delete plugin' };
      }
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('servers:files')],
      response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
      detail: { summary: 'Delete an installed plugin', tags: ['Servers', 'Minecraft'] },
    }
  );

  app.get(
    prefix + '/servers/:id/players/data',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = (ctx.params ?? {}) as Record<string, string>;
      const svc = await serviceFor(id);
      if (svc instanceof ProxmoxApiService) { ctx.set.status = 400; return { error: ctx.t('server.not_supported_for_proxmox_nodes') }; }
      const wings = svc as WingsApiService;

      let userCache: { name: string; uuid: string }[] = [];
      try {
        const uc = await mcReadJson(wings, id, 'usercache.json');
        if (Array.isArray(uc)) userCache = uc;
      } catch {}

      let playerFiles: any[] = [];
      const paths = ['world/playerdata/', 'world/players/data/'];
      for (const p of paths) {
        try {
          const listRes = await wings.listServerFiles(id, p);
          const files = Array.isArray(listRes?.data) ? listRes.data : Array.isArray(listRes) ? listRes : [];
          if (files.length > 0) {
            playerFiles = files;
            break;
          }
        } catch {}
      }

      const seen = new Set<string>();
      const players: { name: string; uuid: string }[] = [];

      for (const f of playerFiles) {
        if (!f.name?.endsWith('.dat')) continue;
        const uuid = f.name.replace(/\.dat$/, '');
        const key = uuid.replace(/-/g, '').toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const entry = userCache.find((u: any) => {
          const cuuid = (u.uuid ?? '').replace(/-/g, '').toLowerCase();
          return cuuid === key;
        });
        players.push({ name: entry?.name ?? uuid, uuid });
      }

      return { players, total: players.length };
    },
    {
      beforeHandle: [authenticate, requireProvider('wings'), authorize('servers:read')],
      response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
      detail: { summary: 'List all known players (from world/playerdata/ or world/players/data/)', tags: ['Servers', 'Minecraft'] },
    }
  );
}