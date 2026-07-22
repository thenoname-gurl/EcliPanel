import { AppDataSource } from '../config/typeorm';
import { In, IsNull, MoreThanOrEqual, Not } from 'typeorm';
import { t } from 'elysia';
import { EloProject } from '../models/eloProject.entity';
import { EloVote } from '../models/eloVote.entity';
import { EloDevlog } from '../models/eloDevlog.entity';
import { EloReport } from '../models/eloReport.entity';
import { AIModel } from '../models/aiModel.entity';
import { User } from '../models/user.entity';
import { Feedback } from '../models/feedback.entity';
import { Node } from '../models/node.entity';
import { Egg } from '../models/egg.entity';
import { ServerConfig } from '../models/serverConfig.entity';
import { ServerMapping } from '../models/serverMapping.entity';
import { authenticate } from '../middleware/auth';
import { authorize, hasPermissionSync } from '../middleware/authorize';
import { requireFeature } from '../middleware/featureToggle';
import { saveServerConfig, removeServerConfig } from './remoteHandler';
import { nodeService } from '../services/nodeService';
import { WingsApiService } from '../services/wingsApiService';
import { createActivityLog } from './logHandler';
import { updateElo, kFactorForProject, calculateEloResources } from '../services/eloService';
import { sanitizeError } from '../utils/sanitizeError';
import { getRolloutTreatment } from '../services/rolloutService';
import { httpRequest } from '../utils/http';
import path from 'path';
import fs from 'fs';

const ELO_SERVER_LIMIT_KEY = 'eloServerLimit';
const VOTES_TO_UNLOCK = 20;

export function clampInt(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(v)));
}

async function requireEloRollout(ctx: any): Promise<true | { error: string }> {
  const f = await requireFeature(ctx, 'elo');
  if (f !== true) return f;
  if (hasPermissionSync(ctx, 'admin:access')) return true;
  if (ctx.user?.id) {
    const rollout = await getRolloutTreatment(ctx.user.id, 'elo_rating');
    if (!rollout || !rollout.inRollout) {
      ctx.set.status = 503;
      return { error: ctx.t('elo.this_feature_is_not_yet_available_for_your_account') };
    }
  }
  return true;
}

export async function syncEloResources(project: EloProject) {
  if (!project.serverId) return;
  const cfg = await AppDataSource.getRepository(ServerConfig).findOneBy({ uuid: project.serverId });
  if (!cfg) return;

  const owner = await AppDataSource.getRepository(User).findOneBy({ id: project.userId });
  const isHackClub = owner?.studentVerified || false;
  const resources = calculateEloResources(project.eloScore, isHackClub, project.isWellMade);

  cfg.memory = resources.memory;
  cfg.disk = resources.disk;
  cfg.cpu = resources.cpu;
  await AppDataSource.getRepository(ServerConfig).save(cfg);

  try {
    const svc = await nodeService.getServiceForServer(project.serverId);
    if (svc instanceof WingsApiService) {
      await svc.syncServer(project.serverId, {
        build: {
          memory_limit: resources.memory,
          disk_space: resources.disk,
          cpu_limit: resources.cpu,
        },
      });
    }
  } catch {
    // Wings sync failure shouldn't block the vote
  }
}

export async function eloRoutes(app: any, prefix = '') {
  const eloProjectRepo = () => AppDataSource.getRepository(EloProject);
  const eloVoteRepo = () => AppDataSource.getRepository(EloVote);
  const eloDevlogRepo = () => AppDataSource.getRepository(EloDevlog);
  const userRepo = () => AppDataSource.getRepository(User);
  const nodeRepo = () => AppDataSource.getRepository(Node);
  const eggRepo = () => AppDataSource.getRepository(Egg);
  const cfgRepo = () => AppDataSource.getRepository(ServerConfig);
  const mappingRepo = () => AppDataSource.getRepository(ServerMapping);

  app.get(
    prefix + '/elo/projects',
    async (ctx: any) => {
      const r = await requireEloRollout(ctx);
      if (r !== true) return r;

      const page = Math.max(1, Number((ctx.query as any)?.page || 1));
      const per = Math.min(100, Math.max(1, Number((ctx.query as any)?.per || 50)));
      const sort = String((ctx.query as any)?.sort || 'elo_desc');

      const order: Record<string, string> =
        sort === 'elo_asc' ? { eloScore: 'ASC' } :
        sort === 'votes' ? { totalVotes: 'DESC' } :
        sort === 'wins' ? { wins: 'DESC' } :
        sort === 'newest' ? { createdAt: 'DESC' } :
        { eloScore: 'DESC' };

      const [projects, total] = await eloProjectRepo().findAndCount({
        where: { serverId: Not(IsNull()) } as any,
        order,
        skip: (page - 1) * per,
        take: per,
      });

      const userIds = [...new Set(projects.map(p => p.userId))];
      const users = await userRepo().findBy({ id: In(userIds.length > 0 ? userIds : [0]) as any });
      const userMap = new Map((users as User[]).map(u => [u.id, u]));

      const enriched = projects.map(p => {
        const owner = userMap.get(p.userId) as User | undefined;
        return {
          id: p.id,
          serverId: p.serverId,
          userId: p.userId,
          title: p.title || `Project #${p.id}`,
          description: p.description,
          githubUrl: p.githubUrl,
          demoUrl: p.demoUrl,
          eloScore: p.eloScore,
          totalVotes: p.totalVotes,
          wins: p.wins,
          losses: p.losses,
          ownerName: owner ? (owner.displayName || `${owner.firstName} ${owner.lastName}`) : 'Unknown',
          createdAt: p.createdAt,
        };
      });

      return {
        projects: enriched,
        total,
        page,
        per,
        totalPages: Math.ceil(total / per),
      };
    },
    {
      beforeHandle: [authenticate],
      detail: { summary: 'List ELO projects', tags: ['ELO'] },
    }
  );

  app.get(
    prefix + '/elo/projects/:id',
    async (ctx: any) => {
      const r = await requireEloRollout(ctx);
      if (r !== true) return r;

      const id = Number((ctx.params as any).id);
      const project = await eloProjectRepo().findOneBy({ id });
      if (!project) {
        ctx.set.status = 404;
        return { error: ctx.t('elo.elo_project_not_found') };
      }

      const devlogs = await eloDevlogRepo().find({
        where: { projectId: id },
        order: { publishedAt: 'DESC' },
        take: 20,
      });

      const owner = await userRepo().findOneBy({ id: project.userId });
      const resources = calculateEloResources(project.eloScore, owner?.studentVerified || false, project.isWellMade);

      return {
        id: project.id,
        serverId: project.serverId,
        userId: project.userId,
        title: project.title || `Project #${project.id}`,
        description: project.description,
        eloScore: project.eloScore,
        totalVotes: project.totalVotes,
        wins: project.wins,
        losses: project.losses,
        skipTokensRemaining: project.skipTokensRemaining,
        maxSkipTokens: project.maxSkipTokens,
        tags: project.tags,
        readme: project.readme,
        githubUrl: project.githubUrl,
        screenshots: project.screenshots,
        demoUrl: project.demoUrl,
        isWellMade: project.isWellMade,
        resources,
        ownerName: owner ? (owner.displayName || `${owner.firstName} ${owner.lastName}`) : 'Unknown',
        devlogs: devlogs.map(d => ({
          id: d.id,
          title: d.title,
          content: d.content,
          tags: d.tags,
          images: d.images,
          publishedAt: d.publishedAt,
        })),
        createdAt: project.createdAt,
        lastActiveAt: project.lastActiveAt,
      };
    },
    {
      detail: { summary: 'Get ELO project detail', tags: ['ELO'] },
    }
  );

  app.put(
    prefix + '/elo/projects/:id',
    async (ctx: any) => {
      const r = await requireEloRollout(ctx);
      if (r !== true) return r;

      const id = Number((ctx.params as any).id);
      const project = await eloProjectRepo().findOneBy({ id });
      if (!project) { ctx.set.status = 404; return { error: ctx.t('elo.project_not_found') }; }
      if (project.userId !== ctx.user.id) {
        const admin = hasPermissionSync(ctx, 'admin:access');
        if (!admin) { ctx.set.status = 403; return { error: ctx.t('elo.not_your_project') }; }
      }

      const body = ctx.body as Record<string, any>;
      if (body.title !== undefined) project.title = String(body.title).trim() || null;
      if (body.description !== undefined) project.description = String(body.description).trim() || null;
      if (body.readme !== undefined) project.readme = String(body.readme).trim() || null;
      if (body.githubUrl !== undefined) project.githubUrl = String(body.githubUrl).trim() || null;
      if (body.demoUrl !== undefined) {
        const val = String(body.demoUrl).trim();
        project.demoUrl = val.length > 0 ? val : null;
      }
      if (body.tags !== undefined) project.tags = Array.isArray(body.tags) ? body.tags : null;
      if (body.screenshots !== undefined) project.screenshots = Array.isArray(body.screenshots) ? body.screenshots : null;

      await eloProjectRepo().save(project);
      return { id: project.id, title: project.title, githubUrl: project.githubUrl, updated: true };
    },
    {
      beforeHandle: [authenticate],
      detail: { summary: 'Update ELO project profile', tags: ['ELO'] },
    }
  );

  app.post(
    prefix + '/elo/servers',
    async (ctx: any) => {
      const r = await requireEloRollout(ctx);
      if (r !== true) return r;

      const user = ctx.user;
      const isAdmin = hasPermissionSync(ctx, 'admin:access');

      const body = ctx.body as Record<string, any>;
      const { eggId, name, nodeId, memory: reqMem, disk: reqDisk, cpu: reqCpu } = body;

      if (!name?.trim()) {
        ctx.set.status = 400;
        return { error: ctx.t('elo.server_name_is_required') };
      }
      if (!eggId) {
        ctx.set.status = 400;
        return { error: ctx.t('elo.server_template_is_required') };
      }

      const eloLimit = user.limits?.[ELO_SERVER_LIMIT_KEY] ?? 1;
      const existingElo = await eloProjectRepo().find({ where: { userId: user.id } });
      if (!isAdmin && existingElo.length >= eloLimit) {
        ctx.set.status = 403;
        return {
          error: `ELO server limit reached (${eloLimit}). Vote ${VOTES_TO_UNLOCK - (user.limits?.votesCast || 0) % VOTES_TO_UNLOCK} more times to unlock another slot.`,
        };
      }

      const egg = await eggRepo().findOneBy({ id: Number(eggId) });
      if (!egg) {
        ctx.set.status = 404;
        return { error: ctx.t('elo.server_template_not_found') };
      }

      let node: Node | null = null;
      if (nodeId) {
        node = await nodeRepo().findOneBy({ id: Number(nodeId) });
      }
      if (!node) {
        const freeNode = await nodeRepo().findOne({ where: { nodeType: In(['free', 'free_and_paid']) } });
        if (!freeNode) {
          ctx.set.status = 503;
          return { error: ctx.t('elo.no_available_nodes') };
        }
        node = freeNode;
      }

      if (node.deploymentsDisabled) {
        ctx.set.status = 403;
        return { error: node.deploymentNotice || 'Node temporarily unavailable' };
      }

      const limits = user.limits || {};
      const memory = reqMem != null ? Number(reqMem) : (limits.memory ?? 1024);
      const disk = reqDisk != null ? Number(reqDisk) : (limits.disk ?? 10240);
      const cpu = reqCpu != null ? Number(reqCpu) : (limits.cpu ?? 100);

      if (!egg.visible && !isAdmin) {
        ctx.set.status = 403;
        return { error: ctx.t('elo.server_template_not_available') };
      }

      const serverUuid = crypto.randomUUID();

      await nodeService.mapServer(serverUuid, node.id);
      await saveServerConfig({
        uuid: serverUuid,
        nodeId: node.id,
        userId: user.id,
        name: name.trim(),
        dockerImage: egg.dockerImage,
        startup: egg.startup || '',
        environment: {},
        memory: clampInt(memory, 128, 65536),
        disk: clampInt(disk, 1024, 512000),
        cpu: clampInt(cpu, 10, 1200),
        eggId: egg.id,
      });

      try {
        const isProxmox = nodeService.isProxmoxNode(node);
        if (isProxmox) {
          const svc = await nodeService.getProxmoxService(node.id);
          await svc.createServer({
            uuid: serverUuid,
            name: name.trim(),
            memory,
            disk,
            cpu,
            vmType: 'lxc',
            template: '',
          });
        } else {
          const base = node.backendWingsUrl || node.url;
          const svc = new WingsApiService(base, node.token);
          await svc.createServer({ uuid: serverUuid, start_on_completion: false, skip_scripts: false });
        }

        const eloProject = eloProjectRepo().create({
          serverId: serverUuid,
          userId: user.id,
          eloScore: 1000,
          kFactor: 24,
          title: name.trim(),
          lastActiveAt: new Date(),
        });
        await eloProjectRepo().save(eloProject);
        await syncEloResources(eloProject);

        await createActivityLog({
          userId: user.id,
          action: 'server:create',
          targetId: serverUuid,
          targetType: 'server',
          metadata: { serverName: name, eggId: egg.id, nodeId: node.id, memory, disk, cpu, isEloServer: true, eloProjectId: eloProject.id },
          ipAddress: ctx.ip,
        });

        return {
          uuid: serverUuid,
          nodeId: node.id,
          isEloServer: true,
          eloProjectId: eloProject.id,
          eloScore: 1000,
        };
      } catch (e: unknown) {
        await Promise.allSettled([removeServerConfig(serverUuid), nodeService.unmapServer(serverUuid)]);
        ctx.set.status = 502;
        return { error: sanitizeError(e, 'eloHandler:create-server') };
      }
    },
    {
      beforeHandle: [authenticate, authorize('servers:create')],
      detail: { summary: 'Create an ELO server', tags: ['ELO'] },
    }
  );

  app.get(
    prefix + '/elo/vote/next',
    async (ctx: any) => {
      const r = await requireEloRollout(ctx);
      if (r !== true) return r;

      const userId = ctx.user.id;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const votesToday = await eloVoteRepo().count({
        where: { voterId: userId, createdAt: MoreThanOrEqual(today) },
      });
      if (votesToday >= 20) {
        ctx.set.status = 429;
        return { error: ctx.t('elo.daily_vote_limit_reached_20_votes_day_come_back_tomorrow') };
      }

      const account = await userRepo().findOneBy({ id: userId });
      if (account) {
        const daysSinceCreation = (Date.now() - new Date(account.createdAt).getTime()) / 86400000;
        if (daysSinceCreation < 7) {
          ctx.set.status = 403;
          return { error: ctx.t('elo.account_must_be_at_least_7_days_old_to_vote') };
        }
      }

      const candidates = await eloProjectRepo()
        .createQueryBuilder('ep')
        .andWhere('ep.serverId IS NOT NULL')
        .andWhere('ep.demoUrl IS NOT NULL')
        .andWhere('ep.demoUrl != :empty', { empty: '' })
        .andWhere('ep.userId != :userId', { userId })
        .orderBy('RAND()')
        .limit(10)
        .getMany();

      if (candidates.length < 2) {
        ctx.set.status = 404;
        return { error: ctx.t('elo.not_enough_projects_to_vote_on_check_back_soon') };
      }

      const recentVotes = await eloVoteRepo().find({
        where: { voterId: userId },
        order: { createdAt: 'DESC' },
        take: 50,
      });
      const recentPairs = new Set(
        recentVotes.map(v => [v.projectAId, v.projectBId].sort((a, b) => a - b).join(','))
      );

      let pair: typeof candidates = [];
      for (let i = 0; i < candidates.length - 1; i++) {
        for (let j = i + 1; j < candidates.length; j++) {
          const key = [candidates[i].id, candidates[j].id].sort((a, b) => a - b).join(',');
          if (!recentPairs.has(key)) {
            pair = [candidates[i], candidates[j]];
            break;
          }
        }
        if (pair.length === 2) break;
      }

      if (pair.length < 2) {
        ctx.set.status = 404;
        return { error: ctx.t('elo.no_more_projects_to_vote_on_right_now_check_back_later') };
      }

      const [a, b] = pair;
      const ownerA = await userRepo().findOneBy({ id: a.userId });
      const ownerB = await userRepo().findOneBy({ id: b.userId });

      async function getDevlogs(projectId: number) {
        return (await eloDevlogRepo().find({
          where: { projectId },
          order: { publishedAt: 'DESC' },
          take: 5,
        })).map(d => ({
          id: d.id,
          title: d.title,
          content: d.content,
          tags: d.tags,
          images: d.images,
          publishedAt: d.publishedAt,
        }));
      }

      const [devlogsA, devlogsB] = await Promise.all([getDevlogs(a.id), getDevlogs(b.id)]);

      return {
        projectA: {
          id: a.id,
          title: a.title || `Project #${a.id}`,
          userId: a.userId,
          description: a.description,
          readme: a.readme,
          screenshots: a.screenshots,
          demoUrl: a.demoUrl,
          githubUrl: a.githubUrl,
          eloScore: a.eloScore,
          totalVotes: a.totalVotes,
          isWellMade: a.isWellMade,
          ownerName: ownerA ? (ownerA.displayName || `${ownerA.firstName} ${ownerA.lastName}`) : 'Unknown',
          devlogs: devlogsA,
        },
        projectB: {
          id: b.id,
          title: b.title || `Project #${b.id}`,
          userId: b.userId,
          description: b.description,
          readme: b.readme,
          screenshots: b.screenshots,
          demoUrl: b.demoUrl,
          githubUrl: b.githubUrl,
          eloScore: b.eloScore,
          totalVotes: b.totalVotes,
          isWellMade: b.isWellMade,
          ownerName: ownerB ? (ownerB.displayName || `${ownerB.firstName} ${ownerB.lastName}`) : 'Unknown',
          devlogs: devlogsB,
        },
      };
    },
    {
      beforeHandle: [authenticate],
      detail: { summary: 'Get next voting pair', tags: ['ELO'] },
    }
  );

  async function moderateVoteFeedback(text: string): Promise<{ isSpam: boolean; reason: string }> {
    const MIN_WORDS = 20;
    const wordCount = text.trim().split(/\s+/).length;
    if (wordCount < MIN_WORDS) {
      return { isSpam: false, reason: `Minimum ${MIN_WORDS} words required (got ${wordCount})` };
    }

    try {
      const models = await AppDataSource.getRepository(AIModel).find({ take: 1 });
      const model = models[0];
      if (!model) {
        return { isSpam: false, reason: '' };
      }

      const url = model.endpoint || model.endpoints?.[0]?.endpoint || model.endpoints?.[0]?.url;
      const key = model.apiKey || model.endpoints?.[0]?.apiKey || model.endpoints?.[0]?.key;
      if (!url) return { isSpam: false, reason: '' };

      const res = await httpRequest(url, {
        method: 'POST',
        timeoutMs: 15000,
        headers: {
          'Authorization': `Bearer ${key || 'none'}`,
          'Content-Type': 'application/json',
        },
        body: {
          model: model.config?.modelId || model.name,
          messages: [
            {
              role: 'system',
              content: `You are a content moderator. Analyze the following ELO voting feedback. Determine if it is spam, gibberish, abuse, or low-effort content not suitable for a game server community. Reply with a JSON object: {"isSpam": boolean, "reason": string}. Set isSpam to true only if the text is clearly spam, gibberish, abuse, or completely low-effort nonsense.`,
            },
            { role: 'user', content: text },
          ],
          max_tokens: 128,
          temperature: 0.1,
        },
      });

      const reply = (res.data as any)?.choices?.[0]?.message?.content || '';
      const match = reply.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return { isSpam: parsed.isSpam === true, reason: parsed.reason || '' };
      }
    } catch {
      // moderation failure should not block voting
    }

    return { isSpam: false, reason: '' };
  }

  app.post(
    prefix + '/elo/vote',
    async (ctx: any) => {
      const r = await requireEloRollout(ctx);
      if (r !== true) return r;

      const userId = ctx.user.id;
      const { projectAId, projectBId, winnerId, feedback } = ctx.body as Record<string, any>;

      if (!projectAId || !projectBId || !winnerId) {
        ctx.set.status = 400;
        return { error: ctx.t('elo.projectaid_projectbid_and_winnerid_are_required') };
      }

      if (winnerId !== projectAId && winnerId !== projectBId) {
        ctx.set.status = 400;
        return { error: ctx.t('elo.winnerid_must_match_projectaid_or_projectbid') };
      }

      if (!feedback?.trim()) {
        ctx.set.status = 400;
        return { error: ctx.t('elo.feedback_is_required') };
      }

      const MIN_WORDS = 20;
      const wordCount = feedback.trim().split(/\s+/).length;
      if (wordCount < MIN_WORDS) {
        ctx.set.status = 400;
        return { error: `Feedback must be at least ${MIN_WORDS} words (got ${wordCount}).` };
      }

      const lastVote = await eloVoteRepo().findOne({
        where: { voterId: userId },
        order: { createdAt: 'DESC' },
      });
      if (lastVote && (Date.now() - new Date(lastVote.createdAt).getTime()) < 10000) {
        ctx.set.status = 429;
        return { error: ctx.t('elo.please_wait_at_least_10_seconds_between_votes') };
      }

      const recentFeedbacks = await AppDataSource.getRepository(Feedback).find({
        where: { userId },
        order: { createdAt: 'DESC' },
        take: 5,
      });
      const normalized = feedback.trim().toLowerCase();
      for (const fb of recentFeedbacks) {
        if (fb.message && fb.message.toLowerCase().includes(normalized.slice(0, 40))) {
          ctx.set.status = 400;
          return { error: ctx.t('elo.reusing_previous_feedback_is_not_allowed_please_write_someth') };
        }
      }

      const moderation = await moderateVoteFeedback(feedback);
      if (moderation.isSpam) {
        const userRepo = AppDataSource.getRepository(User);
        const user = await userRepo.findOneBy({ id: userId });
        if (user) {
          user.voteWarnings = (user.voteWarnings || 0) + 1;
          await userRepo.save(user);
        }
        ctx.set.status = 400;
        return { error: `Feedback flagged as spam: ${moderation.reason || 'Please provide meaningful feedback.'}` };
      }

      const account = await userRepo().findOneBy({ id: userId });
      if (account) {
        const daysSinceCreation = (Date.now() - new Date(account.createdAt).getTime()) / 86400000;
        if (daysSinceCreation < 7) {
          ctx.set.status = 403;
          return { error: ctx.t('elo.account_must_be_at_least_7_days_old_to_vote') };
        }
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const votesToday = await eloVoteRepo().count({ where: { voterId: userId, createdAt: MoreThanOrEqual(today) } });
      if (votesToday >= 20) {
        ctx.set.status = 429;
        return { error: ctx.t('elo.daily_vote_limit_reached_20_votes_day') };
      }

      const recentVote = await eloVoteRepo().findOne({
        where: [
          { voterId: userId, projectAId: Number(projectAId), projectBId: Number(projectBId) },
          { voterId: userId, projectAId: Number(projectBId), projectBId: Number(projectAId) },
        ],
        order: { createdAt: 'DESC' },
      });
      if (recentVote && (Date.now() - new Date(recentVote.createdAt).getTime()) < 86400000) {
        ctx.set.status = 429;
        return { error: ctx.t('elo.you_already_voted_on_this_pair_within_the_last_24_hours') };
      }

      const projectA = await eloProjectRepo().findOneBy({ id: Number(projectAId) });
      const projectB = await eloProjectRepo().findOneBy({ id: Number(projectBId) });
      if (!projectA || !projectB) {
        ctx.set.status = 404;
        return { error: ctx.t('elo.one_or_both_projects_not_found') };
      }

      if (projectA.userId === userId || projectB.userId === userId) {
        ctx.set.status = 403;
        return { error: ctx.t('elo.you_cannot_vote_on_your_own_project') };
      }

      const winner = winnerId === projectAId ? projectA : projectB;
      const loser = winnerId === projectAId ? projectB : projectA;

      const k = Math.round((kFactorForProject(projectA.totalVotes) + kFactorForProject(projectB.totalVotes)) / 2);
      const result = updateElo(winner.eloScore, loser.eloScore, k);

      const voteRecord = eloVoteRepo().create({
        voterId: userId,
        projectAId: Number(projectAId),
        projectBId: Number(projectBId),
        winnerId: Number(winnerId),
        eloDeltaA: result.winnerDelta,
        eloDeltaB: result.loserDelta,
      });
      await eloVoteRepo().save(voteRecord);

      const voterWeight = account?.studentVerified ? 1.1 : 1.0;
      const adjustedDelta = Math.round(result.winnerDelta * voterWeight);

      winner.eloScore += adjustedDelta;
      loser.eloScore += result.loserDelta;
      winner.totalVotes += 1;
      loser.totalVotes += 1;
      winner.wins += 1;
      loser.losses += 1;
      winner.kFactor = kFactorForProject(winner.totalVotes);
      loser.kFactor = kFactorForProject(loser.totalVotes);
      winner.lastActiveAt = new Date();
      loser.lastActiveAt = new Date();

      await eloProjectRepo().save(winner);
      await eloProjectRepo().save(loser);

      await Promise.allSettled([syncEloResources(winner), syncEloResources(loser)]);

      if (account) {
        const currentVotes = account.limits?.votesCast || 0;
        const newVotes = currentVotes + 1;
        const oldSlots = Math.floor(currentVotes / VOTES_TO_UNLOCK) + 1;
        const newSlots = Math.floor(newVotes / VOTES_TO_UNLOCK) + 1;

        account.limits = {
          ...(account.limits || {}),
          votesCast: newVotes,
          eloServerLimit: newSlots,
        };
        await userRepo().save(account);
      }

      try {
        const fb = AppDataSource.getRepository(Feedback).create({
          userId,
          rating: 0,
          message: `ELO vote feedback (projectA=${projectAId}, projectB=${projectBId}): ${feedback.trim()}`,
        });
        await AppDataSource.getRepository(Feedback).save(fb);
      } catch {
        // feedback save failure should not block the vote
      }

      return {
        voteId: voteRecord.id,
        winnerId: Number(winnerId),
        winnerElo: winner.eloScore,
        loserElo: loser.eloScore,
        delta: { winner: adjustedDelta, loser: result.loserDelta },
        weightedByHackClub: account?.studentVerified || false,
      };
    },
    {
      beforeHandle: [authenticate],
      body: t.Object({
        projectAId: t.Number(),
        projectBId: t.Number(),
        winnerId: t.Number(),
        feedback: t.Optional(t.String()),
      }),
      detail: { summary: 'Submit a vote', tags: ['ELO'] },
    }
  );

  app.get(
    prefix + '/elo/leaderboard',
    async (ctx: any) => {
      const r = await requireEloRollout(ctx);
      if (r !== true) return r;

      const page = Math.max(1, Number((ctx.query as any)?.page || 1));
      const per = Math.min(100, Math.max(1, Number((ctx.query as any)?.per || 50)));

      const [projects, total] = await eloProjectRepo().findAndCount({
        where: { serverId: Not(IsNull()) } as any,
        order: { eloScore: 'DESC' },
        skip: (page - 1) * per,
        take: per,
      });

      const userIds = [...new Set(projects.map(p => p.userId))];
      const users = await userRepo().findBy({ id: In(userIds.length > 0 ? userIds : [0]) as any });
      const userMap = new Map((users as User[]).map(u => [u.id, u]));

      const enriched = projects.map((p, i) => {
        const owner = userMap.get(p.userId) as User | undefined;
        return {
          rank: (page - 1) * per + i + 1,
          id: p.id,
          userId: p.userId,
          title: p.title || `Project #${p.id}`,
          description: p.description,
          githubUrl: p.githubUrl,
          eloScore: p.eloScore,
          totalVotes: p.totalVotes,
          wins: p.wins,
          losses: p.losses,
          winRate: p.totalVotes > 0 ? Math.round((p.wins / p.totalVotes) * 100) : 0,
          isWellMade: p.isWellMade,
          ownerName: owner ? (owner.displayName || `${owner.firstName} ${owner.lastName}`) : 'Unknown',
        };
      });

      return { leaderboard: enriched, total, page, per, totalPages: Math.ceil(total / per) };
    },
    {
      detail: { summary: 'ELO leaderboard', tags: ['ELO'] },
    }
  );

  app.get(
    prefix + '/elo/stats',
    async (ctx: any) => {
      const r = await requireEloRollout(ctx);
      if (r !== true) return r;

      const projects = await eloProjectRepo().find({ where: { serverId: Not(IsNull()) } as any, select: { eloScore: true } as any });
      const scores = projects.map(p => p.eloScore);
      const total = scores.length;
      if (total === 0) return { averageElo: 1000, medianElo: 1000, totalProjects: 0 };

      const sorted = [...scores].sort((a, b) => a - b);
      const sum = scores.reduce((a, b) => a + b, 0);
      const mid = Math.floor(sorted.length / 2);

      return {
        averageElo: Math.round(sum / total),
        medianElo: sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2),
        totalProjects: total,
      };
    },
    {
      beforeHandle: [authenticate],
      detail: { summary: 'ELO distribution stats', tags: ['ELO'] },
    }
  );

  app.post(
    prefix + '/elo/devlogs',
    async (ctx: any) => {
      const r = await requireEloRollout(ctx);
      if (r !== true) return r;

      const userId = ctx.user.id;
      const { projectId, title, content, tags, images } = ctx.body as Record<string, any>;

      if (!projectId || !title?.trim() || !content?.trim()) {
        ctx.set.status = 400;
        return { error: ctx.t('elo.projectid_title_and_content_are_required') };
      }

      const VOTE_DEVLOG_DAYS = 14;
      const voteCutoff = new Date(Date.now() - VOTE_DEVLOG_DAYS * 24 * 60 * 60 * 1000);
      const recentVote = await eloVoteRepo().findOne({
        where: { voterId: userId, createdAt: MoreThanOrEqual(voteCutoff) },
        order: { createdAt: 'DESC' },
      });
      if (!recentVote) {
        ctx.set.status = 400;
        return { error: 'You must cast at least one vote in the last ' + VOTE_DEVLOG_DAYS + ' days to publish a devlog. Visit the ELO Voting page.' };
      }

      const project = await eloProjectRepo().findOneBy({ id: Number(projectId) });
      if (!project) {
        ctx.set.status = 404;
        return { error: ctx.t('elo.project_not_found') };
      }
      if (project.userId !== userId) {
        ctx.set.status = 403;
        return { error: ctx.t('elo.you_can_only_publish_devlogs_for_your_own_projects') };
      }

      const devlog = eloDevlogRepo().create({
        projectId: Number(projectId),
        userId,
        title: title.trim(),
        content: content.trim(),
        tags: Array.isArray(tags) ? tags : undefined,
        images: Array.isArray(images) ? images.slice(0, 3) : undefined,
        publishedAt: new Date(),
      });
      await eloDevlogRepo().save(devlog);

      project.skipTokensRemaining = project.maxSkipTokens;
      project.lastActiveAt = new Date();
      await eloProjectRepo().save(project);

      return { id: devlog.id, title: devlog.title, publishedAt: devlog.publishedAt, skipTokensReset: true };
    },
    {
      beforeHandle: [authenticate],
      detail: { summary: 'Publish a devlog', tags: ['ELO'] },
    }
  );

  app.get(
    prefix + '/elo/projects/:id/devlogs',
    async (ctx: any) => {
      const r = await requireEloRollout(ctx);
      if (r !== true) return r;

      const projectId = Number((ctx.params as any).id);
      const devlogs = await eloDevlogRepo().find({
        where: { projectId },
        order: { publishedAt: 'DESC' },
      });

      return {
        projectId,
        devlogs: devlogs.map(d => ({
          id: d.id,
          title: d.title,
          content: d.content,
          tags: d.tags,
          images: d.images,
          publishedAt: d.publishedAt,
          createdAt: d.createdAt,
        })),
      };
    },
    {
      beforeHandle: [authenticate],
      detail: { summary: 'List devlogs for a project', tags: ['ELO'] },
    }
  );

  app.get(
    prefix + '/elo/projects/:id/skip-status',
    async (ctx: any) => {
      const r = await requireEloRollout(ctx);
      if (r !== true) return r;

      const projectId = Number((ctx.params as any).id);
      const project = await eloProjectRepo().findOneBy({ id: projectId });
      if (!project) {
        ctx.set.status = 404;
        return { error: ctx.t('elo.project_not_found') };
      }

      return {
        projectId: project.id,
        skipTokensRemaining: project.skipTokensRemaining,
        maxSkipTokens: project.maxSkipTokens,
      };
    },
    {
      beforeHandle: [authenticate],
      detail: { summary: 'Get skip token status', tags: ['ELO'] },
    }
  );

  app.post(
    prefix + '/elo/projects/:id/skip',
    async (ctx: any) => {
      const r = await requireEloRollout(ctx);
      if (r !== true) return r;

      const userId = ctx.user.id;
      const projectId = Number((ctx.params as any).id);
      const project = await eloProjectRepo().findOneBy({ id: projectId });
      if (!project) {
        ctx.set.status = 404;
        return { error: ctx.t('elo.project_not_found') };
      }
      if (project.userId !== userId) {
        ctx.set.status = 403;
        return { error: ctx.t('elo.you_can_only_use_skips_on_your_own_projects') };
      }
      if (project.skipTokensRemaining <= 0) {
        ctx.set.status = 403;
        return { error: ctx.t('elo.no_skip_tokens_remaining_publish_a_devlog_to_reset_your_skip') };
      }

      project.skipTokensRemaining -= 1;
      await eloProjectRepo().save(project);

      return {
        projectId: project.id,
        skipTokensRemaining: project.skipTokensRemaining,
        maxSkipTokens: project.maxSkipTokens,
        skipConsumed: true,
      };
    },
    {
      beforeHandle: [authenticate],
      detail: { summary: 'Use a skip token', tags: ['ELO'] },
    }
  );

  app.get(
    prefix + '/elo/my',
    async (ctx: any) => {
      const r = await requireEloRollout(ctx);
      if (r !== true) return r;

      const userId = ctx.user.id;
      const projects = await eloProjectRepo().find({ where: { userId }, order: { eloScore: 'DESC' } });
      const eloLimit = ctx.user.limits?.[ELO_SERVER_LIMIT_KEY] ?? 1;
      const votesCast = ctx.user.limits?.votesCast || 0;
      const votesForNextSlot = VOTES_TO_UNLOCK - (votesCast % VOTES_TO_UNLOCK);

      const results = await Promise.all(
        projects.map(async p => {
          if (!p.serverId) {
            await eloProjectRepo().remove(p);
            return null;
          }
          const cfg = await cfgRepo().findOneBy({ uuid: p.serverId });
          if (!cfg) {
            await eloProjectRepo().remove(p);
            return null;
          }
          const resources = calculateEloResources(p.eloScore, ctx.user?.studentVerified || false, p.isWellMade);
          return {
            id: p.id,
            serverId: p.serverId,
            title: p.title || `Project #${p.id}`,
            description: p.description,
            readme: p.readme,
            eloScore: p.eloScore,
            totalVotes: p.totalVotes,
            wins: p.wins,
            losses: p.losses,
            skipTokensRemaining: p.skipTokensRemaining,
            maxSkipTokens: p.maxSkipTokens,
            githubUrl: p.githubUrl,
            demoUrl: p.demoUrl,
            isWellMade: p.isWellMade,
            orphanedAt: p.orphanedAt,
            screenshots: p.screenshots,
            serverName: cfg.name,
            serverStatus: cfg.suspended ? 'suspended' : 'active',
            resources,
            createdAt: p.createdAt,
            ownerName: (ctx.user.displayName || `${ctx.user.firstName} ${ctx.user.lastName}`),
            ownerAvatar: ctx.user.avatarUrl,
          };
        })
      );
      const enriched = results.filter(Boolean);

      return {
        projects: enriched,
        isHackClub: ctx.user?.studentVerified || false,
        eloServerLimit: eloLimit,
        currentEloSlots: eloLimit,
        votesCast,
        votesForNextSlot,
        totalProjects: projects.length,
      };
    },
    {
      beforeHandle: [authenticate],
      detail: { summary: 'Get my ELO projects', tags: ['ELO'] },
    }
  );

  app.get(
    prefix + '/elo/vote/history',
    async (ctx: any) => {
      const r = await requireEloRollout(ctx);
      if (r !== true) return r;

      const userId = ctx.user.id;
      const page = Math.max(1, Number((ctx.query as any)?.page || 1));
      const per = Math.min(100, Math.max(1, Number((ctx.query as any)?.per || 50)));

      const [votes, total] = await eloVoteRepo().findAndCount({
        where: { voterId: userId },
        order: { createdAt: 'DESC' },
        skip: (page - 1) * per,
        take: per,
      });

      return { votes, total, page, per, totalPages: Math.ceil(total / per) };
    },
    {
      beforeHandle: [authenticate],
      detail: { summary: 'Get my voting history', tags: ['ELO'] },
    }
  );

  app.get(
    prefix + '/elo/projects/:id/votes',
    async (ctx: any) => {
      const projectId = Number((ctx.params as any).id);
      if (isNaN(projectId)) { ctx.set.status = 400; return { error: ctx.t('elo.invalid_project_id') }; }

      const project = await eloProjectRepo().findOneBy({ id: projectId });
      if (!project) { ctx.set.status = 404; return { error: ctx.t('elo.project_not_found') }; }

      const page = Math.max(1, Number((ctx.query as any)?.page || 1));
      const per = Math.min(100, Math.max(1, Number((ctx.query as any)?.per || 50)));

      const [votes, total] = await eloVoteRepo().findAndCount({
        where: [
          { projectAId: projectId },
          { projectBId: projectId },
        ],
        order: { createdAt: 'DESC' },
        skip: (page - 1) * per,
        take: per,
      });

      const voterIds = [...new Set(votes.map(v => v.voterId))];
      const voters = voterIds.length > 0
        ? await AppDataSource.getRepository(User).findBy({ id: In(voterIds) as any })
        : [];
      const voterMap = new Map(voters.map(u => [u.id, u]));

      const opponentIds = [...new Set(votes.map(v => v.projectAId === projectId ? v.projectBId : v.projectAId))];
      const opponents = opponentIds.length > 0
        ? await eloProjectRepo().findBy({ id: In(opponentIds) as any })
        : [];
      const opponentMap = new Map(opponents.map(p => [p.id, p]));

      const feedbackEntries = voterIds.length > 0
        ? await AppDataSource.getRepository(Feedback).find({
            where: { userId: In(voterIds) as any },
            order: { createdAt: 'DESC' },
          })
        : [];
      const feedbackByKey = new Map<string, string>();
      for (const fb of feedbackEntries) {
        const match = fb.message?.match(/projectA=(\d+),\s*projectB=(\d+)/);
        if (match) {
          const key = `${fb.userId}:${match[1]}:${match[2]}`;
          const text = fb.message.replace(/^ELO vote feedback \(projectA=\d+,\s*projectB=\d+\):\s*/, '');
          if (!feedbackByKey.has(key)) feedbackByKey.set(key, text);
        }
      }

      const enriched = votes.map(v => {
        const voter = voterMap.get(v.voterId) as User | undefined;
        const isA = v.projectAId === projectId;
        const won = v.winnerId === projectId;
        const oppId = isA ? v.projectBId : v.projectAId;
        const opp = opponentMap.get(oppId) as EloProject | undefined;
        const rawDelta = isA ? v.eloDeltaA : v.eloDeltaB;
        const fbKey = `${v.voterId}:${v.projectAId}:${v.projectBId}`;
        const altKey = `${v.voterId}:${v.projectBId}:${v.projectAId}`;
        return {
          id: v.id,
          voterId: v.voterId,
          voterName: voter ? (voter.displayName || `${voter.firstName} ${voter.lastName}`) : 'Unknown',
          opponentId: oppId,
          opponentTitle: opp?.title || `Project #${oppId}`,
          won,
          eloDelta: won ? Math.abs(rawDelta) : -Math.abs(rawDelta),
          feedback: feedbackByKey.get(fbKey) || feedbackByKey.get(altKey) || null,
          createdAt: v.createdAt,
        };
      });

      return {
        votes: enriched,
        total,
        page,
        per,
        totalPages: Math.ceil(total / per),
      };
    },
    {
      detail: { summary: 'Get votes for a project', tags: ['ELO'] },
    }
  );

  app.post(
    prefix + '/elo/screenshots',
    async (ctx: any) => {
      const r = await requireEloRollout(ctx);
      if (r !== true) return r;
      const userId = ctx.user.id;

      const { file } = (ctx.body || {}) as any;
      const uploadFile = Array.isArray(file) ? file[0] : file;
      if (!uploadFile) {
        ctx.set.status = 400;
        return { error: ctx.t('elo.no_file_provided') };
      }

      const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
      const mime = (uploadFile.type || uploadFile.mimetype || '').toString();
      if (!allowed.includes(mime)) {
        ctx.set.status = 400;
        return { error: ctx.t('elo.invalid_image_type_allowed_png_jpeg_webp_gif') };
      }

      const ab = await uploadFile.arrayBuffer();
      const buffer = Buffer.from(ab);

      const ext = mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : mime === 'image/gif' ? '.gif' : '.jpg';
      const filename = `elo_screenshot_${userId}_${Date.now()}${ext}`;
      const uploadDir = path.join(process.cwd(), 'uploads');
      await fs.promises.mkdir(uploadDir, { recursive: true });
      const filepath = path.join(uploadDir, filename);
      await Bun.write(filepath, buffer);

      const backendBase =
        (process.env.BACKEND_URL || '').replace(/\/+$/, '') ||
        (() => {
          const proto = (ctx.request.headers.get('x-forwarded-proto') || 'https') as string;
          const host = (ctx.request.headers.get('host') || 'localhost') as string;
          return `${proto}://${host}`;
        })();

      return { url: `${backendBase}/uploads/${filename}` };
    },
    {
      body: t.Object({ file: t.File() }),
      beforeHandle: [authenticate],
      detail: { summary: 'Upload an ELO screenshot', tags: ['ELO'] },
    }
  );

  app.get(
    prefix + '/elo/users/:userId',
    async (ctx: any) => {
      const r = await requireEloRollout(ctx);
      if (r !== true) return r;

      const userId = Number((ctx.params as any).userId);
      if (isNaN(userId)) { ctx.set.status = 400; return { error: ctx.t('elo.invalid_user_id') }; }

      const user = await AppDataSource.getRepository(User).findOneBy({ id: userId });
      if (!user) { ctx.set.status = 404; return { error: ctx.t('elo.user_not_found') }; }

      const projects = await eloProjectRepo().find({
        where: { userId, serverId: Not(IsNull()) },
        order: { eloScore: 'DESC' },
      });

      const enriched = await Promise.all(projects.map(async p => {
        const resources = calculateEloResources(p.eloScore, user.studentVerified || false, p.isWellMade);
        return {
          id: p.id,
          serverId: p.serverId,
          title: p.title || `Project #${p.id}`,
          description: p.description?.slice(0, 300),
          eloScore: p.eloScore,
          totalVotes: p.totalVotes,
          wins: p.wins,
          losses: p.losses,
          githubUrl: p.githubUrl,
          demoUrl: p.demoUrl,
          isWellMade: p.isWellMade,
          screenshots: p.screenshots?.slice(0, 1) || null,
          resources,
          createdAt: p.createdAt,
          devlogCount: await eloDevlogRepo().count({ where: { projectId: p.id } }),
        };
      }));

      const votesCast = await eloVoteRepo().count({ where: { voterId: userId } });
      const feedbacks = await AppDataSource.getRepository(Feedback).find({
        where: { userId },
        order: { createdAt: 'DESC' },
      });
      const devlogs = await eloDevlogRepo().find({
        where: { projectId: In(enriched.map(p => p.id).length > 0 ? enriched.map(p => p.id) : [0]) as any },
        order: { publishedAt: 'DESC' },
        take: 20,
      });

      return {
        user: {
          id: user.id,
          displayName: user.displayName || `${user.firstName} ${user.lastName}`,
          avatarUrl: user.avatarUrl,
          studentVerified: user.studentVerified || false,
          createdAt: user.createdAt,
        },
        projects: enriched,
        stats: {
          totalProjects: projects.length,
          totalVotesCast: votesCast,
          highestElo: projects.length > 0 ? Math.max(...projects.map(p => p.eloScore)) : 1000,
          totalFeedbacks: feedbacks.length,
        },
        devlogs: devlogs.map(d => ({
          id: d.id,
          projectId: d.projectId,
          title: d.title,
          content: d.content,
          tags: d.tags,
          images: d.images,
          publishedAt: d.publishedAt,
        })),
      };
    },
    {
      detail: { summary: 'Get public ELO user profile', tags: ['ELO'] },
    }
  );

  const eloReportRepo = () => AppDataSource.getRepository(EloReport);

  app.post(
    prefix + '/elo/reports',
    async ctx => {
      const body = ctx.body as any;
      if (!body || !body.targetType || !body.targetId || !body.reason?.trim()) {
        ctx.set.status = 400;
        return { error: ctx.t('elo.targettype_targetid_and_reason_are_required') };
      }

      if (!['vote', 'project', 'user'].includes(body.targetType)) {
        ctx.set.status = 400;
        return { error: ctx.t('elo.targettype_must_be_one_of_vote_project_user') };
      }

      if (body.reason.trim().length < 10) {
        ctx.set.status = 400;
        return { error: ctx.t('elo.reason_must_be_at_least_10_characters') };
      }

      const report = eloReportRepo().create({
        reporterId: ctx.user.id,
        targetType: body.targetType,
        targetId: Number(body.targetId),
        reason: body.reason.trim(),
      });
      await eloReportRepo().save(report);

      return { message: 'Report submitted', id: report.id };
    },
    {
      beforeHandle: [authenticate],
      detail: { summary: 'Report an ELO vote, project, or user', tags: ['ELO'] },
    }
  );

}
