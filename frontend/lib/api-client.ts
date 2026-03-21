import { API_ENDPOINTS } from "./panel-config";

const API_CACHE_TTL = 60 * 1000 
const apiResponseCache = new Map<string, { expiry: number; data: any }>()

export function clearApiCache(): void {
  apiResponseCache.clear()
}

export async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<any> {
  let base = process.env.NEXT_PUBLIC_API_BASE || "";
  if (typeof window !== 'undefined') {
    try {
      if (base) {
        const u = new URL(base);
        const isPrivate = /^(127|10|172|192)\./.test(u.hostname) || u.hostname === 'localhost';
        if (window.location.protocol === 'https:' && u.protocol === 'http:' && !isPrivate) {
          u.protocol = 'https:';
          base = u.toString();
        }
        if (window.location.protocol === 'https:' && (u.protocol === 'http:' || isPrivate)) {
          base = '';
        }
        if (window.location.protocol === 'https:' && base.startsWith('http://')) {
          base = base.replace(/^http:\/\//, 'https://');
        }
      }
    } catch {
      base = base || '';
    }
  }

  const url = path.startsWith("http") ? path : `${base}${path}`;

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };
  if (!headers["Content-Type"] && !(options.body instanceof FormData) && options.body !== undefined && options.body !== null) {
    headers["Content-Type"] = "application/json";
  }

  if (typeof window !== 'undefined') {
    try {
      const token = localStorage.getItem('token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    } catch (err) {
      console.warn('[apiFetch] localStorage access blocked', err);
    }
  }

  const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const method = String(options.method ?? 'GET').toUpperCase();
  const cacheKey = `${method}:${url}`

  if (method === 'GET') {
    const cached = apiResponseCache.get(cacheKey)
    if (cached && cached.expiry > Date.now()) {
      if (typeof window !== 'undefined') {
        console.log(`[apiFetch] cache hit`, url)
      }
      return cached.data
    }
  }

  if (typeof window !== 'undefined') {
    console.log(`[apiFetch] request`, method, url);
  }
  const res = await fetch(url, { ...options, headers, credentials: "include" });
  const duration = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start;
  if (typeof window !== 'undefined') {
    console.log(`[apiFetch] answered in ${duration.toFixed(2)}ms`, url);
  }

  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try {
      const json = JSON.parse(text);
      msg = json.error || JSON.stringify(json);
    } catch {}
    throw new Error(msg || `HTTP error ${res.status}`);
  }
  if (res.status === 204) return null;

  const cl = res.headers.get('content-length');
  const text = await res.text();
  if (res.status === 200 && !text) {
    return "";
  }

  try {
    const parsed = JSON.parse(text);
    if (method === 'GET') {
      apiResponseCache.set(cacheKey, {
        expiry: Date.now() + API_CACHE_TTL,
        data: parsed,
      })
    }
    try {
      if (url.includes('/auth/login') || url.includes('/auth/session') || url.includes('/auth/2fa/verify-login')) {
        console.debug('[apiFetch] auth response:', url, parsed);
      }
    } catch {}
    return parsed;
  } catch {
    if (method === 'GET') {
      apiResponseCache.set(cacheKey, {
        expiry: Date.now() + API_CACHE_TTL,
        data: text,
      })
    }
    return text;
  }
}
