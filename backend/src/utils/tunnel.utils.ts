export function generateUserCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function getHeaderValue(
  headers: Headers | Record<string, string> | null | undefined,
  name: string
): string | null {
  if (!headers) return null;

  if (typeof (headers as Headers).get === 'function') {
    return (
      (headers as Headers).get(name) ??
      (headers as Headers).get(name.toLowerCase()) ??
      null
    );
  }

  const record = headers as Record<string, string>;
  return record[name] ?? record[name.toLowerCase()] ?? null;
}

export function getAuthToken(ctx: {
  headers?: Headers | Record<string, string>;
  query?: Record<string, string>;
}): string | null {
  const header = getHeaderValue(ctx.headers, 'authorization');

  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice(7);
  }

  return ctx.query?.token ?? null;
}

export function parseBody(body: unknown): Record<string, unknown> {
  if (body == null) return {};

  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      try {
        return Object.fromEntries(new URLSearchParams(body));
      } catch {
        return {};
      }
    }
  }

  if (body instanceof FormData) {
    const result: Record<string, unknown> = {};
    body.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  return typeof body === 'object' ? (body as Record<string, unknown>) : {};
}

export function getStringField(
  body: unknown,
  keys: [string, string],
  fallback = ''
): string {
  const parsed = parseBody(body);
  const value = parsed[keys[0]] ?? parsed[keys[1]];
  return value != null ? String(value) : fallback;
}

export function getNumberField(
  body: unknown,
  keys: [string, string],
  fallback = 0
): number {
  const parsed = parseBody(body);
  const value = parsed[keys[0]] ?? parsed[keys[1]];
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function createJsonResponse(
  data: unknown,
  status = 200
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function errorResponse(
  error: string,
  status: number
): Response {
  return createJsonResponse({ error }, status);
}