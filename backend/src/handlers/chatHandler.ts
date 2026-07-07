import { AppDataSource } from '../config/typeorm';
import { ChatChannel } from '../models/chatChannel.entity';
import { ChatMessage } from '../models/chatMessage.entity';
import { ChatChannelMember } from '../models/chatChannelMember.entity';
import { ChatIpLog } from '../models/chatIpLog.entity';
import { User } from '../models/user.entity';
import { authenticate } from '../middleware/auth';
import { hasPermissionSync } from '../middleware/authorize';
import { chatEmitter } from '../services/chatSocketService';
import { IsNull } from 'typeorm';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// Looking for good code?
// Well, sike its a mess.

const chatClients = new Set<any>();

chatEmitter.on('message', (payload: any) => {
  for (const ws of chatClients) {
    if (ws.data?.channels?.has(payload.channelId)) {
      try { ws.send(JSON.stringify({ type: 'new_message', data: payload })); } catch {}
    }
  }
});

chatEmitter.on('thread_update', (payload: any) => {
  for (const ws of chatClients) {
    if (ws.data?.channels?.has(payload.channelId)) {
      try { ws.send(JSON.stringify({ type: 'thread_update', data: payload })); } catch {}
    }
  }
});

function generateSlug(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64);
  const suffix = Math.random().toString(36).slice(2, 6);
  return base ? `${base}-${suffix}` : suffix;
}

function formatPostId(id: number): string {
  const s = String(id);
  return s.length >= 9 ? s : '0'.repeat(9 - s.length) + s;
}

function hashIp(ip: string): string {
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

function posterId(ip: string): string {
  const hash = crypto.createHash('sha256').update(ip).digest();
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 8; i++) {
    id += chars[hash[i] % chars.length];
  }
  return id;
}

function getClientIp(ctx: any): string {
  try {
    return ctx.ip || ctx.request?.ip || ctx.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || ctx.headers?.['x-real-ip'] || '0.0.0.0';
  } catch { return '0.0.0.0'; }
}

function getUserDisplayName(user: User | null): string {
  if (!user) return 'Anonymous';
  if (user.displayName) return user.displayName;
  if (user.email) return user.email.split('@')[0];
  return 'Anonymous';
}

export async function chatRoutes(app: any, prefix = '') {
  const channelRepo = () => AppDataSource.getRepository(ChatChannel);
  const messageRepo = () => AppDataSource.getRepository(ChatMessage);
  const memberRepo = () => AppDataSource.getRepository(ChatChannelMember);
  const ipLogRepo = () => AppDataSource.getRepository(ChatIpLog);

  app.get(prefix + '/chat/channels', async (ctx: any) => {
    const userId = ctx.user?.id ?? null;
    const type = ctx.query?.type as string | undefined;
    const qb = channelRepo().createQueryBuilder('c').where('c.isArchived = :archived', { archived: false });
    if (userId) qb.andWhere('(c.isListed = :listed OR c.createdById = :userId)', { listed: 1, userId });
    if (type) qb.andWhere('c.type = :type', { type });
    const channels = await qb.orderBy('c.createdAt', 'DESC').getMany();
    const result: any[] = [];
    for (const c of channels) {
      const threadCount = await messageRepo().countBy({ channelId: c.id, parentId: IsNull() });
      const postCount = await messageRepo().countBy({ channelId: c.id });
      let isMember = false, myRole: string | null = null;
      if (userId) { const m = await memberRepo().findOneBy({ channelId: c.id, userId }); isMember = !!m; if (m) myRole = m.role; }
      result.push({ ...c, threadCount, postCount, isMember, myRole });
    }
    return result;
  }, { detail: { tags: ['Chat'], summary: 'List chat channels' } });

  app.get(prefix + '/chat/channels/all', async (ctx: any) => {
    const channels = await channelRepo()
      .createQueryBuilder('c')
      .where('c.isArchived = :archived', { archived: false })
      .andWhere('c.isListed = :listed', { listed: 1 })
      .orderBy('c.createdAt', 'DESC').getMany();
    const result: any[] = [];
    for (const c of channels) {
      const threadCount = await messageRepo().countBy({ channelId: c.id, parentId: IsNull() });
      const postCount = await messageRepo().countBy({ channelId: c.id });
      result.push({ ...c, threadCount, postCount, isMember: true, myRole: null });
    }
    return result;
  }, { detail: { tags: ['Chat'], summary: 'List all visible channels' } });

  app.get(prefix + '/chat/public/channels', async (ctx: any) => {
    const channels = await channelRepo()
      .createQueryBuilder('c')
      .where('c.type = :type', { type: 'public_anonymous' })
      .andWhere('c.isArchived = :archived', { archived: false })
      .andWhere('c.isListed = :listed', { listed: 1 })
      .orderBy('c.createdAt', 'DESC').getMany();
    const result: any[] = [];
    for (const c of channels) {
      const threadCount = await messageRepo().countBy({ channelId: c.id, parentId: IsNull() });
      const postCount = await messageRepo().countBy({ channelId: c.id });
      result.push({ ...c, threadCount, postCount, isMember: true, myRole: null });
    }
    return result;
  }, { detail: { tags: ['Chat'], summary: 'List public anonymous channels' } });

  app.post(prefix + '/chat/channels', async (ctx: any) => {
    const userId = ctx.user.id;
    const { name, description, type } = await ctx.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) { ctx.set.status = 400; return { error: 'Channel name is required' }; }
    const validTypes = ['community', 'public_anonymous'];
    const channelType = type && validTypes.includes(type as string) ? type as string : 'community';
    const slug = generateSlug(name as string);
    const channel = channelRepo().create({ slug, name: (name as string).trim(), description: description ? (description as string).trim() : null, type: channelType, createdById: userId });
    await channelRepo().save(channel);
    if (channelType === 'community') { const m = memberRepo().create({ channelId: channel.id, userId, role: 'admin' }); await memberRepo().save(m); }
    return channel;
  }, { beforeHandle: [authenticate], detail: { tags: ['Chat'], summary: 'Create a chat channel' } });

  app.get(prefix + '/chat/channels/:id', async (ctx: any) => {
    const id = Number(ctx.params?.id);
    const channel = await channelRepo().findOneBy({ id });
    if (!channel) { ctx.set.status = 404; return { error: 'Channel not found' }; }
    const threadCount = await messageRepo().countBy({ channelId: id, parentId: IsNull() });
    const postCount = await messageRepo().countBy({ channelId: id });
    let isMember = false;
    if (ctx.user?.id) { const m = await memberRepo().findOneBy({ channelId: id, userId: ctx.user.id }); isMember = !!m; }
    return { ...channel, threadCount, postCount, isMember };
  }, { detail: { tags: ['Chat'], summary: 'Get channel details' } });

  async function canManageChannel(ctx: any, channel: any): Promise<boolean> {
    const userId = ctx.user?.id;
    if (!userId) return false;
    if (channel.createdById === userId) return true;
    const mem = await memberRepo().findOneBy({ channelId: channel.id, userId });
    if (mem && mem.role === 'admin') return true;
    if (hasPermissionSync(ctx, 'chat:manage')) return true;
    return false;
  }

  app.put(prefix + '/chat/channels/:id', async (ctx: any) => {
    const id = Number(ctx.params?.id);
    const channel = await channelRepo().findOneBy({ id });
    if (!channel) { ctx.set.status = 404; return { error: 'Channel not found' }; }
    if (!await canManageChannel(ctx, channel)) { ctx.set.status = 403; return { error: 'Not authorized to manage this channel' }; }

    const { name, slug, description } = await ctx.body;
    if (name !== undefined && typeof name === 'string' && name.trim().length > 0) channel.name = (name as string).trim();
    if (slug !== undefined && typeof slug === 'string') {
      const s = (slug as string).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 64);
      if (s.length < 1) { ctx.set.status = 400; return { error: 'Slug cannot be empty' }; }
      const existing = await channelRepo().findOneBy({ slug: s, isArchived: false });
      if (existing && existing.id !== id) { ctx.set.status = 400; return { error: 'Slug already in use' }; }
      channel.slug = s;
    }
    if (description !== undefined) channel.description = typeof description === 'string' ? (description as string).trim() || null : null;
    await channelRepo().save(channel);
    return channel;
  }, { beforeHandle: [authenticate], detail: { tags: ['Chat'], summary: 'Update channel name/slug/description' } });

  app.delete(prefix + '/chat/channels/:id', async (ctx: any) => {
    const id = Number(ctx.params?.id);
    const channel = await channelRepo().findOneBy({ id });
    if (!channel) { ctx.set.status = 404; return { error: 'Channel not found' }; }
    if (!await canManageChannel(ctx, channel)) { ctx.set.status = 403; return { error: 'Not authorized to manage this channel' }; }

    channel.isArchived = true;
    await channelRepo().save(channel);
    return { success: true };
  }, { beforeHandle: [authenticate], detail: { tags: ['Chat'], summary: 'Delete (archive) a channel' } });

  app.get(prefix + '/chat/channels/:id/threads', async (ctx: any) => {
    const channelId = Number(ctx.params?.id);
    const channel = await channelRepo().findOneBy({ id: channelId });
    if (!channel) { ctx.set.status = 404; return { error: 'Channel not found' }; }
    const page = Math.max(1, Number(ctx.query?.page) || 1);
    const limit = Math.min(Math.max(Number(ctx.query?.limit) || 20, 1), 50);
    const threads = await messageRepo().find({ where: { channelId, parentId: IsNull() }, order: { bumpedAt: 'DESC', createdAt: 'DESC' }, skip: (page - 1) * limit, take: limit });
    const result: any[] = [];
    for (const op of threads) {
      const replyCount = await messageRepo().countBy({ channelId, parentId: op.id });
      const recentReplies = await messageRepo().find({ where: { channelId, parentId: op.id }, order: { createdAt: 'DESC' }, take: 5 });
      recentReplies.reverse();
      result.push({ ...op, replyCount, recentReplies, isLocked: op.isLocked, formattedId: formatPostId(op.id) });
    }
    const total = await messageRepo().countBy({ channelId, parentId: IsNull() });
    return { threads: result, total, page, limit };
  }, { detail: { tags: ['Chat'], summary: 'Get threads for a channel' } });

  app.get(prefix + '/chat/channels/:id/threads/:threadId', async (ctx: any) => {
    const channelId = Number(ctx.params?.id);
    const threadId = Number(ctx.params?.threadId);
    const op = await messageRepo().findOneBy({ id: threadId, channelId, parentId: IsNull() });
    if (!op) { ctx.set.status = 404; return { error: 'Thread not found' }; }
    const replies = await messageRepo().find({ where: { channelId, parentId: threadId }, order: { createdAt: 'ASC' } });
    const channel = await channelRepo().findOneBy({ id: channelId });
    return { op: { ...op, formattedId: formatPostId(op.id) }, replies: replies.map(r => ({ ...r, formattedId: formatPostId(r.id) })), channel: channel ? { id: channel.id, name: channel.name, slug: channel.slug, type: channel.type } : null };
  }, { detail: { tags: ['Chat'], summary: 'Get single thread with all replies' } });

  app.post(prefix + '/chat/channels/:id/threads', async (ctx: any) => {
    const channelId = Number(ctx.params?.id);
    const userId = ctx.user.id;
    const channel = await channelRepo().findOneBy({ id: channelId });
    if (!channel) { ctx.set.status = 404; return { error: 'Channel not found' }; }
    if (channel.type === 'community') {
      const membership = await memberRepo().findOneBy({ channelId, userId });
      if (!membership) { ctx.set.status = 403; return { error: 'You are not a member' }; }
    }
    const { content, imageUrl } = await ctx.body;
    if (!content || typeof content !== 'string' || content.trim().length === 0) { ctx.set.status = 400; return { error: 'Content is required' }; }
    const trimmed = (content as string).trim().slice(0, 10000);
    const user = await AppDataSource.getRepository(User).findOneBy({ id: userId });
    const now = new Date();
    const op = messageRepo().create({
      channelId, userId, content: trimmed,
      imageUrl: imageUrl ? String(imageUrl).trim().slice(0, 512) || null : null,
      displayName: getUserDisplayName(user),
      avatarUrl: user?.avatarUrl || null,
      bumpedAt: now,
    });
    await messageRepo().save(op);
    const payload = { id: op.id, channelId: op.channelId, parentId: null, userId: op.userId, content: op.content, imageUrl: op.imageUrl, displayName: op.displayName, avatarUrl: op.avatarUrl, bumpedAt: now.toISOString(), replyCount: 0, recentReplies: [], createdAt: op.createdAt.toISOString(), formattedId: formatPostId(op.id) };
    chatEmitter.emit('thread_update', { channelId, thread: payload });
    return payload;
  }, { beforeHandle: [authenticate], detail: { tags: ['Chat'], summary: 'Create a new thread' } });

  app.post(prefix + '/chat/channels/:id/threads/anonymous', async (ctx: any) => {
    const channelId = Number(ctx.params?.id);
    const channel = await channelRepo().findOneBy({ id: channelId });
    if (!channel) { ctx.set.status = 404; return { error: 'Channel not found' }; }
    if (channel.type !== 'public_anonymous') { ctx.set.status = 400; return { error: 'Only public channels' }; }

    const { content, revealIdentity, imageUrl } = await ctx.body;
    if (!content || typeof content !== 'string' || content.trim().length === 0) { ctx.set.status = 400; return { error: 'Content is required' }; }
    const trimmed = (content as string).trim().slice(0, 10000);
    const now = new Date();

    const user = ctx.user ? await AppDataSource.getRepository(User).findOneBy({ id: ctx.user.id }) : null;
    const showIdentity = !!user && revealIdentity === true;

    const op = messageRepo().create({
      channelId,
      content: trimmed,
      imageUrl: imageUrl ? String(imageUrl).trim().slice(0, 512) || null : null,
      bumpedAt: now,
      ...(showIdentity ? { userId: user!.id, displayName: getUserDisplayName(user), avatarUrl: user?.avatarUrl || null } : {}),
    });
    await messageRepo().save(op);

    const ip = getClientIp(ctx);
    const pid = posterId(ip);
    const ipLog = ipLogRepo().create({ messageId: op.id, ipHash: hashIp(ip), channelId });
    await ipLogRepo().save(ipLog);
    if (!showIdentity) {
      op.posterId = pid;
      await messageRepo().save(op);
    }
    const payload = {
      id: op.id, channelId: op.channelId, parentId: null, userId: showIdentity ? user!.id : null,
      content: op.content, imageUrl: op.imageUrl, displayName: showIdentity ? op.displayName : null, avatarUrl: showIdentity ? op.avatarUrl : null,
      posterId: showIdentity ? null : pid,
      bumpedAt: now.toISOString(), replyCount: 0, recentReplies: [], createdAt: op.createdAt.toISOString(), formattedId: formatPostId(op.id),
    };
    chatEmitter.emit('thread_update', { channelId, thread: payload });
    return payload;
  }, { detail: { tags: ['Chat'], summary: 'Create anonymous thread (zero-log)' } });

  app.post(prefix + '/chat/channels/:id/threads/:threadId/reply', async (ctx: any) => {
    const channelId = Number(ctx.params?.id);
    const threadId = Number(ctx.params?.threadId);
    const userId = ctx.user.id;

    const channel = await channelRepo().findOneBy({ id: channelId });
    if (!channel) { ctx.set.status = 404; return { error: 'Channel not found' }; }
    const op = await messageRepo().findOneBy({ id: threadId, channelId, parentId: IsNull() });
    if (!op) { ctx.set.status = 404; return { error: 'Thread not found' }; }
    if (op.isLocked) { ctx.set.status = 403; return { error: 'Thread is locked' }; }
    if (channel.type === 'community') {
      const m = await memberRepo().findOneBy({ channelId, userId });
      if (!m) { ctx.set.status = 403; return { error: 'Not a member' }; }
    }

    const { content, imageUrl } = await ctx.body;
    if (!content || typeof content !== 'string' || content.trim().length === 0) { ctx.set.status = 400; return { error: 'Content is required' }; }
    const trimmed = (content as string).trim().slice(0, 10000);
    const user = await AppDataSource.getRepository(User).findOneBy({ id: userId });
    const now = new Date();

    const reply = messageRepo().create({
      channelId, parentId: threadId, userId, content: trimmed,
      imageUrl: imageUrl ? String(imageUrl).trim().slice(0, 512) || null : null,
      displayName: getUserDisplayName(user), avatarUrl: user?.avatarUrl || null,
    });
    await messageRepo().save(reply);
    op.bumpedAt = now;
    await messageRepo().save(op);

    const payload = { id: reply.id, channelId: reply.channelId, parentId: reply.parentId, userId: reply.userId, content: reply.content, imageUrl: reply.imageUrl, displayName: reply.displayName, avatarUrl: reply.avatarUrl, createdAt: reply.createdAt.toISOString(), formattedId: formatPostId(reply.id) };
    chatEmitter.emit('message', { channelId, threadId, ...payload });
    chatEmitter.emit('thread_update', { channelId, threadId, bumpedAt: now.toISOString() });
    return payload;
  }, { beforeHandle: [authenticate], detail: { tags: ['Chat'], summary: 'Reply to a thread' } });

  app.post(prefix + '/chat/channels/:id/threads/:threadId/reply/anonymous', async (ctx: any) => {
    const channelId = Number(ctx.params?.id);
    const threadId = Number(ctx.params?.threadId);

    const channel = await channelRepo().findOneBy({ id: channelId });
    if (!channel) { ctx.set.status = 404; return { error: 'Channel not found' }; }
    if (channel.type !== 'public_anonymous') { ctx.set.status = 400; return { error: 'Only public channels' }; }

    const op = await messageRepo().findOneBy({ id: threadId, channelId, parentId: IsNull() });
    if (!op) { ctx.set.status = 404; return { error: 'Thread not found' }; }
    if (op.isLocked) { ctx.set.status = 403; return { error: 'Thread is locked' }; }

    const { content, revealIdentity, imageUrl } = await ctx.body;
    if (!content || typeof content !== 'string' || content.trim().length === 0) { ctx.set.status = 400; return { error: 'Content is required' }; }
    const trimmed = (content as string).trim().slice(0, 10000);

    const user = ctx.user ? await AppDataSource.getRepository(User).findOneBy({ id: ctx.user.id }) : null;
    const showIdentity = !!user && revealIdentity === true;

    const now = new Date();
    const reply = messageRepo().create({
      channelId, parentId: threadId, content: trimmed,
      imageUrl: imageUrl ? String(imageUrl).trim().slice(0, 512) || null : null,
      ...(showIdentity ? { userId: user!.id, displayName: getUserDisplayName(user), avatarUrl: user?.avatarUrl || null } : {}),
    });
    await messageRepo().save(reply);

    const ip = getClientIp(ctx);
    const pid = posterId(ip);
    const ipLog = ipLogRepo().create({ messageId: reply.id, ipHash: hashIp(ip), channelId });
    await ipLogRepo().save(ipLog);
    if (!showIdentity) {
      reply.posterId = pid;
      await messageRepo().save(reply);
    }
    op.bumpedAt = now;
    await messageRepo().save(op);

    const payload = {
      id: reply.id, channelId: reply.channelId, parentId: reply.parentId,
      userId: showIdentity ? user!.id : null, content: reply.content, imageUrl: reply.imageUrl,
      displayName: showIdentity ? reply.displayName : null, avatarUrl: showIdentity ? reply.avatarUrl : null,
      posterId: showIdentity ? null : pid,
      createdAt: reply.createdAt.toISOString(), formattedId: formatPostId(reply.id),
    };
    chatEmitter.emit('message', { channelId, threadId, ...payload });
    chatEmitter.emit('thread_update', { channelId, threadId, bumpedAt: now.toISOString() });
    return payload;
  }, { detail: { tags: ['Chat'], summary: 'Anonymous reply (zero-log)' } });

  app.post(prefix + '/chat/channels/:id/join', async (ctx: any) => {
    const channelId = Number(ctx.params?.id); const userId = ctx.user.id;
    const channel = await channelRepo().findOneBy({ id: channelId });
    if (!channel) { ctx.set.status = 404; return { error: 'Channel not found' }; }
    if (channel.type !== 'community') { ctx.set.status = 400; return { error: 'Can only join community channels' }; }
    const existing = await memberRepo().findOneBy({ channelId, userId });
    if (existing) return { success: true };
    const member = memberRepo().create({ channelId, userId, role: 'member' });
    await memberRepo().save(member);
    return { success: true };
  }, { beforeHandle: [authenticate], detail: { tags: ['Chat'], summary: 'Join a community channel' } });

  app.post(prefix + '/chat/channels/:id/leave', async (ctx: any) => {
    const channelId = Number(ctx.params?.id); const userId = ctx.user.id;
    const member = await memberRepo().findOneBy({ channelId, userId });
    if (member) await memberRepo().remove(member);
    return { success: true };
  }, { beforeHandle: [authenticate], detail: { tags: ['Chat'], summary: 'Leave a community channel' } });

  app.get(prefix + '/admin/chat/ip-logs', async (ctx: any) => {
    const messageId = ctx.query?.messageId ? Number(ctx.query.messageId) : undefined;
    const qb = ipLogRepo().createQueryBuilder('l');
    if (messageId) qb.where('l.messageId = :messageId', { messageId });
    const logs = await qb.orderBy('l.createdAt', 'DESC').take(100).getMany();
    return logs;
  }, { beforeHandle: [authenticate], detail: { tags: ['Admin', 'Chat'], summary: 'Export IP logs for legal needs' } });

  app.post(prefix + '/chat/upload', async (ctx: any) => {
    const { file } = (ctx.body || {}) as any;
    const uploadFile = Array.isArray(file) ? file[0] : file;
    if (!uploadFile) {
      ctx.set.status = 400;
      return { error: 'No file provided' };
    }

    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'];
    const mime = (uploadFile.type || uploadFile.mimetype || '').toString();
    if (!allowed.includes(mime)) {
      ctx.set.status = 400;
      return { error: 'Invalid image type. Allowed: PNG, JPEG, WebP, GIF, BMP' };
    }

    const maxSize = 10 * 1024 * 1024;
    const ab = await uploadFile.arrayBuffer();
    if (ab.byteLength > maxSize) {
      ctx.set.status = 400;
      return { error: 'Image too large. Max 10MB' };
    }
    const buffer = Buffer.from(ab);

    const ext = mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : mime === 'image/gif' ? '.gif' : mime === 'image/bmp' ? '.bmp' : '.jpg';
    const filename = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    const uploadDir = path.join(process.cwd(), 'uploads', 'chat');
    await fs.promises.mkdir(uploadDir, { recursive: true });
    const filepath = path.join(uploadDir, filename);
    await Bun.write(filepath, buffer);

    const backendBase =
      (process.env.BACKEND_URL || '').replace(/\/+$/, '') ||
      (() => {
        const proto = (ctx.request.headers.get('x-forwarded-proto') || 'https') as string;
        const host = (ctx.request.headers.get('host') || 'localhost') as string;
        return `${proto}://${host}`;
      })();

    return { url: `${backendBase}/uploads/chat/${filename}` };
  }, {
    beforeHandle: [authenticate],
    detail: { tags: ['Chat'], summary: 'Upload an image for chat posts' }
  });

  app.ws(prefix + '/ws/chat', {
    open(ws: any) {
      ws.data = ws.data || {}; ws.data.channels = new Set<number>(); chatClients.add(ws);
      try { ws.send(JSON.stringify({ type: 'connected', timestamp: Date.now() })); } catch {}
    },
    message(ws: any, message: any) {
      try {
        const data = JSON.parse(typeof message === 'string' ? message : message.toString());
        if (data.type === 'subscribe' && data.channelId) ws.data.channels.add(Number(data.channelId));
        else if (data.type === 'unsubscribe' && data.channelId) ws.data.channels.delete(Number(data.channelId));
      } catch {}
    },
    close(ws: any) { chatClients.delete(ws); ws.data = {}; },
    error(ws: any) { chatClients.delete(ws); ws.data = {}; },
  });
}
