import { redisGet, redisSet } from '../config/redis';
import { randomHex, timingSafeEqual } from '../utils/bunCrypto';

export const CSRF_HEADER = 'x-csrf-token';

export function generateCsrfToken(): string {
  return randomHex(32);
}

export function csrfTokenKey(sessionId: string): string {
  return `csrf:${sessionId}`;
}

export async function storeCsrfToken(sessionId: string, ttlSeconds = 86400): Promise<string> {
  const token = generateCsrfToken();
  await redisSet(csrfTokenKey(sessionId), token, ttlSeconds);
  return token;
}

export async function validateCsrfToken(sessionId: string, token: string): Promise<boolean> {
  if (!sessionId || !token) return false;
  try {
    const expected = await redisGet(csrfTokenKey(sessionId));
    if (!expected) return false; 
    return timingSafeEqual(Buffer.from(expected), Buffer.from(token));
  } catch {
    return false;
  }
}

export async function csrfProtection(ctx: any) {
  const method = (ctx.request as Request)?.method || '';
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return;

  const jwtPayload = (ctx as any).jwtPayload as { sessionId?: string } | undefined;
  const sessionId = jwtPayload?.sessionId;
  if (!sessionId) return;

  const headerToken = (ctx.request as Request)?.headers?.get(CSRF_HEADER);
  if (!headerToken) {
    ctx.set.status = 403;
    return { error: ctx.t('validation.missingCSRFToken') };
  }

  const valid = await validateCsrfToken(sessionId, headerToken);
  if (!valid) {
    ctx.set.status = 403;
    return { error: ctx.t('validation.invalidCSRFToken') };
  }
}
