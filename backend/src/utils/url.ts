export interface RequestHeaders {
  get?(name: string): string | null;
  [key: string]: unknown;
}

export interface RequestContextLike {
  headers?: RequestHeaders | Record<string, string>;
  protocol?: string;
  hostname?: string;
  host?: string;
  request?: {
    headers?: RequestHeaders;
  };
}

function getHeader(ctx: RequestContextLike, name: string): string | null {
  const lowerName = name.toLowerCase();

  if (ctx.headers) {
    if (typeof ctx.headers.get === 'function') {
      return ctx.headers.get(name) || ctx.headers.get(lowerName);
    }
    const headers = ctx.headers as Record<string, string>;
    return headers[name] || headers[lowerName] || null;
  }

  if (ctx.request?.headers) {
    if (typeof ctx.request.headers.get === 'function') {
      return ctx.request.headers.get(name) || ctx.request.headers.get(lowerName);
    }
    const headers = ctx.request.headers as Record<string, string>;
    return headers[name] || headers[lowerName] || null;
  }

  return null;
}

function isCorsWildcard(value: string): boolean {
  const trimmed = value.trim();
  return trimmed === '*' || trimmed.toLowerCase() === 'true';
}

function getBasePanelUrlFromEnv(): string {
  const rawUrl = process.env.PANEL_URL || process.env.FRONTEND_URL || '';
  if (rawUrl && !isCorsWildcard(rawUrl)) {
    return rawUrl.replace(/\/+$/, '');
  }
  return '';
}

export function getPanelUrl(ctx?: RequestContextLike): string {
  const fromEnv = getBasePanelUrlFromEnv();
  if (fromEnv) {
    return fromEnv;
  }

  if (!ctx) {
    return 'https://ecli.app';
  }

  const origin = getHeader(ctx, 'origin') || '';
  if (origin && !isCorsWildcard(origin)) {
    return origin.replace(/\/+$/, '');
  }

  try {
    const proto = getHeader(ctx, 'x-forwarded-proto') || ctx.protocol || 'https';
    const host = getHeader(ctx, 'host') || ctx.hostname || ctx.host || 'localhost';
    return `${proto}://${host}`;
  } catch {
    return 'https://ecli.app';
  }
}

export function resolvePanelBaseUrl(ctx?: RequestContextLike): string {
  return getPanelUrl(ctx);
}

export function getBackendUrl(ctx?: RequestContextLike): string {
  if (process.env.BACKEND_URL) {
    return process.env.BACKEND_URL.replace(/\/+$/, '');
  }

  if (!ctx) {
    return 'http://localhost:3000';
  }

  const proto = getHeader(ctx, 'x-forwarded-proto') || 'http';
  const host = getHeader(ctx, 'host') || 'localhost';
  return `${proto}://${host}`;
}

export function getFrontendHost(ctx?: RequestContextLike): string {
  if (!ctx) {
    return 'localhost';
  }

  const origin = getHeader(ctx, 'origin') || getHeader(ctx, 'referer');
  if (origin) {
    try {
      return new URL(origin).hostname;
    } catch {
      // parsing sucks istg
    }
  }

  if (typeof ctx.hostname === 'string' && ctx.hostname) {
    return ctx.hostname;
  }

  const hostHeader = getHeader(ctx, 'host');
  if (typeof hostHeader === 'string' && hostHeader) {
    return hostHeader.split(':')[0];
  }

  return 'localhost';
}

export function getCookieDomain(ctx?: RequestContextLike): string | null {
  if (process.env.JWT_COOKIE_DOMAIN) {
    return process.env.JWT_COOKIE_DOMAIN;
  }

  if (!ctx) {
    return null;
  }

  try {
    const host = getHeader(ctx, 'host') || '';
    const hostname = host.split(':')[0];
    const parts = hostname.split('.');

    if (parts.length <= 1) {
      return null;
    }

    if (parts.length > 2) {
      parts.shift();
    }

    return '.' + parts.join('.');
  } catch {
    return null;
  }
}

export function isSecureRequest(ctx: RequestContextLike): boolean {
  const forwardedProto = getHeader(ctx, 'x-forwarded-proto');
  return (
    process.env.JWT_COOKIE_SECURE === '1' || forwardedProto === 'https' || ctx.protocol === 'https'
  );
}

export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.origin;
  } catch {
    try {
      const withProto = url.startsWith('http') ? url : `https://${url}`;
      const parsed = new URL(withProto);
      return parsed.origin;
    } catch {
      return url.replace(/\/+$/, '');
    }
  }
}

export function normalizeOrigin(origin: unknown): string {
  if (!origin && origin !== '') {
    return '';
  }

  if (origin instanceof URL) {
    return origin.origin;
  }

  const str = typeof origin === 'string' ? origin : String(origin);
  return normalizeUrl(str);
}

export function getHostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function isSubdomainOf(subdomain: string, parent: string): boolean {
  const normalizedSub = subdomain.startsWith('.') ? subdomain : `.${subdomain}`;
  const normalizedParent = parent.startsWith('.') ? parent : `.${parent}`;
  return normalizedSub.endsWith(normalizedParent);
}
