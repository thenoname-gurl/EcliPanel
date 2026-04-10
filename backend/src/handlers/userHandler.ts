import { AppDataSource } from '../config/typeorm';
import { MailMessage } from '../models/mailMessage.entity';
import { MailboxAccount } from '../models/mailboxAccount.entity';
import { Notification } from '../models/notification.entity';
import { User } from '../models/user.entity';
import { validateUserRegistration } from '../middleware/validation';
import { hashPassword, comparePassword } from '../utils/password';
import { canRegister, getGeoBlockLevel } from '../utils/eu';
import { authenticate } from '../middleware/auth';
import { UserLog } from '../models/userLog.entity';
import { ensureMailboxAccountForUser, getMailboxAccountForUser, getMailboxConnectionInfo, isMailcowConfigured, isPanelAssignedMailboxEmail } from '../services/mailcowService';
import { deleteMessageFromMailbox, fetchMailboxNow } from '../services/imapFetcher';
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

    const valid = await validateUserRegistration(ctx, ctx);
    if (!valid) return (ctx as any).body;

    if (!(await canRegister((ctx.body as any).billingCountry))) {
      ctx.set.status = 403;
      return { error: 'Registration is not allowed from your country under geo-block policy' };
    }

    const body = ctx.body as Partial<User>;
    const normalizedEmail = String(body.email || '').trim().toLowerCase();
    if (normalizedEmail && await isPanelAssignedMailboxEmail(normalizedEmail)) {
      ctx.set.status = 400;
      return { error: 'registration_email_reserved', message: 'That email is reserved by the panel and cannot be used for registration.' };
    }
    const userRepo = AppDataSource.getRepository(User);
    const user = userRepo.create(body);
    user.passwordHash = await hashPassword((body as any).password!);
    if (!user.portalType) user.portalType = 'free';
    try {
      await userRepo.save(user);
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
      address: t.String(),
      address2: t.Optional(t.String()),
      billingCompany: t.Optional(t.String()),
      billingCity: t.String(),
      billingState: t.Optional(t.String()),
      billingZip: t.String(),
      billingCountry: t.String(),
      phone: t.Optional(t.String()),
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

    const isAdmin = requester.role === 'admin' || requester.role === 'rootAdmin' || requester.role === '*';
    const targetUserId = Number(ctx.query?.userId || ctx.query?.user_id || 0) || requester.id;
    if (targetUserId !== requester.id && !isAdmin) {
      ctx.set.status = 403;
      return { error: 'Admin access required' };
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

    const messageRepo = AppDataSource.getRepository(MailMessage);
    const messages = await messageRepo.find({
      where: { userId: requester.id },
      order: { receivedAt: 'DESC' },
    });

    return messages.map((message) => {
      const item: any = {
        id: message.id,
        read: !!message.read,
        subject: message.subject || 'No subject',
        body: message.body || '',
        receivedAt: message.receivedAt instanceof Date ? message.receivedAt.toISOString() : String(message.receivedAt),
      };

      if (message.fromAddress) item.fromAddress = message.fromAddress;
      if (message.toAddress) item.toAddress = message.toAddress;
      if (message.html) item.html = message.html;
      if (message.category) item.category = message.category;
      if (message.attachments) item.attachments = message.attachments;

      return item;
    });
  }, {
   beforeHandle: authenticate,
    response: {
      200: t.Array(t.Object({
        id: t.Number(),
        fromAddress: t.Optional(t.String()),
        toAddress: t.Optional(t.String()),
        subject: t.Optional(t.String()),
        body: t.String(),
        html: t.Optional(t.String()),
        category: t.Optional(t.String()),
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
      401: t.Object({ error: t.String() }),
    },
    detail: { summary: 'Fetch mailbox messages', tags: ['Users'] }
  });

  app.get(prefix + '/mailbox/messages/categories', async (ctx: any) => {
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
    const saved = messageRepo.create({
      userId: user.id,
      fromAddress: String(body.from || body.fromAddress || 'unknown').trim(),
      toAddress: parsed.address,
      subject: String(body.subject || 'No subject').trim(),
      body: String(body.text || body.body || '').trim() || '',
      html: body.html ? String(body.html) : null,
      headers: body.headers ? JSON.stringify(body.headers) : null,
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
    if (requester.id !== user.id && requester.role !== 'admin') {
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
    if (requester.id !== user.id && requester.role !== 'admin') {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    const payload = ctx.body as any;
    const isAdmin = requester.role === 'admin' || requester.role === 'rootAdmin' || requester.role === '*';
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

    const USER_FIELDS = ['email','firstName', 'middleName', 'lastName', 'displayName', 'phone',
      'address', 'address2', 'billingCompany', 'billingCity', 'billingState', 'billingZip', 'billingCountry', 'settings'];
    const ADMIN_ONLY_FIELDS = ['role', 'portalType', 'nodeId', 'limits', 'settings', 'emailVerified', 'idVerified', 'suspended', 'fraudFlag', 'fraudReason'];
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
    await logRepo.save(logRepo.create({ userId: user.id, action: 'update-profile', timestamp: new Date() }));
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
    if (requester.id !== user.id && requester.role !== 'admin') {
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
    if (requester.id !== user.id && requester.role !== 'admin') {
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
    const isAdmin = requester.role === 'admin' || requester.role === 'rootAdmin' || requester.role === '*' || apiKey?.type === 'admin';
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