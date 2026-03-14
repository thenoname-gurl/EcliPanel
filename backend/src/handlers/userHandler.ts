import { AppDataSource } from '../config/typeorm';
import { User } from '../models/user.entity';
import { validateUserRegistration } from '../middleware/validation';
import { hashPassword } from '../utils/password';
import { authenticate } from '../middleware/auth';
import { UserLog } from '../models/userLog.entity';
import { sendMail } from '../services/mailService';
import { redisSet } from '../config/redis';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { WingsApiService } from '../services/wingsApiService';
import { PanelSetting } from '../models/panelSetting.entity';
import { t } from 'elysia';

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
  twoFactorEnabled: t.Boolean(),
  suspended: t.Boolean(),
  deletionRequested: t.Boolean(),
  deletionApproved: t.Boolean(),
  avatarUrl: t.Optional(t.String()),
});

function safeUser(user: User): any {
  const { passwordHash, sessions, ...safe } = user as any;
  return safe;
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
    if (!valid) return;
    const body = ctx.body as Partial<User>;
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
    const logRepo = AppDataSource.getRepository(UserLog);
    await logRepo.save(logRepo.create({ userId: user.id, action: 'register', timestamp: new Date() }));

    try {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const token = uuidv4();
      await redisSet(`email-verify:token:${token}`, String(user.id), 86400);
      await redisSet(`email-verify:code:${user.id}`, code, 86400);
      const panelUrl = process.env.PANEL_URL || 'https://panel.ecli.app';
      const verifyUrl = `${panelUrl}/verify-email?token=${token}`;
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

    return { success: true, user: safeUser(user) };
  }, {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    body: t.Object({
      email: t.String({ format: 'email' }),
      password: t.String({ minLength: 8 }),
      firstName: t.Optional(t.String()),
      lastName: t.Optional(t.String())
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
    return safeUser(user);
  }, {
   beforeHandle: authenticate,
    response: { 200: userSchema, 401: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Get current user', tags: ['Users'] }
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
    return safeUser(user);
  }, {
   beforeHandle: authenticate,
    response: { 200: userSchema, 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Lookup a user by id', tags: ['Users'] }
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
      user.passwordHash = await hashPassword(payload.password);
      delete payload.password;
    }
    const USER_FIELDS = ['firstName', 'middleName', 'lastName', 'displayName', 'phone',
      'address', 'address2', 'billingCompany', 'billingCity', 'billingState', 'billingZip', 'billingCountry', 'settings'];
    const ADMIN_ONLY_FIELDS = ['role', 'portalType', 'nodeId', 'limits', 'settings', 'emailVerified', 'idVerified', 'suspended', 'fraudFlag', 'fraudReason'];
    const allowed = isAdmin ? [...USER_FIELDS, ...ADMIN_ONLY_FIELDS] : USER_FIELDS;
    for (const key of allowed) {
      if (key in payload) (user as any)[key] = payload[key];
    }
    await userRepo.save(user);
    const logRepo = AppDataSource.getRepository(UserLog);
    await logRepo.save(logRepo.create({ userId: user.id, action: 'update-profile', timestamp: new Date() }));
    return { success: true, user: safeUser(user) };
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
    const file = await ctx.file();
    if (!file) {
      ctx.set.status = 400;
      return { error: 'No file' };
    }
    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      ctx.set.status = 400;
      return { error: 'Invalid image type' };
    }
    const buffer = await file.toBuffer();
    const out = await sharp(buffer).rotate().resize(256, 256, { fit: 'cover' }).toBuffer();
    const filename = `avatar_user_${user.id}` + path.extname(file.filename || '.png');
    const filepath = path.join(process.cwd(), 'uploads', filename);
    fs.writeFileSync(filepath, out);
    user.avatarUrl = `/uploads/${filename}`;
    await userRepo.save(user);
    return { success: true, url: user.avatarUrl };
  }, {
   beforeHandle: authenticate,
    response: {
      200: t.Object({ success: t.Boolean(), url: t.String() }),
      400: t.Object({ error: t.String() }),
      401: t.Object({ error: t.String() }),
      403: t.Object({ error: t.String() }),
      404: t.Object({ error: t.String() })
    },
    detail: { summary: 'Upload or update user avatar', tags: ['Users'] }
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
      const svc = new WingsApiService(n.url, n.token);
      const res = await svc.getServers();
      const userServers = (res.data || []).filter((s: any) => s.owner === userId);
      results.push(...userServers.map((s: any) => ({ ...s, node: n.id })));
    }
    return results;
  }, {
   beforeHandle: authenticate,
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'List all servers owned by user', tags: ['Users'] }
  });
}