import { detectLocale, getMessages as loadMessages } from "../../components/shims/i18n-server";
import { API_ENDPOINTS } from "../../lib/panel-config";
import { safeUrl } from "../../lib/url-utils";
import type { AppLocale } from "../../i18n/config";

function getBackendBaseUrl(): string {
  const url =
    (typeof process !== "undefined" && (process.env as any)?.BACKEND_URL) ||
    (typeof process !== "undefined" && (process.env as any)?.PUBLIC_API_BASE) ||
    "";
  return url.replace(/\/+$/, "");
}

// SSR renders middleware authGuard, BaseLayout (theme), and page-data (initialUser)
// on the same request, each doing its own round-trip to /api/auth/session. Memoize on
// the raw cookie so one page load = one backend call, not three. The middleware resets
// this per request (Astro SSR runs on one process), so nothing leaks across requests.
let requestScope: Map<string, Promise<any | null | undefined>> = new Map();

export function resetSessionCache() {
  requestScope = new Map();
}

export function getSessionForRequest(cookieHeader: string): Promise<any | null | undefined> {
  const cached = requestScope.get(cookieHeader);
  if (cached) return cached;
  const p = fetchSessionOnce(cookieHeader);
  requestScope.set(cookieHeader, p);
  return p;
}

// Returns the user, null when the session is definitively invalid (401),
// or undefined when the backend could not be reached in time (transient).
async function fetchSessionOnce(cookieHeader: string): Promise<any | null | undefined> {
  const backendBase = getBackendBaseUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(safeUrl(backendBase, API_ENDPOINTS.session), {
      headers: { cookie: cookieHeader },
      signal: controller.signal,
    });
    if (res.ok) {
      const data = await res.json();
      return data?.user || null;
    }
    if (res.status === 401) return null;
    return undefined;
  } catch (err: any) {
    console.log(`[page-data] session fetch failed: ${err?.name || err?.message || err}`);
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

export interface PageProps {
  locale: string;
  messages: Record<string, any>;
  initialUser: any;
  pathname: string;
}

export async function getPageData(
  cookies: { get: (name: string) => { value: string } | undefined },
  headers: Headers,
  pathname: string,
): Promise<PageProps> {
  const locale = detectLocale(cookies, headers);
  const messages = await loadMessages(locale);

  let initialUser: any = null;
  const cookieHeader = headers.get("cookie") || "";

  if (cookieHeader) {
    const first = await getSessionForRequest(cookieHeader);
    initialUser = first !== undefined ? first : await getSessionForRequest(cookieHeader);
  }

  return { locale, messages, initialUser, pathname };
}
