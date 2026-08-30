import { AppDataSource } from '../config/typeorm';
import { LuminosAttempt } from '../models/luminosAttempt.entity';
import { LuminosEvent } from '../models/luminosEvent.entity';
import { LuminosEventRsvp } from '../models/luminosEventRsvp.entity';
import { LuminosGiveaway } from '../models/luminosGiveaway.entity';
import { LuminosGiveawayEntry } from '../models/luminosGiveawayEntry.entity';
import { LuminosContest } from '../models/luminosContest.entity';
import { LuminosContestSubmission } from '../models/luminosContestSubmission.entity';
import { LuminosDailyScore } from '../models/luminosDailyScore.entity';
import { LuminosBounty } from '../models/luminosBounty.entity';
import { LuminosBountyFinding } from '../models/luminosBountyFinding.entity';
import { LuminosBountyComment } from '../models/luminosBountyComment.entity';
import { LuminosPoint } from '../models/luminosPoint.entity';
import { Coupon } from '../models/coupon.entity';
import { User } from '../models/user.entity';
import { UserLog } from '../models/userLog.entity';
import { ChatChannel } from '../models/chatChannel.entity';
import { ChatChannelMember } from '../models/chatChannelMember.entity';
import { authenticate } from '../middleware/auth';
import { hasPermissionSync } from '../middleware/authorize';
import { isHttpUrl } from '../utils/url';
import { In } from 'typeorm';

const POINTS_PER_DOLLAR = 100;
const REDEEM_EXPIRY_DAYS = 30;
const SEVERITY_POINTS: Record<string, number> = {
  critical: 1000,
  high: 500,
  medium: 200,
  low: 50,
};
const VULN_TYPES = new Set([
  'xss', 'sql_injection', 'rce', 'csrf', 'idor', 'ssrf',
  'auth_bypass', 'info_disclosure', 'dos', 'logic', 'other',
]);
const DAILY_QUESTION_COUNT = 10;
import questionBank from '../data/luminosQuestions.json';

const TIME_LIMIT_MINUTES = 45;
const TOTAL_QUESTIONS = 50;
const PASS_SCORE = 45;
const MAX_ATTEMPTS = 3;

interface BankQuestion {
  id: number;
  category: string;
  question: string;
  options: string[];
  correctIndex: number;
  imageUrl?: string;
}

const QUESTIONS: BankQuestion[] = (questionBank as any).questions;

function dailyQuestions(day: string): BankQuestion[] {
  const photoGeo = QUESTIONS.filter(q => q.imageUrl && q.category === 'geo');
  const rest = QUESTIONS.filter(q => !(q.imageUrl && q.category === 'geo'));
  const seed = daySeed(day);
  const photos = seededPick(photoGeo, seed, Math.min(5, photoGeo.length));
  const mixed = seededPick(rest, seed ^ 0x9e3779b9, Math.max(0, DAILY_QUESTION_COUNT - photos.length));
  return [...photos, ...mixed].slice(0, DAILY_QUESTION_COUNT);
}

function shuffledIndices(n: number): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  const out = Array.from({ length: Math.min(n, TOTAL_QUESTIONS) }, (_, i) => i);
  for (let i = 0; i < out.length; i++) {
    const j = i + Math.floor(cryptoRandom() * (idx.length - i));
    const tmp = idx[i];
    idx[i] = idx[j];
    idx[j] = tmp;
    out[i] = idx[i];
  }
  return out;
}

function cryptoRandom(): number {
  const buf = new Uint32Array(1);
  require('crypto').webcrypto.getRandomValues(buf);
  return buf[0] / 0xffffffff;
}

function daySeed(day: string): number {
  let h = 2166136261;
  for (const c of day) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededPick<T>(arr: T[], seed: number, count: number): T[] {
  const idx = arr.map((_, i) => i);
  let s = seed;
  for (let i = idx.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, Math.min(count, idx.length)).map(i => arr[i]);
}

function localDayString(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function canViewClub(ctx: any): boolean {
  return !!ctx.user?.luminosMember || hasPermissionSync(ctx, 'chat:manage');
}

function stripAnswer(q: BankQuestion) {
  return {
    id: q.id,
    category: q.category,
    question: q.question,
    options: q.options,
    ...(q.imageUrl ? { imageUrl: q.imageUrl } : {}),
  };
}

function isExpired(attempt: LuminosAttempt): boolean {
  return new Date(attempt.startedAt).getTime() + TIME_LIMIT_MINUTES * 60_000 <= Date.now();
}

async function expireStaleAttempts(userId: number): Promise<number> {
  const repo = AppDataSource.getRepository(LuminosAttempt);
  const rows = await repo.find({ where: { userId, status: 'in_progress' } });
  const stale = rows.filter(isExpired);
  for (const a of stale) {
    a.status = 'expired';
    await repo.save(a);
  }
  return stale.length;
}

async function submittedCount(userId: number): Promise<number> {
  return AppDataSource.getRepository(LuminosAttempt).countBy({ userId, status: 'submitted' });
}

export async function luminosRoutes(app: any, prefix = '') {
  app.get(prefix + '/luminos/status',
    { beforeHandle: [authenticate], detail: { tags: ['Luminos'], summary: 'Luminos exam status' } },
    async (ctx: any) => {
      const userId = ctx.user.id;
      await expireStaleAttempts(userId);
      const used = await submittedCount(userId);
      const active = await AppDataSource.getRepository(LuminosAttempt).findOneBy({
        userId, status: 'in_progress',
      });
      return {
        attemptsUsed: used,
        attemptsRemaining: Math.max(0, MAX_ATTEMPTS - used),
        passed: !!ctx.user.luminosMember,
        membership: !!ctx.user.luminosMember,
        activeAttempt: active ? { id: active.id, startedAt: active.startedAt } : null,
        timeLimitMinutes: TIME_LIMIT_MINUTES,
        totalQuestions: TOTAL_QUESTIONS,
        passThreshold: PASS_SCORE,
      };
    });

  app.post(prefix + '/luminos/start',
    { beforeHandle: [authenticate], detail: { tags: ['Luminos'], summary: 'Start a Luminos exam' } },
    async (ctx: any) => {
      const userId = ctx.user.id;
      if (ctx.user.luminosMember) {
        ctx.set.status = 403;
        return { error: ctx.t('luminos.alreadyMember', 'You are already a Luminos member.') };
      }
      await expireStaleAttempts(userId);
      if (await submittedCount(userId) >= MAX_ATTEMPTS) {
        ctx.set.status = 403;
        return { error: ctx.t('luminos.attemptsExhausted', 'No attempts left.') };
      }
      const existing = await AppDataSource.getRepository(LuminosAttempt).findOneBy({
        userId, status: 'in_progress',
      });
      if (existing) {
        ctx.set.status = 409;
        return { error: ctx.t('luminos.attemptInProgress', 'You already have an exam in progress.') };
      }
      if (QUESTIONS.length < TOTAL_QUESTIONS) {
        ctx.set.status = 500;
        return { error: ctx.t('luminos.bankUnavailable', 'Question bank not ready yet.') };
      }

      const picked = shuffledIndices(QUESTIONS.length).map(i => QUESTIONS[i].id);
      const attempt = AppDataSource.getRepository(LuminosAttempt).create({
        userId,
        questionIds: picked,
        score: 0,
        passed: false,
        status: 'in_progress',
        startedAt: new Date(),
      });
      await AppDataSource.getRepository(LuminosAttempt).save(attempt);

      const byId = new Map(QUESTIONS.map(q => [q.id, q]));
      const questions = picked.map(id => {
        const q = byId.get(id)!;
        return stripAnswer(q);
      });
      return {
        attemptId: attempt.id,
        timeLimitMinutes: TIME_LIMIT_MINUTES,
        totalQuestions: TOTAL_QUESTIONS,
        passThreshold: PASS_SCORE,
        questions,
      };
    });

  app.post(prefix + '/luminos/submit',
    { beforeHandle: [authenticate], detail: { tags: ['Luminos'], summary: 'Submit a Luminos exam' } },
    async (ctx: any) => {
      const userId = ctx.user.id;
      const body = (await ctx.body) as any;
      const attemptId = Number(body?.attemptId);
      const answers: Record<string, number> = body?.answers;

      if (!Number.isFinite(attemptId) || !answers || typeof answers !== 'object' || Array.isArray(answers)) {
        ctx.set.status = 400;
        return { error: ctx.t('luminos.invalidAnswers', 'Invalid submission.') };
      }

      const repo = AppDataSource.getRepository(LuminosAttempt);
      const attempt = await repo.findOneBy({ id: attemptId });
      if (!attempt) {
        ctx.set.status = 404;
        return { error: ctx.t('luminos.attemptNotFound', 'Exam not found.') };
      }
      if (attempt.userId !== userId) {
        ctx.set.status = 403;
        return { error: ctx.t('luminos.attemptNotYours', 'This exam belongs to another account.') };
      }
      if (attempt.status === 'submitted') {
        return {
          score: attempt.score,
          correct: attempt.score,
          total: attempt.questionIds.length,
          passed: attempt.passed,
          membership: !!ctx.user.luminosMember,
        };
      }
      if (attempt.status === 'expired' || isExpired(attempt)) {
        if (attempt.status !== 'expired') {
          attempt.status = 'expired';
          await repo.save(attempt);
        }
        ctx.set.status = 400;
        return { error: ctx.t('luminos.examExpired', 'The exam time limit has passed.') };
      }

      const byId = new Map(QUESTIONS.map(q => [q.id, q]));
      let score = 0;
      for (const qid of attempt.questionIds) {
        const q = byId.get(qid);
        if (q && answers[qid] === q.correctIndex) score++;
      }

      attempt.score = score;
      attempt.passed = score >= PASS_SCORE;
      attempt.status = 'submitted';
      attempt.submittedAt = new Date();
      await repo.save(attempt);

      if (attempt.passed && !ctx.user.luminosMember) {
        ctx.user.luminosMember = true;
        const settings =
          ctx.user.settings && typeof ctx.user.settings === 'object' ? { ...ctx.user.settings } : {};
        const badges = Array.isArray(settings.badges)
          ? settings.badges.map(String).filter(Boolean)
          : [];
        settings.badges = Array.from(new Set([...badges, 'luminos']));
        if (settings.gambling && typeof settings.gambling === 'object') {
          settings.gambling = { ...settings.gambling, badges: settings.badges };
        }
        ctx.user.settings = settings;
        await AppDataSource.getRepository(User).save(ctx.user);

        try {
          const channel = await AppDataSource.getRepository(ChatChannel).findOneBy({ slug: 'luminos' });
          if (channel) {
            const memberRepo = AppDataSource.getRepository(ChatChannelMember);
            const existing = await memberRepo.findOneBy({ channelId: channel.id, userId });
            if (!existing) {
              await memberRepo.save(memberRepo.create({ channelId: channel.id, userId }));
            }
          }
        } catch {}
      }

      return {
        score,
        correct: score,
        total: attempt.questionIds.length,
        passed: attempt.passed,
        membership: !!ctx.user.luminosMember,
      };
    });

  app.get(prefix + '/luminos/events',
    { beforeHandle: [authenticate], detail: { tags: ['Luminos'], summary: 'List Luminos Club events' } },
    async (ctx: any) => {
      const canView = ctx.user.luminosMember || hasPermissionSync(ctx, 'chat:manage');
      if (!canView) {
        ctx.set.status = 403;
        return { error: ctx.t('luminos.membersOnlyChannel', 'Luminos Club only.') };
      }
      const rows = await AppDataSource.getRepository(LuminosEvent).find({
        where: { isArchived: false },
        order: { startsAt: 'ASC' },
        take: 50,
      });
      const rsvpRepo = AppDataSource.getRepository(LuminosEventRsvp);
      const eventIds = rows.map(e => e.id);
      const rsvpRows = eventIds.length
        ? await rsvpRepo.find({ where: { eventId: In(eventIds) }, select: { eventId: true, userId: true } })
        : [];
      const countMap = new Map<number, number>();
      const myRsvp = new Set<number>();
      for (const r of rsvpRows) {
        countMap.set(r.eventId, (countMap.get(r.eventId) ?? 0) + 1);
        if (r.userId === ctx.user.id) myRsvp.add(r.eventId);
      }
      return rows.map(e => ({
        ...e,
        rsvpCount: countMap.get(e.id) ?? 0,
        rsvped: myRsvp.has(e.id),
      }));
    });

  app.post(prefix + '/luminos/events',
    { beforeHandle: [authenticate], detail: { tags: ['Luminos'], summary: 'Create a Luminos Club event' } },
    async (ctx: any) => {
      if (!hasPermissionSync(ctx, 'chat:manage')) {
        ctx.set.status = 403;
        return { error: ctx.t('luminos.clubCreateForbidden', 'Only chat moderators can organise club events.') };
      }
      const body = (await ctx.body) as any;
      const title = typeof body?.title === 'string' ? body.title.trim() : '';
      const startsAt = new Date(body?.startsAt);
      if (!title || title.length === 0 || title.length > 120) {
        ctx.set.status = 400;
        return { error: ctx.t('luminos.eventTitleRequired', 'Event title is required.') };
      }
      if (!Number.isFinite(startsAt.getTime())) {
        ctx.set.status = 400;
        return { error: ctx.t('luminos.eventStartsAtRequired', 'A valid start time is required.') };
      }
      const event = AppDataSource.getRepository(LuminosEvent).create({
        title,
        description: typeof body?.description === 'string' ? body.description.trim().slice(0, 2000) || null : null,
        startsAt,
        createdById: ctx.user.id,
        isArchived: false,
      });
      await AppDataSource.getRepository(LuminosEvent).save(event);
      return event;
    });

  app.delete(prefix + '/luminos/events/:id',
    { beforeHandle: [authenticate], detail: { tags: ['Luminos'], summary: 'Delete a Luminos Club event' } },
    async (ctx: any) => {
      const id = Number(ctx.params?.id);
      const event = await AppDataSource.getRepository(LuminosEvent).findOneBy({ id });
      if (!event) {
        ctx.set.status = 404;
        return { error: ctx.t('luminos.eventNotFound', 'Event not found.') };
      }
      if (event.createdById !== ctx.user.id && !hasPermissionSync(ctx, 'chat:manage')) {
        ctx.set.status = 403;
        return { error: ctx.t('luminos.clubCreateForbidden', 'Not allowed to delete this event.') };
      }
      event.isArchived = true;
      await AppDataSource.getRepository(LuminosEvent).save(event);
      return { success: true };
    });

  app.post(prefix + '/luminos/events/:id/rsvp',
    { beforeHandle: [authenticate], detail: { tags: ['Luminos'], summary: 'Toggle RSVP on a club event' } },
    async (ctx: any) => {
      if (!canViewClub(ctx)) {
        ctx.set.status = 403;
        return { error: ctx.t('luminos.membersOnlyChannel', 'Luminos Club only.') };
      }
      const eventId = Number(ctx.params?.id);
      const event = await AppDataSource.getRepository(LuminosEvent).findOneBy({ id: eventId });
      if (!event || event.isArchived) {
        ctx.set.status = 404;
        return { error: ctx.t('luminos.eventNotFound', 'Event not found.') };
      }
      const rsvpRepo = AppDataSource.getRepository(LuminosEventRsvp);
      const existing = await rsvpRepo.findOneBy({ eventId, userId: ctx.user.id });
      if (existing) {
        await rsvpRepo.remove(existing);
      } else {
        await rsvpRepo.save(rsvpRepo.create({ eventId, userId: ctx.user.id }));
      }
      const rsvpCount = await rsvpRepo.countBy({ eventId });
      return { rsvped: !existing, rsvpCount };
    });

  app.get(prefix + '/luminos/giveaways',
    { beforeHandle: [authenticate], detail: { tags: ['Luminos'], summary: 'List Luminos Club giveaways' } },
    async (ctx: any) => {
      if (!canViewClub(ctx)) {
        ctx.set.status = 403;
        return { error: ctx.t('luminos.membersOnlyChannel', 'Luminos Club only.') };
      }
      const rows = await AppDataSource.getRepository(LuminosGiveaway).find({
        where: { isArchived: false },
        order: { endsAt: 'DESC' },
        take: 50,
      });
      const entryRepo = AppDataSource.getRepository(LuminosGiveawayEntry);
      const ids = rows.map(g => g.id);
      const entries = ids.length
        ? await entryRepo.find({ where: { giveawayId: In(ids) }, select: { giveawayId: true, userId: true } })
        : [];
      const countMap = new Map<number, number>();
      const enteredSet = new Set<number>();
      for (const e of entries) {
        countMap.set(e.giveawayId, (countMap.get(e.giveawayId) ?? 0) + 1);
        if (e.userId === ctx.user.id) enteredSet.add(e.giveawayId);
      }
      const winnerIds = Array.from(new Set(rows.map(g => g.winnerId).filter((w): w is number => w != null)));
      const winnerUsers = winnerIds.length
        ? await AppDataSource.getRepository(User).find({ where: { id: In(winnerIds) } })
        : [];
      const winnerNameMap = new Map(winnerUsers.map((u: any) => [u.id, u.displayName || u.email || `User#${u.id}`]));
      return rows.map(g => ({
        ...g,
        entryCount: countMap.get(g.id) ?? 0,
        entered: enteredSet.has(g.id),
        winnerName: g.winnerId != null ? (winnerNameMap.get(g.winnerId) ?? `User#${g.winnerId}`) : null,
      }));
    });

  app.post(prefix + '/luminos/giveaways',
    { beforeHandle: [authenticate], detail: { tags: ['Luminos'], summary: 'Create a giveaway' } },
    async (ctx: any) => {
      if (!hasPermissionSync(ctx, 'chat:manage')) {
        ctx.set.status = 403;
        return { error: ctx.t('luminos.clubCreateForbidden', 'Only club moderators can do that.') };
      }
      const body = (await ctx.body) as any;
      const title = typeof body?.title === 'string' ? body.title.trim() : '';
      const endsAt = new Date(body?.endsAt);
      if (!title || title.length > 120) {
        ctx.set.status = 400;
        return { error: ctx.t('luminos.giveawayTitleRequired', 'Giveaway title is required.') };
      }
      if (!Number.isFinite(endsAt.getTime())) {
        ctx.set.status = 400;
        return { error: ctx.t('luminos.giveawayEndsAtRequired', 'A valid end time is required.') };
      }
      const giveaway = AppDataSource.getRepository(LuminosGiveaway).create({
        title,
        description: typeof body?.description === 'string' ? body.description.trim().slice(0, 2000) || null : null,
        prize: typeof body?.prize === 'string' ? body.prize.trim().slice(0, 500) || null : null,
        startsAt: new Date(body?.startsAt ?? Date.now()),
        endsAt,
        createdById: ctx.user.id,
      });
      await AppDataSource.getRepository(LuminosGiveaway).save(giveaway);
      return giveaway;
    });

  app.post(prefix + '/luminos/giveaways/:id/enter',
    { beforeHandle: [authenticate], detail: { tags: ['Luminos'], summary: 'Enter a giveaway' } },
    async (ctx: any) => {
      if (!canViewClub(ctx)) {
        ctx.set.status = 403;
        return { error: ctx.t('luminos.membersOnlyChannel', 'Luminos Club only.') };
      }
      const giveawayId = Number(ctx.params?.id);
      const giveaway = await AppDataSource.getRepository(LuminosGiveaway).findOneBy({ id: giveawayId });
      if (!giveaway || giveaway.isArchived) {
        ctx.set.status = 404;
        return { error: ctx.t('luminos.giveawayNotFound', 'Giveaway not found.') };
      }
      if (new Date(giveaway.endsAt).getTime() < Date.now()) {
        ctx.set.status = 400;
        return { error: ctx.t('luminos.giveawayEnded', 'This giveaway has ended.') };
      }
      if (giveaway.winnerId != null) {
        ctx.set.status = 400;
        return { error: ctx.t('luminos.giveawayEnded', 'This giveaway has ended.') };
      }
      const entryRepo = AppDataSource.getRepository(LuminosGiveawayEntry);
      const existing = await entryRepo.findOneBy({ giveawayId, userId: ctx.user.id });
      if (!existing) {
        await entryRepo.save(entryRepo.create({ giveawayId, userId: ctx.user.id }));
      }
      const entryCount = await entryRepo.countBy({ giveawayId });
      return { entered: true, entryCount };
    });

  app.post(prefix + '/luminos/giveaways/:id/draw',
    { beforeHandle: [authenticate], detail: { tags: ['Luminos'], summary: 'Draw a giveaway winner' } },
    async (ctx: any) => {
      if (!hasPermissionSync(ctx, 'chat:manage')) {
        ctx.set.status = 403;
        return { error: ctx.t('luminos.clubCreateForbidden', 'Only club moderators can do that.') };
      }
      const giveawayId = Number(ctx.params?.id);
      const giveaway = await AppDataSource.getRepository(LuminosGiveaway).findOneBy({ id: giveawayId });
      if (!giveaway || giveaway.isArchived) {
        ctx.set.status = 404;
        return { error: ctx.t('luminos.giveawayNotFound', 'Giveaway not found.') };
      }
      if (giveaway.winnerId != null) {
        return { winnerId: giveaway.winnerId };
      }
      const entries = await AppDataSource.getRepository(LuminosGiveawayEntry).find({ where: { giveawayId } });
      if (entries.length === 0) {
        ctx.set.status = 400;
        return { error: ctx.t('luminos.giveawayNoEntries', 'No entries yet.') };
      }
      const winner = entries[Math.floor(cryptoRandom() * entries.length)];
      giveaway.winnerId = winner.userId;
      await AppDataSource.getRepository(LuminosGiveaway).save(giveaway);
      return { winnerId: winner.userId };
    });

  app.delete(prefix + '/luminos/giveaways/:id',
    { beforeHandle: [authenticate], detail: { tags: ['Luminos'], summary: 'Archive a giveaway' } },
    async (ctx: any) => {
      if (!hasPermissionSync(ctx, 'chat:manage')) {
        ctx.set.status = 403;
        return { error: ctx.t('luminos.clubCreateForbidden', 'Only club moderators can do that.') };
      }
      const giveaway = await AppDataSource.getRepository(LuminosGiveaway).findOneBy({ id: Number(ctx.params?.id) });
      if (!giveaway) {
        ctx.set.status = 404;
        return { error: ctx.t('luminos.giveawayNotFound', 'Giveaway not found.') };
      }
      giveaway.isArchived = true;
      await AppDataSource.getRepository(LuminosGiveaway).save(giveaway);
      return { success: true };
    });

  app.get(prefix + '/luminos/contests',
    { beforeHandle: [authenticate], detail: { tags: ['Luminos'], summary: 'List Luminos Club contests' } },
    async (ctx: any) => {
      if (!canViewClub(ctx)) {
        ctx.set.status = 403;
        return { error: ctx.t('luminos.membersOnlyChannel', 'Luminos Club only.') };
      }
      const rows = await AppDataSource.getRepository(LuminosContest).find({
        where: { isArchived: false },
        order: { endsAt: 'DESC' },
        take: 50,
      });
      const subRepo = AppDataSource.getRepository(LuminosContestSubmission);
      const ids = rows.map(c => c.id);
      const subs = ids.length ? await subRepo.find({ where: { contestId: In(ids) } }) : [];
      const userRepo = AppDataSource.getRepository(User);
      const userIds = Array.from(new Set(subs.map(s => s.userId)));
      const users = userIds.length
        ? await userRepo.find({ where: { id: In(userIds) } })
        : [];
      const nameMap = new Map(users.map((u: any) => [u.id, u.displayName || u.email || `User#${u.id}`]));
      const subByContest = new Map<number, any[]>();
      for (const s of subs) {
        const list = subByContest.get(s.contestId) ?? [];
        list.push({ ...s, displayName: nameMap.get(s.userId) ?? `User#${s.userId}` });
        subByContest.set(s.contestId, list);
      }
      const winnerIds = Array.from(new Set(rows.map(c => c.winnerId).filter((w): w is number => w != null)));
      const winnerUsers = winnerIds.length
        ? await userRepo.find({ where: { id: In(winnerIds) } })
        : [];
      const winnerNameMap = new Map(winnerUsers.map((u: any) => [u.id, u.displayName || u.email || `User#${u.id}`]));
      return rows.map(c => ({
        ...c,
        submissionCount: (subByContest.get(c.id) ?? []).length,
        submissions: subByContest.get(c.id) ?? [],
        mySubmission: (subByContest.get(c.id) ?? []).find((s: any) => s.userId === ctx.user.id) ?? null,
        winnerName: c.winnerId != null ? (winnerNameMap.get(c.winnerId) ?? `User#${c.winnerId}`) : null,
      }));
    });

  app.post(prefix + '/luminos/contests',
    { beforeHandle: [authenticate], detail: { tags: ['Luminos'], summary: 'Create a contest' } },
    async (ctx: any) => {
      if (!hasPermissionSync(ctx, 'chat:manage')) {
        ctx.set.status = 403;
        return { error: ctx.t('luminos.clubCreateForbidden', 'Only club moderators can do that.') };
      }
      const body = (await ctx.body) as any;
      const title = typeof body?.title === 'string' ? body.title.trim() : '';
      const endsAt = new Date(body?.endsAt);
      if (!title || title.length > 120) {
        ctx.set.status = 400;
        return { error: ctx.t('luminos.contestTitleRequired', 'Contest title is required.') };
      }
      if (!Number.isFinite(endsAt.getTime())) {
        ctx.set.status = 400;
        return { error: ctx.t('luminos.contestEndsAtRequired', 'A valid end time is required.') };
      }
      const contest = AppDataSource.getRepository(LuminosContest).create({
        title,
        description: typeof body?.description === 'string' ? body.description.trim().slice(0, 2000) || null : null,
        endsAt,
        createdById: ctx.user.id,
      });
      await AppDataSource.getRepository(LuminosContest).save(contest);
      return contest;
    });

  app.post(prefix + '/luminos/contests/:id/submit',
    { beforeHandle: [authenticate], detail: { tags: ['Luminos'], summary: 'Submit an entry to a contest' } },
    async (ctx: any) => {
      if (!canViewClub(ctx)) {
        ctx.set.status = 403;
        return { error: ctx.t('luminos.membersOnlyChannel', 'Luminos Club only.') };
      }
      const contestId = Number(ctx.params?.id);
      const contest = await AppDataSource.getRepository(LuminosContest).findOneBy({ id: contestId });
      if (!contest || contest.isArchived) {
        ctx.set.status = 404;
        return { error: ctx.t('luminos.contestNotFound', 'Contest not found.') };
      }
      if (new Date(contest.endsAt).getTime() < Date.now()) {
        ctx.set.status = 400;
        return { error: ctx.t('luminos.contestEnded', 'This contest has ended.') };
      }
      const body = (await ctx.body) as any;
      const content = typeof body?.content === 'string' ? body.content.trim() : '';
      if (!content || content.length > 4000) {
        ctx.set.status = 400;
        return { error: ctx.t('luminos.submissionRequired', 'Submission text is required.') };
      }
      const subRepo = AppDataSource.getRepository(LuminosContestSubmission);
      const existing = await subRepo.findOneBy({ contestId, userId: ctx.user.id });
      if (existing) {
        ctx.set.status = 400;
        return { error: ctx.t('luminos.alreadySubmitted', 'You already submitted to this contest.') };
      }
      const sub = subRepo.create({
        contestId,
        userId: ctx.user.id,
        content,
        imageUrl: typeof body?.imageUrl === 'string' ? body.imageUrl.trim().slice(0, 512) || null : null,
      });
      await subRepo.save(sub);
      return sub;
    });

  app.post(prefix + '/luminos/contests/:id/winner',
    { beforeHandle: [authenticate], detail: { tags: ['Luminos'], summary: 'Pick a contest winner' } },
    async (ctx: any) => {
      if (!hasPermissionSync(ctx, 'chat:manage')) {
        ctx.set.status = 403;
        return { error: ctx.t('luminos.clubCreateForbidden', 'Only club moderators can do that.') };
      }
      const contestId = Number(ctx.params?.id);
      const contest = await AppDataSource.getRepository(LuminosContest).findOneBy({ id: contestId });
      if (!contest || contest.isArchived) {
        ctx.set.status = 404;
        return { error: ctx.t('luminos.contestNotFound', 'Contest not found.') };
      }
      const body = (await ctx.body) as any;
      const sub = await AppDataSource.getRepository(LuminosContestSubmission).findOneBy({
        id: Number(body?.submissionId),
        contestId,
      });
      if (!sub) {
        ctx.set.status = 404;
        return { error: ctx.t('luminos.submissionNotFound', 'Submission not found.') };
      }
      contest.winnerId = sub.userId;
      await AppDataSource.getRepository(LuminosContest).save(contest);
      return { winnerId: sub.userId, submissionId: sub.id };
    });

  app.delete(prefix + '/luminos/contests/:id',
    { beforeHandle: [authenticate], detail: { tags: ['Luminos'], summary: 'Archive a contest' } },
    async (ctx: any) => {
      if (!hasPermissionSync(ctx, 'chat:manage')) {
        ctx.set.status = 403;
        return { error: ctx.t('luminos.clubCreateForbidden', 'Only club moderators can do that.') };
      }
      const contest = await AppDataSource.getRepository(LuminosContest).findOneBy({ id: Number(ctx.params?.id) });
      if (!contest) {
        ctx.set.status = 404;
        return { error: ctx.t('luminos.contestNotFound', 'Contest not found.') };
      }
      contest.isArchived = true;
      await AppDataSource.getRepository(LuminosContest).save(contest);
      return { success: true };
    });

  app.get(prefix + '/luminos/daily',
    { beforeHandle: [authenticate], detail: { tags: ['Luminos'], summary: 'Get today\'s Luminos daily challenge' } },
    async (ctx: any) => {
      if (!canViewClub(ctx)) {
        ctx.set.status = 403;
        return { error: ctx.t('luminos.membersOnlyChannel', 'Luminos Club only.') };
      }
      const day = localDayString();
      const picked = dailyQuestions(day);
      const dailyRepo = AppDataSource.getRepository(LuminosDailyScore);
      const mine = await dailyRepo.findOneBy({ userId: ctx.user.id, day });
      const leaderboard = await dailyRepo.find({ where: { day }, order: { score: 'DESC', correct: 'DESC' }, take: 5 });
      const userRepo = AppDataSource.getRepository(User);
      const users = leaderboard.length
        ? await userRepo.find({ where: { id: In(leaderboard.map(r => r.userId)) } })
        : [];
      const nameMap = new Map(users.map((u: any) => [u.id, u.displayName || u.email || `User#${u.id}`]));
      return {
        day,
        totalQuestions: DAILY_QUESTION_COUNT,
        questions: picked.map(stripAnswer),
        submitted: mine ? { score: mine.score, correct: mine.correct, total: mine.total } : null,
        leaderboard: leaderboard.map((r, i) => ({
          rank: i + 1,
          score: r.score,
          correct: r.correct,
          name: nameMap.get(r.userId) ?? `User#${r.userId}`,
        })),
      };
    });

  app.post(prefix + '/luminos/daily/submit',
    { beforeHandle: [authenticate], detail: { tags: ['Luminos'], summary: 'Submit today\'s daily challenge answers' } },
    async (ctx: any) => {
      if (!canViewClub(ctx)) {
        ctx.set.status = 403;
        return { error: ctx.t('luminos.membersOnlyChannel', 'Luminos Club only.') };
      }
      const day = localDayString();
      const body = (await ctx.body) as any;
      const answers: Record<string, number> = body?.answers;
      if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
        ctx.set.status = 400;
        return { error: ctx.t('luminos.invalidAnswers', 'Invalid submission.') };
      }
      const dailyRepo = AppDataSource.getRepository(LuminosDailyScore);
      const existing = await dailyRepo.findOneBy({ userId: ctx.user.id, day });
      if (existing) {
        return { score: existing.score, correct: existing.correct, total: existing.total, alreadySubmitted: true };
      }
      const picked = dailyQuestions(day);
      let score = 0;
      for (const q of picked) {
        if (answers[q.id] === q.correctIndex) score++;
      }
      const row = dailyRepo.create({
        userId: ctx.user.id,
        day,
        score,
        correct: score,
        total: picked.length,
      });
      await dailyRepo.save(row);
      return { score, correct: score, total: picked.length, alreadySubmitted: false };
    });

  app.get(prefix + '/luminos/bounties',
    { beforeHandle: [authenticate], detail: { tags: ['Luminos'], summary: 'List Luminos Club bounties' } },
    async (ctx: any) => {
      const all = await AppDataSource.getRepository(LuminosBounty).find({
        where: { isArchived: false },
        order: { createdAt: 'DESC' },
        take: 50,
      });
      const rows = all.filter(
        (b: any) => b.isPublished || b.ownerId === ctx.user.id || hasPermissionSync(ctx, 'chat:manage')
      );
      const findingRepo = AppDataSource.getRepository(LuminosBountyFinding);
      const ids = rows.map(b => b.id);
      const findings = ids.length ? await findingRepo.find({ where: { bountyId: In(ids) } }) : [];
      const userRepo = AppDataSource.getRepository(User);
      const userIds = Array.from(new Set([...rows.map(b => b.ownerId), ...findings.map(f => f.userId)]));
      const users = userIds.length ? await userRepo.find({ where: { id: In(userIds) } }) : [];
      const nameMap = new Map(users.map((u: any) => [u.id, u.displayName || u.email || `User#${u.id}`]));
      const findingByBounty = new Map<number, any[]>();
      const findingIds = findings.map(f => f.id);
      const commentRepo = AppDataSource.getRepository(LuminosBountyComment);
      const comments = findingIds.length
        ? await commentRepo.find({ where: { findingId: In(findingIds) }, order: { createdAt: 'ASC' } })
        : [];
      const commentUserIds = Array.from(new Set(comments.map(c => c.userId)));
      const commentUsers = commentUserIds.length
        ? await userRepo.find({ where: { id: In(commentUserIds) } })
        : [];
      const commentNameMap = new Map([...users, ...commentUsers].map((u: any) => [u.id, u.displayName || u.email || `User#${u.id}`]));
      const commentByFinding = new Map<number, any[]>();
      for (const c of comments) {
        const list = commentByFinding.get(c.findingId) ?? [];
        list.push({ id: c.id, userId: c.userId, content: c.content, displayName: commentNameMap.get(c.userId) ?? `User#${c.userId}`, createdAt: c.createdAt });
        commentByFinding.set(c.findingId, list);
      }
      for (const f of findings) {
        const list = findingByBounty.get(f.bountyId) ?? [];
        list.push({ ...f, displayName: nameMap.get(f.userId) ?? `User#${f.userId}`, comments: commentByFinding.get(f.id) ?? [] });
        findingByBounty.set(f.bountyId, list);
      }
      return rows.map(b => ({
        ...b,
        ownerName: nameMap.get(b.ownerId) ?? `User#${b.ownerId}`,
        findings: findingByBounty.get(b.id) ?? [],
      }));
    });

  app.post(prefix + '/luminos/bounties',
    { beforeHandle: [authenticate], detail: { tags: ['Luminos'], summary: 'Post a bounty' } },
    async (ctx: any) => {
      if (!ctx.user.luminosMember) {
        ctx.set.status = 403;
        return { error: ctx.t('luminos.membersOnlyChannel', 'Luminos Club only.') };
      }
      const body = (await ctx.body) as any;
      const title = typeof body?.title === 'string' ? body.title.trim() : '';
      if (!title || title.length > 120) {
        ctx.set.status = 400;
        return { error: ctx.t('luminos.bountyTitleRequired', 'Bounty title is required.') };
      }
      const repoUrlRaw = typeof body?.repoUrl === 'string' ? body.repoUrl.trim().slice(0, 500) : '';
      if (repoUrlRaw && !isHttpUrl(repoUrlRaw)) {
        ctx.set.status = 400;
        return { error: ctx.t('luminos.bountyRepoUrlInvalid', 'Repo URL must be an absolute http(s) link.') };
      }
      const bounty = AppDataSource.getRepository(LuminosBounty).create({
        title,
        description: typeof body?.description === 'string' ? body.description.trim().slice(0, 2000) || null : null,
        repoUrl: repoUrlRaw || null,
        ownerId: ctx.user.id,
        isPublished: false,
      });
      await AppDataSource.getRepository(LuminosBounty).save(bounty);
      return bounty;
    });

  app.post(prefix + '/luminos/bounties/:id/publish',
    { beforeHandle: [authenticate], detail: { tags: ['Luminos'], summary: 'Publish or unpublish a bounty' } },
    async (ctx: any) => {
      const bounty = await AppDataSource.getRepository(LuminosBounty).findOneBy({ id: Number(ctx.params?.id) });
      if (!bounty || bounty.isArchived) {
        ctx.set.status = 404;
        return { error: ctx.t('luminos.bountyNotFound', 'Bounty not found.') };
      }
      if (bounty.ownerId !== ctx.user.id && !hasPermissionSync(ctx, 'chat:manage')) {
        ctx.set.status = 403;
        return { error: ctx.t('luminos.clubCreateForbidden', 'Only the owner or a moderator can do that.') };
      }
      const body = (await ctx.body) as any;
      bounty.isPublished = body?.published === true;
      await AppDataSource.getRepository(LuminosBounty).save(bounty);
      return { isPublished: bounty.isPublished };
    });

  app.post(prefix + '/luminos/bounties/:id/findings',
    { beforeHandle: [authenticate], detail: { tags: ['Luminos'], summary: 'Submit a finding to a bounty' } },
    async (ctx: any) => {
      const bountyId = Number(ctx.params?.id);
      const bounty = await AppDataSource.getRepository(LuminosBounty).findOneBy({ id: bountyId });
      if (!bounty || bounty.isArchived) {
        ctx.set.status = 404;
        return { error: ctx.t('luminos.bountyNotFound', 'Bounty not found.') };
      }
      if (!bounty.isPublished && bounty.ownerId !== ctx.user.id && !hasPermissionSync(ctx, 'chat:manage')) {
        ctx.set.status = 404;
        return { error: ctx.t('luminos.bountyNotFound', 'Bounty not found.') };
      }
      const body = (await ctx.body) as any;
      const content = typeof body?.content === 'string' ? body.content.trim() : '';
      const title = typeof body?.title === 'string' ? body.title.trim() : '';
      if (!title || title.length > 120) {
        ctx.set.status = 400;
        return { error: ctx.t('luminos.findingTitleRequired', 'A report title is required.') };
      }
      if (!content || content.length > 4000) {
        ctx.set.status = 400;
        return { error: ctx.t('luminos.findingRequired', 'Finding text is required.') };
      }
      const severity = body?.severity;
      if (severity != null && !SEVERITY_POINTS[severity as string]) {
        ctx.set.status = 400;
        return { error: ctx.t('luminos.invalidSeverity', 'Severity must be critical, high, medium or low.') };
      }
      const vulnType = body?.vulnType;
      if (vulnType != null && !VULN_TYPES.has(vulnType as string)) {
        ctx.set.status = 400;
        return { error: ctx.t('luminos.invalidVulnType', 'Unknown vulnerability type.') };
      }
      const finding = AppDataSource.getRepository(LuminosBountyFinding).create({
        bountyId,
        userId: ctx.user.id,
        title,
        content,
        vulnType: VULN_TYPES.has(vulnType as string) ? vulnType : null,
        affectedAsset: typeof body?.affectedAsset === 'string' ? body.affectedAsset.trim().slice(0, 500) || null : null,
        severity: SEVERITY_POINTS[severity as string] ? severity : null,
        status: 'pending',
      });
      await AppDataSource.getRepository(LuminosBountyFinding).save(finding);
      return finding;
    });

  app.post(prefix + '/luminos/bounties/:id/findings/:fid/triage',
    { beforeHandle: [authenticate], detail: { tags: ['Luminos'], summary: 'Triage a report' } },
    async (ctx: any) => {
      const bountyId = Number(ctx.params?.id);
      const fid = Number(ctx.params?.fid);
      const bounty = await AppDataSource.getRepository(LuminosBounty).findOneBy({ id: bountyId });
      if (!bounty || bounty.isArchived) {
        ctx.set.status = 404;
        return { error: ctx.t('luminos.bountyNotFound', 'Bounty not found.') };
      }
      if (bounty.ownerId !== ctx.user.id && !hasPermissionSync(ctx, 'chat:manage')) {
        ctx.set.status = 403;
        return { error: ctx.t('luminos.onlyOwnerCanMark', 'Only the bounty owner can do that.') };
      }
      const finding = await AppDataSource.getRepository(LuminosBountyFinding).findOneBy({ id: fid, bountyId });
      if (!finding) {
        ctx.set.status = 404;
        return { error: ctx.t('luminos.findingNotFound', 'Finding not found.') };
      }
      if (finding.status !== 'pending') {
        ctx.set.status = 400;
        return { error: ctx.t('luminos.findingAlreadyAwarded', 'Only pending reports can be triaged.') };
      }
      finding.status = 'triaged';
      finding.decidedBy = ctx.user.id;
      finding.decidedAt = new Date();
      await AppDataSource.getRepository(LuminosBountyFinding).save(finding);
      return finding;
    });

  app.post(prefix + '/luminos/bounties/:id/findings/:fid/disclosure',
    { beforeHandle: [authenticate], detail: { tags: ['Luminos'], summary: 'Request or decide a disclosure' } },
    async (ctx: any) => {
      const bountyId = Number(ctx.params?.id);
      const fid = Number(ctx.params?.fid);
      const bounty = await AppDataSource.getRepository(LuminosBounty).findOneBy({ id: bountyId });
      if (!bounty || bounty.isArchived) {
        ctx.set.status = 404;
        return { error: ctx.t('luminos.bountyNotFound', 'Bounty not found.') };
      }
      const finding = await AppDataSource.getRepository(LuminosBountyFinding).findOneBy({ id: fid, bountyId });
      if (!finding) {
        ctx.set.status = 404;
        return { error: ctx.t('luminos.findingNotFound', 'Finding not found.') };
      }
      const body = (await ctx.body) as any;
      const action = body?.action;
      if (action === 'request') {
        if (finding.userId !== ctx.user.id) {
          ctx.set.status = 403;
          return { error: ctx.t('luminos.onlyReporterCanRequest', 'Only the reporter can request disclosure.') };
        }
        if (finding.status !== 'awarded') {
          ctx.set.status = 400;
          return { error: ctx.t('luminos.disclosureNeedsAward', 'Disclosure can only be requested after the report is awarded.') };
        }
        finding.disclosureRequested = true;
      } else if (action === 'approve' || action === 'decline') {
        if (bounty.ownerId !== ctx.user.id && !hasPermissionSync(ctx, 'chat:manage')) {
          ctx.set.status = 403;
          return { error: ctx.t('luminos.onlyOwnerCanMark', 'Only the bounty owner can decide disclosure.') };
        }
        finding.disclosureRequested = false;
        finding.disclosed = action === 'approve';
      } else {
        ctx.set.status = 400;
        return { error: ctx.t('luminos.invalidStatus', 'Action must be request, approve or decline.') };
      }
      await AppDataSource.getRepository(LuminosBountyFinding).save(finding);
      return finding;
    });

  app.post(prefix + '/luminos/bounties/:id/findings/:fid/comments',
    { beforeHandle: [authenticate], detail: { tags: ['Luminos'], summary: 'Comment on a finding' } },
    async (ctx: any) => {
      const bountyId = Number(ctx.params?.id);
      const fid = Number(ctx.params?.fid);
      const bounty = await AppDataSource.getRepository(LuminosBounty).findOneBy({ id: bountyId });
      if (!bounty || bounty.isArchived) {
        ctx.set.status = 404;
        return { error: ctx.t('luminos.bountyNotFound', 'Bounty not found.') };
      }
      if (!bounty.isPublished && bounty.ownerId !== ctx.user.id && !hasPermissionSync(ctx, 'chat:manage')) {
        ctx.set.status = 404;
        return { error: ctx.t('luminos.bountyNotFound', 'Bounty not found.') };
      }
      const finding = await AppDataSource.getRepository(LuminosBountyFinding).findOneBy({ id: fid, bountyId });
      if (!finding) {
        ctx.set.status = 404;
        return { error: ctx.t('luminos.findingNotFound', 'Finding not found.') };
      }
      const body = (await ctx.body) as any;
      const content = typeof body?.content === 'string' ? body.content.trim() : '';
      if (!content || content.length > 2000) {
        ctx.set.status = 400;
        return { error: ctx.t('luminos.commentRequired', 'Comment text is required.') };
      }
      const comment = AppDataSource.getRepository(LuminosBountyComment).create({
        findingId: fid,
        userId: ctx.user.id,
        content,
      });
      await AppDataSource.getRepository(LuminosBountyComment).save(comment);
      return {
        id: comment.id,
        userId: comment.userId,
        content: comment.content,
        displayName: ctx.user.displayName || ctx.user.email || `User#${ctx.user.id}`,
        createdAt: comment.createdAt,
      };
    });

  app.delete(prefix + '/luminos/bounties/:id/findings/:fid',
    { beforeHandle: [authenticate], detail: { tags: ['Luminos'], summary: 'Remove a finding' } },
    async (ctx: any) => {
      const bountyId = Number(ctx.params?.id);
      const fid = Number(ctx.params?.fid);
      const bounty = await AppDataSource.getRepository(LuminosBounty).findOneBy({ id: bountyId });
      if (!bounty || bounty.isArchived) {
        ctx.set.status = 404;
        return { error: ctx.t('luminos.bountyNotFound', 'Bounty not found.') };
      }
      const finding = await AppDataSource.getRepository(LuminosBountyFinding).findOneBy({ id: fid, bountyId });
      if (!finding) {
        ctx.set.status = 404;
        return { error: ctx.t('luminos.findingNotFound', 'Finding not found.') };
      }
      const isFinder = finding.userId === ctx.user.id;
      const isOwner = bounty.ownerId === ctx.user.id;
      if (!isFinder && !isOwner && !hasPermissionSync(ctx, 'chat:manage')) {
        ctx.set.status = 403;
        return { error: ctx.t('luminos.clubCreateForbidden', 'Not allowed to remove this finding.') };
      }
      if (isFinder && finding.status !== 'pending') {
        ctx.set.status = 400;
        return { error: ctx.t('luminos.findingAlreadyAwarded', 'Only pending findings can be removed by their author.') };
      }
      await AppDataSource.getRepository(LuminosBountyFinding).remove(finding);
      return { success: true };
    });

  app.post(prefix + '/luminos/bounties/:id/findings/:fid/status',
    { beforeHandle: [authenticate], detail: { tags: ['Luminos'], summary: 'Mark a finding valid or invalid' } },
    async (ctx: any) => {
      const bountyId = Number(ctx.params?.id);
      const fid = Number(ctx.params?.fid);
      const bounty = await AppDataSource.getRepository(LuminosBounty).findOneBy({ id: bountyId });
      if (!bounty || bounty.isArchived) {
        ctx.set.status = 404;
        return { error: ctx.t('luminos.bountyNotFound', 'Bounty not found.') };
      }
      if (bounty.ownerId !== ctx.user.id && !hasPermissionSync(ctx, 'chat:manage')) {
        ctx.set.status = 403;
        return { error: ctx.t('luminos.onlyOwnerCanMark', 'Only the bounty owner can mark findings.') };
      }
      const body = (await ctx.body) as any;
      const status = body?.status;
      if (status !== 'valid' && status !== 'invalid') {
        ctx.set.status = 400;
        return { error: ctx.t('luminos.invalidStatus', 'Status must be valid or invalid.') };
      }
      const severity = body?.severity;
      if (status === 'valid' && !SEVERITY_POINTS[severity as string]) {
        ctx.set.status = 400;
        return { error: ctx.t('luminos.severityRequired', 'A severity is required when marking valid.') };
      }
      const finding = await AppDataSource.getRepository(LuminosBountyFinding).findOneBy({ id: fid, bountyId });
      if (!finding) {
        ctx.set.status = 404;
        return { error: ctx.t('luminos.findingNotFound', 'Finding not found.') };
      }
      if (finding.status === 'awarded') {
        ctx.set.status = 400;
        return { error: ctx.t('luminos.findingAlreadyAwarded', 'This finding was already awarded.') };
      }
      finding.status = status;
      finding.severity = status === 'valid' ? severity : finding.severity;
      finding.decidedBy = ctx.user.id;
      finding.decidedAt = new Date();
      await AppDataSource.getRepository(LuminosBountyFinding).save(finding);
      return finding;
    });

  app.post(prefix + '/luminos/bounties/:id/findings/:fid/award',
    { beforeHandle: [authenticate], detail: { tags: ['Luminos'], summary: 'Award points for a verified finding' } },
    async (ctx: any) => {
      if (!hasPermissionSync(ctx, 'chat:manage')) {
        ctx.set.status = 403;
        return { error: ctx.t('luminos.clubCreateForbidden', 'Only club moderators can do that.') };
      }
      const bountyId = Number(ctx.params?.id);
      const fid = Number(ctx.params?.fid);
      const bounty = await AppDataSource.getRepository(LuminosBounty).findOneBy({ id: bountyId });
      if (!bounty || bounty.isArchived) {
        ctx.set.status = 404;
        return { error: ctx.t('luminos.bountyNotFound', 'Bounty not found.') };
      }
      const finding = await AppDataSource.getRepository(LuminosBountyFinding).findOneBy({ id: fid, bountyId });
      if (!finding) {
        ctx.set.status = 404;
        return { error: ctx.t('luminos.findingNotFound', 'Finding not found.') };
      }
      if (finding.status !== 'valid') {
        ctx.set.status = 400;
        return { error: ctx.t('luminos.onlyValidFindingsAwardable', 'Only valid findings can be awarded.') };
      }
      const points = SEVERITY_POINTS[finding.severity ?? 'low'] ?? SEVERITY_POINTS.low;
      finding.status = 'awarded';
      finding.awardedPoints = points;
      await AppDataSource.getRepository(LuminosBountyFinding).save(finding);
      const pointRepo = AppDataSource.getRepository(LuminosPoint);
      await pointRepo.save(pointRepo.create({
        userId: finding.userId,
        amount: points,
        reason: 'bounty_award',
        referenceId: finding.id,
        note: `Bounty: ${bounty.title}`,
      }));
      return { ...finding, awarded: true };
    });

  app.delete(prefix + '/luminos/bounties/:id',
    { beforeHandle: [authenticate], detail: { tags: ['Luminos'], summary: 'Archive a bounty' } },
    async (ctx: any) => {
      const bounty = await AppDataSource.getRepository(LuminosBounty).findOneBy({ id: Number(ctx.params?.id) });
      if (!bounty) {
        ctx.set.status = 404;
        return { error: ctx.t('luminos.bountyNotFound', 'Bounty not found.') };
      }
      if (bounty.ownerId !== ctx.user.id && !hasPermissionSync(ctx, 'chat:manage')) {
        ctx.set.status = 403;
        return { error: ctx.t('luminos.clubCreateForbidden', 'Only the owner or a moderator can do that.') };
      }
      bounty.isArchived = true;
      await AppDataSource.getRepository(LuminosBounty).save(bounty);
      return { success: true };
    });

  app.get(prefix + '/luminos/points',
    { beforeHandle: [authenticate], detail: { tags: ['Luminos'], summary: 'Get your Luminos point balance' } },
    async (ctx: any) => {
      if (!canViewClub(ctx)) {
        ctx.set.status = 403;
        return { error: ctx.t('luminos.membersOnlyChannel', 'Luminos Club only.') };
      }
      const rows = await AppDataSource.getRepository(LuminosPoint).find({
        where: { userId: ctx.user.id },
        order: { createdAt: 'DESC' },
        take: 50,
      });
      const balance = rows.reduce((sum, r) => sum + r.amount, 0);
      return { balance, history: rows };
    });

  app.post(prefix + '/luminos/points/redeem',
    { beforeHandle: [authenticate], detail: { tags: ['Luminos'], summary: 'Redeem points for store credit' } },
    async (ctx: any) => {
      if (!ctx.user.luminosMember) {
        ctx.set.status = 403;
        return { error: ctx.t('luminos.membersOnlyChannel', 'Luminos Club only.') };
      }
      const body = (await ctx.body) as any;
      const points = Number(body?.points);
      if (!Number.isInteger(points) || points < POINTS_PER_DOLLAR || points % POINTS_PER_DOLLAR !== 0) {
        ctx.set.status = 400;
        return { error: ctx.t('luminos.invalidRedemption', `Redemptions must be in steps of ${POINTS_PER_DOLLAR} points.`) };
      }
      const pointRepo = AppDataSource.getRepository(LuminosPoint);
      const rows = await pointRepo.find({ where: { userId: ctx.user.id } });
      const balance = rows.reduce((sum, r) => sum + r.amount, 0);
      if (balance < points) {
        ctx.set.status = 400;
        return { error: ctx.t('luminos.insufficientPoints', 'Not enough points.') };
      }
      const value = points / POINTS_PER_DOLLAR;
      const couponRepo = AppDataSource.getRepository(Coupon);
      const code = `LUMOS-${ctx.user.id}-${cryptoRandom().toString(36).slice(2, 8).toUpperCase()}`;
      const expiresAt = new Date(Date.now() + REDEEM_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
      const coupon = couponRepo.create({
        code,
        discountType: 'fixed',
        discountValue: value,
        maxUsesTotal: 1,
        maxUsesPerUser: 1,
        currentUsesTotal: 0,
        isActive: true,
        expiresAt,
        createdBy: ctx.user.id,
        createdAt: new Date(),
      });
      await couponRepo.save(coupon);
      await pointRepo.save(pointRepo.create({
        userId: ctx.user.id,
        amount: -points,
        reason: 'redemption',
        note: `Redeemed for $${value.toFixed(2)} credit (${code})`,
      }));
      return { code, value, expiresAt, balance: balance - points };
    });

  app.post(prefix + '/luminos/expel/:userId',
    { beforeHandle: [authenticate], detail: { tags: ['Luminos'], summary: 'Expel a Luminos member' } },
    async (ctx: any) => {
      if (!hasPermissionSync(ctx, 'chat:manage')) {
        ctx.set.status = 403;
        return { error: ctx.t('luminos.clubCreateForbidden', 'Only club moderators can do that.') };
      }
      const userId = Number(ctx.params?.userId);
      const userRepo = AppDataSource.getRepository(User);
      const member = await userRepo.findOneBy({ id: userId });
      if (!member) {
        ctx.set.status = 404;
        return { error: ctx.t('luminos.attemptNotFound', 'User not found.') };
      }
      if (!member.luminosMember) {
        return { expelled: false };
      }
      member.luminosMember = false;

      const settings =
        member.settings && typeof member.settings === 'object' ? { ...member.settings } : {};
      if (Array.isArray(settings.badges)) {
        settings.badges = settings.badges.filter((b: any) => String(b) !== 'luminos');
      }
      if (settings.gambling && typeof settings.gambling === 'object' && Array.isArray(settings.gambling.badges)) {
        settings.gambling = { ...settings.gambling, badges: settings.gambling.badges.filter((b: any) => String(b) !== 'luminos') };
      }
      member.settings = settings;
      await userRepo.save(member);

      await AppDataSource.getRepository(LuminosAttempt).delete({ userId } as any);

      try {
        const channel = await AppDataSource.getRepository(ChatChannel).findOneBy({ slug: 'luminos' });
        if (channel) {
          const row = await AppDataSource.getRepository(ChatChannelMember).findOneBy({ channelId: channel.id, userId });
          if (row) await AppDataSource.getRepository(ChatChannelMember).remove(row);
        }
      } catch {}

      try {
        const logRepo = AppDataSource.getRepository(UserLog);
        await logRepo.save(logRepo.create({
          userId,
          action: 'luminos_expel',
          targetId: String(userId),
          targetType: 'user',
          metadata: { by: ctx.user.id },
          timestamp: new Date(),
        }));
      } catch {}

      return { expelled: true };
    });

  app.post(prefix + '/luminos/assign/:userId',
    { beforeHandle: [authenticate], detail: { tags: ['Luminos'], summary: 'Assign a Luminos member' } },
    async (ctx: any) => {
      if (!hasPermissionSync(ctx, 'chat:manage')) {
        ctx.set.status = 403;
        return { error: ctx.t('luminos.clubCreateForbidden', 'Only club moderators can do that.') };
      }
      const userId = Number(ctx.params?.userId);
      const userRepo = AppDataSource.getRepository(User);
      const member = await userRepo.findOneBy({ id: userId });
      if (!member) {
        ctx.set.status = 404;
        return { error: ctx.t('luminos.attemptNotFound', 'User not found.') };
      }
      if (member.luminosMember) {
        return { assigned: false };
      }
      member.luminosMember = true;

      const settings =
        member.settings && typeof member.settings === 'object' ? { ...member.settings } : {};
      const badges = Array.isArray(settings.badges) ? settings.badges.map(String).filter(Boolean) : [];
      settings.badges = Array.from(new Set([...badges, 'luminos']));
      if (settings.gambling && typeof settings.gambling === 'object') {
        const gBadges = Array.isArray(settings.gambling.badges) ? settings.gambling.badges.map(String).filter(Boolean) : [];
        settings.gambling = { ...settings.gambling, badges: Array.from(new Set([...gBadges, 'luminos'])) };
      }
      member.settings = settings;
      await userRepo.save(member);

      try {
        const channel = await AppDataSource.getRepository(ChatChannel).findOneBy({ slug: 'luminos' });
        if (channel) {
          const memberRepo = AppDataSource.getRepository(ChatChannelMember);
          const existing = await memberRepo.findOneBy({ channelId: channel.id, userId });
          if (!existing) {
            await memberRepo.save(memberRepo.create({ channelId: channel.id, userId }));
          }
        }
      } catch {}

      try {
        const logRepo = AppDataSource.getRepository(UserLog);
        await logRepo.save(logRepo.create({
          userId,
          action: 'luminos_assign',
          targetId: String(userId),
          targetType: 'user',
          metadata: { by: ctx.user.id },
          timestamp: new Date(),
        }));
      } catch {}

      return { assigned: true };
    });

}
