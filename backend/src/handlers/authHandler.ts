import { t } from 'elysia';
import { AppDataSource } from '../config/typeorm';
import { User } from '../models/user.entity';
import { AIModel } from '../models/aiModel.entity';
import { AIModelUser } from '../models/aiModelUser.entity';
import { comparePassword, hashPassword } from '../utils/password';
import { isEUIdVerificationDisabledForCountry } from '../utils/eu';
import { v4 as uuidv4 } from 'uuid';
import { authenticate } from '../middleware/auth';
import { UserLog } from '../models/userLog.entity';
import { PasskeyService } from '../services/passkeyService';
import { redisSet, redisGet, redisDel } from '../config/redis';
import { sendMail } from '../services/mailService';
import crypto from 'crypto';
const speakeasy = require('speakeasy');

// I fixed it :D
function getPanelUrl(ctx: any): string {
  if (process.env.PANEL_URL) return process.env.PANEL_URL;
  try {
    const proto = (ctx.headers['x-forwarded-proto'] as string) || (ctx.protocol as string) || 'https';
    const host = (ctx.headers.host as string) || 'localhost';
    return `${proto}://${host}`;
  } catch {
    return 'https://ecli.app';
  }
}

function randomToken(bytes = 32) {
  return require('crypto').randomBytes(bytes).toString('hex');
}

  async function verifyTempToken(token: string, logSource: string, ctx: any) {
    if (!token) {
      ctx.set.status = 400;
      return { error: 'Missing tempToken' };
    }
    try {
      const jwt = ctx.app?.jwt || ctx.jwt || (ctx.app && (ctx.app as any).jwt);
      if (!jwt || typeof jwt.verify !== 'function') {
        throw new Error('jwt unavailable');
      }
      const res = jwt.verify(token);
      if (res && typeof (res as any).then === 'function') {
        return await res;
      }
      return res as any;
    } catch (err: any) {
      const logCtx = ctx.log || ctx.app?.log || console;
      logCtx.warn?.({ err: err.message, token, source: logSource }, 'tempToken verification failed');
      ctx.set.status = 400;
      return { error: 'Invalid tempToken' };
    }
  }

export async function authRoutes(app: any, prefix = '') {
  function getCookieDomain(ctx: any): string | null {
    if (process.env.JWT_COOKIE_DOMAIN) {
      return process.env.JWT_COOKIE_DOMAIN;
    }
    try {
      const host = (ctx.headers?.host as string) || '';
      const hostname = host.split(':')[0];
      const parts = hostname.split('.');
      if (parts.length <= 1) return null;
      if (parts.length > 2) parts.shift();
      return '.' + parts.join('.');
    } catch {
      return null;
    }
  }

  function setAuthCookie(ctx: any, token: string) {
    try {
      const name = process.env.JWT_COOKIE_NAME || 'token';
      const maxAge = Number(process.env.JWT_COOKIE_MAX_AGE || String(30 * 24 * 60 * 60));
      const forwardedProto = (ctx.headers?.['x-forwarded-proto'] as string) || (ctx.headers?.['X-Forwarded-Proto'] as string);
      const domain = getCookieDomain(ctx);
      const secure =
        process.env.JWT_COOKIE_SECURE === '1' ||
        forwardedProto === 'https' ||
        (ctx.protocol === 'https');
      const sameSite = secure ? 'none' : 'lax';
      const options: any = {
        httpOnly: true,
        secure,
        sameSite,
        path: '/',
        maxAge,
      };
      if (domain) options.domain = domain;
      ctx.log?.info?.(
        { token: token.slice(0, 8) + '...', domain, secure, forwardedProto, protocol: ctx.protocol, options },
        'setting auth cookie'
      );
      if (ctx.cookie) {
        const c = ctx.cookie[name];
        c.value = token;
        c.httpOnly = true;
        c.secure = secure;
        c.sameSite = sameSite;
        c.path = '/';
        c.maxAge = maxAge;
        if (domain) c.domain = domain;
      } else if (ctx.set?.cookie) {
        const c = ctx.set.cookie[name];
        c.value = token;
        c.httpOnly = true;
        c.secure = secure;
        c.sameSite = sameSite;
        c.path = '/';
        c.maxAge = maxAge;
        if (domain) c.domain = domain;
      } else if (typeof ctx.setCookie === 'function') {
        ctx.setCookie(name, token, options);
      } else if (ctx.set && typeof ctx.set.header === 'function') {
        const parts: string[] = [`${name}=${token}`, `Path=/`, `HttpOnly`, `SameSite=${sameSite}`, `Max-Age=${maxAge}`];
        if (domain) parts.push(`Domain=${domain}`);
        if (secure) parts.push('Secure');
        ctx.set.header('Set-Cookie', parts.join('; '));
      }
    } catch (e) {
      ctx.log?.warn?.({ err: e }, 'Failed to set auth cookie');
    }
  }

  function clearAuthCookie(ctx: any) {
    try {
      const name = process.env.JWT_COOKIE_NAME || 'token';
      const forwardedProto = (ctx.headers?.['x-forwarded-proto'] as string) || (ctx.headers?.['X-Forwarded-Proto'] as string);
      const domain = getCookieDomain(ctx);
      const secure =
        process.env.JWT_COOKIE_SECURE === '1' ||
        forwardedProto === 'https' ||
        (ctx.protocol === 'https');
      const sameSite = secure ? 'none' : 'lax';
      const options: any = {
        httpOnly: true,
        secure,
        sameSite,
        path: '/',
        maxAge: 0,
        expires: new Date(0),
      };
      if (domain) options.domain = domain;
      ctx.log?.info?.(
        { domain, secure, forwardedProto, protocol: ctx.protocol, options },
        'clearing auth cookie'
      );
      if (typeof ctx.setCookie === 'function') {
        ctx.setCookie(name, '', options);
      } else if (ctx.set && typeof ctx.set.header === 'function') {
        const parts = [`${name}=; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`];
        if (domain) parts.push(`Domain=${domain}`);
        if (secure) parts.push('Secure');
        ctx.set.header('Set-Cookie', parts.join('; '));
      }
    } catch (e) {
      ctx.log?.warn?.({ err: e }, 'Failed to clear auth cookie');
    }
  }

  app.post(prefix + '/auth/login', async (ctx: any) => {
    const body = ctx.body || {};
    const { email, password } = body as any;
    if (!email || !password) {
      ctx.set.status = 400;
      return { error: 'Missing email or password' };
    }
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOneBy({ email });
    if (!user) {
      ctx.set.status = 401;
      return { error: 'Invalid credentials' };
    }
    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) {
      ctx.set.status = 401;
      return { error: 'Invalid credentials' };
    }

    if (user.twoFactorEnabled) {
      const tfaSession = uuidv4();
      await redisSet(`tfa:session:${tfaSession}`, String(user.id), 300);
      const tempToken = ctx.app?.jwt?.sign
        ? ctx.app.jwt.sign({ userId: user.id, tfaSession, tfa: true }, { expiresIn: '5m' })
        : require('jsonwebtoken').sign({ userId: user.id, tfaSession, tfa: true }, process.env.JWT_SECRET || 'changeme', { expiresIn: '5m' });
      ctx.log?.info?.({ userId: user.id, tfaSession }, 'issued 2FA tempToken');
      return { twoFactorRequired: true, tempToken };
    }

    const sessionId = uuidv4();
    user.sessions = Array.isArray(user.sessions) ? user.sessions : [];
    user.sessions.push(sessionId);
    if (user.sessions.length > 20) user.sessions = user.sessions.slice(-20);
    await userRepo.save(user);

    const token = ctx.app?.jwt?.sign
      ? ctx.app.jwt.sign({ userId: user.id, sessionId })
      : require('jsonwebtoken').sign({ userId: user.id, sessionId }, process.env.JWT_SECRET || 'changeme');

    try {
      const logRepo = AppDataSource.getRepository(UserLog);
      await logRepo.save(logRepo.create({ userId: user.id, action: 'login', timestamp: new Date() }));
    } catch (err) {
      ctx.log?.warn?.({ err }, '[DEBUG:login] failed to log login event');
    }


    ctx.log?.info?.({ userId: user.id, token: token.slice(0,8) + '...' }, 'login succeeded, returning token');
    setAuthCookie(ctx, token);
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        middleName: user.middleName || null,
        lastName: user.lastName,
        displayName: user.displayName || null,
        address: user.address || null,
        address2: user.address2 || null,
        phone: user.phone || null,
        billingCompany: user.billingCompany || null,
        billingCity: user.billingCity || null,
        billingState: user.billingState || null,
        billingZip: user.billingZip || null,
        billingCountry: user.billingCountry || null,
        tier: (user as any).portalType || (user as any).tier,
        role: user.role,
        sessionId,
        emailVerified: user.emailVerified ?? false,
        passkeyCount: 0,
        studentVerified: (user as any).studentVerified || false,
        twoFactorEnabled: !!user.twoFactorEnabled,
        avatarUrl: user.avatarUrl || null,
        org: user.org ? { id: user.org.id, name: user.org.name, handle: user.org.handle } : null,
        orgRole: user.orgRole || 'member',
        limits: (user as any).limits || null,
        nodeId: (user as any).nodeId || null,
      }
    };
  }, {
    body: t.Object({ email: t.String({ format: 'email' }), password: t.String({ minLength: 1 }) }),
    response: {
      200: t.Object({ token: t.Optional(t.String()), twoFactorRequired: t.Optional(t.Boolean()), tempToken: t.Optional(t.String()) }),
      400: t.Object({ error: t.String() }),
      401: t.Object({ error: t.String() }),
      500: t.Object({ error: t.String() })
    },
    detail: {
      summary: 'Authenticate user',
      description: 'Authenticate a user with email and password. Returns JWT or temporary token if 2FA is required.',
      tags: ['Auth'],
      operationId: 'postAuthLogin',
    }
  });

  app.post(prefix + '/auth/2fa/send-email', async (ctx: any) => {
    const body = ctx.body || {};
    const { tempToken } = body as any;
    const payload = await verifyTempToken(tempToken, 'send-email', ctx);
    if (payload && payload.error) {
      return payload;
    }
    if (!payload?.tfa || !payload?.userId) {
      ctx.set.status = 400;
      const logCtx = ctx.log || ctx.app?.log || console;
      logCtx.warn?.({ payload, token: tempToken }, 'Invalid tempToken payload in send-email');
      return { error: 'Invalid tempToken payload' };
    }
    ctx.log?.info?.({ userId: payload.userId, tfaSession: payload.tfaSession }, 'sending 2FA email');
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOneBy({ id: payload.userId });
    if (!user) {
      ctx.set.status = 404;
      return { error: 'User not found' };
    }
    const code = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
    await redisSet(`tfa:email:${payload.tfaSession}`, code, 300);
    try {
      await sendMail({ to: user.email, from: process.env.SMTP_FROM || 'noreply@eclipsesystems.org', subject: 'Verify Your Login', template: 'tfa-email', vars: { name: user.displayName || user.email.split('@')[0], code } });
    } catch (err) { ctx.log?.error?.({ err }, 'Failed to send TFA email'); }
    return { success: true };
  }, {
    body: t.Object({ tempToken: t.String() }),
    response: {
      200: t.Object({ success: t.Boolean() }),
      400: t.Object({ error: t.String() }),
      404: t.Object({ error: t.String() })
    },
    detail: {
      summary: 'Send 2FA email code',
      description: 'Send a 2FA code to the user email for login verification.',
      tags: ['Auth'],
      operationId: 'postAuth2faSendEmail',
    }
  });

  app.post(prefix + '/auth/2fa/verify-login', async (ctx: any) => {
    try {
      const body = ctx.body || {};
      const { tempToken, token, backupCode, emailCode } = body as any;
      const payload = await verifyTempToken(tempToken, 'verify-login', ctx);
      if (payload && payload.error) {
        return payload;
      }
      if (!payload?.tfa || !payload?.userId) {
        ctx.set.status = 400;
        const logCtx = ctx.log || ctx.app?.log || console;
        logCtx.warn?.({ payload, token: tempToken, source: 'verify-login' }, 'Invalid tempToken payload in verify-login');
        return { error: 'Invalid tempToken payload' };
      }
      const userRepo = AppDataSource.getRepository(User);
      const user = await userRepo.findOneBy({ id: payload.userId });
      if (!user) {
        ctx.set.status = 404;
        return { error: 'User not found' };
      }

      if (emailCode) {
        const expected = await redisGet(`tfa:email:${payload.tfaSession}`);
        if (expected && expected === String(emailCode)) {
          await redisDel(`tfa:email:${payload.tfaSession}`);
        } else {
          ctx.set.status = 400;
          return { error: 'Invalid email code' };
        }
      }

      if (backupCode) {
        const hashes = user.twoFactorRecoveryCodes || [];
        const h = require('crypto').createHash('sha256').update(String(backupCode)).digest('hex');
        if (!hashes.includes(h)) {
          ctx.set.status = 400;
          return { error: 'Invalid backup code' };
        }
        user.twoFactorRecoveryCodes = hashes.filter((x: string) => x !== h);
        await userRepo.save(user);
      }

      if (token) {
        const speakeasy = require('speakeasy');
        const ok = speakeasy.totp.verify({ secret: user.twoFactorSecret || '', encoding: 'base32', token: String(token).trim(), window: 1 });
        if (!ok) {
          ctx.set.status = 400;
          return { error: 'Invalid token' };
        }
      }

      const sessionId = uuidv4();
      user.sessions = user.sessions || [];
      user.sessions.push(sessionId);
      if (user.sessions.length > 20) user.sessions = user.sessions.slice(-20);
      await userRepo.save(user);
      const finalToken = app.jwt.sign({ userId: user.id, sessionId });
      try { setAuthCookie(ctx, finalToken); } catch (e) { ctx.log?.warn?.({ err: e }, 'setAuthCookie failed for 2fa verify-login'); }
      const logRepo = AppDataSource.getRepository(UserLog);
      await logRepo.save(logRepo.create({ userId: user.id, action: 'login_2fa', timestamp: new Date() }));
      // token returned in body; frontend will store it. no cookie set here.
      return { token: finalToken };
    } catch (err) {
      ctx.log?.error?.({ err }, 'Error in 2fa verify-login');
      ctx.set.status = 500;
      return { error: 'Internal server error' };
    }
  }, {
    body: t.Object({ tempToken: t.String(), token: t.Optional(t.String()), backupCode: t.Optional(t.String()), emailCode: t.Optional(t.String()) }),
    response: {
      200: t.Object({ token: t.String() }),
      400: t.Object({ error: t.String() }),
      401: t.Object({ error: t.String() }),
      404: t.Object({ error: t.String() }),
      500: t.Object({ error: t.String() })
    },
    detail: {
      summary: 'Verify 2FA login',
      description: 'Verify 2FA, backup, or email code during login. Returns JWT if successful.',
      tags: ['Auth'],
      operationId: 'postAuth2faVerifyLogin',
    }
  });

  app.post(prefix + '/auth/password-reset/request', async (ctx: any) => {
    const body = ctx.body || {};
    const { email } = body as any;
    if (!email) {
      ctx.set.status = 400;
      return { error: 'Email required' };
    }

    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOneBy({ email });
    if (!user) {
      return { success: true };
    }

    const token = uuidv4();
    await redisSet(`password-reset:${token}`, String(user.id), 3600);
    const url = `${getPanelUrl(ctx)}/reset-password/${token}`;

    try {
      await sendMail({
        to: user.email,
        from: process.env.SMTP_FROM || 'noreply@ecli.app',
        subject: 'Password reset request',
        template: 'password-reset',
        vars: {
          name: user.firstName || user.email,
          url,
          message: 'Click the link below to reset your password. This link is valid for 1 hour.',
        },
      });
    } catch (e) {
      // skip
    }

    return { success: true };
  }, {
    response: { 200: t.Object({ success: t.Boolean() }), 400: t.Object({ error: t.String() }) },
    detail: { summary: 'Request password reset email', tags: ['Auth'] }
  });

  app.post(prefix + '/auth/password-reset/confirm', async (ctx: any) => {
    const body = ctx.body || {};
    const { token, password } = body as any;
    if (!token || !password) {
      ctx.set.status = 400;
      return { error: 'token and password are required' };
    }

    const userId = await redisGet(`password-reset:${token}`);
    if (!userId) {
      ctx.set.status = 400;
      return { error: 'Invalid or expired token' };
    }

    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOneBy({ id: Number(userId) });
    if (!user) {
      ctx.set.status = 400;
      return { error: 'Invalid token' };
    }

    user.passwordHash = await hashPassword(String(password));
    user.sessions = [];
    await userRepo.save(user);
    await redisDel(`password-reset:${token}`);

    return { success: true };
  }, {
    response: { 200: t.Object({ success: t.Boolean() }), 400: t.Object({ error: t.String() }) },
    detail: { summary: 'Confirm password reset', tags: ['Auth'] }
  });

  app.post(prefix + '/auth/logout', async (ctx: any) => {
    const user = ctx.user as User;
    if (!user) {
      ctx.set.status = 401;
      return { error: 'Unauthorized' };
    }
    const decoded = ctx.jwtPayload as { sessionId?: string } | undefined;
    const sessionId = decoded?.sessionId;
    if (sessionId && user.sessions) {
      user.sessions = user.sessions.filter((s: string) => s !== sessionId);
      const userRepo = AppDataSource.getRepository(User);
      await userRepo.save(user);
      const logRepo = AppDataSource.getRepository(UserLog);
      await logRepo.save(logRepo.create({ userId: user.id, action: 'logout', timestamp: new Date() }));
    }
    try { clearAuthCookie(ctx); } catch {}
    return { success: true };
  }, { beforeHandle: authenticate,
    response: {
      200: t.Object({ success: t.Boolean() }),
      401: t.Object({ error: t.String() })
    },
    detail: {
      summary: 'Logout current session',
      description: 'Logs out the current authenticated session.',
      tags: ['Auth'],
      operationId: 'postAuthLogout',
    }
  });


  async function sendVerificationEmail(user: User) {
    const code = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
    const token = uuidv4();

    await redisSet(`email-verify:token:${token}`, String(user.id), 86400);
    await redisSet(`email-verify:code:${user.id}`, code, 86400);

    const panelUrl = process.env.PANEL_URL || 'https://panel.ecli.app';
    const verifyUrl = `${panelUrl}/verify-email?token=${token}`;
    try {
      await sendMail({
        to: user.email,
        from: process.env.SMTP_FROM || 'noreply@eclipsesystems.org',
        subject: 'Verify your email — EcliPanel',
        template: 'email-verify',
        vars: { name: user.firstName || 'User', verifyUrl, code },
      });
    } catch (err) {
      console.error('Failed to send verification email:', err);
    }
  }

  app.get(prefix + '/auth/verify-email', async (ctx: any) => {
    const { token } = ctx.query as any;
    if (!token) {
      ctx.set.status = 400;
      return { error: 'Missing token' };
    }
    const userId = await redisGet(`email-verify:token:${token}`);
    if (!userId) {
      ctx.log?.warn({ token }, 'email verification link used with missing/expired token');
      ctx.set.status = 400;
      return { error: 'Invalid or expired token' };
    }
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOneBy({ id: Number(userId) });
    if (!user) {
      ctx.set.status = 404;
      return { error: 'User not found' };
    }
    user.emailVerified = true;
    await userRepo.save(user);
    await redisDel(`email-verify:token:${token}`);
    await redisDel(`email-verify:code:${user.id}`);
    const panelUrl = getPanelUrl(ctx);
    return { redirect: `${panelUrl}/dashboard?emailVerified=1` };
  }, {
    response: {
      200: t.Any(),
      400: t.Object({ error: t.String() }),
      404: t.Object({ error: t.String() })
    },
    detail: {
      summary: 'Verify email via link',
      description: 'Verifies user email using a verification link.',
      tags: ['Auth'],
      operationId: 'getAuthVerifyEmail',
    }
  });

  app.post(prefix + '/auth/verify-email', async (ctx: any) => {
    const user = ctx.user;
    const body = ctx.body || {};
    const { code } = body as any;
    if (!code) {
      ctx.set.status = 400;
      return { error: 'Missing code' };
    }
    const expected = await redisGet(`email-verify:code:${user.id}`);
    if (!expected || expected !== String(code).trim()) {
      ctx.log?.warn({ userId: user.id, provided: code, expected }, 'email verification failed');
      ctx.set.status = 400;
      return { error: 'Invalid or expired code' };
    }
    const userRepo = AppDataSource.getRepository(User);
    user.emailVerified = true;
    await userRepo.save(user);
    await redisDel(`email-verify:code:${user.id}`);
    return { success: true };
  }, { beforeHandle: authenticate,
    body: t.Object({ code: t.String() }),
    response: {
      200: t.Object({ success: t.Boolean() }),
      400: t.Object({ error: t.String() }),
      401: t.Object({ error: t.String() })
    },
    detail: {
      summary: 'Verify email with code',
      description: 'Verifies user email using a code sent to their email.',
      tags: ['Auth'],
      operationId: 'postAuthVerifyEmail',
    }
  });

  app.post(prefix + '/auth/resend-verification', async (ctx: any) => {
    const user = ctx.user;
    if (user.emailVerified) return { success: true, message: 'Already verified' };
    await sendVerificationEmail(user);
    return { success: true };
  }, { beforeHandle: authenticate,
    response: {
      200: t.Object({ success: t.Boolean(), message: t.Optional(t.String()) }),
      401: t.Object({ error: t.String() })
    },
    detail: {
      summary: 'Resend verification email',
      description: 'Resends the verification email to the user.',
      tags: ['Auth'],
      operationId: 'postAuthResendVerification',
    }
  });

  app.post(prefix + '/auth/passkey/register-challenge', async (ctx: any) => {
    const user = ctx.user;
    const origin = ctx.headers.origin || ctx.headers.referer;
    let frontendHost = ctx.hostname;
    if (origin) {
      try {
        frontendHost = new URL(origin).hostname;
      } catch {}
    }
    const opts = await PasskeyService.generateRegistration({ id: user.id, email: user.email }, frontendHost);
    await redisSet(`passkey:reg:${user.id}`, opts.challenge, 300);
    return opts;
  }, { beforeHandle: authenticate,
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }) },
    detail: {
      summary: 'Begin passkey registration',
      description: 'Starts the passkey registration process for the user.',
      tags: ['Auth'],
      operationId: 'postAuthPasskeyRegisterChallenge',
    }
  });

  app.post(prefix + '/auth/passkey/register', async (ctx: any) => {
    const user = ctx.user;
    const body = ctx.body || {};
    const { attestationResponse } = body as any;
    const expected = await redisGet(`passkey:reg:${user.id}`);
    if (!expected) {
      ctx.set.status = 400;
      return { error: 'No challenge' };
    }
    const ver = await PasskeyService.verifyRegistrationResponse({
      userId: user.id,
      attestationResponse,
      expectedChallenge: String(expected),
    });
    await redisDel(`passkey:reg:${user.id}`);
    return ver;
  }, { beforeHandle: authenticate,
    body: t.Any(),
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }) },
    detail: {
      summary: 'Complete passkey registration',
      description: 'Completes the passkey registration process for the user.',
      tags: ['Auth'],
      operationId: 'postAuthPasskeyRegister',
    }
  });

  app.post(prefix + '/auth/passkey/authenticate-challenge', async (ctx: any) => {
    const body = ctx.body || {};
    const { email } = body as any;
    if (!email) {
      ctx.set.status = 400;
      return { error: 'Missing email' };
    }
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOneBy({ email });
    if (!user) {
      ctx.set.status = 400;
      return { error: 'No passkeys available for this account' };
    }
    const origin = ctx.headers.origin || ctx.headers.referer;
    let frontendHost = ctx.hostname;
    if (origin) {
      try {
        frontendHost = new URL(origin).hostname;
      } catch {}
    }
    const opts = await PasskeyService.generateAuthentication(user.id, frontendHost);
    await redisSet(`passkey:auth:${user.id}`, opts.challenge, 300);
    return opts;
  }, {
    body: t.Object({ email: t.String({ format: 'email' }) }),
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }) },
    detail: {
      summary: 'Start passkey authentication',
      description: 'Starts the passkey authentication process for the user.',
      tags: ['Auth'],
      operationId: 'postAuthPasskeyAuthenticateChallenge',
    }
  });

  app.post(prefix + '/auth/passkey/authenticate', async (ctx: any) => {
    const body = ctx.body || {};
    const { email, authenticationResponse } = body as any;
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOneBy({ email });
    if (!user) {
      ctx.set.status = 401;
      return { error: 'Authentication failed' };
    }
    const expected = await redisGet(`passkey:auth:${user.id}`);
    if (!expected) {
      ctx.set.status = 400;
      return { error: 'No challenge' };
    }
    const ver = await PasskeyService.verifyAuthenticationResponse({
      userId: user.id,
      authenticationResponse,
      expectedChallenge: String(expected),
    });
    if (ver.verified) {
      const sessionId = uuidv4();
      user.sessions = user.sessions || [];
      user.sessions.push(sessionId);
      if (user.sessions.length > 20) user.sessions = user.sessions.slice(-20);
      await userRepo.save(user);
      const token = app.jwt.sign({ userId: user.id, sessionId });
      try { setAuthCookie(ctx, token); } catch (e) { ctx.log?.warn?.({ err: e }, 'setAuthCookie failed for passkey auth'); }
      return { token };
    } else {
      ctx.set.status = 401;
      return { error: 'Authentication failed' };
    }
  }, {
    body: t.Object({ email: t.String({ format: 'email' }), authenticationResponse: t.Any() }),
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }) },
    detail: {
      summary: 'Finish passkey authentication',
      description: 'Completes the passkey authentication process for the user.',
      tags: ['Auth'],
      operationId: 'postAuthPasskeyAuthenticate',
    }
  });

  app.get(prefix + '/auth/passkeys', async (ctx: any) => {
    const user = ctx.user;
    const passkeyRepo = AppDataSource.getRepository(require('../models/passkey.entity').Passkey);
    const keys = await passkeyRepo.find({ where: { user: { id: user.id } }, relations: ['user'] });
    return keys.map((k: any) => ({
      id: k.id,
      credentialID: k.credentialID,
      transports: k.transports,
    }));
  }, { beforeHandle: authenticate,
    response: { 200: t.Array(t.Object({ id: t.Number(), credentialID: t.Any(), transports: t.Any() })), 401: t.Object({ error: t.String() }) },
    detail: {
      summary: 'List registered passkeys',
      description: 'Lists all registered passkeys for the user.',
      tags: ['Auth'],
      operationId: 'getAuthPasskeys',
    }
  });

  app.get(prefix + '/auth/2fa/setup', async (ctx: any) => {
    const user = ctx.user as User;
    const secret = speakeasy.generateSecret({ name: `EcliPanel (${user.email})` });
    return { secret: secret.base32, otpauth_url: secret.otpauth_url };
  }, { beforeHandle: authenticate,
    response: { 200: t.Object({ secret: t.String(), otpauth_url: t.String() }), 401: t.Object({ error: t.String() }) },
    detail: {
      summary: 'Generate 2FA secret',
      description: 'Generates a new 2FA secret for the user.',
      tags: ['Auth'],
      operationId: 'getAuth2faSetup',
    }
  });

  app.post(prefix + '/auth/2fa/verify', async (ctx: any) => {
    const user = ctx.user as User;
    const body = ctx.body || {};
    const { token, secret } = body as any;
    if (!token || !secret) {
      ctx.set.status = 400;
      return { error: 'Missing token or secret' };
    }
    const ok = speakeasy.totp.verify({ secret: String(secret), encoding: 'base32', token: String(token).trim(), window: 1 });
    if (!ok) {
      ctx.set.status = 400;
      return { error: 'Invalid token' };
    }
    const userRepo = AppDataSource.getRepository(User);
    user.twoFactorEnabled = true;
    user.twoFactorSecret = String(secret);
    const codes: string[] = [];
    const hashes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const c = randomToken(6);
      codes.push(c);
      hashes.push(require('crypto').createHash('sha256').update(c).digest('hex'));
    }
    user.twoFactorRecoveryCodes = hashes;
    await userRepo.save(user);
    ctx.log.info({ userId: user.id, twoFactorEnabled: user.twoFactorEnabled }, 'User 2FA enabled and recovery codes generated');
    return { recoveryCodes: codes };
  }, { beforeHandle: authenticate,
    body: t.Object({ token: t.String(), secret: t.String() }),
    response: { 200: t.Object({ recoveryCodes: t.Array(t.String()) }), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }) },
    detail: {
      summary: 'Enable two-factor authentication',
      description: 'Enables two-factor authentication for the user.',
      tags: ['Auth'],
      operationId: 'postAuth2faVerify',
    }
  });

  app.post(prefix + '/auth/2fa/disable', async (ctx: any) => {
    const user = ctx.user as User;
    const body = ctx.body || {};
    const { token } = body as any;
    if (!token) {
      ctx.set.status = 400;
      return { error: 'Missing token' };
    }
    const ok = speakeasy.totp.verify({ secret: user.twoFactorSecret || '', encoding: 'base32', token: String(token).trim(), window: 1 });
    if (!ok) {
      ctx.set.status = 400;
      return { error: 'Invalid token' };
    }
    const userRepo = AppDataSource.getRepository(User);
    user.twoFactorEnabled = false;
    user.twoFactorSecret = undefined;
    user.twoFactorRecoveryCodes = undefined;
    await userRepo.save(user);
    ctx.log.info({ userId: user.id, twoFactorEnabled: user.twoFactorEnabled }, 'User 2FA disabled');
    return { success: true };
  }, { beforeHandle: authenticate,
    body: t.Object({ token: t.String() }),
    response: { 200: t.Object({ success: t.Boolean() }), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }) },
    detail: {
      summary: 'Disable two-factor authentication',
      description: 'Disables two-factor authentication for the user.',
      tags: ['Auth'],
      operationId: 'postAuth2faDisable',
    }
  });

  app.delete(prefix + '/auth/passkeys/:id', async (ctx: any) => {
    const user = ctx.user;
    const { id } = (ctx.params as any);
    const passkeyRepo = AppDataSource.getRepository(require('../models/passkey.entity').Passkey);
    const key = await passkeyRepo.findOne({ where: { id: Number(id), user: { id: user.id } }, relations: ['user'] });
    if (!key) {
      ctx.set.status = 404;
      return { error: 'Passkey not found' };
    }
    await passkeyRepo.remove(key);
    return { success: true };
  }, { beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean() }), 401: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: {
      summary: 'Remove a passkey',
      description: 'Removes a passkey from the user account.',
      tags: ['Auth'],
      operationId: 'deleteAuthPasskeysId',
    }
  });

  // I hope gods of github will accept our partnership
  // and I will hope whatever I did will work..
  app.get(prefix + '/auth/github/start', async (ctx: any) => {
    const user = ctx.user;
    const state = randomToken(16);
    await redisSet(`github-student-state:${state}`, String(user.id), 600);
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) {
      ctx.set.status = 500;
      return { error: 'GitHub client id not configured' };
    }
    const redirect = `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=read:user+user:email&state=${state}`;
    return { redirect };
  }, { beforeHandle: authenticate,
    response: { 200: t.Object({ redirect: t.String() }), 401: t.Object({ error: t.String() }), 500: t.Object({ error: t.String() }) },
    detail: {
      summary: 'Initiate GitHub student OAuth',
      description: 'Starts the GitHub OAuth flow for student verification.',
      tags: ['Auth'],
      operationId: 'getAuthGithubStart',
    }
  });

  app.get(prefix + '/auth/github/callback', async (ctx: any) => {
    const { code, state } = ctx.query as any;
    if (!code || !state) {
      ctx.set.status = 400;
      return { error: 'Missing code or state' };
    }
    const stored = await redisGet(`github-student-state:${state}`);
    if (!stored) {
      ctx.set.status = 400;
      return { error: 'Invalid or expired state' };
    }
    const userId = Number(stored);

    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      ctx.set.status = 500;
      return { error: 'GitHub OAuth not configured' };
    }
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, state }),
    });
    const tokenData = await tokenRes.json();
    ctx.log.info({ scopes: tokenData.scope, expires_in: tokenData.expires_in }, 'GitHub token metadata');
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      ctx.set.status = 400;
      return { error: 'Failed to obtain access token' };
    }

    const eduRes = await fetch('https://education.github.com/api/user', {
      headers: {
        'Authorization': `token ${accessToken}`,
        'User-Agent': 'EcliPanel',
        'Accept': 'application/vnd.github+json',
      },
    });
    const eduText = await eduRes.text();
    ctx.log.info({ status: eduRes.status, headers: Object.fromEntries(eduRes.headers.entries()), body: eduText }, 'GitHub Education API raw response');
    let eduData: any = {};
    try { eduData = JSON.parse(eduText); } catch {
      ctx.log.warn({ status: eduRes.status, body: eduText }, 'GitHub Education API returned non-JSON');
    }
    ctx.log.info({ eduData }, 'GitHub Education API parsed response');
    const isStudent = eduData?.student === true;
    if (!isStudent) {
      ctx.log.warn({ userId, eduData }, 'GitHub Education API did not confirm student status');
      const panelUrl = getPanelUrl(ctx);
      return { redirect: `${panelUrl}/?studentVerified=0` };
    }

    const { Plan } = require('../models/plan.entity');
    const planRepo = AppDataSource.getRepository(Plan);
    const eduPlan = await planRepo.findOne({ where: { type: 'educational' } });

    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOneBy({ id: userId });
    if (user) {
      user.studentVerified = true;
      user.studentVerifiedAt = new Date();
      user.portalType = 'educational';
      user.educationLimits = {
        memory:      eduPlan?.memory      ?? 2048,
        disk:        eduPlan?.disk        ?? 20480,
        cpu:         eduPlan?.cpu         ?? 400,
        serverLimit: eduPlan?.serverLimit ?? 2,
      };
      ctx.log.info({ eduPlan: eduPlan?.id ?? null, limits: user.educationLimits }, 'Applying educational plan limits to user');
      await userRepo.save(user);
    }
    await redisDel(`github-student-state:${state}`);
    const panelUrl = getPanelUrl(ctx);
    return { redirect: `${panelUrl}/?studentVerified=1` };
  }, {
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 500: t.Object({ error: t.String() }) },
    detail: {
      summary: 'Handle GitHub OAuth callback',
      description: 'Handles the callback from GitHub OAuth for student verification.',
      tags: ['Auth'],
      operationId: 'getAuthGithubCallback',
    }
  });

  app.get(prefix + '/auth/hackclub/start', async (ctx: any) => {
    const user = ctx.user;
    const state = randomToken(16);
    await redisSet(`hackclub-student-state:${state}`, String(user.id), 600);
    const clientId = process.env.HACKCLUB_CLIENT_ID;
    const redirectUri = process.env.HACKCLUB_REDIRECT_URI || `${getPanelUrl(ctx)}/api/auth/hackclub/callback`;
    if (!clientId) {
      ctx.set.status = 500;
      return { error: 'Hack Club client id not configured' };
    }
    const scope = 'verification_status';
    const authorizationUrl =
      `https://auth.hackclub.com/oauth/authorize?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=${encodeURIComponent(state)}`;

    return { redirect: authorizationUrl };
  }, { beforeHandle: authenticate,
    response: { 200: t.Object({ redirect: t.String() }), 401: t.Object({ error: t.String() }), 500: t.Object({ error: t.String() }) },
    detail: {
      summary: 'Initiate Hack Club student OAuth',
      description: 'Starts the Hack Club OAuth flow for student verification.',
      tags: ['Auth'],
      operationId: 'getAuthHackclubStart',
    }
  });

  app.get(prefix + '/auth/hackclub/callback', async (ctx: any) => {
    const { code, state } = ctx.query as any;
    if (!code || !state) {
      ctx.set.status = 400;
      return { error: 'Missing code or state' };
    }
    const stored = await redisGet(`hackclub-student-state:${state}`);
    if (!stored) {
      ctx.set.status = 400;
      return { error: 'Invalid or expired state' };
    }
    const userId = Number(stored);

    const clientId = process.env.HACKCLUB_CLIENT_ID;
    const clientSecret = process.env.HACKCLUB_CLIENT_SECRET;
    const redirectUri = process.env.HACKCLUB_REDIRECT_URI || `${getPanelUrl(ctx)}/api/auth/hackclub/callback`;
    if (!clientId || !clientSecret) {
      ctx.set.status = 500;
      return { error: 'Hack Club OAuth not configured' };
    }

    const tokenRes = await fetch('https://auth.hackclub.com/oauth/token', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      ctx.set.status = 400;
      return { error: 'Failed to obtain access token' };
    }

    const meRes = await fetch('https://auth.hackclub.com/api/v1/me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });
    const meText = await meRes.text();
    let meData: any = {};
    try { meData = JSON.parse(meText); } catch {
      ctx.log.warn({ status: meRes.status, body: meText }, 'Hack Club /api/v1/me returned non-JSON');
    }

    const hkIdentity = meData?.identity ?? {};
    const isStudent = hkIdentity?.ysws_eligible === true;

    if (!isStudent) {
      ctx.log.warn({ userId, meData }, 'Hack Club did not confirm student status');
      const panelUrl = getPanelUrl(ctx);
      await redisDel(`hackclub-student-state:${state}`);
      return { redirect: `${panelUrl}/?studentVerified=0` };
    }

    const { Plan } = require('../models/plan.entity');
    const planRepo = AppDataSource.getRepository(Plan);
    const eduPlan = await planRepo.findOne({ where: { type: 'educational' } });

    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOneBy({ id: userId });
    if (user) {
      user.studentVerified = true;
      user.studentVerifiedAt = new Date();

      const defaultEduLimits = {
        memory: eduPlan?.memory ?? 2048,
        disk: eduPlan?.disk ?? 20480,
        cpu: eduPlan?.cpu ?? 400,
        serverLimit: eduPlan?.serverLimit ?? 2,
      };

      const existingLimits = user.educationLimits || {};
      const currentBaseLimits = user.limits || {};

      user.educationLimits = {
        memory: Math.max(existingLimits.memory || 0, currentBaseLimits.memory || 0, defaultEduLimits.memory),
        disk: Math.max(existingLimits.disk || 0, currentBaseLimits.disk || 0, defaultEduLimits.disk),
        cpu: Math.max(existingLimits.cpu || 0, currentBaseLimits.cpu || 0, defaultEduLimits.cpu),
        serverLimit: Math.max(existingLimits.serverLimit || 0, currentBaseLimits.serverLimit || 0, defaultEduLimits.serverLimit),
      };

      if (!['paid', 'enterprise'].includes(user.portalType)) {
        user.portalType = 'educational';
      }

      ctx.log.info({ eduPlan: eduPlan?.id ?? null, portalType: user.portalType, educationLimits: user.educationLimits }, 'Applying Hack Club educational plan limits to user');
      await userRepo.save(user);
    }

    await redisDel(`hackclub-student-state:${state}`);
    const panelUrl = getPanelUrl(ctx);
    return { redirect: `${panelUrl}/?studentVerified=1` };
  }, {
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 500: t.Object({ error: t.String() }) },
    detail: {
      summary: 'Handle Hack Club OAuth callback',
      description: 'Handles the callback from Hack Club OAuth for student verification.',
      tags: ['Auth'],
      operationId: 'getAuthHackclubCallback',
    }
  });

  app.post(prefix + '/auth/demo', async (ctx: any) => {
    const user = ctx.user as User | undefined;
    if (!user) {
      ctx.set.status = 401;
      return { error: 'Unauthorized' };
    }

    if (user.demoUsed) {
      ctx.set.status = 400;
      return { error: 'Demo has already been used' };
    }

    const durationMinutes = Number(ctx.body?.minutes || 30);
    const now = new Date();
    const expires = new Date(now.getTime() + durationMinutes * 60 * 1000);

    user.demoOriginalPortalType = user.portalType;
    user.portalType = 'enterprise';
    user.demoExpiresAt = expires;
    user.demoLimits = { tokens: 500, requests: 50 };
    user.demoUsed = true;

    if (!user.org) {
      const orgRepo = AppDataSource.getRepository(require('../models/organisation.entity').Organisation);
      const demoHandle = `demo-${user.id}`;
      let demoOrg: any = await orgRepo.findOneBy({ handle: demoHandle });
      if (!demoOrg) {
        demoOrg = orgRepo.create({
          name: `Demo (${user.email})`,
          handle: demoHandle,
          ownerId: user.id,
          portalTier: 'enterprise',
        } as any);
        await orgRepo.save(demoOrg);
      }
      user.org = demoOrg as any;
      user.orgRole = 'member';
    }

    await AppDataSource.getRepository(User).save(user);

    try {
      const modelRepo = AppDataSource.getRepository(AIModel);
      const userModelRepo = AppDataSource.getRepository(AIModelUser);
      const demoTag = 'demo';

      const models = await modelRepo.find();
      let demoModel = models.find((m) => Array.isArray(m.tags) && m.tags.includes(demoTag));

      if (!demoModel) {
        const demoModelName = 'openai/gpt-oss-20b';
        demoModel = await modelRepo.findOneBy({ name: demoModelName });
      }

      const existing = await userModelRepo.findOne({ where: { user: { id: user.id }, model: { id: demoModel.id } } });
      if (!existing) {
        const link = userModelRepo.create({ user, model: demoModel, limits: { tokens: 500, requests: 50 } });
        await userModelRepo.save(link);
      }
    } catch (err) {
      // skip
    }

    return { success: true, demoExpiresAt: expires.toISOString(), demoLimits: user.demoLimits };
  }, { beforeHandle: authenticate,
    body: t.Object({ minutes: t.Optional(t.Number()) }),
    response: { 200: t.Object({ success: t.Boolean(), demoExpiresAt: t.String(), demoLimits: t.Optional(t.Any()) }), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }) },
    detail: { summary: 'Start a temporary demo mode', description: 'Grants temporary enterprise access with demo limits.', tags: ['Auth'], operationId: 'postAuthDemo' }
  });

  app.post(prefix + '/auth/demo/finish', async (ctx: any) => {
    const user = ctx.user as User | undefined;
    if (!user) {
      ctx.set.status = 401;
      return { error: 'Unauthorized' };
    }

    if (user.demoOriginalPortalType) {
      user.portalType = user.demoOriginalPortalType;
      user.demoOriginalPortalType = undefined;
    }
    user.demoExpiresAt = undefined;
    user.demoLimits = undefined;

    if (user.org && String(user.org.handle).startsWith('demo-') && user.org.ownerId === user.id) {
      try {
        const orgRepo = AppDataSource.getRepository(require('../models/organisation.entity').Organisation);
        await orgRepo.remove(user.org);
      } catch (e) {
        // skip
      }
      user.org = undefined;
      user.orgRole = 'member';
    }

    await AppDataSource.getRepository(User).save(user);

    return { success: true };
  }, { beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean() }), 401: t.Object({ error: t.String() }) },
    detail: { summary: 'Finish demo mode early', description: 'Reverts demo mode back to the original plan.', tags: ['Auth'], operationId: 'postAuthDemoFinish' }
  });

  app.get(prefix + '/auth/session', async (ctx: any) => {
    const user = ctx.user as User | undefined;
    if (!user) {
      ctx.set.status = 401;
      return { error: 'Unauthorized' };
    }
    const decoded = ctx.jwtPayload as { sessionId?: string } | undefined;
    const passkeyRepo = AppDataSource.getRepository(require('../models/passkey.entity').Passkey);
    const passkeyCount = await passkeyRepo.count({ where: { user: { id: user.id } } });

    const userTier = (user as any).portalType || (user as any).tier || ((user.org as any)?.portalTier || null);
    let returnedLimits: any = (user as any).limits || (user as any).educationLimits || null;
    if (!returnedLimits && userTier && userTier !== 'free') {
      try {
        const Order = require('../models/order.entity').Order;
        const Plan = require('../models/plan.entity').Plan;
        const orderRepo = AppDataSource.getRepository(Order);
        const planRepo = AppDataSource.getRepository(Plan);
        let orders: any[] = [];
        try {
          if (user.org && (user.org as any).id) {
            orders = await orderRepo.find({ where: [ { userId: user.id, status: 'active' }, { orgId: (user.org as any).id, status: 'active' } ], order: { createdAt: 'DESC' } });
          } else {
            orders = await orderRepo.find({ where: { userId: user.id, status: 'active' }, order: { createdAt: 'DESC' } });
          }
        } catch (err) {
          orders = [];
        }

        let order = orders.find((o: any) => o.planId != null) || null;
        let plan: any = null;
        if (order) {
          plan = await planRepo.findOneBy({ id: order.planId! });
        }

        if (!plan && userTier) {
          try {
            plan = await planRepo.findOne({ where: { type: userTier } });
          } catch (err) {
            plan = null;
          }
        }

        if (plan) {
          const nodeRepo = AppDataSource.getRepository(require('../models/node.entity').Node);
          let limitsFromPlan: any = {};
          if (plan.type === 'enterprise' && (user as any).nodeId) {
            const node = await nodeRepo.findOneBy({ id: (user as any).nodeId });
            if (node) {
              if (node.memory != null) limitsFromPlan.memory = Number(node.memory);
              if (node.disk != null) limitsFromPlan.disk = Number(node.disk);
              if (node.cpu != null) limitsFromPlan.cpu = Number(node.cpu);
              if (node.serverLimit != null) limitsFromPlan.serverLimit = Number(node.serverLimit);
            }
          }
          if (Object.keys(limitsFromPlan).length === 0) {
            if (plan.memory != null) limitsFromPlan.memory = plan.memory;
            if (plan.disk != null) limitsFromPlan.disk = plan.disk;
            if (plan.cpu != null) limitsFromPlan.cpu = plan.cpu;
            if (plan.serverLimit != null) limitsFromPlan.serverLimit = plan.serverLimit;
          }
          returnedLimits = Object.keys(limitsFromPlan).length ? limitsFromPlan : null;
        }
      } catch (err) {
        //  skip
      }
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        middleName: user.middleName || null,
        lastName: user.lastName,
        displayName: user.displayName || null,
        address: user.address || null,
        address2: user.address2 || null,
        phone: user.phone || null,
        billingCompany: user.billingCompany || null,
        billingCity: user.billingCity || null,
        billingState: user.billingState || null,
        billingZip: user.billingZip || null,
        billingCountry: user.billingCountry || null,
        tier: (user as any).portalType || (user as any).tier,
        role: user.role,
        sessionId: decoded?.sessionId,
        emailVerified: user.emailVerified ?? false,
        passkeyCount,
        studentVerified: (user as any).studentVerified || false,
        twoFactorEnabled: !!user.twoFactorEnabled,
        avatarUrl: user.avatarUrl || null,
        org: user.org
          ? {
              id: user.org.id,
              name: user.org.name,
              handle: user.org.handle,
              portalTier: (user.org as any).portalTier,
              avatarUrl: (user.org as any).avatarUrl,
            }
          : null,
        orgRole: user.orgRole || 'member',
        limits: returnedLimits,
        nodeId: (user as any).nodeId || null,
        settings: (user as any).settings || null,
        euIdVerificationDisabled: isEUIdVerificationDisabledForCountry(user.billingCountry),
        demoExpiresAt: user.demoExpiresAt || null,
        demoLimits: user.demoLimits || null,
        demoUsed: user.demoUsed === true,
      },
    };
  }, { beforeHandle: authenticate,
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }) },
    detail: {
      summary: 'Get current session info',
      description: 'Returns information about the current authenticated session.',
      tags: ['Auth'],
      operationId: 'getAuthSession',
    }
  });
}
