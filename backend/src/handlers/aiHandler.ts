import { AppDataSource } from '../config/typeorm';
import { AIModel } from '../models/aiModel.entity';
import { AIModelUser } from '../models/aiModelUser.entity';
import { AIModelOrg } from '../models/aiModelOrg.entity';
import { authenticate } from '../middleware/auth';
import { authorize, hasPermissionSync } from '../middleware/authorize';
import { requireFeature } from '../middleware/featureToggle';
import axios from 'axios';
import { redisClient } from '../config/redis';
import { createActivityLog } from './logHandler';
import { AIUsage } from '../models/aiUsage.entity';
import { User } from '../models/user.entity';
import { t } from 'elysia';
import { In } from 'typeorm';

// I swear I hate this route handler, 
// its a dumping ground ngl
function requireAdmin(ctx: any): true | { error: string } {
  const user = ctx.user as User | undefined;
  if (!user) {
    ctx.set.status = 401;
    return { error: 'Unauthenticated' };
  }
  if (!hasPermissionSync(ctx, 'admin:access')) {
    ctx.set.status = 403;
    return { error: 'Forbidden' };
  }
  return true;
}

// There is no mercy for the unclean.
// This code should burn in hell
// TODO: refactor this entire file, its a mess
// TBH not refacturing it
export async function aiRoutes(app: any, prefix = '') {
  const modelRepo = AppDataSource.getRepository(AIModel);
  const modelUserRepo = AppDataSource.getRepository(AIModelUser);
  const modelOrgRepo = AppDataSource.getRepository(AIModelOrg);
  const orgMemberRepo = AppDataSource.getRepository(require('../models/organisationMember.entity').OrganisationMember);
  const usageRepo = AppDataSource.getRepository(AIUsage);
  const endpointCooldowns: Map<string, number> = new Map();

  async function getUserOrgIds(userId: number): Promise<number[]> {
    const memberships = await orgMemberRepo.find({ where: { userId } });
    return memberships.map((m: any) => Number(m.organisationId)).filter((v: number) => Number.isFinite(v));
  }

  function nowTs() { return Date.now(); }

  function extractEndpoints(model: any): Array<{ base: string; apiKey?: string; id?: string }> {
    const list: Array<{ base: string; apiKey?: string; id?: string }> = [];
    try {
      if (Array.isArray(model?.endpoints) && model.endpoints.length) {
        for (const e of model.endpoints) {
          if (!e) continue;
          const base = (e.endpoint || e.url || '').toString().replace(/\/v1.*$/i, '').replace(/\/+$/, '');
          if (!base) continue;
          list.push({ base, apiKey: e.apiKey || e.key || undefined, id: e.id || base });
        }
      }
    } catch { }
    if (list.length === 0 && model?.endpoint) {
      list.push({ base: model.endpoint.toString().replace(/\/v1.*$/i, '').replace(/\/+$/, ''), apiKey: model.apiKey || undefined, id: model.endpoint });
    }
    return list;
  }

  async function requestWithFallback(opts: { model: any; path: string; method?: 'post'|'get'|'put'|'delete'; data?: any; headers?: Record<string, any>; timeoutMs?: number }) {
    const { model, path, method = 'post', data, headers = {}, timeoutMs = 60000 } = opts;
    const endpoints = extractEndpoints(model);
    if (endpoints.length === 0) throw new Error('No endpoints configured');

    const errs: any[] = [];
    for (const ep of endpoints) {
      const key = ep.id || ep.base;
      const cooldown = endpointCooldowns.get(key) || 0;
      if (cooldown > nowTs()) {
        errs.push({ endpoint: ep.base, reason: 'cooldown' });
        continue;
      }

      const url = `${ep.base.replace(/\/$/, '')}${path.startsWith('/') ? path : '/' + path}`;
      const hdrs = { ...(headers || {}), Authorization: `Bearer ${ep.apiKey || ''}`, 'Content-Type': 'application/json' } as any;
      try {
        const res = await axios.request({ method: method as any, url, data, headers: hdrs, timeout: timeoutMs });
        return res;
      } catch (e: any) {
        const status = e.response?.status;
        const body = e.response?.data;
        const isRate = status === 429 || (body && (String(body?.type || '').includes('rate') || String(body?.code || '').includes('rate') || String(body?.error || '').toLowerCase().includes('rate')));
        if (isRate) {
          const ra = Number(e.response?.headers?.['retry-after'] || e.response?.headers?.['x-retry-after'] || 0);
          const wait = (Number.isFinite(ra) && ra > 0) ? (ra * 1000) : 5000;
          endpointCooldowns.set(key, nowTs() + wait + 50);
          errs.push({ endpoint: ep.base, reason: 'rate_limited', wait });
          try {
            const entry = { timestamp: new Date().toISOString(), modelId: model?.id, modelName: model?.name, endpoint: ep.base, waitMs: wait };
            try { await redisClient.lPush('admin:ai:cooldowns', JSON.stringify(entry)); } catch (e) { /* ignore redis push errors */ }
            try { await redisClient.expire('admin:ai:cooldowns', 24 * 60 * 60); } catch (e) { /* ignore */ }
            try { await createActivityLog({ userId: 0, action: 'ai:endpoint:cooldown', targetId: String(model?.id || ''), targetType: 'ai-model', metadata: entry, ipAddress: '', notify: false }); } catch (e) { /* ignore */ }
          } catch (e) { /* meow */ }
          continue;
        }

        errs.push({ endpoint: ep.base, reason: e.message || 'error', status });
        continue;
      }
    }

    const err = new Error('All endpoints failed');
    (err as any).details = errs;
    throw err;
  }

  function resolveProviderModelId(model: any) {
    const providerId = model?.config?.modelId || model?.name;
    if (!providerId || typeof providerId !== 'string') {
      throw new Error('AI model is misconfigured: missing model identifier (expected e.g. "gpt-3.5-turbo").');
    }
    if (/^\d+$/.test(providerId)) {
      throw new Error('AI model is misconfigured: model identifier appears to be a numeric ID. Set config.modelId to an actual provider model name (e.g. "gpt-4").');
    }
    return providerId;
  }

  app.post(prefix + '/ai/models', async (ctx: any) => {
    const f = await requireFeature(ctx, 'ai'); if (f !== true) return f;
    const adminCheck = requireAdmin(ctx);
    if (adminCheck !== true) return adminCheck;
    const body = ctx.body as Partial<AIModel>;
    const model = modelRepo.create(body);
    await modelRepo.save(model);
    return { success: true, model };
  }, {beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean(), model: t.Any() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Create AI model (Admin only)', tags: ['AI'] }
  });

  app.get(prefix + '/ai/models', async (ctx: any) => {
    const f = await requireFeature(ctx, 'ai'); if (f !== true) return f;
    const models = await modelRepo.find();
    const safe = models.map((m: any) => {
      const { apiKey, endpoint, ...rest } = m || {};
      return rest;
    });
    return safe;
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }) },
    detail: { summary: 'List AI models (authenticated users)', tags: ['AI'] }
  });

  app.post(prefix + '/ai/models/:id/link-user', async (ctx: any) => {
    const f = await requireFeature(ctx, 'ai'); if (f !== true) return f;
    const adminCheck = requireAdmin(ctx);
    if (adminCheck !== true) return adminCheck;
    const model = await modelRepo.findOneBy({ id: Number(ctx.params['id']) });
    if (!model) {
      ctx.set.status = 404;
      return { error: 'Model not found' };
    }
    const { userId, limits } = ctx.body as any;
    const user = await AppDataSource.getRepository(User).findOneBy({ id: userId });
    if (!user) {
      ctx.set.status = 404;
      return { error: 'User not found' };
    }
    const existing = await modelUserRepo.findOne({ where: { model: { id: model.id }, user: { id: userId } } });
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

  app.post(prefix + '/ai/models/:id/link-org', async (ctx: any) => {
    const f = await requireFeature(ctx, 'ai'); if (f !== true) return f;
    const adminCheck = requireAdmin(ctx);
    if (adminCheck !== true) return adminCheck;
    const model = await modelRepo.findOneBy({ id: Number(ctx.params['id']) });
    if (!model) {
      ctx.set.status = 404;
      return { error: 'Model not found' };
    }
    const { orgId, limits } = ctx.body as any;
    const org = await AppDataSource.getRepository(require('../models/organisation.entity').Organisation).findOneBy({ id: orgId });
    if (!org) {
      ctx.set.status = 404;
      return { error: 'Organisation not found' };
    }
    const link = modelOrgRepo.create({ model, organisation: org, limits });
    await modelOrgRepo.save(link);
    return { success: true, link };
  }, {beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean(), link: t.Any() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Link AI model to organisation (Admin only)', tags: ['AI'] }
  });

  app.get(prefix + '/ai/my-models', async (ctx: any) => {
    const f = await requireFeature(ctx, 'ai'); if (f !== true) return f;
    const user = ctx.user as any;
    const links = await modelUserRepo.find({ where: { user: { id: user.id } }, relations: ['model'] });
    const models = links.map((l) => {
      const { apiKey, endpoint, ...safeModel } = l.model || {};
      return { model: safeModel, limits: l.limits };
    });
    const orgIds = await getUserOrgIds(user.id);
    if (orgIds.length > 0) {
      const orgLinks = await modelOrgRepo.find({ where: { organisation: { id: In(orgIds) } } as any, relations: ['model'] });
      models.push(...orgLinks.map((l) => {
        const { apiKey, endpoint, ...safeModel } = l.model || {};
        return { model: safeModel, limits: l.limits };
      }));
    }
    return models;
  }, {beforeHandle: authenticate,
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }) },
    detail: { summary: 'Get models available to current user', tags: ['AI'] }
  });

  app.post(prefix + '/ai/use', async (ctx: any) => {
    const f = await requireFeature(ctx, 'ai'); if (f !== true) return f;
    const user = ctx.user as any;
    const { modelId, tokens = 0, requests = 0 } = ctx.body as any;
    let limits: any = {};
    const orgIds = await getUserOrgIds(user.id);
    const userLink = await modelUserRepo.findOne({ where: { user: { id: user.id }, model: { id: modelId } } });
    if (userLink) limits = userLink.limits || {};
    else if (orgIds.length > 0) {
      const orgLink = await modelOrgRepo.findOne({ where: { organisation: { id: In(orgIds) }, model: { id: modelId } } as any });
      if (orgLink) limits = orgLink.limits || {};
    }

    if (user.demoExpiresAt && new Date(user.demoExpiresAt) > new Date() && user.demoLimits) {
      limits = {
        tokens: typeof user.demoLimits.tokens === 'number'
          ? Math.min(limits.tokens ?? Infinity, user.demoLimits.tokens)
          : limits.tokens,
        requests: typeof user.demoLimits.requests === 'number'
          ? Math.min(limits.requests ?? Infinity, user.demoLimits.requests)
          : limits.requests,
      };
    }

    if (limits.tokens != null && tokens > limits.tokens) {
      ctx.set.status = 429;
      return { error: 'Token limit exceeded' };
    }
    if (limits.requests != null && requests > limits.requests) {
      ctx.set.status = 429;
      return { error: 'Request limit exceeded' };
    }
    const usage = usageRepo.create({ userId: user.id, organisationId: orgIds[0], modelId, tokens, requests, timestamp: new Date() });
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

  app.post(prefix + '/ai/chat', async (ctx: any) => {
    const f = await requireFeature(ctx, 'ai'); if (f !== true) return f;
    const user = ctx.user as any;
    const { message, modelId, systemPrompt, history } = ctx.body as any;
    if (!message) {
      ctx.set.status = 400;
      return { error: 'message required' };
    }

    let model: any;
    const orgIds = await getUserOrgIds(user.id);
    if (modelId) {
      model = await modelRepo.findOneBy({ id: Number(modelId) });
    } else {
      const userLink = await modelUserRepo.findOne({ where: { user: { id: user.id } }, relations: ['model'] });
      if (userLink) model = userLink.model;
      if (!model && orgIds.length > 0) {
        const orgLink = await modelOrgRepo.findOne({ where: { organisation: { id: In(orgIds) } } as any, relations: ['model'] });
        if (orgLink) model = orgLink.model;
      }
    }

    if (!model) {
      return { reply: 'No AI model is configured for your account. Contact your administrator to enable AI Chat.' };
    }

    try {
      const messages: { role: string; content: string }[] = [];
      if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
      if (Array.isArray(history)) {
        for (const h of history) {
          if (h.role && h.content) messages.push({ role: h.role, content: h.content });
        }
      }
      messages.push({ role: 'user', content: message });

      const providerModel = resolveProviderModelId(model);
      try {
        const res = await requestWithFallback({
          model,
          path: '/v1/chat/completions',
          method: 'post',
          data: { model: providerModel, messages, max_tokens: 4096 },
          timeoutMs: 60000,
        });
        const aiReply = res.data?.choices?.[0]?.message?.content || JSON.stringify(res.data);
        return { reply: aiReply };
      } catch (e: any) {
        // hide provider internals from end user
        return { reply: 'AI service temporarily unavailable. Please try again shortly.' };
      }
    } catch (err: any) {
      const status = err.response?.status;
      const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      return { reply: `AI service error (${status ?? 'network'}): ${detail}` };
    }
  }, {beforeHandle: authenticate,
    response: { 200: t.Object({ reply: t.String() }), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }) },
    detail: { summary: 'Chat with AI model', tags: ['AI'] }
  });

  app.post(prefix + '/ai/openai/v1/chat/completions', async (ctx: any) => {
    const f = await requireFeature(ctx, 'ai'); if (f !== true) return f;
    const user = ctx.user as any;
    const body = ctx.body || {};
    const orgIds = await getUserOrgIds(user.id);

    let model: any;
    if (body.modelId) {
      model = await modelRepo.findOneBy({ id: Number(body.modelId) });
    } else {
      const userLink = await modelUserRepo.findOne({ where: { user: { id: user.id } }, relations: ['model'] });
      if (userLink) model = userLink.model;
      if (!model && orgIds.length > 0) {
        const orgLink = await modelOrgRepo.findOne({ where: { organisation: { id: In(orgIds) } } as any, relations: ['model'] });
        if (orgLink) model = orgLink.model;
      }
    }
    if (!model) {
      ctx.set.status = 400;
      return { error: 'No model configured for your account' };
    }

    const allowedUserLink = await modelUserRepo.findOne({ where: { user: { id: user.id }, model: { id: model.id } } });
    let allowed = !!allowedUserLink;
    if (!allowed && orgIds.length > 0) {
      const orgLink = await modelOrgRepo.findOne({ where: { organisation: { id: In(orgIds) }, model: { id: model.id } } as any });
      if (orgLink) allowed = true;
    }
    if (!allowed) {
      ctx.set.status = 403;
      return { error: 'no access to model' };
    }

    try {
      const baseUrl = (model.endpoint || '').replace(/\/+$/g, '').replace(/\/v1(\/chat(\/completions)?)?$/g, '');
      const url = `${baseUrl}/v1/chat/completions`;
      const forwardBody = { ...(body || {}) };
      delete (forwardBody as any).model;
      forwardBody.model = resolveProviderModelId(model);
      try {
        const res = await requestWithFallback({ model, path: '/v1/chat/completions', method: 'post', data: forwardBody, timeoutMs: 60000 });
        return res.data;
      } catch (e: any) {
        ctx.set.status = 502;
        return { error: 'AI service temporarily unavailable' };
      }
    } catch (err: any) {
      const status = err.response?.status;
      const detail = err.response?.data ? err.response.data : err.message;
      ctx.set.status = status || 502;
      return { error: typeof detail === 'string' ? detail : JSON.stringify(detail) };
    }
  }, {beforeHandle: authenticate,
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'OpenAI compatible chat completions proxy', tags: ['AI'] }
  });

  app.post(prefix + '/ai/openai/v1/completions', async (ctx: any) => {
    const f = await requireFeature(ctx, 'ai'); if (f !== true) return f;
    const user = ctx.user as any;
    const body = ctx.body || {};
    const orgIds = await getUserOrgIds(user.id);

    let model: any;
    if (body.modelId) {
      model = await modelRepo.findOneBy({ id: Number(body.modelId) });
    } else {
      const userLink = await modelUserRepo.findOne({ where: { user: { id: user.id } }, relations: ['model'] });
      if (userLink) model = userLink.model;
      if (!model && orgIds.length > 0) {
        const orgLink = await modelOrgRepo.findOne({ where: { organisation: { id: In(orgIds) } } as any, relations: ['model'] });
        if (orgLink) model = orgLink.model;
      }
    }
    if (!model) {
      ctx.set.status = 400;
      return { error: 'No model configured for your account' };
    }

    const allowedUserLink = await modelUserRepo.findOne({ where: { user: { id: user.id }, model: { id: model.id } } });
    let allowed = !!allowedUserLink;
    if (!allowed && orgIds.length > 0) {
      const orgLink = await modelOrgRepo.findOne({ where: { organisation: { id: In(orgIds) }, model: { id: model.id } } as any });
      if (orgLink) allowed = true;
    }
    if (!allowed) {
      ctx.set.status = 403;
      return { error: 'no access to model' };
    }

    try {
      const baseUrl = (model.endpoint || '').replace(/\/+$/g, '').replace(/\/v1(\/completions)?$/g, '');
      const url = `${baseUrl}/v1/completions`;
      const forwardBody = { ...(body || {}) };
      delete (forwardBody as any).model;
      forwardBody.model = resolveProviderModelId(model);
      try {
        const res = await requestWithFallback({ model, path: '/v1/completions', method: 'post', data: forwardBody, timeoutMs: 60000 });
        return res.data;
      } catch (e: any) {
        ctx.set.status = 502;
        return { error: 'AI service temporarily unavailable' };
      }
    } catch (err: any) {
      const status = err.response?.status;
      const detail = err.response?.data ? err.response.data : err.message;
      ctx.set.status = status || 502;
      return { error: typeof detail === 'string' ? detail : JSON.stringify(detail) };
    }
  }, {beforeHandle: authenticate,
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'OpenAI compatible completions proxy', tags: ['AI'] }
  });

  app.all(prefix + '/ai/proxy/:id/*', async (ctx: any) => {
    const f = await requireFeature(ctx, 'ai'); if (f !== true) return f;
    const model = await modelRepo.findOneBy({ id: Number(ctx.params['id']) });
    if (!model) {
      ctx.set.status = 404;
      return { error: 'Model not found' };
    }

    const user = ctx.user;
    const orgIds = await getUserOrgIds(user.id);
    let allowed = false;
    const userLink = await modelUserRepo.findOne({ where: { user: { id: user.id }, model: { id: model.id } } });
    if (userLink) allowed = true;
    if (!allowed && orgIds.length > 0) {
      const orgLink = await modelOrgRepo.findOne({ where: { organisation: { id: In(orgIds) }, model: { id: model.id } } as any });
      if (orgLink) allowed = true;
    }
    if (!allowed) {
      ctx.set.status = 403;
      return { error: 'no access to model' };
    }

    const restPath = ctx.params['*'];
    const endpoints = extractEndpoints(model);
    const errs: any[] = [];
    for (const ep of endpoints) {
      const key = ep.id || ep.base;
      const cooldown = endpointCooldowns.get(key) || 0;
      if (cooldown > nowTs()) {
        errs.push({ endpoint: ep.base, reason: 'cooldown' });
        continue;
      }
      const url = `${ep.base.replace(/\/$/, '')}/${restPath}`;
      const headers: any = { ...ctx.headers };
      if (ep.apiKey) headers.authorization = `Bearer ${ep.apiKey}`;
      delete headers.host;
      try {
        const res2 = await axios({
          method: ctx.method as any,
          url,
          headers,
          data: ctx.raw,
          responseType: 'stream',
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        });
        const response = new Response(res2.data, { status: res2.status, headers: res2.headers as any });
        return response;
      } catch (e: any) {
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
        errs.push({ endpoint: ep.base, reason: e.message || 'error', status });
        continue;
      }
    }

    ctx.set.status = 502;
    return { error: 'AI service temporarily unavailable' };
  }, {beforeHandle: authenticate,
    detail: { summary: 'Proxy request to AI model endpoint', tags: ['AI'] }
  });

  app.get(prefix + '/admin/ai/models', async (ctx: any) => {
    const f = await requireFeature(ctx, 'ai'); if (f !== true) return f;
    const adminCheck = requireAdmin(ctx);
    if (adminCheck !== true) return adminCheck;
    const models = await modelRepo.find();
    return models;
  }, {beforeHandle: authenticate,
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Admin list AI models', tags: ['AI'] }
  });

  app.get(prefix + '/admin/ai/cooldowns', async (ctx: any) => {
    const f = await requireFeature(ctx, 'ai'); if (f !== true) return f;
    const adminCheck = requireAdmin(ctx);
    if (adminCheck !== true) return adminCheck;
    try {
      const rows = await redisClient.lRange('admin:ai:cooldowns', 0, 99);
      const parsed = rows.map((r: string) => {
        try { return JSON.parse(r); } catch { return r; }
      });
      return parsed;
    } catch (e: any) {
      ctx.set.status = 500;
      return { error: 'Failed to read cooldowns' };
    }
  }, { beforeHandle: authenticate, response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) }, detail: { summary: 'Recent AI endpoint cooldowns (24h)', tags: ['AI','Admin'] } });

  app.post(prefix + '/admin/ai/models', async (ctx: any) => {
    const adminCheck = requireAdmin(ctx);
    if (adminCheck !== true) return adminCheck;
    const body = ctx.body as Partial<AIModel>;
    const model = modelRepo.create(body);
    await modelRepo.save(model);
    return model;
  }, {beforeHandle: authenticate,
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Admin create AI model', tags: ['AI'] }
  });

  app.put(prefix + '/admin/ai/models/:id', async (ctx: any) => {
    const adminCheck = requireAdmin(ctx);
    if (adminCheck !== true) return adminCheck;
    const model = await modelRepo.findOneBy({ id: Number(ctx.params['id']) });
    if (!model) {
      ctx.set.status = 404;
      return { error: 'Model not found' };
    }
    Object.assign(model, ctx.body as Partial<AIModel>);
    await modelRepo.save(model);
    return model;
  }, {beforeHandle: authenticate,
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Admin update AI model', tags: ['AI'] }
  });

  app.delete(prefix + '/admin/ai/models/:id', async (ctx: any) => {
    const adminCheck = requireAdmin(ctx);
    if (adminCheck !== true) return adminCheck;
    const model = await modelRepo.findOneBy({ id: Number(ctx.params['id']) });
    if (!model) {
      ctx.set.status = 404;
      return { error: 'Model not found' };
    }
    await modelRepo.remove(model);
    return { success: true };
  }, {beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Admin delete AI model', tags: ['AI'] }
  });
}