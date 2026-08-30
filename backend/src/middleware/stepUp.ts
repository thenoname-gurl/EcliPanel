import { verifyAnyToken } from '../utils/pqJwt';
// a bit deprecated aka unused
const STEPUP_HEADER = 'x-stepup-token';
const SUDO_HEADER = 'x-sudo-token';
export const STEPUP_CODE_HEADER = 'x-stepup-code';

function setStepUpCode(ctx: any, code: string) {
  try {
    const headers = (ctx.set && ctx.set.headers) || {};
    headers[STEPUP_CODE_HEADER] = code;
    ctx.set.headers = headers;
  } catch {
    // uwuuuu
  }
}

export function requirePasskeyStepUp(ctx: any): true | { error: string; code: string } {
  if (ctx.apiKey || ctx.oauthToken) return true;

  const t = (key: string, def?: string) =>
    typeof ctx.t === 'function' ? ctx.t(key) : def || key;

  const getHeader = (name: string) => {
    const h = ctx.headers || {};
    return h[name.toLowerCase()] || h[name];
  };

  const token = getHeader(STEPUP_HEADER) || getHeader(SUDO_HEADER);
  let payload: any = null;
  if (token) {
    try {
      payload = verifyAnyToken(token);
    } catch {
      payload = null;
    }
  }

  const user = ctx.user as any;
  const sessionId = ctx.jwtPayload?.sessionId ?? ctx.pqJwtPayload?.sessionId;
  if (
    payload &&
    (payload.stepup === true || payload.sudo === true) &&
    user &&
    payload.userId === user.id &&
    typeof sessionId === 'string' &&
    payload.sessionId === sessionId
  ) {
    return true;
  }

  ctx.set.status = 403;
  setStepUpCode(ctx, 'STEPUP_REQUIRED');
  return { error: t('auth.stepUpRequired', 'Passkey verification required'), code: 'STEPUP_REQUIRED' };
}

export function requirePasskeySudo(ctx: any): true | { error: string; code: string } {
  if (ctx.apiKey || ctx.oauthToken) return true;

  const t = (key: string, def?: string) =>
    typeof ctx.t === 'function' ? ctx.t(key) : def || key;

  const getHeader = (name: string) => {
    const h = ctx.headers || {};
    return h[name.toLowerCase()] || h[name];
  };

  const token = getHeader(SUDO_HEADER);
  let payload: any = null;
  if (token) {
    try {
      payload = verifyAnyToken(token);
    } catch {
      payload = null;
    }
  }

  const user = ctx.user as any;
  const sessionId = ctx.jwtPayload?.sessionId ?? ctx.pqJwtPayload?.sessionId;
  if (
    payload &&
    payload.sudo === true &&
    user &&
    payload.userId === user.id &&
    typeof sessionId === 'string' &&
    payload.sessionId === sessionId
  ) {
    return true;
  }

  ctx.set.status = 403;
  setStepUpCode(ctx, 'SUDO_REQUIRED');
  return { error: t('auth.sudoRequired', 'Passkey re-verification required for this action'), code: 'SUDO_REQUIRED' };
}