import { AppDataSource } from '../config/typeorm';
import { AIModel } from '../models/aiModel.entity';
import { AIModelUser } from '../models/aiModelUser.entity';
import { AIModelOrg } from '../models/aiModelOrg.entity';
import { AIModelPlan } from '../models/aiModelPlan.entity';
import { authenticate } from '../middleware/auth';
import { authorize, hasPermissionSync } from '../middleware/authorize';
import { requireFeature } from '../middleware/featureToggle';
import { redisClient } from '../config/redis';
import { createActivityLog } from './logHandler';
import { AIUsage } from '../models/aiUsage.entity';
import { User } from '../models/user.entity';
import { Order } from '../models/order.entity';
import { Plan } from '../models/plan.entity';
import { t } from 'elysia';
import { In } from 'typeorm';
import { sanitizeError } from '../utils/sanitizeError';
import type { AIApp, AIContext, ModelLike } from '../types/ai';
import { extractEndpoints, requestWithFallback, resolveProviderModelId } from '../utils/aiProvider';

// I swear I hate this route handler,
// its a dumping ground ngl
function requireAiManagement(ctx: AIContext): true | { error: string } {
  const user = ctx.user as User | undefined;
  if (!user) {
    ctx.set.status = 401;
    return { error: ctx.t('auth.unauthorized') };
  }
  if (!hasPermissionSync(ctx, 'ai:manage')) {
    ctx.set.status = 403;
    return { error: ctx.t('admin.aiPermissionRequired') };
  }
  return true;
}

// There is no mercy for the unlcean
// This code should burn in hell
export async function aiRoutes(app: AIApp, prefix = '') {
  const modelRepo = AppDataSource.getRepository(AIModel);
  const modelUserRepo = AppDataSource.getRepository(AIModelUser);
  const modelOrgRepo = AppDataSource.getRepository(AIModelOrg);
  const modelPlanRepo = AppDataSource.getRepository(AIModelPlan);
  const orgMemberRepo = AppDataSource.getRepository(require('../models/organisationMember.entity').OrganisationMember);
  const usageRepo = AppDataSource.getRepository(AIUsage);
  const endpointCooldowns: Map<string, number> = new Map();

  async function getUserOrgIds(userId: number): Promise<number[]> {
    const memberships = await orgMemberRepo.find({ where: { userId } });
    return memberships
      .map((m: { organisationId?: number | string }) => Number(m.organisationId))
      .filter((v: number) => Number.isFinite(v));
  }

  async function getUserPlanIds(userId: number): Promise<number[]> {
    const orderRepo = AppDataSource.getRepository(Order);
    const orders = await orderRepo.find({
      where: { userId, status: 'active' },
      order: { createdAt: 'DESC' },
    });
    return orders
      .filter(o => o.planId != null)
      .map(o => o.planId as number);
  }

  async function getPlanModelLinks(planIds: number[]): Promise<AIModelPlan[]> {
    if (planIds.length === 0) return [];
    return modelPlanRepo.find({ where: { plan: { id: In(planIds) } }, relations: { model: true } });
  }

  async function isModelAllowedForPlan(userId: number, modelId: number): Promise<{ allowed: boolean; limits: Record<string, unknown> }> {
    const planIds = await getUserPlanIds(userId);
    if (planIds.length === 0) return { allowed: false, limits: {} };
    const links = await getPlanModelLinks(planIds);
    const match = links.find(l => l.model?.id === modelId);
    if (match) return { allowed: true, limits: match.limits || {} };
    return { allowed: false, limits: {} };
  }

  function nowTs() { return Date.now(); }

  async function logEndpointCooldown(model: ModelLike, endpoint: string, waitMs: number) {
    const entry = {
      timestamp: new Date().toISOString(),
      modelId: model?.id,
      modelName: model?.name,
      endpoint,
      waitMs,
    };
    try {
      await redisClient.lpush('admin:ai:cooldowns', JSON.stringify(entry));
    } catch {
      // ignore redis push errors
    }
    try {
      await redisClient.expire('admin:ai:cooldowns', 24 * 60 * 60);
    } catch {
      // ignore expiry errors
    }
    try {
      await createActivityLog({
        userId: 0,
        action: 'ai:endpoint:cooldown',
        targetId: String(model?.id || ''),
        targetType: 'ai-model',
        metadata: entry,
        ipAddress: '',
        notify: false,
      });
    } catch {
      // ignore activity log errors
    }
  }

  app.post(prefix + '/ai/models', async (ctx: AIContext) => {
    const f = await requireFeature(ctx, 'ai'); if (f !== true) return f;
    const adminCheck = requireAiManagement(ctx);
    if (adminCheck !== true) return adminCheck;
    const { name, config, limits, tags } = (ctx.body || {}) as Record<string, unknown>;
    const model = modelRepo.create({
      name: String(name || ''),
      config: (config && typeof config === 'object' ? (config as Record<string, unknown>) : undefined) as AIModel['config'],
      limits: (limits && typeof limits === 'object' ? (limits as Record<string, unknown>) : undefined) as AIModel['limits'],
      tags: Array.isArray(tags) ? tags.map(String) : undefined,
    });
    await modelRepo.save(model);
    return { success: true, model };
  }, {beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean(), model: t.Any() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Create AI model (Admin only)', tags: ['AI'] }
  });

  app.get(prefix + '/ai/models', async (ctx: AIContext) => {
    const f = await requireFeature(ctx, 'ai'); if (f !== true) return f;
    const models = await modelRepo.find();
    const safe = models.map((m) => {
      const { apiKey, endpoint, ...rest } = m || {};
      return rest;
    });
    return safe;
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }) },
    detail: { summary: 'List AI models (authenticated users)', tags: ['AI'] }
  });

  app.post(prefix + '/ai/models/:id/link-user', async (ctx: AIContext) => {
    const f = await requireFeature(ctx, 'ai'); if (f !== true) return f;
    const adminCheck = requireAiManagement(ctx);
    if (adminCheck !== true) return adminCheck;
    const model = await modelRepo.findOneBy({ id: Number(ctx.params['id']) });
    if (!model) {
      ctx.set.status = 404;
      return { error: ctx.t('common.modelNotFound') };
    }
    const { userId, limits } = (ctx.body || {}) as Record<string, unknown>;
    const userIdNum = Number(userId);
    const user = await AppDataSource.getRepository(User).findOneBy({ id: userIdNum });
    if (!user) {
      ctx.set.status = 404;
      return { error: ctx.t('user.notFound') };
    }
    const existing = await modelUserRepo.findOne({ where: { model: { id: model.id }, user: { id: userIdNum } } });
    if (existing) {
      if (limits !== undefined) {
        existing.limits = limits;
        await modelUserRepo.save(existing);
      }
      return { success: true, link: existing, updated: true };
    }
    const link = modelUserRepo.create({ model, user, limits });
    await modelUserRepo.save(link);
    return { success: true, link };
  }, {beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean(), link: t.Any(), updated: t.Optional(t.Boolean()) }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Link AI model to user (Admin only)', tags: ['AI'] }
  });

  app.post(prefix + '/ai/models/:id/link-org', async (ctx: AIContext) => {
    const f = await requireFeature(ctx, 'ai'); if (f !== true) return f;
    const adminCheck = requireAiManagement(ctx);
    if (adminCheck !== true) return adminCheck;
    const model = await modelRepo.findOneBy({ id: Number(ctx.params['id']) });
    if (!model) {
      ctx.set.status = 404;
      return { error: ctx.t('common.modelNotFound') };
    }
    const { orgId, limits } = (ctx.body || {}) as Record<string, unknown>;
    const orgIdNum = Number(orgId);
    const org = await AppDataSource.getRepository(require('../models/organisation.entity').Organisation).findOneBy({ id: orgIdNum });
    if (!org) {
      ctx.set.status = 404;
      return { error: ctx.t('organisation.notFound') };
    }
    const link = modelOrgRepo.create({ model, organisation: org, limits });
    await modelOrgRepo.save(link);
    return { success: true, link };
  }, {beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean(), link: t.Any() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Link AI model to organisation (Admin only)', tags: ['AI'] }
  });

  app.get(prefix + '/ai/my-models', async (ctx: AIContext) => {
    const f = await requireFeature(ctx, 'ai'); if (f !== true) return f;
    const user = ctx.user as User | null;
    if (!user) {
      ctx.set.status = 401;
      return { error: ctx.t('auth.unauthorized') };
    }
    const links = await modelUserRepo.find({ where: { user: { id: user.id } }, relations: {"model":true} });
    const models = links.map((l) => {
      const { apiKey, endpoint, ...safeModel } = l.model || {};
      return { model: safeModel, limits: l.limits };
    });
    const orgIds = await getUserOrgIds(user.id);
    if (orgIds.length > 0) {
      const orgLinks = await modelOrgRepo.find({ where: { organisation: { id: In(orgIds) } }, relations: {"model":true} });
      models.push(...orgLinks.map((l) => {
        const { apiKey, endpoint, ...safeModel } = l.model || {};
        return { model: safeModel, limits: l.limits };
      }));
    }
    const planIds = await getUserPlanIds(user.id);
    if (planIds.length > 0) {
      const planLinks = await getPlanModelLinks(planIds);
      const existingIds = new Set(models.map(m => (m.model as any)?.id));
      for (const l of planLinks) {
        const { apiKey, endpoint, ...safeModel } = l.model || {};
        if (!existingIds.has((safeModel as any)?.id)) {
          models.push({ model: safeModel, limits: l.limits });
        }
      }
    }
    return models;
  }, {beforeHandle: authenticate,
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }) },
    detail: { summary: 'Get models available to current user', tags: ['AI'] }
  });

  app.post(prefix + '/ai/use', async (ctx: AIContext) => {
    const f = await requireFeature(ctx, 'ai'); if (f !== true) return f;
    const user = ctx.user as User | null;
    if (!user) {
      ctx.set.status = 401;
      return { error: ctx.t('auth.unauthorized') };
    }
    const { modelId, tokens = 0, requests = 0 } = (ctx.body || {}) as Record<string, unknown>;
    const modelIdNum = Number(modelId);
    const tokenCount = Number(tokens) || 0;
    const requestCount = Number(requests) || 0;
    let limits: Record<string, unknown> = {};
    const orgIds = await getUserOrgIds(user.id);
    const userLink = await modelUserRepo.findOne({ where: { user: { id: user.id }, model: { id: modelIdNum } } });
    if (userLink) limits = userLink.limits || {};
    else if (orgIds.length > 0) {
      const orgLink = await modelOrgRepo.findOne({ where: { organisation: { id: In(orgIds) }, model: { id: modelIdNum } } });
      if (orgLink) limits = orgLink.limits || {};
    }
    if (Object.keys(limits).length === 0) {
      const planCheck = await isModelAllowedForPlan(user.id, modelIdNum);
      if (planCheck.allowed) limits = planCheck.limits;
    }

    const maxTokens = Number(limits.tokens);
    const maxRequests = Number(limits.requests);
    if (Number.isFinite(maxTokens) && tokenCount > maxTokens) {
      ctx.set.status = 429;
      return { error: ctx.t('auth.tokenLimitExceeded') };
    }
    if (Number.isFinite(maxRequests) && requestCount > maxRequests) {
      ctx.set.status = 429;
      return { error: ctx.t('common.requestLimitExceeded') };
    }
    const usage = usageRepo.create({ userId: user.id, organisationId: orgIds[0], modelId: modelIdNum, tokens: tokenCount, requests: requestCount, timestamp: new Date() });
    await usageRepo.save(usage);
    try {
      const { aiEmitter } = require('../services/aiSocketService');
      aiEmitter.emit('usage', usage);
    } catch {}
    return { success: true };
  }, {beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 429: t.Object({ error: t.String() }) },
    detail: { summary: 'Record AI usage', tags: ['AI'] }
  });

  app.post(prefix + '/ai/chat', async (ctx: AIContext) => {
    const f = await requireFeature(ctx, 'ai'); if (f !== true) return f;
    const user = ctx.user as User | null;
    if (!user) {
      ctx.set.status = 401;
      return { error: ctx.t('auth.unauthorized') };
    }
    const { message, modelId, systemPrompt, history } = (ctx.body || {}) as Record<string, unknown>;
    if (!message) {
      ctx.set.status = 400;
      return { error: ctx.t('validation.messageRequired') };
    }

    let model: AIModel | null = null;
    const orgIds = await getUserOrgIds(user.id);
    if (modelId) {
      model = await modelRepo.findOneBy({ id: Number(modelId) });
    } else {
      const userLink = await modelUserRepo.findOne({ where: { user: { id: user.id } }, relations: {"model":true} });
      if (userLink) model = userLink.model;
      if (!model && orgIds.length > 0) {
        const orgLink = await modelOrgRepo.findOne({ where: { organisation: { id: In(orgIds) } }, relations: {"model":true} });
        if (orgLink) model = orgLink.model;
      }
      if (!model) {
        const planIds = await getUserPlanIds(user.id);
        if (planIds.length > 0) {
          const planLinks = await getPlanModelLinks(planIds);
          if (planLinks.length > 0) model = planLinks[0].model;
        }
      }
    }

    if (!model) {
      return { reply: 'No AI model is configured for your account. Contact your administrator to enable AI Chat.' };
    }

    try {
      const messages: { role: string; content: string }[] = [];
      if (typeof systemPrompt === 'string' && systemPrompt) messages.push({ role: 'system', content: systemPrompt });
      if (Array.isArray(history)) {
        for (const h of history) {
          if (!h || typeof h !== 'object') continue;
          const msg = h as Record<string, unknown>;
          if (typeof msg.role === 'string' && typeof msg.content === 'string') {
            messages.push({ role: msg.role, content: msg.content });
          }
        }
      }
      messages.push({ role: 'user', content: String(message) });

      const providerModel = resolveProviderModelId(model);
      try {
        const res = await requestWithFallback({
          model,
          path: '/v1/chat/completions',
          method: 'post',
          data: { model: providerModel, messages, max_tokens: 4096 },
          timeoutMs: 60000,
        }, endpointCooldowns, nowTs, async ({ model: rateModel, endpoint, waitMs }) => {
          await logEndpointCooldown(rateModel, endpoint.base, waitMs);
        });
        const payload = res.data as Record<string, unknown>;
        const choices = payload?.choices as Array<{ message?: { content?: unknown } }> | undefined;
        const aiReply = String(choices?.[0]?.message?.content || JSON.stringify(res.data));
        return { reply: aiReply };
      } catch {
        // hide provider internals from end user
        return { reply: 'AI service temporarily unavailable. Please try again shortly.' };
      }
    } catch (err) {
      console.error('[aiHandler:chat]', err);
      return { reply: 'AI service temporarily unavailable. Please try again shortly.' };
    }
  }, {beforeHandle: authenticate,
    response: { 200: t.Object({ reply: t.String() }), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }) },
    detail: { summary: 'Chat with AI model', tags: ['AI'] }
  });

  app.post(prefix + '/ai/openai/v1/chat/completions', async (ctx: AIContext) => {
    const f = await requireFeature(ctx, 'ai'); if (f !== true) return f;
    const user = ctx.user as User | null;
    if (!user) {
      ctx.set.status = 401;
      return { error: ctx.t('auth.unauthorized') };
    }
    const body = (ctx.body || {}) as Record<string, unknown>;
    const orgIds = await getUserOrgIds(user.id);

    let model: AIModel | null = null;
    if (body.modelId) {
      model = await modelRepo.findOneBy({ id: Number(body.modelId) });
    } else {
      const userLink = await modelUserRepo.findOne({ where: { user: { id: user.id } }, relations: {"model":true} });
      if (userLink) model = userLink.model;
      if (!model && orgIds.length > 0) {
        const orgLink = await modelOrgRepo.findOne({ where: { organisation: { id: In(orgIds) } }, relations: {"model":true} });
        if (orgLink) model = orgLink.model;
      }
      if (!model) {
        const planIds = await getUserPlanIds(user.id);
        if (planIds.length > 0) {
          const planLinks = await getPlanModelLinks(planIds);
          if (planLinks.length > 0) model = planLinks[0].model;
        }
      }
    }
    if (!model) {
      ctx.set.status = 400;
      return { error: ctx.t('system.noModelForAccount') };
    }

    const allowedUserLink = await modelUserRepo.findOne({ where: { user: { id: user.id }, model: { id: model.id } } });
    let allowed = !!allowedUserLink;
    if (!allowed && orgIds.length > 0) {
      const orgLink = await modelOrgRepo.findOne({ where: { organisation: { id: In(orgIds) }, model: { id: model.id } } });
      if (orgLink) allowed = true;
    }
    if (!allowed) {
      const planCheck = await isModelAllowedForPlan(user.id, model.id);
      if (planCheck.allowed) allowed = true;
    }
    if (!allowed) {
      ctx.set.status = 403;
      return { error: ctx.t('system.noAccessToModel') };
    }

    try {
      const forwardBody: Record<string, unknown> = { ...body };
      delete forwardBody.model;
      forwardBody.model = resolveProviderModelId(model);
      try {
        const res = await requestWithFallback({ model, path: '/v1/chat/completions', method: 'post', data: forwardBody, timeoutMs: 60000 }, endpointCooldowns, nowTs, async ({ model: rateModel, endpoint, waitMs }) => {
          await logEndpointCooldown(rateModel, endpoint.base, waitMs);
        });
        return res.data;
      } catch {
        ctx.set.status = 502;
        return { error: ctx.t('system.aiUnavailable') };
      }
    } catch (err) {
      ctx.set.status = 502;
      console.error('[aiHandler:chat-completions-proxy]', err);
      return { error: ctx.t('system.aiUnavailable') };
    }
  }, {beforeHandle: authenticate,
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'OpenAI compatible chat completions proxy', tags: ['AI'] }
  });

  app.post(prefix + '/ai/openai/v1/completions', async (ctx: AIContext) => {
    const f = await requireFeature(ctx, 'ai'); if (f !== true) return f;
    const user = ctx.user as User | null;
    if (!user) {
      ctx.set.status = 401;
      return { error: ctx.t('auth.unauthorized') };
    }
    const body = (ctx.body || {}) as Record<string, unknown>;
    const orgIds = await getUserOrgIds(user.id);

    let model: AIModel | null = null;
    if (body.modelId) {
      model = await modelRepo.findOneBy({ id: Number(body.modelId) });
    } else {
      const userLink = await modelUserRepo.findOne({ where: { user: { id: user.id } }, relations: {"model":true} });
      if (userLink) model = userLink.model;
      if (!model && orgIds.length > 0) {
        const orgLink = await modelOrgRepo.findOne({ where: { organisation: { id: In(orgIds) } }, relations: {"model":true} });
        if (orgLink) model = orgLink.model;
      }
      if (!model) {
        const planIds = await getUserPlanIds(user.id);
        if (planIds.length > 0) {
          const planLinks = await getPlanModelLinks(planIds);
          if (planLinks.length > 0) model = planLinks[0].model;
        }
      }
    }
    if (!model) {
      ctx.set.status = 400;
      return { error: ctx.t('system.noModelForAccount') };
    }

    const allowedUserLink = await modelUserRepo.findOne({ where: { user: { id: user.id }, model: { id: model.id } } });
    let allowed = !!allowedUserLink;
    if (!allowed && orgIds.length > 0) {
      const orgLink = await modelOrgRepo.findOne({ where: { organisation: { id: In(orgIds) }, model: { id: model.id } } });
      if (orgLink) allowed = true;
    }
    if (!allowed) {
      const planCheck = await isModelAllowedForPlan(user.id, model.id);
      if (planCheck.allowed) allowed = true;
    }
    if (!allowed) {
      ctx.set.status = 403;
      return { error: ctx.t('system.noAccessToModel') };
    }

    try {
      const forwardBody: Record<string, unknown> = { ...body };
      delete forwardBody.model;
      forwardBody.model = resolveProviderModelId(model);
      try {
        const res = await requestWithFallback({ model, path: '/v1/completions', method: 'post', data: forwardBody, timeoutMs: 60000 }, endpointCooldowns, nowTs, async ({ model: rateModel, endpoint, waitMs }) => {
          await logEndpointCooldown(rateModel, endpoint.base, waitMs);
        });
        return res.data;
      } catch {
        ctx.set.status = 502;
        return { error: ctx.t('system.aiUnavailable') };
      }
    } catch (err) {
      ctx.set.status = 502;
      console.error('[aiHandler:completions-proxy]', err);
      return { error: ctx.t('system.aiUnavailable') };
    }
  }, {beforeHandle: authenticate,
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'OpenAI compatible completions proxy', tags: ['AI'] }
  });

  app.all(prefix + '/ai/proxy/:id/*', async (ctx: AIContext) => {
    const f = await requireFeature(ctx, 'ai'); if (f !== true) return f;
    const model = await modelRepo.findOneBy({ id: Number(ctx.params['id']) });
    if (!model) {
      ctx.set.status = 404;
      return { error: ctx.t('common.modelNotFound') };
    }

    const user = ctx.user as User | null;
    if (!user) {
      ctx.set.status = 401;
      return { error: ctx.t('auth.unauthorized') };
    }
    const orgIds = await getUserOrgIds(user.id);
    let allowed = false;
    const userLink = await modelUserRepo.findOne({ where: { user: { id: user.id }, model: { id: model.id } } });
    if (userLink) allowed = true;
    if (!allowed && orgIds.length > 0) {
      const orgLink = await modelOrgRepo.findOne({ where: { organisation: { id: In(orgIds) }, model: { id: model.id } } });
      if (orgLink) allowed = true;
    }
    if (!allowed) {
      const planCheck = await isModelAllowedForPlan(user.id, model.id);
      if (planCheck.allowed) allowed = true;
    }
    if (!allowed) {
      ctx.set.status = 403;
      return { error: ctx.t('system.noAccessToModel') };
    }

    const restPath = ctx.params['*'];
    const endpoints = extractEndpoints(model);
    const errs: Array<Record<string, unknown>> = [];
    for (const ep of endpoints) {
      const key = ep.id || ep.base;
      const cooldown = endpointCooldowns.get(key) || 0;
      if (cooldown > nowTs()) {
        errs.push({ endpoint: ep.base, reason: 'cooldown' });
        continue;
      }
      const url = `${ep.base.replace(/\/$/, '')}/${restPath}`;
      const headers: Record<string, string> =
        ctx.headers && typeof (ctx.headers as { get?: unknown }).get !== 'function'
          ? { ...(ctx.headers as Record<string, string>) }
          : {};
      if (ep.apiKey) headers.authorization = `Bearer ${ep.apiKey}`;
      delete headers.host;
      try {
        const method = String(ctx.method || 'GET').toUpperCase();
        const res2 = await fetch(url, {
          method,
          headers,
          body: ['GET', 'HEAD'].includes(method) ? undefined : (ctx.raw as BodyInit | null | undefined),
        });
        const response = new Response(res2.body, { status: res2.status, headers: res2.headers });
        return response;
      } catch (error) {
        const e = error as { response?: { status?: number; data?: Record<string, unknown>; headers?: Record<string, unknown> } };
        const status = e.response?.status;
        const body = e.response?.data;
        const isRate = status === 429 || (body && (String(body?.type || '').includes('rate') || String(body?.code || '').includes('rate')));
        if (isRate) {
          const ra = Number(e.response?.headers?.['retry-after'] || e.response?.headers?.['x-retry-after'] || 0);
          const wait = (Number.isFinite(ra) && ra > 0) ? (ra * 1000) : 5000;
          endpointCooldowns.set(key, nowTs() + wait + 50);
          errs.push({ endpoint: ep.base, reason: 'rate_limited', wait });
          continue;
        }
        console.error(`[aiHandler:requestWithFallback2] endpoint ${ep.base}:`, e);
        errs.push({ endpoint: ep.base, reason: 'endpoint_error', status });
        continue;
      }
    }

    ctx.set.status = 502;
    return { error: ctx.t('system.aiUnavailable') };
  }, {beforeHandle: authenticate,
    detail: { summary: 'Proxy request to AI model endpoint', tags: ['AI'] }
  });

  app.get(prefix + '/admin/ai/models', async (ctx: AIContext) => {
    const adminCheck = requireAiManagement(ctx);
    if (adminCheck !== true) return adminCheck;
    const models = await modelRepo.find();
    return models;
  }, {beforeHandle: authenticate,
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Admin list AI models', tags: ['AI'] }
  });

  app.get(prefix + '/admin/ai/cooldowns', async (ctx: AIContext) => {
    const adminCheck = requireAiManagement(ctx);
    if (adminCheck !== true) return adminCheck;
    try {
      const rows = await redisClient.lrange('admin:ai:cooldowns', 0, 99);
      const parsed = rows.map((r: string) => {
        try { return JSON.parse(r); } catch { return r; }
      });
      return parsed;
    } catch {
      ctx.set.status = 500;
      return { error: ctx.t('node.cooldownReadFailed') };
    }
  }, { beforeHandle: authenticate, response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) }, detail: { summary: 'Recent AI endpoint cooldowns (24h)', tags: ['AI','Admin'] } });

  function isValidEndpointUrl(url: unknown): boolean {
    if (!url || typeof url !== 'string') return false;
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  function validateModelEndpoints(body: unknown): string | null {
    const parsedBody = (body && typeof body === 'object' ? body : {}) as {
      endpoint?: unknown;
      endpoints?: Array<Record<string, unknown>>;
    };
    const { endpoint, endpoints } = parsedBody;
    if (endpoint && !isValidEndpointUrl(endpoint)) return 'Invalid endpoint URL';
    if (Array.isArray(endpoints)) {
      for (let i = 0; i < endpoints.length; i++) {
        const ep = endpoints[i];
        if (!ep) continue;
        const url = ep.endpoint || ep.url;
        if (url && !isValidEndpointUrl(url)) return `Invalid endpoint URL at index ${i}`;
      }
    }
    return null;
  }

  app.post(prefix + '/admin/ai/models', async (ctx: AIContext) => {
    const adminCheck = requireAiManagement(ctx);
    if (adminCheck !== true) return adminCheck;
    const err = validateModelEndpoints(ctx.body);
    if (err) {
      ctx.set.status = 400;
      return { error: err };
    }
    const { name, config, limits, tags, endpoint, apiKey, endpoints } = (ctx.body || {}) as Record<string, unknown>;
    const model = modelRepo.create({
      name: String(name || ''),
      config: (config && typeof config === 'object' ? (config as Record<string, unknown>) : undefined) as AIModel['config'],
      limits: (limits && typeof limits === 'object' ? (limits as Record<string, unknown>) : undefined) as AIModel['limits'],
      tags: Array.isArray(tags) ? tags.map(String) : undefined,
      endpoint: typeof endpoint === 'string' ? endpoint : undefined,
      apiKey: typeof apiKey === 'string' ? apiKey : undefined,
      endpoints: Array.isArray(endpoints)
        ? (endpoints as Array<Record<string, unknown>>).map((ep) => ({
            id: typeof ep.id === 'string' ? ep.id : undefined,
            endpoint: typeof ep.endpoint === 'string' ? ep.endpoint : undefined,
            url: typeof ep.url === 'string' ? ep.url : undefined,
            apiKey: typeof ep.apiKey === 'string' ? ep.apiKey : undefined,
            key: typeof ep.key === 'string' ? ep.key : undefined,
          }))
        : undefined,
    });
    await modelRepo.save(model);
    return model;
  }, {beforeHandle: authenticate,
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Admin create AI model', tags: ['AI'] }
  });

  app.put(prefix + '/admin/ai/models/:id', async (ctx: AIContext) => {
    const adminCheck = requireAiManagement(ctx);
    if (adminCheck !== true) return adminCheck;
    const model = await modelRepo.findOneBy({ id: Number(ctx.params['id']) });
    if (!model) {
      ctx.set.status = 404;
      return { error: ctx.t('common.modelNotFound') };
    }
    const err = validateModelEndpoints(ctx.body);
    if (err) {
      ctx.set.status = 400;
      return { error: err };
    }
    const { name, config, limits, tags, endpoint, apiKey, endpoints } = (ctx.body || {}) as Record<string, unknown>;
    Object.assign(model, { name, config, limits, tags, endpoint, apiKey, endpoints });
    await modelRepo.save(model);
    return model;
  }, {beforeHandle: authenticate,
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Admin update AI model', tags: ['AI'] }
  });

  app.delete(prefix + '/admin/ai/models/:id', async (ctx: AIContext) => {
    const adminCheck = requireAiManagement(ctx);
    if (adminCheck !== true) return adminCheck;
    const model = await modelRepo.findOneBy({ id: Number(ctx.params['id']) });
    if (!model) {
      ctx.set.status = 404;
      return { error: ctx.t('common.modelNotFound') };
    }
    await modelRepo.remove(model);
    return { success: true };
  }, {beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Admin delete AI model', tags: ['AI'] }
  });

  app.get(prefix + '/admin/ai/plans/:planId/models', async (ctx: AIContext) => {
    const adminCheck = requireAiManagement(ctx);
    if (adminCheck !== true) return adminCheck;
    const planId = Number(ctx.params['planId']);
    const planRepo = AppDataSource.getRepository(Plan);
    const plan = await planRepo.findOneBy({ id: planId });
    if (!plan) {
      ctx.set.status = 404;
      return { error: 'Plan not found' };
    }
    const links = await modelPlanRepo.find({ where: { plan: { id: planId } }, relations: { model: true } });
    return links.map(l => {
      const { apiKey, endpoint, ...safeModel } = l.model || {};
      return { id: l.id, model: safeModel, limits: l.limits };
    });
  }, {beforeHandle: authenticate,
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'List AI models assigned to a plan', tags: ['AI'] }
  });

  app.post(prefix + '/admin/ai/models/:id/link-plan', async (ctx: AIContext) => {
    const adminCheck = requireAiManagement(ctx);
    if (adminCheck !== true) return adminCheck;
    const model = await modelRepo.findOneBy({ id: Number(ctx.params['id']) });
    if (!model) {
      ctx.set.status = 404;
      return { error: ctx.t('common.modelNotFound') };
    }
    const { planId, limits } = (ctx.body || {}) as Record<string, unknown>;
    const planIdNum = Number(planId);
    const planRepo = AppDataSource.getRepository(Plan);
    const plan = await planRepo.findOneBy({ id: planIdNum });
    if (!plan) {
      ctx.set.status = 404;
      return { error: 'Plan not found' };
    }
    const existing = await modelPlanRepo.findOne({ where: { model: { id: model.id }, plan: { id: planIdNum } } });
    if (existing) {
      if (limits !== undefined) {
        existing.limits = limits;
        await modelPlanRepo.save(existing);
      }
      return { success: true, link: existing, updated: true };
    }
    const link = modelPlanRepo.create({ model, plan, limits });
    await modelPlanRepo.save(link);
    return { success: true, link };
  }, {beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean(), link: t.Any(), updated: t.Optional(t.Boolean()) }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Link AI model to plan (Admin only)', tags: ['AI'] }
  });

  app.delete(prefix + '/admin/ai/models/:id/unlink-plan/:planId', async (ctx: AIContext) => {
    const adminCheck = requireAiManagement(ctx);
    if (adminCheck !== true) return adminCheck;
    const modelId = Number(ctx.params['id']);
    const planId = Number(ctx.params['planId']);
    const link = await modelPlanRepo.findOne({ where: { model: { id: modelId }, plan: { id: planId } } });
    if (!link) {
      ctx.set.status = 404;
      return { error: 'Link not found' };
    }
    await modelPlanRepo.remove(link);
    return { success: true };
  }, {beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Unlink AI model from plan (Admin only)', tags: ['AI'] }
  });
}