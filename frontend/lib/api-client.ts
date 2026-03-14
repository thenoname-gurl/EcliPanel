import { API_ENDPOINTS } from "./panel-config";

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

  const res = await fetch(url, { ...options, headers, credentials: "include" });
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
    try {
      if (url.includes('/auth/login') || url.includes('/auth/session') || url.includes('/auth/2fa/verify-login')) {
        console.debug('[apiFetch] auth response:', url, parsed);
      }
    } catch {}
    return parsed;
  } catch {
    return text;
  }
}
