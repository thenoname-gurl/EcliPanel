import { API_ENDPOINTS } from "./panel-config";

const DEFAULT_API_TIMEOUT = 10000
const DEFAULT_API_RETRIES = 2

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function apiFetch(
  path: string,
  options: Omit<RequestInit, 'body'> & { body?: any; timeout?: number; retries?: number } = {}
): Promise<any> {
  const timeout = Number(options.timeout ?? DEFAULT_API_TIMEOUT)
  let retries = Number(options.retries ?? DEFAULT_API_RETRIES)

  const isFormDataBody = options.body instanceof FormData;
  if (isFormDataBody && retries > 1) {
    retries = 1;
  }

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
  if (options.body instanceof FormData) {
    if (headers["Content-Type"]) delete headers["Content-Type"];
  } else if (!headers["Content-Type"] && options.body !== undefined && options.body !== null) {
    headers["Content-Type"] = "application/json";
  }

  let fetchBody: any = options.body;
  if (headers["Content-Type"] === 'application/json' && fetchBody !== undefined && fetchBody !== null && !(fetchBody instanceof FormData) && typeof fetchBody === 'object') {
    try {
      fetchBody = JSON.stringify(fetchBody);
    } catch {
      // skippyyyyy!!!!
    }
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

  const method = String(options.method ?? 'GET').toUpperCase();

  async function execute(attempt: number): Promise<any> {
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    if (typeof window !== 'undefined') {
      console.log(`[apiFetch] request`, method, url, `(attempt ${attempt}/${retries})`);
    }

    try {
      const res = await fetch(url, {
        ...options,
        headers,
        body: fetchBody,
        credentials: 'include',
        signal: controller.signal,
      })

      const duration = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start;
      if (typeof window !== 'undefined') {
        console.log(`[apiFetch] answered in ${duration.toFixed(2)}ms`, url);
      }

      if (!res.ok) {
        const text = await res.text();
        let msg = text;
        try {
          const json = JSON.parse(text);
          let hasMessage = false;
          if (json?.error) {
            msg = json.error;
            hasMessage = true;
          }
          if (json?.message) {
            msg = json.message;
            hasMessage = true;
          }
          if (json?.details) {
            msg = `${hasMessage ? msg + ' - ' : ''}${json.details}`;
            hasMessage = true;
          }
          if (!hasMessage && json?.type === 'validation' && json?.found) {
            msg = Object.entries(json.found)
              .map(([field, value]) => `${field}: ${value}`)
              .join('; ');
          } else if (!hasMessage) {
            msg = JSON.stringify(json);
          }
        } catch {}
        throw new Error(msg || `HTTP error ${res.status}`);
      }

      if (res.status === 204) return null;

      const text = await res.text();
      if (res.status === 200 && !text) {
        return "";
      }

      let data: any
      try {
        data = JSON.parse(text)
      } catch {
        data = text
      }

      try {
        if (url.includes('/auth/login') || url.includes('/auth/session') || url.includes('/auth/2fa/verify-login')) {
          console.debug('[apiFetch] auth response:', url, data);
        }
      } catch {}

      return data
    } catch (err: any) {
      const isAbort = err?.name === 'AbortError' || err?.message?.includes('The user aborted a request');
      const isNetwork = err instanceof TypeError || err?.message?.toLowerCase().includes('failed to fetch');

      if (attempt < retries && (isAbort || isNetwork)) {
        if (typeof window !== 'undefined') {
          console.warn(`[apiFetch] retrying ${url} due to network/timeout (attempt ${attempt + 1}/${retries})`, err);
        }
        await sleep(500 * attempt)
        return execute(attempt + 1)
      }

      if (isAbort) {
        throw new Error(`Request timed out after ${timeout}ms: ${url}`)
      }

      throw err
    } finally {
      clearTimeout(timeoutId)
    }
  }

  return execute(1)
}

