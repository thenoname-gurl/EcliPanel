import { AppDataSource } from '../config/typeorm';
import { sendMail } from './mailService';
import { User } from '../models/user.entity';
import { DeletionRequest } from '../models/deletionRequest.entity';

/*
 I swear spamhaus hates me,
 hence I will just add what they want to leave me alone..
*/
const INACTIVITY_WARNING_DAYS = 365;
const SUNSET_GRACE_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

function getPanelUrl(): string {
  return (process.env.PANEL_URL || process.env.FRONTEND_URL || 'https://ecli.app').replace(/\/+$/, '');
}

function getNoticeDeadline(): Date {
  return new Date(Date.now() + SUNSET_GRACE_DAYS * DAY_MS);
}

function buildLoginUrl() {
  return `${getPanelUrl()}/login`;
}

export async function cancelPendingAutoSunsetDeletionRequest(user: User) {
  if (!AppDataSource.isInitialized) return;
  const repo = AppDataSource.getRepository(DeletionRequest);
  const request = await repo.findOne({ where: { userId: user.id, status: 'pending_deletion', autoSunset: true } });
  if (!request) return;

  request.status = 'cancelled';
  await repo.save(request);

  user.deletionRequested = false;
  user.deletionApproved = false;
  user.pendingDeletionUntil = undefined;
  user.sunsetNoticeSentAt = undefined;
}

export async function processSunsetPolicy() {
  if (!AppDataSource.isInitialized) return;
  const userRepo = AppDataSource.getRepository(User);
  const reqRepo = AppDataSource.getRepository(DeletionRequest);
  const cutoff = new Date(Date.now() - INACTIVITY_WARNING_DAYS * DAY_MS);

  const users = await userRepo.createQueryBuilder('user')
    .where('user.emailVerified = :verified', { verified: true })
    .andWhere('user.deletedAt IS NULL')
    .andWhere('user.suspended = false')
    .andWhere('user.supportBanned = false')
    .andWhere('user.deletionRequested = false')
    .andWhere(
      '(user.lastLoginAt IS NOT NULL AND user.lastLoginAt <= :cutoff) OR (user.lastLoginAt IS NULL AND user.createdAt IS NOT NULL AND user.createdAt <= :cutoff)',
      { cutoff: cutoff.toISOString() }
    )
    .getMany();

  for (const user of users) {
    if (!user.email) continue;

    const existing = await reqRepo.findOne({ where: { userId: user.id, status: 'pending_deletion', autoSunset: true } });
    if (existing) continue;

    const loginUrl = buildLoginUrl();
    const subject = 'Your account is inactive - please log in to keep it';
    const message = `Your EclipseSystems account has been inactive for more than one year. Please log in to keep your account active.`;
    const details = `If you do not log in within 90 days, your account will be deleted automatically.`;

    try {
      await sendMail({
        to: user.email,
        from: process.env.SMTP_FROM || process.env.MAIL_FROM || 'noreply@ecli.app',
        subject,
        template: 'sunset-policy',
        vars: {
          title: subject,
          message,
          action_url: loginUrl,
          action_text: 'Log in now',
          details,
        },
      });
    } catch (err: any) {
      console.warn('[sunsetPolicy] failed to send inactivity notice to', user.email, err?.message || err);
      continue;
    }

    const scheduledDeletionAt = getNoticeDeadline();
    const request = reqRepo.create({
      userId: user.id,
      status: 'pending_deletion',
      requestedAt: new Date(),
      approvedAt: new Date(),
      scheduledDeletionAt,
      idVerified: user.idVerified,
      autoSunset: true,
    });
    await reqRepo.save(request);

    user.deletionRequested = true;
    user.deletionApproved = false;
    user.pendingDeletionUntil = scheduledDeletionAt;
    user.sunsetNoticeSentAt = new Date();
    await userRepo.save(user);
  }
}