import { httpRequest } from './http';
import type { EndpointInfo, ModelLike } from '../types/ai';

export function extractEndpoints(model: ModelLike | null | undefined): EndpointInfo[] {
  const list: EndpointInfo[] = [];
  try {
    if (Array.isArray(model?.endpoints) && model.endpoints.length) {
      for (const e of model.endpoints) {
        if (!e) continue;
        const endpoint = e.endpoint;
        const url = e.url;
        const base = String(endpoint || url || '').replace(/\/v1.*$/i, '').replace(/\/+$/, '');
        if (!base) continue;
        list.push({
          base,
          apiKey: (typeof e.apiKey === 'string' ? e.apiKey : typeof e.key === 'string' ? e.key : undefined),
          id: (typeof e.id === 'string' ? e.id : base),
        });
      }
    }
  } catch {
    // skip
  }

  if (list.length === 0 && model?.endpoint) {
    list.push({
      base: model.endpoint.toString().replace(/\/v1.*$/i, '').replace(/\/+$/, ''),
      apiKey: model.apiKey || undefined,
      id: model.endpoint,
    });
  }

  return list;
}

export function resolveProviderModelId(model: ModelLike): string {
  const providerId = model?.config?.modelId || model?.name;
  if (!providerId || typeof providerId !== 'string') {
    throw new Error('AI model is misconfigured: missing model identifier (expected e.g. "gpt-3.5-turbo").');
  }
  if (/^\d+$/.test(providerId)) {
    throw new Error('AI model is misconfigured: model identifier appears to be a numeric ID. Set config.modelId to an actual provider model name (e.g. "gpt-4").');
  }
  return providerId;
}

export async function requestWithFallback(
  opts: {
    model: ModelLike;
    path: string;
    method?: 'post' | 'get' | 'put' | 'delete';
    data?: unknown;
    headers?: Record<string, string>;
    timeoutMs?: number;
  },
  endpointCooldowns: Map<string, number>,
  nowTs: () => number,
  onRateLimited?: (info: {
    model: ModelLike;
    endpoint: EndpointInfo;
    waitMs: number;
  }) => Promise<void> | void
) {
  const { model, path, method = 'post', data, headers = {}, timeoutMs = 60000 } = opts;
  const endpoints = extractEndpoints(model);
  if (endpoints.length === 0) throw new Error('No endpoints configured');

  const errs: Array<Record<string, unknown>> = [];
  for (const ep of endpoints) {
    const key = ep.id || ep.base;
    const cooldown = endpointCooldowns.get(key) || 0;
    if (cooldown > nowTs()) {
      errs.push({ endpoint: ep.base, reason: 'cooldown' });
      continue;
    }

    const url = `${ep.base.replace(/\/$/, '')}${path.startsWith('/') ? path : '/' + path}`;
    const hdrs: Record<string, string> = {
      ...(headers || {}),
      Authorization: `Bearer ${ep.apiKey || ''}`,
      'Content-Type': 'application/json',
    };

    try {
      const res = await httpRequest(url, { method, body: data as never, headers: hdrs, timeoutMs });
      return res;
    } catch (error) {
      const e = error as {
        response?: { status?: number; data?: unknown; headers?: Record<string, unknown> };
      };
      const status = e.response?.status;
      const body = e.response?.data as Record<string, unknown> | undefined;
      const isRate =
        status === 429 ||
        (body &&
          (String(body?.type || '').includes('rate') ||
            String(body?.code || '').includes('rate') ||
            String(body?.error || '').toLowerCase().includes('rate')));

      if (isRate) {
        const ra = Number(
          e.response?.headers?.['retry-after'] || e.response?.headers?.['x-retry-after'] || 0
        );
        const wait = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 5000;
        endpointCooldowns.set(key, nowTs() + wait + 50);
        errs.push({ endpoint: ep.base, reason: 'rate_limited', wait });
        if (onRateLimited) {
          await onRateLimited({ model, endpoint: ep, waitMs: wait });
        }
        continue;
      }

      console.error(`[aiProvider:requestWithFallback] endpoint ${ep.base}:`, e);
      errs.push({ endpoint: ep.base, reason: 'endpoint_error', status });
      continue;
    }
  }

  const err = new Error('All endpoints failed') as Error & {
    details?: Array<Record<string, unknown>>;
  };
  err.details = errs;
  throw err;
}