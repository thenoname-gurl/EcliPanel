import { AppDataSource } from '../config/typeorm';
import { MailMessage } from '../models/mailMessage.entity';
import { MailboxAccount } from '../models/mailboxAccount.entity';
import { Notification } from '../models/notification.entity';
import { OutboundEmail } from '../models/outboundEmail.entity';
import { User } from '../models/user.entity';
import { validateUserRegistration } from '../middleware/validation';
import { hashPassword, comparePassword } from '../utils/password';
import { canRegister, getGeoBlockLevel, getMinimumAgeForCountry } from '../utils/eu';
import { authenticate } from '../middleware/auth';
import { hasPermissionSync } from '../middleware/authorize';
import { UserLog } from '../models/userLog.entity';
import { ParentLinkRequest } from '../models/parentLinkRequest.entity';
import { ParentRegistrationInvite } from '../models/parentRegistrationInvite.entity';
import { ensureMailboxAccountForUser, getMailboxAccountForUser, getMailboxConnectionInfo, isMailcowConfigured, isPanelAssignedMailboxEmail } from '../services/mailcowService';
import { deleteMessageFromMailbox, fetchMailboxNow } from '../services/imapFetcher';
import { detectMailboxSecurityFlags, extractMailboxAuthMetadata, extractMailboxPriority, resolveReverseDns } from '../utils/mailboxMessage';
import { createOutboundEmailRecord, getOutboundEmailUsage, getSendLimitsForUser, sendOutboundEmailImmediately } from '../services/outboundEmailService';
import { sendMail } from '../services/mailService';
import { redisSet, redisGet, redisDel } from '../config/redis';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { resizeImage } from '../workers/imageWorker';
import { WingsApiService } from '../services/wingsApiService';
import { PanelSetting } from '../models/panelSetting.entity';
import { t } from 'elysia';
import crypto from 'crypto';
import { Plan } from '../models/plan.entity';
import { Order } from '../models/order.entity';
import { Node } from '../models/node.entity';

const userSchema = t.Object({
  id: t.Number(),
  email: t.String({ format: 'email' }),
  firstName: t.String(),
  middleName: t.Optional(t.String()),
  lastName: t.String(),
  displayName: t.Optional(t.String()),
  address: t.String(),
  address2: t.Optional(t.String()),
  phone: t.Optional(t.String()),
  billingCompany: t.Optional(t.String()),
  billingCity: t.Optional(t.String()),
  billingState: t.Optional(t.String()),
  billingZip: t.Optional(t.String()),
  billingCountry: t.Optional(t.String()),
  fraudFlag: t.Boolean(),
  fraudReason: t.Optional(t.String()),
  fraudDetectedAt: t.Optional(t.String()),
  role: t.Optional(t.String()),
  orgRole: t.Optional(t.String()),
  portalType: t.String(),
  org: t.Optional(t.Any()),
  node: t.Optional(t.Any()),
  nodeId: t.Optional(t.Number()),
  limits: t.Optional(t.Any()),
  settings: t.Optional(t.Any()),
  dateOfBirth: t.Optional(t.String()),
  parentId: t.Optional(t.Number()),
  age: t.Optional(t.Number()),
  isChildAccount: t.Optional(t.Boolean()),
  ageVerificationRequired: t.Boolean(),
  emailVerified: t.Boolean(),
  studentVerified: t.Boolean(),
  studentVerifiedAt: t.Optional(t.String()),
  educationLimits: t.Optional(t.Any()),
  idVerified: t.Boolean(),
  euIdVerificationDisabled: t.Optional(t.Boolean()),
  twoFactorEnabled: t.Boolean(),
  suspended: t.Boolean(),
  deletionRequested: t.Boolean(),
  deletionApproved: t.Boolean(),
  avatarUrl: t.Optional(t.String()),
});

async function safeUser(user: User): Promise<any> {
  const { passwordHash, sessions, ...safe } = user as any;
  safe.geoBlockLevel = await getGeoBlockLevel(user.billingCountry);
  safe.isGeoSubuserOnly = safe.geoBlockLevel === 4;

  if (safe.fraudDetectedAt instanceof Date) {
    safe.fraudDetectedAt = safe.fraudDetectedAt.toISOString();
  }
  if (safe.studentVerifiedAt instanceof Date) {
    safe.studentVerifiedAt = safe.studentVerifiedAt.toISOString();
  }
  if (safe.dateOfBirth instanceof Date) {
    safe.dateOfBirth = safe.dateOfBirth.toISOString().split('T')[0];
  }

  const computedAge = getAgeFromDate(safe.dateOfBirth);
  safe.age = computedAge === null ? undefined : computedAge;
  safe.isChildAccount = computedAge != null ? isMinorByCountry(computedAge, safe.billingCountry) : undefined;
  safe.ageVerificationRequired = !safe.dateOfBirth;

  const minimumAge = await getMinimumAgeForCountry(safe.billingCountry);
  if (computedAge !== null && computedAge < minimumAge && !safe.suspended && !safe.parentId) {
    safe.suspended = true;
    safe.fraudFlag = true;
    safe.fraudReason = safe.fraudReason || `Underage account (<${minimumAge} years)`;
    await AppDataSource.getRepository(User).save({ id: user.id, suspended: true, fraudFlag: true, fraudReason: safe.fraudReason });
  }

  if (safe.fraudDetectedAt === null) {
    delete safe.fraudDetectedAt;
  }
  if (safe.studentVerifiedAt === null) {
    delete safe.studentVerifiedAt;
  }
  if (safe.nodeId === null) {
    delete safe.nodeId;
  }

  for (const k of Object.keys(safe)) {
    if (safe[k] === null) delete (safe as any)[k];
  }

  return safe;
}

function parseDateOfBirth(value: any): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  if (isNaN(date.getTime())) return null;
  return date;
}

const COUNTRY_ADULT_AGE: Record<string, number> = {
  CA: 19,
  TH: 20,
  TW: 20,
  AE: 21,
  BH: 21,
  OM: 21,
};

function getAdultAgeForCountry(country?: string | null): number {
  if (!country) return 18;
  const code = String(country).trim().toUpperCase();
  return COUNTRY_ADULT_AGE[code] ?? 18;
}

function isAdultByCountry(age: number, country?: string | null): boolean {
  return age >= getAdultAgeForCountry(country);
}

function isMinorByCountry(age: number, country?: string | null): boolean {
  return age < getAdultAgeForCountry(country);
}

function getAgeFromDate(date?: Date | string | null): number | null {
  if (!date) return null;
  const dob = date instanceof Date ? date : new Date(String(date));
  if (isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - dob.getUTCMonth();
  const dayDiff = now.getUTCDate() - dob.getUTCDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }
  return age;
}

function generateParentLinkCode(): string {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

async function sendVerificationEmailToUser(user: User) {
  const code = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
  const token = uuidv4();

  await redisSet(`email-verify:token:${token}`, String(user.id), 86400);
  await redisSet(`email-verify:code:${user.id}`, code, 86400);

  const panelUrl = process.env.PANEL_URL || 'https://panel.ecli.app';
  const verifyUrl = `${panelUrl}/verify-email?token=${token}`;

  try {
    await sendMail({
      to: user.email,
      from: process.env.SMTP_FROM || 'noreply@ecli.app',
      subject: 'Verify your email - EcliPanel',
      template: 'email-verify',
      vars: { name: user.firstName || 'User', verifyUrl, code },
    });
  } catch (err) {
    console.error('Failed to send verification email:', err);
  }
}

export async function userRoutes(app: any, prefix = '') {
  app.post(prefix + '/users/register', async (ctx: any) => {
    try {
      const settingRepo = AppDataSource.getRepository(PanelSetting);
      const setting = await settingRepo.findOneBy({ key: 'registrationEnabled' });
      if (setting && setting.value === 'false') {
        const noticeSetting = await settingRepo.findOneBy({ key: 'registrationNotice' });
        const notice = noticeSetting?.value || 'Registration is currently disabled.';
        ctx.set.status = 503;
        return { error: 'registration_disabled', message: notice };
      }
    } catch { }

    const body = ctx.body as Partial<User>;
    const rawToken = typeof (ctx.body as any).parentRegistrationToken === 'string'
      ? (ctx.body as any).parentRegistrationToken.trim()
      : '';
    const parentRegistrationToken = rawToken || undefined;

    const inviteRepo = AppDataSource.getRepository(ParentRegistrationInvite);
    const userRepo = AppDataSource.getRepository(User);
    let parentRegistrationInvite: ParentRegistrationInvite | null = null;
    if (parentRegistrationToken) {
      parentRegistrationInvite = await inviteRepo.findOneBy({ token: parentRegistrationToken, used: false });
      if (!parentRegistrationInvite) {
        ctx.set.status = 400;
        return { error: 'invalid_parent_registration_token', message: 'Parent registration token is invalid or has already been used.' };
      }
      const normalizedEmail = String(body.email || '').trim().toLowerCase();
      if (parentRegistrationInvite.childEmail && parentRegistrationInvite.childEmail !== normalizedEmail) {
        ctx.set.status = 400;
        return { error: 'email_mismatch', message: 'The child email does not match the parent registration invite.' };
      }
      body.parentId = parentRegistrationInvite.parentId;

      const parentUser = await userRepo.findOneBy({ id: parentRegistrationInvite.parentId });
      if (parentUser) {
        if (!body.phone && parentUser.phone) body.phone = parentUser.phone;
        if (!body.address && parentUser.address) body.address = parentUser.address;
        if (!body.address2 && parentUser.address2) body.address2 = parentUser.address2;
        if (!body.billingCompany && parentUser.billingCompany) body.billingCompany = parentUser.billingCompany;
        if (!body.billingCity && parentUser.billingCity) body.billingCity = parentUser.billingCity;
        if (!body.billingState && parentUser.billingState) body.billingState = parentUser.billingState;
        if (!body.billingZip && parentUser.billingZip) body.billingZip = parentUser.billingZip;
        if (!body.billingCountry && parentUser.billingCountry) body.billingCountry = parentUser.billingCountry;
      }

      if (!body.address) {
        body.address = '';
      }
    }

    const valid = await validateUserRegistration(ctx, ctx, { skipMinimumAge: !!parentRegistrationInvite, skipAddressFields: !!parentRegistrationInvite });
    if (!valid) {
      const validation = (ctx as any).body;
      const found = validation?.found || {};
      const errorMessage = Object.entries(found)
        .map(([field, message]) => `${field}: ${message}`)
        .join('; ') || 'Validation failed.';
      return { error: errorMessage };
    }

    if (!(await canRegister((ctx.body as any).billingCountry))) {
      ctx.set.status = 403;
      return { error: 'Registration is not allowed from your country under geo-block policy' };
    }

    const dateOfBirth = parseDateOfBirth((body as any).dateOfBirth);
    if (!dateOfBirth) {
      ctx.set.status = 400;
      return { error: 'invalid_date_of_birth', message: 'dateOfBirth must be a valid date string in YYYY-MM-DD format.' };
    }
    body.dateOfBirth = dateOfBirth;

    const normalizedEmail = String(body.email || '').trim().toLowerCase();
    if (normalizedEmail && await isPanelAssignedMailboxEmail(normalizedEmail)) {
      ctx.set.status = 400;
      return { error: 'registration_email_reserved', message: 'That email is reserved by the panel and cannot be used for registration.' };
    }

    if (body.parentId != null) {
      const parentId = Number(body.parentId);
      if (!Number.isInteger(parentId) || parentId <= 0) {
        ctx.set.status = 400;
        return { error: 'invalid_parent_id', message: 'parentId must be a valid user id.' };
      }
      const parent = await userRepo.findOneBy({ id: parentId });
      if (!parent) {
        ctx.set.status = 404;
        return { error: 'parent_not_found', message: 'Parent account not found.' };
      }
      const parentAge = getAgeFromDate(parent.dateOfBirth);
      if (parentAge === null || !isAdultByCountry(parentAge, parent.billingCountry)) {
        ctx.set.status = 403;
        return { error: 'parent_must_be_adult', message: 'Only an adult user may be assigned as a parent.' };
      }
      if (!dateOfBirth) {
        ctx.set.status = 400;
        return { error: 'date_of_birth_required', message: 'Child dateOfBirth is required when assigning a parent.' };
      }
      const childAge = getAgeFromDate(dateOfBirth);
      if (childAge === null || !isMinorByCountry(childAge, body.billingCountry)) {
        ctx.set.status = 400;
        return { error: 'child_must_be_under_18', message: `Child accounts must be under age ${getAdultAgeForCountry(body.billingCountry)}.` };
      }
      body.parentId = parentId;
    }

    const user = userRepo.create(body);
    user.passwordHash = await hashPassword((body as any).password!);
    if (!user.portalType) user.portalType = 'free';
    try {
      await userRepo.save(user);
      if (parentRegistrationInvite) {
        parentRegistrationInvite.used = true;
        parentRegistrationInvite.usedAt = new Date();
        parentRegistrationInvite.updatedAt = new Date();
        await inviteRepo.save(parentRegistrationInvite);
      }
    } catch (err: any) {
      if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
        ctx.set.status = 409;
        return { error: 'An account with that email address already exists.' };
      }
      throw err;
    }

    try {
      await ensureMailboxAccountForUser(user);
    } catch (err: any) {
      console.warn('Failed to provision Mailcow mailbox for user:', err?.message || err);
    }

    const logRepo = AppDataSource.getRepository(UserLog);
    await logRepo.save(logRepo.create({ userId: user.id, action: 'register', timestamp: new Date() }));

    try {
      const code = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
      const token = uuidv4();
      await redisSet(`email-verify:token:${token}`, String(user.id), 86400);
      await redisSet(`email-verify:code:${user.id}`, code, 86400);
      const panelUrl = process.env.PANEL_URL || 'https://panel.ecli.app';
      const verifyUrl = `${panelUrl}/verify-email?token=${token}`;
      await sendMail({
        to: user.email,
        from: process.env.SMTP_FROM || 'noreply@ecli.app',
        subject: 'Verify your email - EcliPanel',
        template: 'email-verify',
        vars: { name: user.firstName || 'User', verifyUrl, code },
      });
    } catch (err) {
      console.error('Failed to send verification email:', err);
    }

    try {
      const planRepo = AppDataSource.getRepository(Plan);
      const orderRepo = AppDataSource.getRepository(Order);
      const nodeRepo = AppDataSource.getRepository(Node);
      const plans = await planRepo.find({ where: { type: user.portalType }, order: { price: 'ASC' } });
      if (plans && plans.length > 0) {
        const chosen = plans.find(p => p.isDefault) || plans[0];

        let limits: Record<string, number> = {};
        if (chosen.type === 'enterprise' && user.nodeId) {
          const node = await nodeRepo.findOneBy({ id: user.nodeId });
          if (node) {
            if (node.memory != null) limits.memory = Number(node.memory);
            if (node.disk != null) limits.disk = Number(node.disk);
            if (node.cpu != null) limits.cpu = Number(node.cpu);
            if (node.serverLimit != null) limits.serverLimit = Number(node.serverLimit);
          }
        }
        if (Object.keys(limits).length === 0) {
          if (chosen.memory != null) limits.memory = chosen.memory;
          if (chosen.disk != null) limits.disk = chosen.disk;
          if (chosen.cpu != null) limits.cpu = chosen.cpu;
          if (chosen.serverLimit != null) limits.serverLimit = chosen.serverLimit;
        }

        user.limits = Object.keys(limits).length ? limits : null;
        user.portalType = chosen.type;
        await userRepo.save(user);

        const order = orderRepo.create({
          userId: user.id,
          description: `${chosen.name} (auto-assigned)`,
          planId: chosen.id,
          amount: chosen.price ?? 0,
          items: `plan:${chosen.id}`,
          status: 'active',
          notes: 'Auto-assigned plan on registration',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
        });
        await orderRepo.save(order);
      }
    } catch (err) {
      console.error('Failed to auto-assign plan on register:', err);
    }

    return { success: true, user: await safeUser(user) };
  }, {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    body: t.Object({
      email: t.String({ format: 'email' }),
      password: t.String({ minLength: 8 }),
      firstName: t.Optional(t.String()),
      middleName: t.Optional(t.String()),
      lastName: t.Optional(t.String()),
      address: t.Optional(t.String()),
      address2: t.Optional(t.String()),
      billingCompany: t.Optional(t.String()),
      billingCity: t.Optional(t.String()),
      billingState: t.Optional(t.String()),
      billingZip: t.Optional(t.String()),
      billingCountry: t.Optional(t.String()),
      phone: t.Optional(t.String()),
      dateOfBirth: t.String(),
      parentId: t.Optional(t.Number()),
      parentRegistrationToken: t.Optional(t.String()),
      captchaAnswer: t.Optional(t.String()),
      captchaToken: t.Optional(t.String()),
      invisibleCaptchaToken: t.Optional(t.String()),
      invisibleCaptchaDelay: t.Optional(t.Number()),
      behaviorData: t.Optional(t.Object({
        mouseMoves: t.Number(),
        mouseClicks: t.Number(),
        keyboardEvents: t.Number(),
        firstInteraction: t.Optional(t.Number()),
        lastInteraction: t.Optional(t.Number()),
      })),
    }),
    response: {
      200: t.Object({ success: t.Boolean(), user: userSchema }),
      400: t.Object({ error: t.String() }),
      409: t.Object({ error: t.String() }),
      503: t.Object({ error: t.String(), message: t.Optional(t.String()) })
    },
    detail: {
      summary: 'Create a new user account',
      description: 'Registers a new user and sends verification email',
      tags: ['Users']
    }
  });

  app.get(prefix + '/users/me', async (ctx: any) => {
    const requester = ctx.user as User;
    if (!requester) {
      ctx.set.status = 401;
      return { error: 'Not logged in' };
    }
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOneBy({ id: requester.id });
    if (!user) {
      ctx.set.status = 404;
      return { error: 'User not found' };
    }
    return await safeUser(user);
  }, {
    beforeHandle: authenticate,
    response: { 200: userSchema, 401: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Get current user', tags: ['Users'] }
  });

  async function serializeParentLinkRequest(request: ParentLinkRequest, requester: User) {
    return {
      id: request.id,
      childId: request.childId,
      parentId: request.parentId,
      parentEmail: request.parentEmail,
      code: request.parentId === requester.id ? undefined : request.code,
      status: request.status,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
      acceptedAt: request.acceptedAt?.toISOString() || null,
      child: request.child ? {
        id: request.child.id,
        email: request.child.email,
        firstName: request.child.firstName,
        lastName: request.child.lastName,
        dateOfBirth: request.child.dateOfBirth instanceof Date ? request.child.dateOfBirth.toISOString().split('T')[0] : request.child.dateOfBirth,
        age: getAgeFromDate(request.child.dateOfBirth),
      } : null,
      parent: request.parent ? {
        id: request.parent.id,
        email: request.parent.email,
        firstName: request.parent.firstName,
        lastName: request.parent.lastName,
      } : null,
    };
  }

  app.post(prefix + '/users/me/parent-link-requests', async (ctx: any) => {
    const requester = ctx.user as User;
    if (!requester) {
      ctx.set.status = 401;
      return { error: 'Not logged in' };
    }

    const childAge = getAgeFromDate(requester.dateOfBirth);
    if (childAge === null || !isMinorByCountry(childAge, requester.billingCountry)) {
      ctx.set.status = 403;
      return { error: 'child_access_required', message: 'Only underage users may request a parent link.' };
    }
    if (requester.parentId) {
      ctx.set.status = 409;
      return { error: 'already_linked', message: 'This account is already linked to a parent.' };
    }

    const body = (ctx.body as any) || {};
    const parentEmail = typeof body.parentEmail === 'string' ? body.parentEmail.trim().toLowerCase() : '';
    const parentId = body.parentId != null ? Number(body.parentId) : undefined;
    if (!parentEmail && (parentId === undefined || parentId === null)) {
      ctx.set.status = 400;
      return { error: 'parent_required', message: 'parentEmail or parentId is required.' };
    }

    const userRepo = AppDataSource.getRepository(User);
    const parent = parentId != null
      ? await userRepo.findOneBy({ id: parentId })
      : await userRepo.findOneBy({ email: parentEmail });

    if (!parent) {
      ctx.set.status = 404;
      return { error: 'parent_not_found', message: 'Parent account not found.' };
    }
    if (parent.id === requester.id) {
      ctx.set.status = 400;
      return { error: 'invalid_parent', message: 'You cannot assign yourself as a parent.' };
    }
    const parentAge = getAgeFromDate(parent.dateOfBirth);
    if (parentAge === null || !isAdultByCountry(parentAge, parent.billingCountry)) {
      ctx.set.status = 403;
      return { error: 'parent_must_be_adult', message: 'Only adult users may be assigned as parents.' };
    }

    const requestRepo = AppDataSource.getRepository(ParentLinkRequest);
    const existing = await requestRepo.findOne({ where: { childId: requester.id, parentId: parent.id, status: 'pending' }, relations: ['child', 'parent'] });
    if (existing) {
      return { success: true, request: await serializeParentLinkRequest(existing, requester) };
    }

    const request = requestRepo.create({
      childId: requester.id,
      parentId: parent.id,
      parentEmail: parent.email,
      code: generateParentLinkCode(),
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await requestRepo.save(request);

    return { success: true, request: await serializeParentLinkRequest(request, requester) };
  }, {
    beforeHandle: authenticate,
    body: t.Optional(t.Object({ parentEmail: t.Optional(t.String()), parentId: t.Optional(t.Number()) })),
    response: { 200: t.Object({ success: t.Boolean(), request: t.Any() }), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }), 409: t.Object({ error: t.String() }) },
    detail: { summary: 'Request a parent link for the current child account', tags: ['Users'] }
  });

  app.post(prefix + '/users/me/parent-registration-invites', async (ctx: any) => {
    const requester = ctx.user as User;
    if (!requester) {
      ctx.set.status = 401;
      return { error: 'Not logged in' };
    }

    const parentAge = getAgeFromDate(requester.dateOfBirth);
    if (parentAge === null || !isAdultByCountry(parentAge, requester.billingCountry)) {
      ctx.set.status = 403;
      return { error: 'parent_access_required', message: 'Only adult users may create parent registration invites.' };
    }

    const body = (ctx.body as any) || {};
    const childEmail = typeof body.childEmail === 'string' ? body.childEmail.trim().toLowerCase() : undefined;
    const inviteRepo = AppDataSource.getRepository(ParentRegistrationInvite);
    const invite = inviteRepo.create({
      parentId: requester.id,
      childEmail: childEmail || null,
      token: crypto.randomBytes(10).toString('hex').toUpperCase(),
      used: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await inviteRepo.save(invite);

    const baseUrl = process.env.PANEL_URL || process.env.FRONTEND_URL || (ctx.headers?.origin || 'https://ecli.app');
    const inviteLink = `${String(baseUrl).replace(/\/$/, '')}/register?parentRegistrationToken=${encodeURIComponent(invite.token)}`;

    return {
      success: true,
      invite: {
        id: invite.id,
        token: invite.token,
        childEmail: invite.childEmail || null,
        link: inviteLink,
        createdAt: invite.createdAt.toISOString(),
        used: invite.used,
      },
    };
  }, {
    beforeHandle: authenticate,
    body: t.Optional(t.Object({ childEmail: t.Optional(t.String()) })),
    response: { 200: t.Object({ success: t.Boolean(), invite: t.Object({ id: t.Number(), token: t.String(), childEmail: t.Union([t.String(), t.Null()]), link: t.String(), createdAt: t.String(), used: t.Boolean() }) }), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Create a parent registration invite for a child account', tags: ['Users'] }
  });

  app.get(prefix + '/users/me/parent-registration-invites', async (ctx: any) => {
    const requester = ctx.user as User;
    if (!requester) {
      ctx.set.status = 401;
      return { error: 'Not logged in' };
    }

    const inviteRepo = AppDataSource.getRepository(ParentRegistrationInvite);
    const invites = await inviteRepo.find({ where: { parentId: requester.id }, order: { createdAt: 'DESC' } });
    const baseUrl = process.env.PANEL_URL || process.env.FRONTEND_URL || (ctx.headers?.origin || 'https://ecli.app');
    const normalizedBase = String(baseUrl).replace(/\/$/, '');

    return {
      success: true,
      invites: invites.map((invite) => ({
        id: invite.id,
        token: invite.token,
        childEmail: invite.childEmail || null,
        link: `${normalizedBase}/register?parentRegistrationToken=${encodeURIComponent(invite.token)}`,
        createdAt: invite.createdAt.toISOString(),
        used: invite.used,
        usedAt: invite.usedAt ? invite.usedAt.toISOString() : null,
        expiresAt: invite.expiresAt ? invite.expiresAt.toISOString() : null,
      })),
    };
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean(), invites: t.Array(t.Object({ id: t.Number(), token: t.String(), childEmail: t.Union([t.String(), t.Null()]), link: t.String(), createdAt: t.String(), used: t.Boolean(), usedAt: t.Optional(t.Union([t.String(), t.Null()])), expiresAt: t.Optional(t.Union([t.String(), t.Null()])) })) }), 401: t.Object({ error: t.String() }) },
    detail: { summary: 'List parent registration invites for the current parent', tags: ['Users'] }
  });

  app.delete(prefix + '/users/me/parent-registration-invites/:inviteId', async (ctx: any) => {
    const requester = ctx.user as User;
    if (!requester) {
      ctx.set.status = 401;
      return { error: 'Not logged in' };
    }

    const inviteId = Number(ctx.params['inviteId']);
    if (!Number.isInteger(inviteId) || inviteId <= 0) {
      ctx.set.status = 400;
      return { error: 'invalid_invite_id', message: 'Invalid invite id' };
    }

    const inviteRepo = AppDataSource.getRepository(ParentRegistrationInvite);
    const invite = await inviteRepo.findOneBy({ id: inviteId });
    if (!invite) {
      ctx.set.status = 404;
      return { error: 'invite_not_found', message: 'Invite not found.' };
    }
    if (invite.parentId !== requester.id) {
      ctx.set.status = 403;
      return { error: 'forbidden', message: 'You do not own this invite.' };
    }
    if (invite.used) {
      ctx.set.status = 409;
      return { error: 'invite_already_used', message: 'Cannot revoke an invite that has already been used.' };
    }

    await inviteRepo.delete({ id: inviteId });
    return { success: true };
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean() }), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }), 409: t.Object({ error: t.String() }) },
    detail: { summary: 'Revoke a parent registration invite', tags: ['Users'] }
  });

  app.get(prefix + '/users/me/parent-link-requests', async (ctx: any) => {
    const requester = ctx.user as User;
    if (!requester) {
      ctx.set.status = 401;
      return { error: 'Not logged in' };
    }

    const requestRepo = AppDataSource.getRepository(ParentLinkRequest);
    const requesterAge = getAgeFromDate(requester.dateOfBirth);
    const requesterIsMinor = requesterAge === null
      ? requester.parentId != null
      : isMinorByCountry(requesterAge, requester.billingCountry);
    const where = requesterIsMinor ? { childId: requester.id } : { parentId: requester.id };

    const requests = await requestRepo.find({ where, relations: ['child', 'parent'], order: { createdAt: 'DESC' } });
    return { success: true, requests: await Promise.all(requests.map((request) => serializeParentLinkRequest(request, requester))) };
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean(), requests: t.Array(t.Any()) }), 401: t.Object({ error: t.String() }) },
    detail: { summary: 'List parent link requests for the current user', tags: ['Users'] }
  });

  app.post(prefix + '/users/me/parent-link-requests/:id/accept', async (ctx: any) => {
    const requester = ctx.user as User;
    if (!requester) {
      ctx.set.status = 401;
      return { error: 'Not logged in' };
    }

    const parentAge = getAgeFromDate(requester.dateOfBirth);
    if (parentAge === null || !isAdultByCountry(parentAge, requester.billingCountry)) {
      ctx.set.status = 403;
      return { error: 'parent_access_required', message: 'Only adult users may accept child link requests.' };
    }

    const requestId = Number(ctx.params['id']);
    if (!Number.isInteger(requestId) || requestId <= 0) {
      ctx.set.status = 400;
      return { error: 'invalid_request_id', message: 'Invalid request id' };
    }

    const body = ctx.body as any;
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!code) {
      ctx.set.status = 400;
      return { error: 'code_required', message: 'A parent link code is required.' };
    }

    const requestRepo = AppDataSource.getRepository(ParentLinkRequest);
    const userRepo = AppDataSource.getRepository(User);
    const request = await requestRepo.findOne({ where: { id: requestId }, relations: ['child', 'parent'] });
    if (!request) {
      ctx.set.status = 404;
      return { error: 'request_not_found', message: 'Parent link request not found.' };
    }
    if (request.parentId !== requester.id) {
      ctx.set.status = 403;
      return { error: 'forbidden', message: 'You are not the parent for this request.' };
    }
    if (request.status !== 'pending') {
      ctx.set.status = 409;
      return { error: 'request_not_pending', message: 'This request is no longer pending.' };
    }
    if (request.code !== code) {
      ctx.set.status = 403;
      return { error: 'invalid_code', message: 'The provided linking code is incorrect.' };
    }

    const child = await userRepo.findOneBy({ id: request.childId });
    if (!child) {
      ctx.set.status = 404;
      return { error: 'child_not_found', message: 'Child account not found.' };
    }
    if (child.parentId && child.parentId !== requester.id) {
      ctx.set.status = 409;
      return { error: 'child_already_assigned', message: 'This child already has a parent.' };
    }

    child.parentId = requester.id;
    await userRepo.save(child);

    request.status = 'accepted';
    request.acceptedAt = new Date();
    request.updatedAt = new Date();
    await requestRepo.save(request);

    const logRepo = AppDataSource.getRepository(UserLog);
    await logRepo.save(logRepo.create({ userId: requester.id, action: 'accept-parent-link', targetId: String(child.id), targetType: 'user', timestamp: new Date(), metadata: { requestId: request.id } } as any));

    return { success: true, request: await serializeParentLinkRequest(request, requester), child: await safeUser(child) };
  }, {
    beforeHandle: authenticate,
    body: t.Object({ code: t.String() }),
    response: { 200: t.Object({ success: t.Boolean(), request: t.Any(), child: userSchema }), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }), 409: t.Object({ error: t.String() }) },
    detail: { summary: 'Accept a parent link request with linking code', tags: ['Users'] }
  });


  app.put(prefix + '/users/me/children/:childId', async (ctx: any) => {
    const requester = ctx.user as User;
    if (!requester) {
      ctx.set.status = 401;
      return { error: 'Not logged in' };
    }
    const parentAge = getAgeFromDate(requester.dateOfBirth);
    if (parentAge === null || !isAdultByCountry(parentAge, requester.billingCountry)) {
      ctx.set.status = 403;
      return { error: 'parent_access_required', message: 'Only adult users may update child account details.' };
    }

    const childId = Number(ctx.params['childId']);
    if (!Number.isInteger(childId) || childId <= 0) {
      ctx.set.status = 400;
      return { error: 'invalid_child_user_id', message: 'Invalid child user id' };
    }

    const payload = ctx.body as any;
    const dateOfBirth = parseDateOfBirth(payload?.dateOfBirth);
    if (!dateOfBirth) {
      ctx.set.status = 400;
      return { error: 'invalid_date_of_birth', message: 'dateOfBirth must be a valid date string in YYYY-MM-DD format.' };
    }

    const userRepo = AppDataSource.getRepository(User);
    const child = await userRepo.findOneBy({ id: childId });
    if (!child) {
      ctx.set.status = 404;
      return { error: 'child_not_found', message: 'Child account not found.' };
    }
    if (child.parentId !== requester.id) {
      ctx.set.status = 403;
      return { error: 'forbidden', message: 'You do not manage this child account.' };
    }

    const childAge = getAgeFromDate(dateOfBirth);
    const effectiveCountry = child.billingCountry || requester.billingCountry;
    if (childAge === null || !isMinorByCountry(childAge, effectiveCountry)) {
      ctx.set.status = 400;
      return { error: 'child_must_be_underage', message: `Child date of birth must keep the account under the legal age for ${effectiveCountry || 'your country'}.` };
    }

    child.dateOfBirth = dateOfBirth;
    await userRepo.save(child);

    const logRepo = AppDataSource.getRepository(UserLog);
    await logRepo.save(logRepo.create({ userId: requester.id, action: 'update-child-dob', targetId: String(child.id), targetType: 'user', timestamp: new Date(), metadata: { dateOfBirth: child.dateOfBirth?.toISOString().split('T')[0] } } as any));

    return { success: true, child: await safeUser(child) };
  }, {
    beforeHandle: authenticate,
    body: t.Object({ dateOfBirth: t.String() }),
    response: { 200: t.Object({ success: t.Boolean(), child: userSchema }), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Update a managed child account', tags: ['Users'] }
  });

  app.get(prefix + '/users/me/children', async (ctx: any) => {
    const requester = ctx.user as User;
    if (!requester) {
      ctx.set.status = 401;
      return { error: 'Not logged in' };
    }
    const parentAge = getAgeFromDate(requester.dateOfBirth);
    if (parentAge === null || !isAdultByCountry(parentAge, requester.billingCountry)) {
      ctx.set.status = 403;
      return { error: 'parent_access_required', message: 'Only adult users can view child accounts.' };
    }

    const userRepo = AppDataSource.getRepository(User);
    const children = await userRepo.find({ where: { parentId: requester.id }, order: { id: 'ASC' } });
    return { success: true, children: await Promise.all(children.map((child) => safeUser(child))) };
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean(), children: t.Array(userSchema) }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'List child accounts for the current parent', tags: ['Users'] }
  });

  app.get(prefix + '/users/me/parent', async (ctx: any) => {
    const requester = ctx.user as User;
    if (!requester) {
      ctx.set.status = 401;
      return { error: 'Not logged in' };
    }

    if (!requester.parentId) {
      return { success: true, parent: null };
    }

    const userRepo = AppDataSource.getRepository(User);
    const parent = await userRepo.findOneBy({ id: requester.parentId });
    if (!parent) {
      return { success: true, parent: null };
    }

    return { success: true, parent: await safeUser(parent) };
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean(), parent: t.Optional(userSchema) }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Get parent account details for the current child', tags: ['Users'] }
  });

  app.get(prefix + '/users/me/children/:childId/servers', async (ctx: any) => {
    const requester = ctx.user as User;
    if (!requester) {
      ctx.set.status = 401;
      return { error: 'Not logged in' };
    }
    const parentAge = getAgeFromDate(requester.dateOfBirth);
    if (parentAge === null || !isAdultByCountry(parentAge, requester.billingCountry)) {
      ctx.set.status = 403;
      return { error: 'parent_access_required', message: 'Only adult users can view child servers.' };
    }

    const childId = Number(ctx.params['childId']);
    if (!Number.isInteger(childId) || childId <= 0) {
      ctx.set.status = 400;
      return { error: 'invalid_child_user_id', message: 'Invalid child user id' };
    }

    const userRepo = AppDataSource.getRepository(User);
    const child = await userRepo.findOneBy({ id: childId });
    if (!child) {
      ctx.set.status = 404;
      return { error: 'child_not_found', message: 'Child account not found.' };
    }
    if (child.parentId !== requester.id) {
      ctx.set.status = 403;
      return { error: 'forbidden', message: 'You do not manage this child account.' };
    }

    const serverRepo = AppDataSource.getRepository(require('../models/serverConfig.entity').ServerConfig);
    const nodeRepo = AppDataSource.getRepository(Node);
    const servers = await serverRepo.find({ where: { userId: childId }, order: { name: 'ASC' } });
    const nodes = await nodeRepo.find();
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));

    return {
      success: true,
      servers: servers.map((server: any) => ({
        uuid: server.uuid,
        name: server.name || server.uuid,
        status: server.dmca ? 'dmca' : server.hibernated ? 'hibernated' : server.suspended ? 'suspended' : 'active',
        template: server.dockerImage || server.startup || 'Unknown',
        memory: server.memory,
        disk: server.disk,
        cpu: server.cpu,
        maxDatabases: server.maxDatabases,
        maxBackups: server.maxBackups,
        nodeId: server.nodeId,
        nodeName: nodeMap.get(server.nodeId)?.name || null,
      })),
    };
  }, {
    beforeHandle: authenticate,
    response: {
      200: t.Object({ success: t.Boolean(), servers: t.Array(t.Object({ uuid: t.String(), name: t.String(), status: t.String(), template: t.String(), memory: t.Number(), disk: t.Number(), cpu: t.Number(), maxDatabases: t.Number(), maxBackups: t.Number(), nodeId: t.Number(), nodeName: t.Optional(t.String()) })) }),
      400: t.Object({ error: t.String() }),
      401: t.Object({ error: t.String() }),
      403: t.Object({ error: t.String() }),
      404: t.Object({ error: t.String() }),
    },
    detail: { summary: 'List servers for a managed child account', tags: ['Users'] }
  });

  app.get(prefix + '/users/me/children/:childId/orders', async (ctx: any) => {
    const requester = ctx.user as User;
    if (!requester) {
      ctx.set.status = 401;
      return { error: 'Not logged in' };
    }
    const parentAge = getAgeFromDate(requester.dateOfBirth);
    if (parentAge === null || !isAdultByCountry(parentAge, requester.billingCountry)) {
      ctx.set.status = 403;
      return { error: 'parent_access_required', message: 'Only adult users can view child billing history.' };
    }

    const childId = Number(ctx.params['childId']);
    if (!Number.isInteger(childId) || childId <= 0) {
      ctx.set.status = 400;
      return { error: 'invalid_child_user_id', message: 'Invalid child user id' };
    }

    const userRepo = AppDataSource.getRepository(User);
    const child = await userRepo.findOneBy({ id: childId });
    if (!child) {
      ctx.set.status = 404;
      return { error: 'child_not_found', message: 'Child account not found.' };
    }
    if (child.parentId !== requester.id) {
      ctx.set.status = 403;
      return { error: 'forbidden', message: 'You do not manage this child account.' };
    }

    const orderRepo = AppDataSource.getRepository(Order);
    const orders = await orderRepo.find({ where: { userId: childId }, order: { createdAt: 'DESC' } });
    return { success: true, orders };
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean(), orders: t.Array(t.Any()) }), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'List orders for a managed child account', tags: ['Users'] }
  });

  app.get(prefix + '/users/me/children/:childId/organisations', async (ctx: any) => {
    const requester = ctx.user as User;
    if (!requester) {
      ctx.set.status = 401;
      return { error: 'Not logged in' };
    }
    const parentAge = getAgeFromDate(requester.dateOfBirth);
    if (parentAge === null || !isAdultByCountry(parentAge, requester.billingCountry)) {
      ctx.set.status = 403;
      return { error: 'parent_access_required', message: 'Only adult users can view child organisations.' };
    }

    const childId = Number(ctx.params['childId']);
    if (!Number.isInteger(childId) || childId <= 0) {
      ctx.set.status = 400;
      return { error: 'invalid_child_user_id', message: 'Invalid child user id' };
    }

    const userRepo = AppDataSource.getRepository(User);
    const child = await userRepo.findOneBy({ id: childId });
    if (!child) {
      ctx.set.status = 404;
      return { error: 'child_not_found', message: 'Child account not found.' };
    }
    if (child.parentId !== requester.id) {
      ctx.set.status = 403;
      return { error: 'forbidden', message: 'You do not manage this child account.' };
    }

    const membershipRepo = AppDataSource.getRepository(require('../models/organisationMember.entity').OrganisationMember);
    const memberships = await membershipRepo.find({ where: { userId: childId }, relations: ['organisation'], order: { createdAt: 'ASC' } });
    return {
      success: true,
      organisations: memberships.map((membership: any) => ({
        id: membership.organisation?.id,
        name: membership.organisation?.name,
        role: membership.orgRole,
      })),
    };
  }, {
    beforeHandle: authenticate,
    response: {
      200: t.Object({ success: t.Boolean(), organisations: t.Array(t.Object({ id: t.Optional(t.Number()), name: t.Optional(t.String()), role: t.String() })) }),
      400: t.Object({ error: t.String() }),
      401: t.Object({ error: t.String() }),
      403: t.Object({ error: t.String() }),
      404: t.Object({ error: t.String() }),
    },
    detail: { summary: 'List organisations for a managed child account', tags: ['Users'] }
  });

  app.post(prefix + '/users/me/children', async (ctx: any) => {
    const requester = ctx.user as User;
    if (!requester) {
      ctx.set.status = 401;
      return { error: 'Not logged in' };
    }
    const parentAge = getAgeFromDate(requester.dateOfBirth);
    if (parentAge === null || !isAdultByCountry(parentAge, requester.billingCountry)) {
      ctx.set.status = 403;
      return { error: 'parent_access_required', message: 'Only adult users may assign child accounts.' };
    }

    const payload = ctx.body as any;
    const childUserId = Number(payload?.childUserId);
    if (!Number.isInteger(childUserId) || childUserId <= 0) {
      ctx.set.status = 400;
      return { error: 'invalid_child_user_id', message: 'childUserId is required and must be a valid number.' };
    }
    if (childUserId === requester.id) {
      ctx.set.status = 400;
      return { error: 'invalid_child_user_id', message: 'You cannot assign yourself as a child.' };
    }

    const userRepo = AppDataSource.getRepository(User);
    const child = await userRepo.findOneBy({ id: childUserId });
    if (!child) {
      ctx.set.status = 404;
      return { error: 'child_not_found', message: 'Child account not found.' };
    }
    if (child.parentId) {
      ctx.set.status = 409;
      return { error: 'child_already_assigned', message: 'This account already has a parent.' };
    }
    const childAge = getAgeFromDate(child.dateOfBirth);
    if (childAge === null || !isMinorByCountry(childAge, child.billingCountry)) {
      ctx.set.status = 400;
      return { error: 'child_must_be_under_18', message: `Only users under age ${getAdultAgeForCountry(child.billingCountry)} may be assigned as children.` };
    }
    child.parentId = requester.id;
    await userRepo.save(child);
    return { success: true, child: await safeUser(child) };
  }, {
    beforeHandle: authenticate,
    body: t.Object({ childUserId: t.Number() }),
    response: { 200: t.Object({ success: t.Boolean(), child: userSchema }), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }), 409: t.Object({ error: t.String() }) },
    detail: { summary: 'Assign an existing child account to the current parent', tags: ['Users'] }
  });

  app.delete(prefix + '/users/me/children/:childId', async (ctx: any) => {
    const requester = ctx.user as User;
    if (!requester) {
      ctx.set.status = 401;
      return { error: 'Not logged in' };
    }
    const childId = Number(ctx.params['childId']);
    if (!Number.isInteger(childId) || childId <= 0) {
      ctx.set.status = 400;
      return { error: 'invalid_child_user_id', message: 'Invalid child user id' };
    }
    const userRepo = AppDataSource.getRepository(User);
    const child = await userRepo.findOneBy({ id: childId });
    if (!child) {
      ctx.set.status = 404;
      return { error: 'child_not_found', message: 'Child account not found.' };
    }
    if (child.parentId !== requester.id) {
      ctx.set.status = 403;
      return { error: 'forbidden', message: 'You do not manage this child account.' };
    }
    child.parentId = null;
    await userRepo.save(child);
    return { success: true };
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean() }), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Remove a child assignment from the current parent', tags: ['Users'] }
  });

  const mailboxDomain = String(process.env.MAILBOX_DOMAIN || process.env.MAIL_DOMAIN || 'ecli.app').trim();

  async function resolveMailboxRecipient(addresses: string[]) {
    const normalizedAddresses = addresses
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean);

    if (!normalizedAddresses.length) return null;

    const mailboxRepo = AppDataSource.getRepository(MailboxAccount);
    const accounts = await mailboxRepo.find();

    for (const address of normalizedAddresses) {
      for (const account of accounts) {
        const primary = String(account.email || '').trim().toLowerCase();
        if (primary && primary === address) {
          return { userId: account.userId, address };
        }

        const aliases = Array.isArray(account.aliases) ? account.aliases : [];
        if (aliases.some((item: any) => String(item?.address || '').trim().toLowerCase() === address)) {
          return { userId: account.userId, address };
        }
      }
    }

    return null;
  }

  app.get(prefix + '/mailbox/address', async (ctx: any) => {
    const requester = ctx.user as User;
    if (!requester) {
      ctx.set.status = 401;
      return { error: 'Not logged in' };
    }

    const isAdmin = hasPermissionSync(ctx, 'users:read');
    const targetUserId = Number(ctx.query?.userId || ctx.query?.user_id || 0) || requester.id;
    if (targetUserId !== requester.id && !isAdmin) {
      ctx.set.status = 403;
      return { error: 'Insufficient permissions' };
    }

    const targetUserRepo = AppDataSource.getRepository(User);
    const targetUser = await targetUserRepo.findOneBy({ id: targetUserId });
    if (!targetUser) {
      ctx.set.status = 404;
      return { error: 'User not found' };
    }

    let account;
    try {
      account = await getMailboxAccountForUser(targetUser.id);
    } catch (err: any) {
      console.warn('Failed to fetch mailbox account for user:', targetUser.id, err?.message || err);
    }

    if (!account && targetUserId === requester.id && isMailcowConfigured()) {
      try {
        account = await ensureMailboxAccountForUser(requester);
      } catch (err: any) {
        console.warn('Mailbox provisioning failed for user:', requester.id, err?.message || err);
      }
    }

    const address = account?.email || '';
    const domain = account?.domain || mailboxDomain;
    const connection = getMailboxConnectionInfo(domain);

    return {
      address,
      mailboxReady: Boolean(account?.email),
      uuid: account?.uuid,
      aliases: account?.aliases || [],
      domain,
      imapHost: connection.imapHost,
      imapPort: connection.imapPort,
      imapSecure: connection.imapSecure,
      smtpHost: connection.smtpHost,
      smtpPort: connection.smtpPort,
      smtpSecure: connection.smtpSecure,
    };
  }, {
    beforeHandle: authenticate,
    response: {
      200: t.Object({
        address: t.String(),
        mailboxReady: t.Boolean(),
        uuid: t.Optional(t.String()),
        aliases: t.Optional(t.Array(t.Object({
          address: t.String(),
          canSendFrom: t.Optional(t.Boolean()),
          createdAt: t.Optional(t.String()),
        }))),
        domain: t.String(),
        imapHost: t.String(),
        imapPort: t.Number(),
        imapSecure: t.Boolean(),
        smtpHost: t.String(),
        smtpPort: t.Number(),
        smtpSecure: t.Boolean(),
      }),
      401: t.Object({ error: t.String() }),
    },
    detail: { summary: 'Fetch mailbox address', tags: ['Users'] }
  });

  app.get(prefix + '/mailbox/notifications', async (ctx: any) => {
    const requester = ctx.user as User;
    if (!requester) {
      ctx.set.status = 401;
      return { error: 'Not logged in' };
    }

    const notificationRepo = AppDataSource.getRepository(Notification);
    const notifications = await notificationRepo.find({
      where: { userId: requester.id },
      order: { createdAt: 'DESC' },
    });

    return notifications.map((notification) => ({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      url: notification.url || null,
      read: !!notification.read,
      createdAt: notification.createdAt instanceof Date ? notification.createdAt.toISOString() : String(notification.createdAt),
    }));
  }, {
    beforeHandle: authenticate,
    response: {
      200: t.Array(t.Object({
        id: t.Number(),
        type: t.String(),
        title: t.String(),
        body: t.String(),
        url: t.Optional(t.String()),
        read: t.Boolean(),
        createdAt: t.String(),
      })),
      401: t.Object({ error: t.String() }),
    },
    detail: { summary: 'Fetch mailbox notifications', tags: ['Users'] }
  });

  app.post(prefix + '/mailbox/notifications/:id/read', async (ctx: any) => {
    const requester = ctx.user as User;
    if (!requester) {
      ctx.set.status = 401;
      return { error: 'Not logged in' };
    }

    const id = Number(ctx.params['id']);
    const body = ctx.body as any;
    const setRead = body?.read === undefined ? true : Boolean(body.read);

    const notificationRepo = AppDataSource.getRepository(Notification);
    const notification = await notificationRepo.findOneBy({ id, userId: requester.id } as any);
    if (!notification) {
      ctx.set.status = 404;
      return { error: 'Notification not found' };
    }

    notification.read = setRead;
    await notificationRepo.save(notification);
    return { success: true };
  }, {
    beforeHandle: authenticate,
    response: {
      200: t.Object({ success: t.Boolean() }),
      401: t.Object({ error: t.String() }),
      404: t.Object({ error: t.String() }),
    },
    detail: { summary: 'Mark mailbox notification read/unread', tags: ['Users'] }
  });

  app.delete(prefix + '/mailbox/notifications/:id', async (ctx: any) => {
    const requester = ctx.user as User;
    if (!requester) {
      ctx.set.status = 401;
      return { error: 'Not logged in' };
    }

    const id = Number(ctx.params['id']);
    const notificationRepo = AppDataSource.getRepository(Notification);
    const notification = await notificationRepo.findOneBy({ id, userId: requester.id } as any);
    if (!notification) {
      ctx.set.status = 404;
      return { error: 'Notification not found' };
    }

    await notificationRepo.remove(notification);
    return { success: true };
  }, {
    beforeHandle: authenticate,
    response: {
      200: t.Object({ success: t.Boolean() }),
      401: t.Object({ error: t.String() }),
      404: t.Object({ error: t.String() }),
    },
    detail: { summary: 'Delete mailbox notification', tags: ['Users'] }
  });

  app.get(prefix + '/mailbox/messages', async (ctx: any) => {
    const requester = ctx.user as User;
    if (!requester) {
      ctx.set.status = 401;
      return { error: 'Not logged in' };
    }

    if (isMailcowConfigured()) {
      try {
        const account = await getMailboxAccountForUser(requester.id);
        if (account) {
          await fetchMailboxNow(account);
        }
      } catch (err: any) {
        console.warn('[userHandler] on-demand mailbox fetch failed for', requester.id, err?.message || err);
      }
    }

    const query = (ctx.query as any) || {};
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));
    const searchQuery = String(query.q || '').trim();
    const unreadOnly = String(query.unread || '').toLowerCase() === 'true';
    const categoryFilter = String(query.category || '').trim();
    const favoriteOnly = String(query.favorite || '').toLowerCase() === 'true';

    const messageRepo = AppDataSource.getRepository(MailMessage);
    const qb = messageRepo.createQueryBuilder('message')
      .where('message.userId = :userId', { userId: requester.id });

    if (searchQuery) {
      qb.andWhere(
        '(message.subject LIKE :q OR message.fromAddress LIKE :q OR message.toAddress LIKE :q OR message.body LIKE :q)',
        { q: `%${searchQuery}%` },
      );
    }

    if (unreadOnly) {
      qb.andWhere('message.read = false');
    }

    if (categoryFilter) {
      if (categoryFilter === '__uncategorized__') {
        qb.andWhere('message.category IS NULL');
      } else {
        qb.andWhere('message.category = :category', { category: categoryFilter });
      }
    }

    if (favoriteOnly) {
      qb.andWhere('message.favorite = true');
    }

    const total = await qb.getCount();
    const messages = await qb
      .orderBy('message.receivedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    const messageItems = await Promise.all(messages.map(async (message) => {
      let senderIp = message.senderIp || undefined;
      let parsedHeaders: any = null;
      if (!senderIp && (message.rawHeaders || message.headers)) {
        try {
          parsedHeaders = message.headers ? JSON.parse(message.headers as string) : null;
          const authMetadata = await extractMailboxAuthMetadata(parsedHeaders, message.rawHeaders || message.headers || undefined);
          senderIp = authMetadata.senderIp || senderIp;
        } catch {
          parsedHeaders = null;
        }
      }

      const senderRdns = senderIp ? await resolveReverseDns(senderIp) : message.senderRdns || undefined;
      const priority = extractMailboxPriority(parsedHeaders || message.rawHeaders || message.headers || undefined) || undefined;
      const item: any = {
        id: message.id,
        read: !!message.read,
        subject: message.subject || 'No subject',
        body: message.body || '',
        receivedAt: message.receivedAt instanceof Date ? message.receivedAt.toISOString() : String(message.receivedAt),
        isSpam: !!message.isSpam,
        isVirus: !!message.isVirus,
        rawHeaders: message.rawHeaders || message.headers || undefined,
        headers: message.headers ? (() => {
          try {
            return JSON.parse(message.headers as string);
          } catch {
            return message.headers;
          }
        })() : undefined,
        senderIp: senderIp || undefined,
        senderRdns: senderRdns || undefined,
        favorite: !!message.favorite,
        priority: priority || undefined,
        spfResult: message.spfResult || undefined,
        dkimResult: message.dkimResult || undefined,
        dmarcResult: message.dmarcResult || undefined,
        authResults: message.authResults || undefined,
        receivedChain: message.receivedChain || undefined,
        messageId: message.messageId || undefined,
      };

      if (typeof message.spamScore === 'number') {
        item.spamScore = message.spamScore;
      }

      if (message.virusName) {
        item.virusName = message.virusName;
      }

      if (message.fromAddress) item.fromAddress = message.fromAddress;
      if (message.toAddress) item.toAddress = message.toAddress;
      if (message.html) item.html = message.html;
      if (message.category) item.category = message.category;
      if (message.attachments) item.attachments = message.attachments;

      return item;
    }));

    return {
      meta: {
        page,
        limit,
        total,
      },
      messages: messageItems,
    };
  }, {
    beforeHandle: authenticate,
    response: {
      200: t.Object({
        meta: t.Object({
          page: t.Number(),
          limit: t.Number(),
          total: t.Number(),
        }),
        messages: t.Array(t.Object({
          id: t.Number(),
          messageId: t.Optional(t.String()),
          fromAddress: t.Optional(t.String()),
          toAddress: t.Optional(t.String()),
          subject: t.Optional(t.String()),
          body: t.String(),
          rawHeaders: t.Optional(t.String()),
          headers: t.Optional(t.Any()),
          senderIp: t.Optional(t.String()),
          senderRdns: t.Optional(t.String()),
          spfResult: t.Optional(t.String()),
          dkimResult: t.Optional(t.String()),
          dmarcResult: t.Optional(t.String()),
          favorite: t.Optional(t.Boolean()),
          priority: t.Optional(t.String()),
          authResults: t.Optional(t.String()),
          encryptionType: t.Optional(t.String()),
          receivedChain: t.Optional(t.Array(t.Object({
            raw: t.String(),
            from: t.Optional(t.String()),
            by: t.Optional(t.String()),
            with: t.Optional(t.String()),
            id: t.Optional(t.String()),
            for: t.Optional(t.String()),
            ip: t.Optional(t.String()),
          }))),
          html: t.Optional(t.String()),
          category: t.Optional(t.String()),
          isSpam: t.Boolean(),
          spamScore: t.Optional(t.Number()),
          isVirus: t.Boolean(),
          virusName: t.Optional(t.String()),
          attachments: t.Optional(t.Array(t.Object({
            filename: t.String(),
            url: t.String(),
            contentType: t.Optional(t.String()),
            size: t.Optional(t.Number()),
            cid: t.Optional(t.String()),
          }))),
          read: t.Boolean(),
          receivedAt: t.String(),
        })),
      }),
      401: t.Object({ error: t.String() }),
    },
    detail: { summary: 'Fetch mailbox messages', tags: ['Users'] }
  });

  app.get(prefix + '/mailbox/sent', async (ctx: any) => {
    const requester = ctx.user as User;
    if (!requester) {
      ctx.set.status = 401;
      return { error: 'Not logged in' };
    }

    const query = ctx.query as any;
    const statusFilter = String(query.status || '').trim();
    const searchQuery = String(query.q || '').trim();
    const favoriteOnly = String(query.favorite || '').toLowerCase() === 'true';

    const outboundRepo = AppDataSource.getRepository(OutboundEmail);
    const qb = outboundRepo.createQueryBuilder('out')
      .where('out.userId = :userId', { userId: requester.id });

    if (searchQuery) {
      qb.andWhere(
        '(out.subject LIKE :q OR out.body LIKE :q OR out.toAddress LIKE :q OR out.fromAddress LIKE :q)',
        { q: `%${searchQuery}%` },
      );
    }

    if (statusFilter) {
      qb.andWhere('out.status = :status', { status: statusFilter });
    }
    if (favoriteOnly) {
      qb.andWhere('out.favorite = true');
    }

    const sentEmails = await qb.orderBy('out.scheduledAt', 'DESC').addOrderBy('out.createdAt', 'DESC').getMany();

    return {
      messages: sentEmails.map((sent) => ({
        id: sent.id,
        status: sent.status,
        favorite: !!sent.favorite,
        fromAddress: sent.fromAddress || undefined,
        toAddress: sent.toAddress,
        subject: sent.subject || 'No subject',
        body: sent.body,
        html: sent.html || undefined,
        sentAt: sent.sentAt ? sent.sentAt.toISOString() : undefined,
        scheduledAt: sent.scheduledAt ? sent.scheduledAt.toISOString() : undefined,
        messageId: sent.messageId || undefined,
      })),
    };
  }, {
    beforeHandle: authenticate,
    response: {
      200: t.Object({
        messages: t.Array(t.Object({
          id: t.Number(),
          status: t.String(),
          favorite: t.Boolean(),
          fromAddress: t.Optional(t.String()),
          toAddress: t.String(),
          subject: t.String(),
          body: t.String(),
          html: t.Optional(t.String()),
          sentAt: t.Optional(t.String()),
          scheduledAt: t.Optional(t.String()),
          messageId: t.Optional(t.String()),
        })),
      }),
      401: t.Object({ error: t.String() }),
    },
    detail: { summary: 'Fetch sent mailbox emails', tags: ['Users'] }
  });

  app.post(prefix + '/mailbox/messages/:id/favorite', async (ctx: any) => {
    const requester = ctx.user as User;
    if (!requester) {
      ctx.set.status = 401;
      return { error: 'Not logged in' };
    }

    const id = Number(ctx.params['id']);
    const body = ctx.body as any;
    const favorite = body.favorite === undefined ? true : Boolean(body.favorite);
    const messageRepo = AppDataSource.getRepository(MailMessage);
    const message = await messageRepo.findOneBy({ id, userId: requester.id } as any);
    if (!message) {
      ctx.set.status = 404;
      return { error: 'Message not found' };
    }

    message.favorite = favorite;
    await messageRepo.save(message);
    return { success: true, favorite: message.favorite };
  }, {
    beforeHandle: authenticate,
    body: t.Object({ favorite: t.Optional(t.Boolean()) }),
    response: {
      200: t.Object({ success: t.Boolean(), favorite: t.Boolean() }),
      400: t.Object({ error: t.String() }),
      401: t.Object({ error: t.String() }),
      404: t.Object({ error: t.String() }),
    },
    detail: { summary: 'Mark mailbox message as favorite', tags: ['Users'] }
  });

  app.post(prefix + '/mailbox/sent/:id/favorite', async (ctx: any) => {
    const requester = ctx.user as User;
    if (!requester) {
      ctx.set.status = 401;
      return { error: 'Not logged in' };
    }

    const id = Number(ctx.params['id']);
    const body = ctx.body as any;
    const favorite = body.favorite === undefined ? true : Boolean(body.favorite);
    const outboundRepo = AppDataSource.getRepository(OutboundEmail);
    const sent = await outboundRepo.findOneBy({ id, userId: requester.id } as any);
    if (!sent) {
      ctx.set.status = 404;
      return { error: 'Sent email not found' };
    }

    sent.favorite = favorite;
    await outboundRepo.save(sent);
    return { success: true, favorite: sent.favorite };
  }, {
    beforeHandle: authenticate,
    body: t.Object({ favorite: t.Optional(t.Boolean()) }),
    response: {
      200: t.Object({ success: t.Boolean(), favorite: t.Boolean() }),
      400: t.Object({ error: t.String() }),
      401: t.Object({ error: t.String() }),
      404: t.Object({ error: t.String() }),
    },
    detail: { summary: 'Mark sent email as favorite', tags: ['Users'] }
  });

  app.post(prefix + '/mailbox/messages/:id/category', async (ctx: any) => {
    const requester = ctx.user as User;
    if (!requester) {
      ctx.set.status = 401;
      return { error: 'Not logged in' };
    }

    const messageRepo = AppDataSource.getRepository(MailMessage);
    const rows = await messageRepo
      .createQueryBuilder('message')
      .select('DISTINCT message.category', 'category')
      .where('message.userId = :userId', { userId: requester.id })
      .andWhere('message.category IS NOT NULL')
      .orderBy('message.category', 'ASC')
      .getRawMany();

    return rows
      .map((row: any) => String(row.category || '').trim())
      .filter(Boolean);
  }, {
    beforeHandle: authenticate,
    response: {
      200: t.Array(t.String()),
      401: t.Object({ error: t.String() }),
    },
    detail: { summary: 'Fetch mailbox message categories', tags: ['Users'] }
  });

  async function resolveOutboundFromAddress(user: User) {
    if (isMailcowConfigured()) {
      const account = await getMailboxAccountForUser(user.id).catch(() => null);
      if (account) {
        if (Array.isArray(account.aliases) && account.aliases.length > 0) {
          const alias = account.aliases.find(a => a.canSendFrom) || account.aliases[0];
          if (alias?.address) return String(alias.address).trim();
        }
        if (account.email) return String(account.email).trim();
      }
    }
    if (user.email) return String(user.email).trim();
    return null;
  }

  app.post(prefix + '/mailbox/send', async (ctx: any) => {
    const requester = ctx.user as User;
    if (!requester) {
      ctx.set.status = 401;
      return { error: 'Not logged in' };
    }

    const { to, cc, bcc, subject, body, html } = ctx.body as any;
    const toAddress = String(to || '').trim();
    const ccValue = cc ? String(cc).trim() : '';
    const bccValue = bcc ? String(bcc).trim() : '';
    const messageBody = String(body || '').trim();
    const messageHtml = html ? String(html) : undefined;

    const fromAddress = await resolveOutboundFromAddress(requester);
    if (!fromAddress) {
      ctx.set.status = 400;
      return { error: 'Unable to determine outgoing sender address for your mailbox' };
    }

    if (!toAddress) {
      ctx.set.status = 400;
      return { error: 'Recipient email address is required' };
    }
    if (!messageBody && !messageHtml) {
      ctx.set.status = 400;
      return { error: 'Message body or HTML content is required' };
    }

    const limits = await getSendLimitsForUser(requester);
    if (limits.dailyLimit <= 0) {
      ctx.set.status = 403;
      return { error: 'Email sending is not enabled for your plan' };
    }

    const usage = await getOutboundEmailUsage(requester.id);
    if (usage.queued >= limits.queueLimit) {
      ctx.set.status = 429;
      return { error: 'Email send queue is full. Try again later.' };
    }

    const sendNow = usage.sentToday < limits.dailyLimit;
    const scheduledAt = sendNow ? new Date() : new Date(Date.now() + 24 * 60 * 60 * 1000);
    const record = await createOutboundEmailRecord({
      user: requester,
      fromAddress,
      toAddress,
      cc: ccValue || undefined,
      bcc: bccValue || undefined,
      subject: String(subject || 'No subject').trim(),
      body: messageBody || (messageHtml ? 'See HTML content' : ''),
      html: messageHtml,
      status: sendNow ? 'sent' : 'queued',
      scheduledAt: sendNow ? new Date() : scheduledAt,
      messageId: undefined,
    });

    if (sendNow) {
      try {
        const account = await getMailboxAccountForUser(requester.id).catch(() => null);
        const result = await sendOutboundEmailImmediately(record, account || undefined, requester);
        record.status = 'sent';
        record.sentAt = new Date();
        record.attempts = (record.attempts || 0) + 1;
        record.messageId = result.messageId || record.messageId;
        await AppDataSource.getRepository(OutboundEmail).save(record);
      } catch (err: any) {
        record.status = 'failed';
        record.sentAt = undefined;
        record.failureReason = String(err?.message || err);
        record.attempts = (record.attempts || 0) + 1;
        await AppDataSource.getRepository(OutboundEmail).save(record);
        ctx.set.status = 500;
        return { error: 'Failed to send email', details: record.failureReason };
      }
    }

    return {
      success: true,
      status: record.status,
      sentToday: usage.sentToday + (sendNow ? 1 : 0),
      queued: sendNow ? usage.queued : usage.queued + 1,
      scheduledAt: record.scheduledAt?.toISOString(),
    };
  }, {
    beforeHandle: authenticate,
    body: t.Object({
      to: t.String({ format: 'email' }),
      cc: t.Optional(t.String()),
      bcc: t.Optional(t.String()),
      subject: t.Optional(t.String()),
      body: t.Optional(t.String()),
      html: t.Optional(t.String()),
    }),
    response: {
      200: t.Object({ success: t.Boolean(), status: t.String(), sentToday: t.Number(), queued: t.Number(), scheduledAt: t.Optional(t.String()) }),
      400: t.Object({ error: t.String() }),
      401: t.Object({ error: t.String() }),
      403: t.Object({ error: t.String() }),
      429: t.Object({ error: t.String() }),
      500: t.Object({ error: t.String(), details: t.Optional(t.String()) }),
    },
    detail: { summary: 'Send an outbound email or queue it if daily quota is exhausted', tags: ['Users'] }
  });

  app.post(prefix + '/mailbox/messages/:id/category', async (ctx: any) => {
    const requester = ctx.user as User;
    if (!requester) {
      ctx.set.status = 401;
      return { error: 'Not logged in' };
    }

    const id = Number(ctx.params['id']);
    const body = ctx.body as any;
    const category = String(body?.category || '').trim() || null;

    const messageRepo = AppDataSource.getRepository(MailMessage);
    const message = await messageRepo.findOneBy({ id, userId: requester.id } as any);
    if (!message) {
      ctx.set.status = 404;
      return { error: 'Message not found' };
    }

    message.category = category;
    await messageRepo.save(message);
    return { success: true };
  }, {
    beforeHandle: authenticate,
    body: t.Object({ category: t.Optional(t.String()) }),
    response: {
      200: t.Object({ success: t.Boolean() }),
      400: t.Object({ error: t.String() }),
      401: t.Object({ error: t.String() }),
      404: t.Object({ error: t.String() }),
    },
    detail: { summary: 'Assign category to mailbox message', tags: ['Users'] }
  });

  app.post(prefix + '/mailbox/messages/:id/read', async (ctx: any) => {
    const requester = ctx.user as User;
    if (!requester) {
      ctx.set.status = 401;
      return { error: 'Not logged in' };
    }

    const id = Number(ctx.params['id']);
    const body = ctx.body as any;
    const setRead = body?.read === undefined ? true : Boolean(body.read);

    const messageRepo = AppDataSource.getRepository(MailMessage);
    const message = await messageRepo.findOneBy({ id, userId: requester.id } as any);
    if (!message) {
      ctx.set.status = 404;
      return { error: 'Message not found' };
    }

    message.read = setRead;
    await messageRepo.save(message);
    return { success: true };
  }, {
    beforeHandle: authenticate,
    response: {
      200: t.Object({ success: t.Boolean() }),
      401: t.Object({ error: t.String() }),
      404: t.Object({ error: t.String() }),
    },
    detail: { summary: 'Mark mailbox message read/unread', tags: ['Users'] }
  });

  app.delete(prefix + '/mailbox/messages/:id', async (ctx: any) => {
    const requester = ctx.user as User;
    if (!requester) {
      ctx.set.status = 401;
      return { error: 'Not logged in' };
    }

    const id = Number(ctx.params['id']);
    const messageRepo = AppDataSource.getRepository(MailMessage);
    const message = await messageRepo.findOneBy({ id, userId: requester.id } as any);
    if (!message) {
      ctx.set.status = 404;
      return { error: 'Message not found' };
    }

    let remoteDeleteError: any = null;
    if (isMailcowConfigured()) {
      const account = await getMailboxAccountForUser(requester.id);
      if (account) {
          try {
            const deleted = await deleteMessageFromMailbox(account, message);
            if (!deleted) {
              remoteDeleteError = new Error('Remote deletion failed or message not found');
            }
          } catch (err: any) {
            remoteDeleteError = err;
          }
      }
    }

    if (remoteDeleteError) {
      ctx.set.status = 500;
      return { error: 'Failed to delete mailbox message remotely' };
    }

    await messageRepo.remove(message);
    return { success: true };
  }, {
    beforeHandle: authenticate,
    response: {
      200: t.Object({ success: t.Boolean() }),
      401: t.Object({ error: t.String() }),
      404: t.Object({ error: t.String() }),
    },
    detail: { summary: 'Delete mailbox message', tags: ['Users'] }
  });

  app.post(prefix + '/mailbox/inbound', async (ctx: any) => {
    const secret = String(process.env.MAILBOX_INBOUND_SECRET || '');
    if (!secret) {
      ctx.set.status = 503;
      return { error: 'Mailbox inbound endpoint is not configured' };
    }

    const incomingSecret = String(ctx.request.headers.get('x-mailbox-inbound-secret') || '');
    if (!incomingSecret || incomingSecret !== secret) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }

    const body = ctx.body as any;
    const rawTo = String(body.to || body.toAddress || body.recipient || '').trim();
    if (!rawTo) {
      ctx.set.status = 400;
      return { error: 'Missing to address' };
    }

    const toAddresses = rawTo.split(',').map((value: string) => value.trim().toLowerCase()).filter(Boolean);
    const parsed = await resolveMailboxRecipient(toAddresses);
    if (!parsed) {
      ctx.set.status = 404;
      return { error: 'Mailbox not found' };
    }

    const user = await AppDataSource.getRepository(User).findOneBy({ id: parsed.userId });
    if (!user) {
      ctx.set.status = 404;
      return { error: 'Mailbox owner not found' };
    }

    const messageRepo = AppDataSource.getRepository(MailMessage);
    const security = detectMailboxSecurityFlags(body.headers || null, String(body.subject || 'No subject').trim());
    const rawHeadersValue = typeof body.rawHeaders === 'string'
      ? body.rawHeaders
      : body.headers && typeof body.headers === 'string'
        ? body.headers
        : body.headers && typeof body.headers === 'object'
          ? JSON.stringify(body.headers)
          : null;
    const authMetadata = await extractMailboxAuthMetadata(body.headers || null, rawHeadersValue || undefined);

    const saved = messageRepo.create({
      userId: user.id,
      fromAddress: String(body.from || body.fromAddress || 'unknown').trim(),
      toAddress: parsed.address,
      subject: String(body.subject || 'No subject').trim(),
      body: String(body.text || body.body || '').trim() || '',
      html: body.html ? String(body.html) : null,
      headers: body.headers ? JSON.stringify(body.headers) : null,
      rawHeaders: rawHeadersValue || undefined,
      senderIp: authMetadata.senderIp || undefined,
      senderRdns: authMetadata.senderRdns || undefined,
      spfResult: authMetadata.spfResult || undefined,
      dkimResult: authMetadata.dkimResult || undefined,
      dmarcResult: authMetadata.dmarcResult || undefined,
      authResults: authMetadata.authResults || undefined,
      encryptionType: authMetadata.encryptionType || undefined,
      receivedChain: authMetadata.receivedChain.length > 0 ? authMetadata.receivedChain : undefined,
      isSpam: security.isSpam,
      spamScore: security.spamScore,
      isVirus: security.isVirus,
      virusName: security.virusName,
      read: false,
      receivedAt: body.receivedAt ? new Date(body.receivedAt) : new Date(),
    });
    await messageRepo.save(saved);

    return { success: true, id: saved.id };
  }, {
    response: {
      200: t.Object({ success: t.Boolean(), id: t.Number() }),
      400: t.Object({ error: t.String() }),
      403: t.Object({ error: t.String() }),
      404: t.Object({ error: t.String() }),
      503: t.Object({ error: t.String() }),
    },
    detail: { summary: 'Inbound mailbox webhook for incoming mail', tags: ['Users'] }
  });

  app.post(prefix + '/mailbox/refresh', async (ctx: any) => {
    const requester = ctx.user as User;
    if (!requester) {
      ctx.set.status = 401;
      return { error: 'Not logged in' };
    }

    if (!isMailcowConfigured()) {
      ctx.set.status = 503;
      return { error: 'Mailbox system not configured' };
    }

    const account = await getMailboxAccountForUser(requester.id);
    if (!account) {
      ctx.set.status = 404;
      return { error: 'Mailbox account not found' };
    }

    try {
      await fetchMailboxNow(account);
      return { success: true };
    } catch (err: any) {
      console.warn('Failed on-demand mailbox fetch for', requester.id, err?.message || err);
      ctx.set.status = 500;
      return { error: 'Failed to refresh mailbox' };
    }
  }, {
    beforeHandle: authenticate,
    config: { rateLimit: { max: 6, timeWindow: '1 minute' } },
    response: { 200: t.Object({ success: t.Boolean() }), 401: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }), 503: t.Object({ error: t.String() }), 500: t.Object({ error: t.String() }) },
    detail: { summary: 'Refresh mailbox now (on-demand)', tags: ['Users'] }
  });

  app.get(prefix + '/users/:id', async (ctx: any) => {
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOneBy({ id: Number(ctx.params['id']) });
    if (!user) {
      ctx.set.status = 404;
      return { error: 'User not found' };
    }
    const requester = ctx.user as User;
    if (!requester) {
      ctx.set.status = 401;
      return { error: 'Not logged in' };
    }
    if (requester.id !== user.id && !hasPermissionSync(ctx, 'users:read')) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    return await safeUser(user);
  }, {
   beforeHandle: authenticate,
    response: { 200: userSchema, 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Lookup a user by id', tags: ['Users'] }
  });

  app.patch(prefix + '/users/me/favorites', async (ctx: any) => {
    const requester = ctx.user as User;
    if (!requester) {
      ctx.set.status = 401;
      return { error: 'Not logged in' };
    }

    const payload = ctx.body as any;
    const incomingFavorites = payload?.favorites;
    if (!Array.isArray(incomingFavorites)) {
      ctx.set.status = 400;
      return { error: 'Invalid favorites list' };
    }

    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOneBy({ id: requester.id });
    if (!user) {
      ctx.set.status = 404;
      return { error: 'User not found' };
    }

    const normalized = Array.from(new Set(incomingFavorites.map((id: any) => String(id))));
    if (!user.settings || typeof user.settings !== 'object') {
      user.settings = {};
    }
    (user.settings as any).serverFavorites = normalized;

    await userRepo.save(user);

    return {
      success: true,
      serverFavorites: normalized,
    };
  }, {
    beforeHandle: authenticate,
    response: {
      200: t.Object({ success: t.Boolean(), serverFavorites: t.Array(t.String()) }),
      400: t.Object({ error: t.String() }),
      401: t.Object({ error: t.String() }),
      404: t.Object({ error: t.String() }),
    },
    detail: { summary: 'Update current user server favorites', tags: ['Users'] },
  });

  app.put(prefix + '/users/:id', async (ctx: any) => {
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOneBy({ id: Number(ctx.params['id']) });
    if (!user) {
      ctx.set.status = 404;
      return { error: 'User not found' };
    }
    const requester = ctx.user as User;
    if (!requester) {
      ctx.set.status = 401;
      return { error: 'Not logged in' };
    }
    if (requester.id !== user.id && !hasPermissionSync(ctx, 'users:write')) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    const payload = ctx.body as any;
    const isAdmin = hasPermissionSync(ctx, 'users:write');
    if (payload.password) {
      if (typeof payload.password !== 'string' || payload.password.length < 8) {
        ctx.set.status = 400;
        return { error: 'Password must be at least 8 characters' };
      }

      const submittedCurrentPassword = typeof payload.currentPassword === 'string' ? payload.currentPassword : undefined;
      if (!submittedCurrentPassword && !isAdmin) {
        ctx.set.status = 400;
        return { error: 'Current password is required to change password' };
      }

      if (submittedCurrentPassword) {
        const validCurrent = await comparePassword(submittedCurrentPassword, user.passwordHash);
        if (!validCurrent) {
          ctx.set.status = 403;
          return { error: 'Current password is invalid' };
        }
      }

      user.passwordHash = await hashPassword(payload.password);
      user.sessions = [];
      delete payload.password;
      delete payload.currentPassword;
    }

    const newEmail = typeof payload.email === 'string' ? payload.email.trim() : undefined;
    const oldEmail = user.email;
    let emailChanged = false;

    if (newEmail && newEmail !== oldEmail) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
        ctx.set.status = 400;
        return { error: 'Invalid email address' };
      }
      user.email = newEmail;
      user.emailVerified = false;
      emailChanged = true;
    }

    if ('dateOfBirth' in payload) {
      const hasVerifiedDob = Boolean(user.idVerified || user.settings?.ageVerificationSelfieVerifiedAt);
      if (hasVerifiedDob && !isAdmin && requester.id === user.id) {
        ctx.set.status = 403;
        return { error: 'date_of_birth_locked', message: 'Date of birth is locked after identity or selfie verification and can only be updated by an administrator.' };
      }
      const dateOfBirth = parseDateOfBirth(payload.dateOfBirth);
      if (!dateOfBirth) {
        ctx.set.status = 400;
        return { error: 'invalid_date_of_birth', message: 'dateOfBirth must be a valid date string in YYYY-MM-DD format.' };
      }
      const updatedAge = getAgeFromDate(dateOfBirth);
      const effectiveCountry = typeof payload.billingCountry === 'string' ? payload.billingCountry : user.billingCountry;
      const minimumAge = await getMinimumAgeForCountry(effectiveCountry);
      if (updatedAge !== null && updatedAge < minimumAge) {
        if (!isAdmin) {
          ctx.set.status = 400;
          return { error: 'minimum_age', message: `Users must be at least ${minimumAge} years old.` };
        }
        user.suspended = true;
        user.fraudFlag = true;
        user.fraudReason = `Underage account (<${minimumAge} years)`;
      }
      user.dateOfBirth = dateOfBirth;
      delete payload.dateOfBirth;
    }

    const isChildWithParent = requester.id === user.id && user.parentId != null;
    if (isChildWithParent) {
      const forbiddenBillingFields = ['address', 'address2', 'billingCompany', 'billingCity', 'billingState', 'billingZip', 'billingCountry'];
      for (const field of forbiddenBillingFields) {
        if (field in payload) {
          ctx.set.status = 403;
          return { error: 'child_cannot_update_billing', message: 'Child accounts cannot update billing or address information.' };
        }
      }
    }

    const requiredProfileFields = ['address', 'billingCity', 'billingZip', 'billingCountry'];
    for (const field of requiredProfileFields) {
      if (field in payload) {
        const value = payload[field];
        if (value === null || value === undefined || String(value).trim() === '') {
          ctx.set.status = 400;
          return { error: `${field}_required`, message: `${field} cannot be empty.` };
        }
      }
    }

    if ('phone' in payload) {
      const phone = payload.phone;
      if (phone === null || phone === undefined || String(phone).trim() === '') {
        if (isChildWithParent) {
          delete payload.phone;
        } else {
          ctx.set.status = 400;
          return { error: 'phone_required', message: 'Phone cannot be cleared or set to an empty value.' };
        }
      }
    }

    const addressChangeFields = ['address', 'address2', 'billingCompany', 'billingCity', 'billingState', 'billingZip', 'billingCountry', 'phone'];
    const addressChanges: Record<string, any> = {};
    for (const key of addressChangeFields) {
      if (key in payload) {
        const oldValue = (user as any)[key];
        const newValue = payload[key];
        const oldNormalized = oldValue === undefined || oldValue === null ? '' : String(oldValue).trim();
        const newNormalized = newValue === undefined || newValue === null ? '' : String(newValue).trim();
        if (oldNormalized !== newNormalized) {
          addressChanges[key] = { before: oldValue ?? null, after: newValue ?? null };
        }
      }
    }

    const USER_FIELDS = ['email','firstName', 'middleName', 'lastName', 'displayName', 'phone',
      'address', 'address2', 'billingCompany', 'billingCity', 'billingState', 'billingZip', 'billingCountry', 'settings'];
    const ADMIN_ONLY_FIELDS = ['role', 'portalType', 'nodeId', 'limits', 'settings', 'emailVerified', 'idVerified', 'suspended', 'fraudFlag', 'fraudReason', 'parentId'];
    const allowed = isAdmin ? [...USER_FIELDS, ...ADMIN_ONLY_FIELDS] : USER_FIELDS;
    for (const key of allowed) {
      if (key === 'email') continue;
      if (key in payload) (user as any)[key] = payload[key];
    }

    try {
      await userRepo.save(user);
    } catch (err: any) {
      if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
        ctx.set.status = 409;
        return { error: 'An account with that email address already exists.' };
      }
      throw err;
    }

    if (emailChanged) {
      await sendVerificationEmailToUser(user);

      const restoreToken = uuidv4();
      await redisSet(`email-restore:token:${restoreToken}`, JSON.stringify({ userId: user.id, oldEmail, newEmail }), 48 * 3600);

      const panelUrl = process.env.PANEL_URL || 'https://panel.ecli.app';
      const restoreUrl = `${panelUrl}/restore-email?token=${restoreToken}`;
      try {
        await sendMail({
          to: oldEmail,
          from: process.env.SMTP_FROM || 'noreply@ecli.app',
          subject: 'Restore your previous email - EcliPanel',
          template: 'email-restore',
          vars: { name: user.firstName || 'User', restoreUrl, newEmail, oldEmail },
        });
      } catch (err) {
        console.error('Failed to send email restore link to old email:', err);
      }
    }

    const logRepo = AppDataSource.getRepository(UserLog);
    if (Object.keys(addressChanges).length > 0) {
      await logRepo.save(logRepo.create({ userId: user.id, action: 'update-address', metadata: addressChanges, timestamp: new Date() }));
    } else {
      await logRepo.save(logRepo.create({ userId: user.id, action: 'update-profile', timestamp: new Date() }));
    }
    return { success: true, user: await safeUser(user) };
  }, {
   beforeHandle: authenticate,
    body: t.Any(),
    response: { 200: t.Object({ success: t.Boolean(), user: userSchema }), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Update user profile', tags: ['Users'] }
  });

  // opsec next level
  app.post(prefix + '/users/:id/avatar', async (ctx: any) => {
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOneBy({ id: Number(ctx.params['id']) });
    if (!user) {
      ctx.set.status = 404;
      return { error: 'User not found' };
    }
    const requester = ctx.user as User;
    if (!requester) {
      ctx.set.status = 401;
      return { error: 'Not logged in' };
    }
    if (requester.id !== user.id && !hasPermissionSync(ctx, 'users:write')) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    const { file } = (ctx.body || {}) as any;
    const uploadFile = Array.isArray(file) ? file[0] : file;
    if (!uploadFile) {
      ctx.set.status = 400;
      return { error: 'No file' };
    }

    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    const mime = (uploadFile.type || uploadFile.mimetype || '').toString();
    if (!allowed.includes(mime)) {
      ctx.set.status = 400;
      return { error: 'Invalid image type' };
    }

    const ab = await uploadFile.arrayBuffer();
    const buffer = Buffer.from(ab);

    let isAnimated = false;
    if (mime === 'image/gif' || mime === 'image/webp') {
      try {
        const meta = await sharp(buffer, { animated: true }).metadata();
        isAnimated = Number(meta.pages || 1) > 1;
      } catch {
        isAnimated = false;
      }
    }

    const preserveOriginalAnimation = (mime === 'image/gif' || mime === 'image/webp') && isAnimated;
    const out = preserveOriginalAnimation
      ? buffer
      : await resizeImage(buffer, 256, 256).catch(async (err) => {
        try {
          return await sharp(buffer).rotate().resize(256, 256, { fit: 'cover' }).toBuffer();
        } catch (e) {
          throw err || e;
        }
      });
    const originalName = uploadFile.name || uploadFile.filename || `avatar_user_${user.id}`;
    const ext = path.extname(originalName) || (mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : mime === 'image/gif' ? '.gif' : '.jpg');
    const filename = `avatar_user_${user.id}` + ext;

    const uploadDir = path.join(process.cwd(), 'uploads');
    fs.mkdirSync(uploadDir, { recursive: true });
    const filepath = path.join(uploadDir, filename);
    fs.writeFileSync(filepath, out);

    const backendBase = (process.env.BACKEND_URL || '').replace(/\/+$/, '') || (() => {
      const proto = (ctx.request.headers.get('x-forwarded-proto') || 'https') as string;
      const host = (ctx.request.headers.get('host') || 'localhost') as string;
      return `${proto}://${host}`;
    })();

    user.avatarUrl = `${backendBase}/uploads/${filename}`;
    await userRepo.save(user);

    return { success: true, url: user.avatarUrl };
  }, {
   beforeHandle: authenticate,
    body: t.Object({ file: t.File({ type: 'image' }) }),
    response: {
      200: t.Object({ success: t.Boolean(), url: t.String() }),
      400: t.Object({ error: t.String() }),
      401: t.Object({ error: t.String() }),
      403: t.Object({ error: t.String() }),
      404: t.Object({ error: t.String() })
    },
    detail: { summary: 'Upload or update user avatar', tags: ['Users'] }
  });

  app.post(prefix + '/users/:id/guide', async (ctx: any) => {
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOneBy({ id: Number(ctx.params['id']) });
    if (!user) {
      ctx.set.status = 404;
      return { error: 'User not found' };
    }
    const requester = ctx.user as User;
    if (!requester) {
      ctx.set.status = 401;
      return { error: 'Not logged in' };
    }
    if (requester.id !== user.id && !hasPermissionSync(ctx, 'users:write')) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }

    const body = ctx.body as any;
    const shown = body && typeof body.shown === 'boolean' ? body.shown : true;
    (user as any).guideShown = shown === true;
    await userRepo.save(user);

    const logRepo = AppDataSource.getRepository(UserLog);
    await logRepo.save(logRepo.create({ userId: user.id, action: shown ? 'guide:shown' : 'guide:reset', timestamp: new Date() }));

    return { success: true, user: await safeUser(user) };
  }, {
   beforeHandle: authenticate,
    body: t.Any(),
    response: { 200: t.Object({ success: t.Boolean(), user: t.Any() }), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Set or clear guide shown flag for a user', tags: ['Users'] }
  });

  app.get(prefix + '/users/:id/servers', async (ctx: any) => {
    const userId = Number(ctx.params['id']);
    const requester = ctx.user as User;
    if (!requester) {
      ctx.set.status = 401;
      return { error: 'Not logged in' };
    }
    const apiKey = ctx.apiKey;
    const isAdmin = (hasPermissionSync(ctx, 'users:read') || apiKey?.type === 'admin');
    if (!isAdmin && requester.id !== userId) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    const repo = AppDataSource.getRepository(require('../models/node.entity').Node);
    const nodes = await repo.find();
    let results: any[] = [];
    for (const n of nodes) {
      const base = (n as any).backendWingsUrl || n.url;
      const svc = new WingsApiService(base, n.token);
      const res = await svc.getServers();

      const userServers = (res.data || []).filter((s: any) => {
        const ownerCandidate = s.owner ?? s.ownerId ?? s.user ?? s.userId ?? s.owner_id ?? s.user_id;
        const serverOwner = Number(ownerCandidate);
        return !Number.isNaN(serverOwner) && serverOwner === userId;
      });

      results.push(...userServers.map((s: any) => ({ ...s, node: n.id })));
    }
    return results;
  }, {
   beforeHandle: authenticate,
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'List all servers owned by user', tags: ['Users'] }
  });
}