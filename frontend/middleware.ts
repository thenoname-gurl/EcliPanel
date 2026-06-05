import { NextRequest, NextResponse } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';

const SECRET = new TextEncoder().encode(
  process.env.BROWSER_CHECK_SECRET ?? 'change-me-to-a-random-64-char-string-pls'
);
const VERIFIED_COOKIE = '__browser_verified';
const CHALLENGE_COOKIE = '__browser_challenge';
const COOKIE_MAX_AGE = 60 * 60;
const CHALLENGE_EXPIRY = 120;
const POW_DIFFICULTY = 4;
const RATE_LIMIT = 10;
const RATE_WINDOW = 60_000;

const IP_REFRESH_INTERVAL = 24 * 60 * 60 * 1000;

const BYPASS_PATHS = [
  '/api/browser-verify',
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

const HEADLESS_RENDERERS = ['swiftshader', 'llvmpipe', 'mesa'];
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

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const usedChallenges = new Set<string>();

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

function randomHex(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(data: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(data)
  );
  return Array.from(new Uint8Array(buf), (b) =>
    b.toString(16).padStart(2, '0')
  ).join('');
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }

  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

function pruneRateLimitMap() {
  const now = Date.now();
  for (const [key, val] of rateLimitMap) {
    if (now > val.resetAt) rateLimitMap.delete(key);
  }
}

function markChallengeUsed(id: string) {
  usedChallenges.add(id);
  if (usedChallenges.size > 50_000) {
    const iter = usedChallenges.values();
    for (let i = 0; i < 25_000; i++) {
      const v = iter.next().value;
      if (v) usedChallenges.delete(v);
    }
  }
}

async function createChallengeToken(ip: string) {
  const challengeId = randomHex(32);
  const token = await new SignJWT({ challengeId, ip, type: 'challenge' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${CHALLENGE_EXPIRY}s`)
    .sign(SECRET);
  return { challengeId, token };
}

async function createVerifiedToken(ip: string): Promise<string> {
  return new SignJWT({ ip, verified: true, type: 'verified' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${COOKIE_MAX_AGE}s`)
    .sign(SECRET);
}

async function isAlreadyVerified(
  cookieValue: string | undefined,
  ip: string
): Promise<boolean> {
  if (!cookieValue) return false;
  try {
    const { payload } = await jwtVerify(cookieValue, SECRET);
    return (
      payload.type === 'verified' &&
      payload.ip === ip &&
      payload.verified === true
    );
  } catch {
    return false;
  }
}

interface BrowserSignals {
  screen?: string;
  depth?: number;
  tz?: string;
  lang?: string;
  platform?: string;
  cores?: number;
  touch?: boolean;
  webgl?: string;
  canvas?: string;
}

function analyzeSignals(signals: BrowserSignals | undefined): {
  suspicious: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (!signals) return { suspicious: true, reasons: ['no_signals'] };

  if (signals.webgl === 'none' || signals.webgl === 'error')
    reasons.push('no_webgl');
  if (!signals.cores || signals.cores === 0)
    reasons.push('no_hardware_concurrency');
  if (!signals.tz || signals.tz === 'undefined') reasons.push('no_timezone');
  if (!signals.lang) reasons.push('no_language');
  if (
    signals.webgl &&
    HEADLESS_RENDERERS.some((r) => signals.webgl!.toLowerCase().includes(r))
  )
    reasons.push('headless_webgl_renderer');

  return { suspicious: reasons.length >= 2, reasons };
}

function buildChallengePage(
  challengeId: string,
  challengeToken: string
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Verifying your browser...</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#000;color:#fff;font-family:system-ui,-apple-system,sans-serif}
.wrap{width:100%;max-width:420px;padding:1.5rem}
.card{border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.02);padding:1.5rem}
.heading{font-size:1.1rem;font-weight:600;color:rgba(255,255,255,.9);margin-bottom:.35rem}
.subtext{font-size:.8rem;color:rgba(255,255,255,.4);margin-bottom:1.25rem;line-height:1.5}
.spinner-row{display:flex;align-items:center;gap:.75rem;margin:1rem 0 .75rem}
.spinner{width:16px;height:16px;border:2px solid rgba(255,255,255,.15);border-top-color:rgba(255,255,255,.5);border-radius:50%;animation:spin .8s linear infinite;flex-shrink:0}
@keyframes spin{to{transform:rotate(360deg)}}
.stext{font-size:.8rem;color:rgba(255,255,255,.5)}
.bar-wrap{margin-top:.25rem;height:2px;background:rgba(255,255,255,.08);overflow:hidden}
.bar-fill{height:100%;width:0%;background:rgba(255,255,255,.4);transition:width .4s ease-out}
.status{font-size:.75rem;color:rgba(255,255,255,.35);margin-top:.5rem;min-height:1.2em}
.retry{margin-top:1rem;font-size:.65rem;color:rgba(255,255,255,.25);text-align:center}
.retry a{color:#818cf8;text-decoration:none;cursor:pointer;transition:color .2s}
.retry a:hover{color:#a5b4fc}
noscript div{border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03);padding:1rem;margin-top:1rem;font-size:.75rem;color:rgba(255,255,255,.45);text-align:center}
</style>
</head>
<body>
<div class="wrap">
  <div class="card" role="status" aria-live="polite">
    <h1 class="heading">Verifying your browser</h1>
    <p class="subtext">Please wait while we confirm you are human.</p>
    <div class="spinner-row">
      <div class="spinner" id="sp"></div>
      <span class="stext" id="st">Preparing challenge...</span>
    </div>
    <div class="bar-wrap"><div class="bar-fill" id="bar"></div></div>
    <div class="status" id="sv"></div>
  </div>
  <p class="retry">Stuck? <a onclick="location.reload()">Reload</a></p>
  <noscript><div>JavaScript is required to verify your browser. Please enable it and reload.</div></noscript>
</div>
<script>
(function(){
var CID='${challengeId}';
var TOKEN='${challengeToken}';
var DIFF=${POW_DIFFICULTY};
var PAGE_URL=location.href;
var VERIFY_ENDPOINT='/api/browser-verify';
var PREFIX='';
for(var i=0;i<DIFF;i++)PREFIX+='0';

var elSp=document.getElementById('sp');
var elSt=document.getElementById('st');
var elBar=document.getElementById('bar');
var elSv=document.getElementById('sv');

var signals={
  screen:screen.width+'x'+screen.height,
  depth:screen.colorDepth,
  tz:Intl.DateTimeFormat().resolvedOptions().timeZone,
  lang:navigator.language,
  platform:navigator.platform,
  cores:navigator.hardwareConcurrency||0,
  touch:'ontouchstart' in window,
  webgl:(function(){
    try{
      var c=document.createElement('canvas');
      var gl=c.getContext('webgl')||c.getContext('experimental-webgl');
      if(!gl)return'none';
      var ext=gl.getExtension('WEBGL_debug_renderer_info');
      return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'generic';
    }catch(e){return'error';}
  })(),
  canvas:(function(){
    try{
      var c=document.createElement('canvas');c.width=200;c.height=50;
      var ctx=c.getContext('2d');
      ctx.textBaseline='top';ctx.font='14px Arial';
      ctx.fillText('browser-check-fp',2,2);
      return c.toDataURL().slice(-32);
    }catch(e){return'error';}
  })()
};

function setStatus(text){
  elSv.textContent=text;
}

function fail(msg){
  elSp.style.display='none';
  elSt.textContent=msg;
}

async function submit(nonce){
  elSt.textContent='Verifying with server...';
  try{
    var res=await fetch(VERIFY_ENDPOINT,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({token:TOKEN,nonce:String(nonce),signals:signals})
    });
    var data=await res.json();
    if(data.success){
      elBar.style.width='100%';
      elSt.textContent='Redirecting...';
      elSv.textContent='';
      setTimeout(function(){window.location.replace(PAGE_URL);},350);
    }else{
      fail('Failed: '+(data.error||'unknown'));
    }
  }catch(e){
    fail('Network error \\u2014 please reload.');
  }
}

var workerScript=[
  'self.onmessage=function(e){',
  'var cid=e.data.cid,pre=e.data.pre;',
  'async function sha256(s){',
  'var b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));',
  'var a=new Uint8Array(b),h="";',
  'for(var i=0;i<a.length;i++)h+=a[i].toString(16).padStart(2,"0");',
  'return h;',
  '}',
  'async function solve(){',
  'var n=0,B=10000,M=500000000;',
  'while(n<M){',
  'for(var i=0;i<B;i++){',
  'var h=await sha256(cid+":"+n);',
  'if(h.startsWith(pre)){self.postMessage({type:"solved",nonce:n});return;}',
  'n++;',
  '}',
  'self.postMessage({type:"progress",nonce:n});',
  '}',
  'self.postMessage({type:"failed"});',
  '}',
  'solve();',
  '};'
].join('\\n');

var blob=new Blob([workerScript],{type:'application/javascript'});
var worker=new Worker(URL.createObjectURL(blob));

worker.onmessage=function(e){
  var d=e.data;
  if(d.type==='progress'){
    var pct=Math.min((d.nonce/300000)*100,90);
    elBar.style.width=pct+'%';
    setStatus('Working \\u2026 '+(d.nonce/1000).toFixed(0)+'k attempts');
  }else if(d.type==='solved'){
    elBar.style.width='100%';
    setStatus('');
    submit(d.nonce);
  }else if(d.type==='failed'){
    fail('Challenge failed \\u2014 please reload.');
  }
};

worker.onerror=function(){
  fail('Verification error \\u2014 please reload.');
};

elSt.textContent='Solving challenge...';
worker.postMessage({cid:CID,pre:PREFIX});
})();
</script>
</body>
</html>`;
}

async function handleVerify(req: NextRequest): Promise<NextResponse> {
  const ip = getIP(req);

  pruneRateLimitMap();

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { success: false, error: 'rate_limited' },
      { status: 429 }
    );
  }

  let body: { token?: string; nonce?: string; signals?: BrowserSignals };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'invalid_json' },
      { status: 400 }
    );
  }

  const { token, nonce, signals } = body;

  if (!token || nonce === undefined) {
    return NextResponse.json(
      { success: false, error: 'missing_fields' },
      { status: 400 }
    );
  }

  let payload: Record<string, unknown>;
  try {
    const result = await jwtVerify(token, SECRET);
    payload = result.payload as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { success: false, error: 'invalid_or_expired_token' },
      { status: 400 }
    );
  }

  if (payload.type !== 'challenge') {
    return NextResponse.json(
      { success: false, error: 'invalid_token_type' },
      { status: 400 }
    );
  }

  if (payload.ip !== ip) {
    return NextResponse.json(
      { success: false, error: 'ip_mismatch' },
      { status: 403 }
    );
  }

  const challengeId = payload.challengeId as string;

  if (usedChallenges.has(challengeId)) {
    return NextResponse.json(
      { success: false, error: 'challenge_already_used' },
      { status: 400 }
    );
  }

  const hash = await sha256Hex(`${challengeId}:${nonce}`);
  if (!hash.startsWith('0'.repeat(POW_DIFFICULTY))) {
    return NextResponse.json(
      { success: false, error: 'invalid_proof_of_work' },
      { status: 400 }
    );
  }

  const { suspicious, reasons } = analyzeSignals(signals);
  if (suspicious) {
    return NextResponse.json(
      { success: false, error: 'suspicious_browser', reasons },
      { status: 403 }
    );
  }

  markChallengeUsed(challengeId);

  const verifiedToken = await createVerifiedToken(ip);

  const res = NextResponse.json({ success: true });

  res.cookies.set(VERIFIED_COOKIE, verifiedToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });

  res.cookies.delete(CHALLENGE_COOKIE);

  return res;
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

  if (pathname === '/api/browser-verify' && req.method === 'POST') {
    return handleVerify(req);
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

  if (!isHtmlRequest(req)) return NextResponse.next();

  const verifiedCookie = req.cookies.get(VERIFIED_COOKIE)?.value;
  const ip = getIP(req);

  if (await isAlreadyVerified(verifiedCookie, ip)) {
    try {
      if (req.method === 'GET' && isHtmlRequest(req) && pathname.startsWith('/dashboard/tunnels')) {
        const sessionUser = await getSessionUser(req);
        if (sessionUser) {
          const backendBase = getBackendBaseUrl();
          if (backendBase) {
            const r = await fetch(`${backendBase.replace(/\/+$/, '')}/api/rollouts`, {
              method: 'GET',
              headers: { cookie: req.headers.get('cookie') || '' },
              cache: 'no-store',
            });
            if (r.ok) {
              const data = await r.json();
              const candidates = Object.keys(data || {}).filter((k) => k.includes('tunnel'));
              if (candidates.length > 0) {
                const res = NextResponse.next();
                for (const k of candidates) {
                  const st = data[k];
                  if (st && st.inRollout) {
                    res.cookies.set(`rollout_${k}`, '1', {
                      path: '/',
                      maxAge: 60 * 60 * 24,
                      sameSite: 'lax',
                      secure: true,
                    });
                  }
                }
                return res;
              }
            }
          }
        }
      }
    } catch {
      // woof woof
    }

    return NextResponse.next();
  }

  const { challengeId, token } = await createChallengeToken(ip);

  const res = new NextResponse(buildChallengePage(challengeId, token), {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store, no-cache, must-revalidate',
      'x-robots-tag': 'noindex, nofollow',
    },
  });

  res.cookies.set(CHALLENGE_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: CHALLENGE_EXPIRY,
    path: '/',
  });

  return res;
}

export const config = {
  matcher: ['/((?!_next/|static/|uploads/|public/).*)'],
};
