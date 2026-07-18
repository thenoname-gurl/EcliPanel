import { t } from 'elysia';
import { AppDataSource } from '../config/typeorm';
import { ChatChannel } from '../models/chatChannel.entity';
import { ChatMessage } from '../models/chatMessage.entity';
import { ChatChannelMember } from '../models/chatChannelMember.entity';
import { ChatIpLog } from '../models/chatIpLog.entity';
import { ChatIpBan } from '../models/chatIpBan.entity';
import { In, IsNull, MoreThan } from 'typeorm';
import { User } from '../models/user.entity';
import { authenticate, optionalAuth } from '../middleware/auth';
import { hasPermissionSync } from '../middleware/authorize';
import { chatEmitter } from '../services/chatSocketService';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// Looking for good code?
// Well, sike its a mess.

const chatClients = new Set<any>();

const recentPosts = new Map<string, number>();
const RATE_LIMIT_MS = 3000;

function checkRateLimit(ctx: any): boolean {
  const key = ctx.user?.id ? `user:${ctx.user.id}` : `ip:${getClientIp(ctx)}`;
  const last = recentPosts.get(key);
  const now = Date.now();
  if (last && now - last < RATE_LIMIT_MS) return false;
  recentPosts.set(key, now);
  if (recentPosts.size > 10000) {
    const cutoff = now - 60000;
    for (const [k, t] of recentPosts) { if (t < cutoff) recentPosts.delete(k); }
  }
  return true;
}

chatEmitter.on('message', (payload: any) => {
  for (const ws of chatClients) {
    if (ws.data?.channels?.has(payload.channelId)) {
      try { ws.send(JSON.stringify({ type: 'new_message', data: payload })); } catch { }
    }
  }
});

chatEmitter.on('thread_update', (payload: any) => {
  for (const ws of chatClients) {
    if (ws.data?.channels?.has(payload.channelId)) {
      try { ws.send(JSON.stringify({ type: 'thread_update', data: payload })); } catch { }
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

function isChatMod(ctx: any): boolean {
  return !!ctx.user?.id && hasPermissionSync(ctx, 'chat:manage');
}

async function checkBan(ctx: any): Promise<string | null> {
  const ip = getClientIp(ctx);
  const hash = hashIp(ip);
  const where: any[] = [
    { ipHash: hash, expiresAt: IsNull() },
    { ipHash: hash, expiresAt: MoreThan(new Date()) },
  ];
  if (ctx.user?.id) {
    where.push({ userId: ctx.user.id, expiresAt: IsNull() });
    where.push({ userId: ctx.user.id, expiresAt: MoreThan(new Date()) });
  }
  const active = await AppDataSource.getRepository(ChatIpBan).findOne({ where });
  if (active) return active.userId ? 'Your account is banned' : 'Your IP is banned';
  return null;
}

async function enrichPost(ctx: any, post: any, staffCache?: Map<number, boolean>): Promise<any> {
  const mod = isChatMod(ctx);
  let authorIsStaff = false;
  if (post.userId) {
    if (staffCache) {
      authorIsStaff = staffCache.get(post.userId) ?? false;
    } else {
      const author = await AppDataSource.getRepository(User).findOne({
        where: { id: post.userId },
        relations: { userRoles: { role: { permissions: true, parentRole: { permissions: true } } } },
      });
      if (author) {
        const authorCtx = { user: author, userPermissions: undefined as string[] | undefined };
        authorIsStaff = hasPermissionSync(authorCtx, 'chat:manage');
      }
    }
  }
  return {
    ...post,
    authorIsStaff,
    formattedId: formatPostId(post.id),
    content: post.isHidden && !mod ? '[removed by moderator]' : post.content,
  };
}

async function batchStaffCheck(userIds: number[]): Promise<Map<number, boolean>> {
  const map = new Map<number, boolean>();
  if (!userIds.length) return map;
  const users = await AppDataSource.getRepository(User).find({
    where: { id: In(userIds) },
    relations: { userRoles: { role: { permissions: true, parentRole: { permissions: true } } } },
  });
  for (const u of users) {
    const ctx = { user: u, userPermissions: undefined as string[] | undefined };
    map.set(u.id, hasPermissionSync(ctx, 'chat:manage'));
  }
  return map;
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
  const banRepo = () => AppDataSource.getRepository(ChatIpBan);

  app.get(prefix + '/chat/channels', async (ctx: any) => {
    const userId = ctx.user?.id ?? null;
    const type = ctx.query?.type as string | undefined;
    const qb = channelRepo().createQueryBuilder('c').where('c.isArchived = :archived', { archived: false });
    if (userId) qb.andWhere('(c.isListed = :listed OR c.createdById = :userId)', { listed: 1, userId });
    if (type) qb.andWhere('c.type = :type', { type });
    const channels = await qb.orderBy('c.createdAt', 'DESC').getMany();
    const channelIds = channels.map(c => c.id);
    const [countRows, members] = await Promise.all([
      channelIds.length
        ? messageRepo().createQueryBuilder('m')
            .select('m.channelId', 'channelId')
            .addSelect('COUNT(*)', 'cnt')
            .addSelect('SUM(CASE WHEN m.parentId IS NULL THEN 1 ELSE 0 END)', 'threads')
            .where('m.channelId IN (:...ids)', { ids: channelIds })
            .groupBy('m.channelId').getRawMany()
        : [],
      userId
        ? memberRepo().find({ where: { channelId: In(channelIds), userId }, select: { channelId: true, role: true } })
        : [],
    ]);

    const postCounts = new Map(countRows.map(r => [Number(r.channelId), Number(r.cnt)]));
    const threadCounts = new Map(countRows.map(r => [Number(r.channelId), Number(r.threads)]));
    const memberMap = new Map<number, string>(members.map((m: any) => [m.channelId, m.role] as [number, string]));
    const result: any[] = [];
    for (const c of channels) {
      result.push({
        ...c,
        threadCount: threadCounts.get(c.id) ?? 0,
        postCount: postCounts.get(c.id) ?? 0,
        isMember: memberMap.has(c.id),
        myRole: memberMap.get(c.id) ?? null,
      });
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
    if (!name || typeof name !== 'string' || name.trim().length === 0) { ctx.set.status = 400; return { error: ctx.t('chat.channel_name_is_required') }; }
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
    if (!channel) { ctx.set.status = 404; return { error: ctx.t('chat.channel_not_found') }; }
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
    if (!channel) { ctx.set.status = 404; return { error: ctx.t('chat.channel_not_found') }; }
    if (!await canManageChannel(ctx, channel)) { ctx.set.status = 403; return { error: ctx.t('chat.not_authorized_to_manage_this_channel') }; }

    const { name, slug, description, isMature } = await ctx.body;
    if (name !== undefined && typeof name === 'string' && name.trim().length > 0) channel.name = (name as string).trim();
    if (slug !== undefined && typeof slug === 'string') {
      const s = (slug as string).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 64);
      if (s.length < 1) { ctx.set.status = 400; return { error: ctx.t('chat.slug_cannot_be_empty') }; }
      const existing = await channelRepo().findOneBy({ slug: s, isArchived: false });
      if (existing && existing.id !== id) { ctx.set.status = 400; return { error: ctx.t('chat.slug_already_in_use') }; }
      channel.slug = s;
    }
    if (description !== undefined) channel.description = typeof description === 'string' ? (description as string).trim() || null : null;
    if (isMature !== undefined) channel.isMature = isMature === true;
    await channelRepo().save(channel);
    return channel;
  }, { beforeHandle: [authenticate], detail: { tags: ['Chat'], summary: 'Update channel details' } });

  app.delete(prefix + '/chat/channels/:id', async (ctx: any) => {
    const id = Number(ctx.params?.id);
    const channel = await channelRepo().findOneBy({ id });
    if (!channel) { ctx.set.status = 404; return { error: ctx.t('chat.channel_not_found') }; }
    if (!await canManageChannel(ctx, channel)) { ctx.set.status = 403; return { error: ctx.t('chat.not_authorized_to_manage_this_channel') }; }

    channel.isArchived = true;
    await channelRepo().save(channel);
    return { success: true };
  }, { beforeHandle: [authenticate], detail: { tags: ['Chat'], summary: 'Delete (archive) a channel' } });

  app.get(prefix + '/chat/channels/:id/threads', async (ctx: any) => {
    const channelId = Number(ctx.params?.id);
    const channel = await channelRepo().findOneBy({ id: channelId });
    if (!channel) { ctx.set.status = 404; return { error: ctx.t('chat.channel_not_found') }; }
    const mod = isChatMod(ctx);
    const page = Math.max(1, Number(ctx.query?.page) || 1);
    const limit = Math.min(Math.max(Number(ctx.query?.limit) || 20, 1), 50);
    const threads = await messageRepo().find({ where: { channelId, parentId: IsNull(), ...(mod ? {} : { isHidden: false }) }, order: { bumpedAt: 'DESC', createdAt: 'DESC' }, skip: (page - 1) * limit, take: limit });
    const threadIds = threads.map(t => t.id);
    const replyCountMap = new Map<number, number>();
    const counts = await messageRepo().createQueryBuilder('m')
      .select('m.parentId', 'parentId').addSelect('COUNT(*)', 'cnt')
      .where('m.parentId IN (:...ids)', { ids: threadIds.length ? threadIds : [0] })
      .andWhere(mod ? '1=1' : 'm.isHidden = false')
      .groupBy('m.parentId').getRawMany();
    for (const r of counts) replyCountMap.set(Number(r.parentId), Number(r.cnt));

    const allUserIds = new Set(threads.map(t => t.userId).filter(Boolean));
    const staffCache = await batchStaffCheck([...allUserIds]);

    const result: any[] = [];
    for (const op of threads) {
      const replyCount = replyCountMap.get(op.id) ?? 0;
      const recentReplies = await messageRepo().find({ where: { channelId, parentId: op.id, ...(mod ? {} : { isHidden: false }) }, order: { createdAt: 'DESC' }, take: 5 });
      recentReplies.reverse();
      result.push(await enrichPost(ctx, { ...op, replyCount, recentReplies }, staffCache));
    }
    const total = await messageRepo().countBy({ channelId, parentId: IsNull(), ...(mod ? {} : { isHidden: false }) });
    return { threads: result, total, page, limit };
  }, { beforeHandle: [optionalAuth], detail: { tags: ['Chat'], summary: 'Get threads for a channel' } });

  app.get(prefix + '/chat/channels/:id/threads/:threadId', async (ctx: any) => {
    const channelId = Number(ctx.params?.id);
    const threadId = Number(ctx.params?.threadId);
    const mod = isChatMod(ctx);
    const op = await messageRepo().findOneBy({ id: threadId, channelId, parentId: IsNull() });
    if (!op) { ctx.set.status = 404; return { error: ctx.t('chat.thread_not_found') }; }
    if (op.isHidden && !mod) { ctx.set.status = 404; return { error: ctx.t('chat.thread_not_found') }; }
    const replies = await messageRepo().find({ where: { channelId, parentId: threadId, ...(mod ? {} : { isHidden: false }) }, order: { createdAt: 'ASC' }, take: 200 });
    const channel = await channelRepo().findOneBy({ id: channelId });
    const allIds = new Set([op.userId, ...replies.map(r => r.userId)].filter(Boolean));
    const staffCache = await batchStaffCheck([...allIds]);
    return { op: await enrichPost(ctx, op, staffCache), replies: await Promise.all(replies.map(r => enrichPost(ctx, r, staffCache))), channel: channel ? { id: channel.id, name: channel.name, slug: channel.slug, type: channel.type } : null };
  }, { beforeHandle: [optionalAuth], detail: { tags: ['Chat'], summary: 'Get single thread with all replies' } });

  app.post(prefix + '/chat/channels/:id/threads', async (ctx: any) => {
    const channelId = Number(ctx.params?.id);
    const userId = ctx.user.id;
    const channel = await channelRepo().findOneBy({ id: channelId });
    if (!channel) { ctx.set.status = 404; return { error: ctx.t('chat.channel_not_found') }; }
    if (channel.type === 'community') {
      const membership = await memberRepo().findOneBy({ channelId, userId });
      if (!membership) { ctx.set.status = 403; return { error: ctx.t('chat.you_are_not_a_member') }; }
    }
    if (!checkRateLimit(ctx)) { ctx.set.status = 429; return { error: ctx.t('chat.please_wait_a_moment_before_posting_again') }; }
    const banErr = await checkBan(ctx);
    if (banErr) { ctx.set.status = 403; return { error: banErr }; }
    const { content, imageUrl } = await ctx.body;
    if (!content || typeof content !== 'string' || content.trim().length === 0) { ctx.set.status = 400; return { error: ctx.t('chat.content_is_required') }; }
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
    const payload = { id: op.id, channelId: op.channelId, parentId: null, userId: op.userId, content: op.content, imageUrl: op.imageUrl, displayName: op.displayName, avatarUrl: op.avatarUrl, bumpedAt: now.toISOString(), replyCount: 0, recentReplies: [], createdAt: op.createdAt.toISOString(), formattedId: formatPostId(op.id), authorIsStaff: isChatMod(ctx) };
    chatEmitter.emit('thread_update', { channelId, thread: payload });
    return payload;
  }, { beforeHandle: [authenticate], detail: { tags: ['Chat'], summary: 'Create a new thread' } });

  app.post(prefix + '/chat/channels/:id/threads/anonymous', async (ctx: any) => {
    const channelId = Number(ctx.params?.id);
    const channel = await channelRepo().findOneBy({ id: channelId });
    if (!channel) { ctx.set.status = 404; return { error: ctx.t('chat.channel_not_found') }; }
    if (channel.type !== 'public_anonymous') { ctx.set.status = 400; return { error: ctx.t('chat.only_public_channels') }; }
    if (!checkRateLimit(ctx)) { ctx.set.status = 429; return { error: ctx.t('chat.please_wait_a_moment_before_posting_again') }; }
    const banErr = await checkBan(ctx);
    if (banErr) { ctx.set.status = 403; return { error: banErr }; }

    const { content, revealIdentity, imageUrl, anonymousName } = await ctx.body;
    if (!content || typeof content !== 'string' || content.trim().length === 0) { ctx.set.status = 400; return { error: ctx.t('chat.content_is_required') }; }
    const trimmed = (content as string).trim().slice(0, 10000);
    const now = new Date();

    const user = ctx.user ? await AppDataSource.getRepository(User).findOneBy({ id: ctx.user.id }) : null;
    const showIdentity = !!user && revealIdentity === true;

    const anonName = anonymousName && typeof anonymousName === 'string' ? (anonymousName as string).trim().slice(0, 64) || null : null;

    const op = messageRepo().create({
      channelId,
      content: trimmed,
      imageUrl: imageUrl ? String(imageUrl).trim().slice(0, 512) || null : null,
      bumpedAt: now,
      anonymousName: showIdentity ? null : anonName,
      ...(showIdentity ? { userId: user!.id, displayName: getUserDisplayName(user), avatarUrl: user?.avatarUrl || null } : {}),
    });
    await messageRepo().save(op);

    const ip = getClientIp(ctx);
    const pid = showIdentity ? `User#${user!.id}` : posterId(ip);
    op.posterId = pid;
    await messageRepo().save(op);
    const ipLog = ipLogRepo().create({ messageId: op.id, ipHash: hashIp(ip), channelId });
    await ipLogRepo().save(ipLog);
    const payload = {
      id: op.id, channelId: op.channelId, parentId: null, userId: showIdentity ? user!.id : null,
      content: op.content, imageUrl: op.imageUrl, displayName: showIdentity ? op.displayName : null, avatarUrl: showIdentity ? op.avatarUrl : null,
      anonymousName: showIdentity ? null : op.anonymousName,
      posterId: pid,
      authorIsStaff: showIdentity && isChatMod(ctx),
      bumpedAt: now.toISOString(), replyCount: 0, recentReplies: [], createdAt: op.createdAt.toISOString(), formattedId: formatPostId(op.id),
    };
    chatEmitter.emit('thread_update', { channelId, thread: payload });
    return payload;
  }, { beforeHandle: [optionalAuth], detail: { tags: ['Chat'], summary: 'Create anonymous thread (zero-log)' } });

  app.post(prefix + '/chat/channels/:id/threads/:threadId/reply', async (ctx: any) => {
    const channelId = Number(ctx.params?.id);
    const threadId = Number(ctx.params?.threadId);
    const userId = ctx.user.id;

    const channel = await channelRepo().findOneBy({ id: channelId });
    if (!channel) { ctx.set.status = 404; return { error: ctx.t('chat.channel_not_found') }; }
    const op = await messageRepo().findOneBy({ id: threadId, channelId, parentId: IsNull() });
    if (!op) { ctx.set.status = 404; return { error: ctx.t('chat.thread_not_found') }; }
    if (op.isLocked) { ctx.set.status = 403; return { error: ctx.t('chat.thread_is_locked') }; }
    if (channel.type === 'community') {
      const m = await memberRepo().findOneBy({ channelId, userId });
      if (!m) { ctx.set.status = 403; return { error: ctx.t('chat.not_a_member') }; }
    }
    if (!checkRateLimit(ctx)) { ctx.set.status = 429; return { error: ctx.t('chat.please_wait_a_moment_before_posting_again') }; }
    const banErr = await checkBan(ctx);
    if (banErr) { ctx.set.status = 403; return { error: banErr }; }

    const { content, imageUrl } = await ctx.body;
    if (!content || typeof content !== 'string' || content.trim().length === 0) { ctx.set.status = 400; return { error: ctx.t('chat.content_is_required') }; }
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

    const payload = { id: reply.id, channelId: reply.channelId, parentId: reply.parentId, userId: reply.userId, content: reply.content, imageUrl: reply.imageUrl, displayName: reply.displayName, avatarUrl: reply.avatarUrl, createdAt: reply.createdAt.toISOString(), formattedId: formatPostId(reply.id), authorIsStaff: isChatMod(ctx) };
    chatEmitter.emit('message', { channelId, threadId, ...payload });
    chatEmitter.emit('thread_update', { channelId, threadId, bumpedAt: now.toISOString() });
    return payload;
  }, { beforeHandle: [authenticate], detail: { tags: ['Chat'], summary: 'Reply to a thread' } });

  app.post(prefix + '/chat/channels/:id/threads/:threadId/reply/anonymous', async (ctx: any) => {
    const channelId = Number(ctx.params?.id);
    const threadId = Number(ctx.params?.threadId);

    const channel = await channelRepo().findOneBy({ id: channelId });
    if (!channel) { ctx.set.status = 404; return { error: ctx.t('chat.channel_not_found') }; }
    if (channel.type !== 'public_anonymous') { ctx.set.status = 400; return { error: ctx.t('chat.only_public_channels') }; }

    const op = await messageRepo().findOneBy({ id: threadId, channelId, parentId: IsNull() });
    if (!op) { ctx.set.status = 404; return { error: ctx.t('chat.thread_not_found') }; }
    if (op.isLocked) { ctx.set.status = 403; return { error: ctx.t('chat.thread_is_locked') }; }
    if (!checkRateLimit(ctx)) { ctx.set.status = 429; return { error: ctx.t('chat.please_wait_a_moment_before_posting_again') }; }
    const banErr = await checkBan(ctx);
    if (banErr) { ctx.set.status = 403; return { error: banErr }; }

    const { content, revealIdentity, imageUrl, anonymousName } = await ctx.body;
    if (!content || typeof content !== 'string' || content.trim().length === 0) { ctx.set.status = 400; return { error: ctx.t('chat.content_is_required') }; }
    const trimmed = (content as string).trim().slice(0, 10000);

    const user = ctx.user ? await AppDataSource.getRepository(User).findOneBy({ id: ctx.user.id }) : null;
    const showIdentity = !!user && revealIdentity === true;

    const anonName = anonymousName && typeof anonymousName === 'string' ? (anonymousName as string).trim().slice(0, 64) || null : null;

    const now = new Date();
    const reply = messageRepo().create({
      channelId, parentId: threadId, content: trimmed,
      imageUrl: imageUrl ? String(imageUrl).trim().slice(0, 512) || null : null,
      anonymousName: showIdentity ? null : anonName,
      ...(showIdentity ? { userId: user!.id, displayName: getUserDisplayName(user), avatarUrl: user?.avatarUrl || null } : {}),
    });
    await messageRepo().save(reply);

    const ip = getClientIp(ctx);
    const pid = showIdentity ? `User#${user!.id}` : posterId(ip);
    reply.posterId = pid;
    await messageRepo().save(reply);
    const ipLog = ipLogRepo().create({ messageId: reply.id, ipHash: hashIp(ip), channelId });
    await ipLogRepo().save(ipLog);
    op.bumpedAt = now;
    await messageRepo().save(op);

    const payload = {
      id: reply.id, channelId: reply.channelId, parentId: reply.parentId,
      userId: showIdentity ? user!.id : null, content: reply.content, imageUrl: reply.imageUrl,
      displayName: showIdentity ? reply.displayName : null, avatarUrl: showIdentity ? reply.avatarUrl : null,
      anonymousName: showIdentity ? null : reply.anonymousName,
      posterId: pid,
      authorIsStaff: showIdentity && isChatMod(ctx),
      createdAt: reply.createdAt.toISOString(), formattedId: formatPostId(reply.id),
    };
    chatEmitter.emit('message', { channelId, threadId, ...payload });
    chatEmitter.emit('thread_update', { channelId, threadId, bumpedAt: now.toISOString() });
    return payload;
  }, { beforeHandle: [optionalAuth], detail: { tags: ['Chat'], summary: 'Anonymous reply (zero-log)' } });

  app.post(prefix + '/chat/channels/:id/join', async (ctx: any) => {
    const channelId = Number(ctx.params?.id); const userId = ctx.user.id;
    const channel = await channelRepo().findOneBy({ id: channelId });
    if (!channel) { ctx.set.status = 404; return { error: ctx.t('chat.channel_not_found') }; }
    if (channel.type !== 'community') { ctx.set.status = 400; return { error: ctx.t('chat.can_only_join_community_channels') }; }
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

  app.delete(prefix + '/chat/channels/:id/messages/:messageId', async (ctx: any) => {
    if (!isChatMod(ctx)) { ctx.set.status = 403; return { error: ctx.t('chat.not_authorized') }; }
    const channelId = Number(ctx.params?.id);
    const messageId = Number(ctx.params?.messageId);
    const msg = await messageRepo().findOneBy({ id: messageId });
    if (!msg) { ctx.set.status = 404; return { error: ctx.t('chat.message_not_found') }; }
    await messageRepo().remove(msg);
    chatEmitter.emit('thread_update', { channelId, threadId: msg.parentId || msg.id });
    return { success: true };
  }, { beforeHandle: [optionalAuth], detail: { tags: ['Chat', 'Admin'], summary: 'Delete a message (moderator)' } });

  app.post(prefix + '/chat/channels/:id/messages/:messageId/hide', async (ctx: any) => {
    if (!isChatMod(ctx)) { ctx.set.status = 403; return { error: ctx.t('chat.not_authorized') }; }
    const channelId = Number(ctx.params?.id);
    const messageId = Number(ctx.params?.messageId);
    const msg = await messageRepo().findOneBy({ id: messageId });
    if (!msg) { ctx.set.status = 404; return { error: ctx.t('chat.message_not_found') }; }
    msg.isHidden = true;
    msg.hiddenById = ctx.user.id;
    await messageRepo().save(msg);
    chatEmitter.emit('thread_update', { channelId, threadId: msg.parentId || msg.id });
    return { success: true };
  }, { beforeHandle: [optionalAuth], detail: { tags: ['Chat', 'Admin'], summary: 'Hide a message (moderator shadow ban)' } });

  app.post(prefix + '/chat/channels/:id/messages/:messageId/unhide', async (ctx: any) => {
    if (!isChatMod(ctx)) { ctx.set.status = 403; return { error: ctx.t('chat.not_authorized') }; }
    const channelId = Number(ctx.params?.id);
    const messageId = Number(ctx.params?.messageId);
    const msg = await messageRepo().findOneBy({ id: messageId });
    if (!msg) { ctx.set.status = 404; return { error: ctx.t('chat.message_not_found') }; }
    msg.isHidden = false;
    msg.hiddenById = null;
    await messageRepo().save(msg);
    chatEmitter.emit('thread_update', { channelId, threadId: msg.parentId || msg.id });
    return { success: true };
  }, { beforeHandle: [optionalAuth], detail: { tags: ['Chat', 'Admin'], summary: 'Unhide a message (moderator)' } });

  app.get(prefix + '/admin/chat/ip-logs', async (ctx: any) => {
    const messageId = ctx.query?.messageId ? Number(ctx.query.messageId) : undefined;
    const qb = ipLogRepo().createQueryBuilder('l');
    if (messageId) qb.where('l.messageId = :messageId', { messageId });
    const logs = await qb.orderBy('l.createdAt', 'DESC').take(100).getMany();
    return logs;
  }, { beforeHandle: [authenticate], detail: { tags: ['Admin', 'Chat'], summary: 'Export IP logs for legal needs' } });

  app.get(prefix + '/chat/messages/lookup', async (ctx: any) => {
    if (!isChatMod(ctx)) { ctx.set.status = 403; return { error: ctx.t('chat.not_authorized') }; }
    const { id, posterId: pid } = ctx.query as any;
    let msgs: any[] = [];
    if (id) {
      const msg = await messageRepo().findOneBy({ id: Number(id) });
      if (msg) msgs = [msg];
    } else if (pid) {
      msgs = await messageRepo().find({ where: { posterId: pid, parentId: IsNull() }, order: { createdAt: 'DESC' }, take: 50 });
    } else {
      ctx.set.status = 400; return { error: ctx.t('chat.provide_id_or_posterid') };
    }
    if (msgs.length === 0) { ctx.set.status = 404; return { error: ctx.t('chat.no_messages_found') }; }
    const out: any[] = [];
    for (const m of msgs) {
      const log = await ipLogRepo().findOneBy({ messageId: m.id });
      out.push({
        id: m.id, formattedId: formatPostId(m.id), channelId: m.channelId, posterId: m.posterId,
        userId: m.userId, content: m.content.slice(0, 200), createdAt: m.createdAt,
        ipHash: log?.ipHash || null,
      });
    }
    return out;
  }, { beforeHandle: [authenticate], detail: { tags: ['Chat', 'Admin'], summary: 'Lookup a message by id or posterId' } });

  app.post(prefix + '/chat/ip-bans', async (ctx: any) => {
    if (!isChatMod(ctx)) { ctx.set.status = 403; return { error: ctx.t('chat.not_authorized') }; }
    const { ipHash, userId, reason, hours } = await ctx.body;
    if (!ipHash && !userId) { ctx.set.status = 400; return { error: ctx.t('chat.provide_iphash_or_userid') }; }
    let ban = banRepo().create({
      ipHash: ipHash || '',
      userId: userId || null,
      reason: reason || null,
      bannedById: ctx.user.id,
      expiresAt: hours ? new Date(Date.now() + Number(hours) * 3600000) : null,
    });
    ban = await banRepo().save(ban);
    return ban;
  }, { beforeHandle: [authenticate], detail: { tags: ['Chat', 'Admin'], summary: 'Ban an IP or user' } });

  app.get(prefix + '/chat/ip-bans', async (ctx: any) => {
    if (!isChatMod(ctx)) { ctx.set.status = 403; return { error: ctx.t('chat.not_authorized') }; }
    const bans = await banRepo().find({ order: { createdAt: 'DESC' }, take: 100 });
    return bans;
  }, { beforeHandle: [authenticate], detail: { tags: ['Chat', 'Admin'], summary: 'List active IP bans' } });

  app.post(prefix + '/chat/ip-bans/:id/unban', async (ctx: any) => {
    if (!isChatMod(ctx)) { ctx.set.status = 403; return { error: ctx.t('chat.not_authorized') }; }
    const ban = await banRepo().findOneBy({ id: Number(ctx.params?.id) });
    if (!ban) { ctx.set.status = 404; return { error: ctx.t('chat.ban_not_found') }; }
    await banRepo().remove(ban);
    return { success: true };
  }, { beforeHandle: [authenticate], detail: { tags: ['Chat', 'Admin'], summary: 'Unban an IP' } });

  app.post(prefix + '/chat/messages/mass-delete', async (ctx: any) => {
    if (!isChatMod(ctx)) { ctx.set.status = 403; return { error: ctx.t('chat.not_authorized') }; }
    const { posterId: pid, ipHash, hours, userId } = await ctx.body;
    const since = new Date(Date.now() - (Number(hours || 24) * 3600000));
    const where: any = { createdAt: MoreThan(since) };
    if (pid) where.posterId = pid;
    if (userId) where.userId = userId;
    if (!pid && !userId) { ctx.set.status = 400; return { error: ctx.t('chat.provide_posterid_or_userid') }; }
    if (ipHash) {
      const logs = await ipLogRepo().find({ where: { ipHash, createdAt: MoreThan(since) } });
      const msgIds = logs.map(l => l.messageId);
      if (msgIds.length === 0) return { deleted: 0 };
      const msgs = await messageRepo().find({ where: { id: In(msgIds) } });
      await messageRepo().remove(msgs);
      return { deleted: msgs.length };
    }
    const msgs = await messageRepo().find({ where });
    await messageRepo().remove(msgs);
    return { deleted: msgs.length };
  }, { beforeHandle: [authenticate], detail: { tags: ['Chat', 'Admin'], summary: 'Mass delete posts by posterId, userId, or ipHash' } });

  app.post(prefix + '/chat/upload', async (ctx: any) => {
    const { file } = (ctx.body || {}) as any;
    const uploadFile = Array.isArray(file) ? file[0] : file;
    if (!uploadFile) {
      ctx.set.status = 400;
      return { error: ctx.t('chat.no_file_provided') };
    }

    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'];
    const mime = (uploadFile.type || uploadFile.mimetype || '').toString();
    if (!allowed.includes(mime)) {
      ctx.set.status = 400;
      return { error: ctx.t('chat.invalid_image_type_allowed_png_jpeg_webp_gif_bmp') };
    }

    const maxSize = 10 * 1024 * 1024;
    const ab = await uploadFile.arrayBuffer();
    if (ab.byteLength > maxSize) {
      ctx.set.status = 400;
      return { error: ctx.t('chat.image_too_large_max_10mb') };
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
    body: t.Object({ file: t.File() }),
    beforeHandle: [authenticate],
    detail: { tags: ['Chat'], summary: 'Upload an image for chat posts' }
  });

  app.ws(prefix + '/ws/chat', {
    open(ws: any) {
      ws.data.channels = new Set<number>(); chatClients.add(ws);
      try { ws.send(JSON.stringify({ type: 'connected', timestamp: Date.now() })); } catch { }
    },
    message(ws: any, message: any) {
      try {
        const data = JSON.parse(typeof message === 'string' ? message : message.toString());
        if (data.type === 'subscribe' && data.channelId) ws.data.channels.add(Number(data.channelId));
        else if (data.type === 'unsubscribe' && data.channelId) ws.data.channels.delete(Number(data.channelId));
      } catch { }
    },
    close(ws: any) { chatClients.delete(ws); try { ws.data.channels?.clear?.(); } catch {} },
    error(ws: any) { chatClients.delete(ws); try { ws.data.channels?.clear?.(); } catch {} },
  });
}
