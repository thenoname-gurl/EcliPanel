export type HttpResult<T> = {
  data: T;
  status: number;
  headers: Record<string, string>;
};

export class HttpError extends Error {
  response?: HttpResult<any>;
}

type RequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  timeoutMs?: number;
  responseType?: 'json' | 'text' | 'arraybuffer';
};

function normalizeHeaders(headers?: Record<string, string>): Record<string, string> {
  return headers ? { ...headers } : {};
}

async function readResponse(res: Response, responseType: RequestOptions['responseType']) {
  if (responseType === 'text') return await res.text();
  if (responseType === 'arraybuffer') return await res.arrayBuffer();
  return await res.json().catch(() => null);
}

const allowInvalidCerts = process.env.WINGS_ALLOW_INVALID_CERT === 'true';

export async function httpRequest<T = any>(url: string, opts: RequestOptions = {}): Promise<HttpResult<T>> {
  const { method = 'GET', headers, body, timeoutMs, responseType = 'json' } = opts;
  const controller = new AbortController();
  const timeout = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : undefined;

  try {
    const init: RequestInit & { tls?: { rejectUnauthorized: boolean } } = {
      method,
      headers: normalizeHeaders(headers),
      signal: controller.signal,
    };

    if (allowInvalidCerts) {
      init.tls = { rejectUnauthorized: false };
    }

    if (body !== undefined) {
      if (typeof body === 'string' || body instanceof Uint8Array || body instanceof ArrayBuffer) {
        init.body = body as any;
      } else {
        init.body = JSON.stringify(body);
        if (!init.headers) init.headers = {};
        if (!(init.headers as Record<string, string>)['Content-Type']) {
          (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
        }
      }
    }

    const res = await fetch(url, init);
    const data = await readResponse(res, responseType);
    const headersOut: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      headersOut[key.toLowerCase()] = value;
    });

    if (!res.ok) {
      const err = new HttpError(`HTTP ${res.status}`);
      err.response = { data, status: res.status, headers: headersOut };
      throw err;
    }

    return { data, status: res.status, headers: headersOut } as HttpResult<T>;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}