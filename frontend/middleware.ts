import { NextRequest, NextResponse } from 'next/server';

const IP_REFRESH_INTERVAL = 24 * 60 * 60 * 1000;

const BYPASS_PATHS = [
  '/api',
  '/health',
  '/uploads',
  '/public',
  '/_next',
  '/static',
  '/favicon.ico',
  '/robots.txt',
];

const STATIC_EXT =
  /\.(js|css|png|jpg|jpeg|webp|svg|ico|json|xml|txt|woff2?|ttf|eot|map)$/i;

const SEO_BOT_PATTERNS = [
  'googlebot',
  'bingbot',
  'duckduckbot',
  'yandex',
  'baiduspider',
  'applebot',
  'slurp',
  'facebookexternalhit',
  'twitterbot',
  'linkedinbot',
  'slackbot',
  'discordbot',
  'telegrambot',
  'whatsapp',
  'curl',
  'wget',
  'bot',
  'crawler',
  'spider',
  'preview',
];

const PROTECTED_ROUTE_PREFIXES = ['/dashboard'];
const ADMIN_ROUTE_PREFIXES = ['/dashboard/admin'];
const AUTH_ROUTE_PREFIXES = ['/login', '/register'];
const ADMIN_PANEL_PERMISSIONS = [
  'admin:access'
];

interface MiddlewareSessionUser {
  role?: string;
  permissions?: string[];
}

interface CrawlerConfig {
  name: string;
  uaPatterns: string[];
  ipSources: string[];
  reverseDnsHosts?: string[];
}

const CRAWLER_CONFIGS: CrawlerConfig[] = [
  {
    name: 'Google',
    uaPatterns: [
      'googlebot',
      'adsbot-google',
      'mediapartners-google',
      'apis-google',
      'google-inspectiontool',
      'googleother',
      'google-extended',
      'feedfetcher-google',
      'google-site-verification',
      'google-read-aloud',
    ],
    ipSources: [
      'https://developers.google.com/static/search/apis/ipranges/common-crawlers.json',
      'https://developers.google.com/static/search/apis/ipranges/special-crawlers.json',
      'https://developers.google.com/static/search/apis/ipranges/user-triggered-fetchers.json',
      'https://developers.google.com/static/search/apis/ipranges/user-triggered-fetchers-google.json',
    ],
  },
  {
    name: 'Bing',
    uaPatterns: [
      'bingbot',
      'msnbot',
      'adidxbot',
      'bingpreview',
    ],
    ipSources: [
      'https://www.bing.com/toolbox/bingbot.json',
    ],
  },
  {
    name: 'DuckDuckGo',
    uaPatterns: [
      'duckduckbot',
      'duckduckgo-favicons-bot',
      'duckassistbot',
    ],
    ipSources: [],
    reverseDnsHosts: ['duckduckgo.com'],
  },
  {
    name: 'Yandex',
    uaPatterns: [
      'yandexbot',
      'yandexaccessibilitybot',
      'yandexmobilebot',
      'yandexdirectdyn',
      'yandexscreenshotbot',
      'yandeximages',
      'yandexvideo',
      'yandexmedia',
      'yandexpagechecker',
      'yandexnews',
      'yandexblogs',
      'yandexfavicons',
      'yandexwebmaster',
      'yandexmetrika',
    ],
    ipSources: [],
    reverseDnsHosts: ['yandex.ru', 'yandex.net', 'yandex.com'],
  },
  {
    name: 'Baidu',
    uaPatterns: [
      'baiduspider',
      'baiduspider-render',
      'baiduspider-image',
      'baiduspider-video',
      'baiduspider-news',
    ],
    ipSources: [],
    reverseDnsHosts: ['baidu.com', 'baidu.jp'],
  },
  {
    name: 'Apple',
    uaPatterns: [
      'applebot',
    ],
    ipSources: [],
    reverseDnsHosts: ['applebot.apple.com'],
  },
];

interface IPRangeCache {
  ipv4Ranges: { network: string; prefix: number }[];
  ipv6Ranges: { network: string; prefix: number }[];
  ipv4Exact: Set<string>;
  ipv6Exact: Set<string>;
  lastFetched: number;
  fetching: boolean;
}

const crawlerIPCaches = new Map<string, IPRangeCache>();

function getOrCreateCache(name: string): IPRangeCache {
  let cache = crawlerIPCaches.get(name);
  if (!cache) {
    cache = {
      ipv4Ranges: [],
      ipv6Ranges: [],
      ipv4Exact: new Set(),
      ipv6Exact: new Set(),
      lastFetched: 0,
      fetching: false,
    };
    crawlerIPCaches.set(name, cache);
  }
  return cache;
}

function ipv4ToNumber(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function expandIPv6(ip: string): string {
  ip = ip.split('%')[0];
  const halves = ip.split('::');
  let groups: string[];

  if (halves.length === 2) {
    const left = halves[0] ? halves[0].split(':') : [];
    const right = halves[1] ? halves[1].split(':') : [];
    const missing = 8 - left.length - right.length;
    groups = [...left, ...Array(missing).fill('0000'), ...right];
  } else {
    groups = ip.split(':');
  }

  return groups.map((g) => g.padStart(4, '0').toLowerCase()).join(':');
}

function ipv6ToBigInt(ip: string): bigint {
  const expanded = expandIPv6(ip);
  const hex = expanded.replace(/:/g, '');
  return BigInt('0x' + hex);
}

function parseCIDR(cidr: string): {
  network: string;
  prefix: number;
  isV6: boolean;
} {
  const [network, prefixStr] = cidr.split('/');
  const prefix = parseInt(prefixStr, 10);
  const isV6 = network.includes(':');
  return { network, prefix, isV6 };
}

function isIPv4InCIDR(ip: string, network: string, prefix: number): boolean {
  const ipNum = ipv4ToNumber(ip);
  const netNum = ipv4ToNumber(network);
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipNum & mask) === (netNum & mask);
}

function isIPv6InCIDR(ip: string, network: string, prefix: number): boolean {
  const ipBig = ipv6ToBigInt(ip);
  const netBig = ipv6ToBigInt(network);
  if (prefix === 0) return true;
  const shift = BigInt(128 - prefix);
  return (ipBig >> shift) === (netBig >> shift);
}

function parseIPData(
  data: unknown,
  cache: IPRangeCache
): void {
  if (!data) return;

  if (Array.isArray(data)) {
    for (const entry of data) {
      if (typeof entry === 'string') {
        addIPOrCIDR(entry, cache);
      } else if (typeof entry === 'object' && entry !== null) {
        extractPrefixEntry(entry as Record<string, string>, cache);
      }
    }
    return;
  }

  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;

    if (Array.isArray(obj.prefixes)) {
      for (const entry of obj.prefixes) {
        if (typeof entry === 'object' && entry !== null) {
          extractPrefixEntry(entry as Record<string, string>, cache);
        }
      }
    }

    if (Array.isArray(obj.ips)) {
      for (const ip of obj.ips) {
        if (typeof ip === 'string') {
          addIPOrCIDR(ip, cache);
        }
      }
    }

    if (Array.isArray(obj.ranges)) {
      for (const range of obj.ranges) {
        if (typeof range === 'string') {
          addIPOrCIDR(range, cache);
        }
      }
    }
  }
}

function extractPrefixEntry(
  entry: Record<string, string>,
  cache: IPRangeCache
): void {
  const v4 = entry.ipv4Prefix || entry.ipv4 || entry.ip4 || entry.cidr;
  const v6 = entry.ipv6Prefix || entry.ipv6 || entry.ip6;

  if (v4) addIPOrCIDR(v4, cache);
  if (v6) addIPOrCIDR(v6, cache);
}

function addIPOrCIDR(value: string, cache: IPRangeCache): void {
  const trimmed = value.trim();
  if (!trimmed) return;

  if (trimmed.includes('/')) {
    const parsed = parseCIDR(trimmed);
    if (parsed.isV6) {
      cache.ipv6Ranges.push({ network: parsed.network, prefix: parsed.prefix });
    } else {
      cache.ipv4Ranges.push({ network: parsed.network, prefix: parsed.prefix });
    }
  } else {
    if (trimmed.includes(':')) {
      cache.ipv6Exact.add(trimmed.toLowerCase());
    } else {
      cache.ipv4Exact.add(trimmed);
    }
  }
}

async function fetchCrawlerIPs(config: CrawlerConfig): Promise<void> {
  const cache = getOrCreateCache(config.name);
  if (cache.fetching) return;
  if (config.ipSources.length === 0) return;

  cache.fetching = true;

  try {
    const newCache: IPRangeCache = {
      ipv4Ranges: [],
      ipv6Ranges: [],
      ipv4Exact: new Set(),
      ipv6Exact: new Set(),
      lastFetched: Date.now(),
      fetching: false,
    };

    const results = await Promise.allSettled(
      config.ipSources.map((url) =>
        fetch(url, { signal: AbortSignal.timeout(8000) })
          .then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
          })
      )
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        parseIPData(result.value, newCache);
      }
    }

    const totalRanges =
      newCache.ipv4Ranges.length +
      newCache.ipv6Ranges.length +
      newCache.ipv4Exact.size +
      newCache.ipv6Exact.size;

    if (totalRanges > 0) {
      const existing = getOrCreateCache(config.name);
      existing.ipv4Ranges = newCache.ipv4Ranges;
      existing.ipv6Ranges = newCache.ipv6Ranges;
      existing.ipv4Exact = newCache.ipv4Exact;
      existing.ipv6Exact = newCache.ipv6Exact;
      existing.lastFetched = newCache.lastFetched;
    }
  } catch {
    // BUH
  } finally {
    const c = getOrCreateCache(config.name);
    c.fetching = false;
  }
}

async function refreshAllCrawlerIPs(): Promise<void> {
  const promises = CRAWLER_CONFIGS
    .filter((c) => c.ipSources.length > 0)
    .filter((c) => {
      const cache = getOrCreateCache(c.name);
      return Date.now() - cache.lastFetched > IP_REFRESH_INTERVAL;
    })
    .map((c) => fetchCrawlerIPs(c));

  if (promises.length > 0) {
    Promise.allSettled(promises);
  }
}

function isIPInCache(ip: string, cache: IPRangeCache): boolean {
  if (!ip || ip === 'unknown') return false;
  const isV6 = ip.includes(':');

  if (isV6) {
    const normalized = expandIPv6(ip);
    if (cache.ipv6Exact.has(ip.toLowerCase()) || cache.ipv6Exact.has(normalized)) {
      return true;
    }
    return cache.ipv6Ranges.some((r) => isIPv6InCIDR(ip, r.network, r.prefix));
  } else {
    if (cache.ipv4Exact.has(ip)) return true;
    return cache.ipv4Ranges.some((r) => isIPv4InCIDR(ip, r.network, r.prefix));
  }
}

function matchesCrawlerUA(req: NextRequest): CrawlerConfig | null {
  const ua = (req.headers.get('user-agent') ?? '').toLowerCase();

  for (const config of CRAWLER_CONFIGS) {
    if (config.uaPatterns.some((pattern) => ua.includes(pattern))) {
      return config;
    }
  }

  return null;
}

function isVerifiedCrawler(req: NextRequest): boolean {
  const config = matchesCrawlerUA(req);
  if (!config) return false;

  const ip = getIP(req);

  if (config.ipSources.length > 0) {
    const cache = getOrCreateCache(config.name);
    const hasData =
      cache.ipv4Ranges.length > 0 ||
      cache.ipv6Ranges.length > 0 ||
      cache.ipv4Exact.size > 0 ||
      cache.ipv6Exact.size > 0;

    if (hasData) {
      return isIPInCache(ip, cache);
    }
    return true;
  }

  if (config.reverseDnsHosts && config.reverseDnsHosts.length > 0) {
    return true;
  }

  return false;
}

function isSeoCrawlerRequest(req: NextRequest): boolean {
  const ua = (req.headers.get('user-agent') ?? '').toLowerCase();
  if (!ua) return false;
  return SEO_BOT_PATTERNS.some((pattern) => ua.includes(pattern));
}

function shouldBypass(pathname: string): boolean {
  if (BYPASS_PATHS.some((p) => pathname.startsWith(p))) return true;
  return STATIC_EXT.test(pathname);
}

function isHtmlRequest(req: NextRequest): boolean {
  return (req.headers.get('accept') ?? '').includes('text/html');
}

function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_ROUTE_PREFIXES.some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function isAdminRoute(pathname: string): boolean {
  return ADMIN_ROUTE_PREFIXES.some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function getBackendBaseUrl(): string {
  return (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/+$/, '');
}

async function hasActiveSession(req: NextRequest): Promise<boolean> {
  return (await getSessionUser(req)) !== null;
}

async function getSessionUser(req: NextRequest): Promise<MiddlewareSessionUser | null> {
  const backendBase = getBackendBaseUrl();
  if (!backendBase) return null;

  try {
    const res = await fetch(`${backendBase}/api/auth/session`, {
      method: 'GET',
      headers: {
        cookie: req.headers.get('cookie') || '',
      },
      cache: 'no-store',
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data?.user ?? null;
  } catch {
    return null;
  }
}

function permissionMatches(granted: string, required: string): boolean {
  if (!granted || !required) return false;
  if (granted === '*' || granted === required) return true;

  const parts = String(granted).split(':');
  const reqParts = String(required).split(':');
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === '*') return true;
    if (reqParts[i] !== parts[i]) return false;
  }

  return true;
}

function hasPermission(user: MiddlewareSessionUser | null, required: string): boolean {
  if (!user) return false;

  if (user.role === '*' || user.role === 'rootAdmin' || user.role === 'admin') return true;

  const permissions = Array.isArray(user.permissions) ? user.permissions : [];
  if (permissions.includes('*')) return true;

  return permissions.some((permission) => permissionMatches(permission, required));
}

function canAccessAdmin(user: MiddlewareSessionUser | null): boolean {
  return ADMIN_PANEL_PERMISSIONS.some((permission) => hasPermission(user, permission));
}

const SHORT_URL_RESERVED_ROOT_PATHS = new Set([
  'api',
  'public',
  '_next',
  'static',
  'uploads',
  'health',
  'favicon.ico',
  'robots.txt',
  'login',
  'logout',
  'register',
  'forgot-password',
  'reset-password',
  'restore-email',
  'verify-email',
  'license',
  'legal',
  'dashboard',
  'servers',
  'billing',
  'identity',
  'mailbox',
  'settings',
  'tickets',
  'organisations',
  'tunnel',
  'docs',
  'admin',
  'changelogs',
  'changelog',
  'contributors',
])

function getShortUrlPath(pathname: string): { prefix: 'a' | 'root'; code: string } | null {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 2 && segments[0] === 'a' && segments[1]) {
    return { prefix: 'a', code: segments[1].toLowerCase() };
  }
  if (segments.length === 1 && segments[0] && !SHORT_URL_RESERVED_ROOT_PATHS.has(segments[0])) {
    return { prefix: 'root', code: segments[0].toLowerCase() };
  }
  return null;
}

async function resolveShortUrlTarget(prefix: 'a' | 'root', code: string): Promise<string | null> {
  const backendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_BASE || '';
  if (!backendUrl) return null;

  const url = new URL(`${backendUrl.replace(/\/+$/, '')}/public/short-url`);
  url.searchParams.set('code', code);
  if (prefix === 'a') url.searchParams.set('prefix', 'a');

  try {
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json || typeof json.targetUrl !== 'string') return null;
    return json.targetUrl;
  } catch {
    return null;
  }
}

function getIP(req: NextRequest): string {
  return (
    req.headers.get('cf-connecting-ipv6') ??
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  refreshAllCrawlerIPs();

  const shortUrlPath = getShortUrlPath(pathname);
  if (shortUrlPath && req.method === 'GET') {
    const targetUrl = await resolveShortUrlTarget(shortUrlPath.prefix, shortUrlPath.code);
    if (targetUrl) {
      return NextResponse.redirect(targetUrl, 302);
    }
  }

  if (
    req.method === 'GET' &&
    isHtmlRequest(req) &&
    isSeoCrawlerRequest(req) &&
    !isProtectedRoute(pathname) &&
    !isAdminRoute(pathname)
  ) {
    return NextResponse.next();
  }

  if (req.method === 'GET' && isHtmlRequest(req)) {
    const protectedRoute = isProtectedRoute(pathname);
    const adminRoute = isAdminRoute(pathname);
    const authRoute = isAuthRoute(pathname);

    if (protectedRoute || authRoute || adminRoute) {
      const sessionUser = await getSessionUser(req);
      const loggedIn = !!sessionUser;

      if (protectedRoute && !loggedIn) {
        const loginUrl = new URL('/login', req.url);
        if (pathname !== '/dashboard') {
          loginUrl.searchParams.set('next', pathname);
        }
        return NextResponse.redirect(loginUrl);
      }

      if (adminRoute && loggedIn && !canAccessAdmin(sessionUser)) {
        return NextResponse.redirect(new URL('/dashboard', req.url));
      }

      if (authRoute && loggedIn) {
        return NextResponse.redirect(new URL('/dashboard', req.url));
      }
    }
  }

  if (shouldBypass(pathname)) return NextResponse.next();

  if (isVerifiedCrawler(req)) return NextResponse.next();

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/|static/|uploads/|public/).*)'],
};
