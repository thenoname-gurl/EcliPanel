import { defineMiddleware, sequence } from "astro:middleware";
import { getSessionForRequest, resetSessionCache } from "./lib/page-data";

const BYPASS_PATHS = [
  "/api",
  "/health",
  "/uploads",
  "/public",
  "/_astro",
  "/static",
  "/favicon.ico",
  "/robots.txt",
];

const STATIC_EXT = /\.(js|css|png|jpg|jpeg|webp|svg|ico|json|xml|txt|woff2?|ttf|eot|map)$/i;

const SEO_BOT_PATTERNS = [
  "googlebot", "bingbot", "duckduckbot", "yandex", "baiduspider",
  "applebot", "slurp", "facebookexternalhit", "twitterbot", "linkedinbot",
  "slackbot", "discordbot", "telegrambot", "whatsapp", "curl", "wget",
  "bot", "crawler", "spider", "preview",
];

const PROTECTED_ROUTE_PREFIXES = ["/dashboard"];
const ADMIN_ROUTE_PREFIXES = ["/dashboard/admin"];
const AUTH_ROUTE_PREFIXES = ["/login", "/register"];
const ADMIN_PANEL_PERMISSIONS = ["admin:access"];

const BACKEND_URL = (import.meta.env.BACKEND_URL || import.meta.env.PUBLIC_API_BASE || "").replace(/\/+$/, "");

interface SessionUser {
  role?: string;
  permissions?: string[];
}

function getIP(request: Request): string {
  return (
    request.headers.get("cf-connecting-ipv6") ??
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

function shouldBypass(pathname: string): boolean {
  if (BYPASS_PATHS.some((p) => pathname.startsWith(p))) return true;
  return STATIC_EXT.test(pathname);
}

function isHtmlRequest(request: Request): boolean {
  return (request.headers.get("accept") ?? "").includes("text/html");
}

function isProtectedRoute(pathname: string): boolean {
  if (pathname === "/dashboard/chat" || pathname.startsWith("/dashboard/chat/")) {
    return false;
  }
  return PROTECTED_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isAdminRoute(pathname: string): boolean {
  return ADMIN_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isSeoCrawlerRequest(request: Request): boolean {
  const ua = (request.headers.get("user-agent") ?? "").toLowerCase();
  return SEO_BOT_PATTERNS.some((pattern) => ua.includes(pattern));
}

function permissionMatches(granted: string, required: string): boolean {
  if (!granted || !required) return false;
  if (granted === "*" || granted === required) return true;
  const parts = String(granted).split(":");
  const reqParts = String(required).split(":");
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === "*") return true;
    if (reqParts[i] !== parts[i]) return false;
  }
  return true;
}

function hasPermission(user: SessionUser | null, required: string): boolean {
  if (!user) return false;
  if (user.role === "*" || user.role === "rootAdmin" || user.role === "admin") return true;
  const permissions = Array.isArray(user.permissions) ? user.permissions : [];
  if (permissions.includes("*")) return true;
  return permissions.some((p) => permissionMatches(p, required));
}

function canAccessAdmin(user: SessionUser | null): boolean {
  return ADMIN_PANEL_PERMISSIONS.some((p) => hasPermission(user, p));
}

async function getSessionUser(request: Request): Promise<SessionUser | null> {
  if (!BACKEND_URL) return null;
  // Reuses the per-request memoized session fetch (also used by page-data and
  // BaseLayout) so a single page hit never issues >1 round-trip to the backend.
  const cookie = request.headers.get("cookie") || "";
  try {
    const user = await getSessionForRequest(cookie);
    return user ?? null;
  } catch {
    return null;
  }
}

const SHORT_URL_RESERVED = new Set([
  "api", "public", "_astro", "static", "uploads", "health",
  "favicon.ico", "robots.txt", "login", "logout", "register",
  "forgot-password", "reset-password", "restore-email", "verify-email",
  "license", "legal", "dashboard", "servers", "billing", "identity",
  "mailbox", "settings", "tickets", "organisations", "tunnel",
  "docs", "admin", "changelogs", "changelog", "contributors", "blog",
]);

function getShortUrlPath(pathname: string): { prefix: "a" | "root"; code: string } | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 2 && segments[0] === "a" && segments[1]) {
    return { prefix: "a", code: segments[1].toLowerCase() };
  }
  if (segments.length === 1 && segments[0] && !SHORT_URL_RESERVED.has(segments[0])) {
    return { prefix: "root", code: segments[0].toLowerCase() };
  }
  return null;
}

async function resolveShortUrl(prefix: "a" | "root", code: string): Promise<string | null> {
  if (!BACKEND_URL) return null;
  const url = new URL(`${BACKEND_URL}/public/short-url`);
  url.searchParams.set("code", code);
  if (prefix === "a") url.searchParams.set("prefix", "a");
  try {
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const json = await res.json();
    return json?.targetUrl || null;
  } catch {
    return null;
  }
}

function isVerifiedCrawler(request: Request): boolean {
  const ua = (request.headers.get("user-agent") ?? "").toLowerCase();
  return SEO_BOT_PATTERNS.some((p) => ua.includes(p));
}

let _cspOriginsCache: { origins: string[]; at: number } | null = null;
const CSP_ORIGINS_TTL_MS = 5 * 60 * 1000;

async function getCspTrustedOrigins(): Promise<string[]> {
  if (_cspOriginsCache && Date.now() - _cspOriginsCache.at < CSP_ORIGINS_TTL_MS) {
    return _cspOriginsCache.origins;
  }
  if (!BACKEND_URL) return _cspOriginsCache?.origins ?? [];
  try {
    const res = await fetch(`${BACKEND_URL}/api/internal-domains`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return _cspOriginsCache?.origins ?? [];
    const data = await res.json();
    const origins: string[] = Array.isArray(data?.origins)
      ? data.origins.map((o: string) => String(o).toLowerCase()).filter(Boolean)
      : [];
    _cspOriginsCache = { origins, at: Date.now() };
    return origins;
  } catch {
    return _cspOriginsCache?.origins ?? [];
  }
}

const securityHeaders = defineMiddleware(async (_, next) => {
  // Astro SSR runs on one process; reset the per-request session cache so each
  // request gets a fresh session lookup instead of a stale cached user.
  resetSessionCache();
  const response = await next();

  const trustedOrigins = await getCspTrustedOrigins();
  const connectSources = [
    "'self'",
    "https://backend.ecli.app",
    "https://ecli.app",
    "wss://backend.ecli.app",
    "wss://ecli.app",
    "https://cdn.jsdelivr.net",
  ];
  for (const origin of trustedOrigins) {
    connectSources.push(`https://${origin}`);
    connectSources.push(`wss://${origin}`);
    connectSources.push(`http://${origin}`);
    connectSources.push(`ws://${origin}`);
  }

  const csp = [
    "default-src 'self' https://backend.ecli.app",
    "script-src 'self' https://backend.ecli.app 'unsafe-inline' https://cdn.jsdelivr.net",
    "style-src 'self' https://backend.ecli.app 'unsafe-inline' https: https://cdn.jsdelivr.net",
    "img-src * data: blob:",
    "font-src 'self' https://backend.ecli.app data: https://fonts.gstatic.com",
    `connect-src ${connectSources.join(" ")}`,
    "frame-src 'self' https://backend.ecli.app https://mail.ecli.app https://maps.google.com https://www.google.com",
    "worker-src 'self' blob:",
    "child-src 'self' blob: https://mail.ecli.app",
    "media-src 'self' https://backend.ecli.app data: blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://backend.ecli.app",
  ].join("; ");

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-DNS-Prefetch-Control", "on");
  response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  // HTML pages must never be heuristically cached: they reference hashed
  // chunks, and a stale shell loads broken JS after deploys.
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/html")) {
    response.headers.set("Cache-Control", "no-cache");
  }

  return response;
});

const shortUrls = defineMiddleware(async (context, next) => {
  if (context.request.method !== "GET") return next();

  const { pathname } = new URL(context.request.url);
  const short = getShortUrlPath(pathname);
  if (short) {
    const target = await resolveShortUrl(short.prefix, short.code);
    if (target) {
      return new Response(null, {
        status: 302,
        headers: { Location: target },
      });
    }
  }

  return next();
});

const authGuard = defineMiddleware(async (context, next) => {
  if (context.request.method !== "GET" || !isHtmlRequest(context.request)) {
    return next();
  }

  const { pathname } = new URL(context.request.url);

  if (shouldBypass(pathname)) return next();
  if (isSeoCrawlerRequest(context.request) && !isProtectedRoute(pathname) && !isAdminRoute(pathname)) {
    return next();
  }

  const isProtected = isProtectedRoute(pathname);
  const isAdmin = isAdminRoute(pathname);
  const isAuth = isAuthRoute(pathname);

  if (isProtected || isAuth || isAdmin) {
    const user = await getSessionUser(context.request);
    const loggedIn = !!user;

    if (isProtected && !loggedIn) {
      const host = context.request.headers.get("x-forwarded-host") ||
                   context.request.headers.get("host") ||
                   "ecli.app";
      const proto = context.request.headers.get("x-forwarded-proto") || "https";
      const loginUrl = new URL(`${proto}://${host}/login`);
      if (pathname !== "/dashboard") {
        loginUrl.searchParams.set("redirect", pathname);
      }
      return new Response(null, {
        status: 302,
        headers: { Location: loginUrl.toString() },
      });
    }

    if (isAdmin && loggedIn && !canAccessAdmin(user)) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/dashboard" },
      });
    }

    if (isAuth && loggedIn) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/dashboard" },
      });
    }
  }

  if (isVerifiedCrawler(context.request)) return next();

  return next();
});

export const onRequest = sequence(securityHeaders, shortUrls, authGuard);