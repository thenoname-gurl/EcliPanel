import { AppDataSource } from '../config/typeorm';
import { sendMail } from './mailService';
import { User } from '../models/user.entity';
import { DeletionRequest } from '../models/deletionRequest.entity';
import { resolveLocale, tForUser } from '../i18n';
import { getPanelUrl } from '../utils/url';

/*
 I swear spamhaus hates me,
 hence I will just add what they want to leave me alone..
*/
const INACTIVITY_WARNING_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

function buildLoginUrl() {
  return `${getPanelUrl()}/login`;
}

export async function cancelPendingAutoSunsetDeletionRequest(user: User) {
  if (!AppDataSource.isInitialized) return;
  if (user.inactive && user.sunsetNoticeSentAt) { // And we're risking again w spamhause crap yay
    const userRepo = AppDataSource.getRepository(User);
    user.inactive = false;
    user.sunsetNoticeSentAt = undefined;
    await userRepo.save(user);
    return;
  }

  const repo = AppDataSource.getRepository(DeletionRequest);
  const request = await repo.findOne({
    where: { userId: user.id, status: 'pending_deletion', autoSunset: true },
  });
  if (!request) return;

  request.status = 'cancelled';
  await repo.save(request);

  const userRepo = AppDataSource.getRepository(User);
  user.deletionRequested = false;
  user.deletionApproved = false;
  user.pendingDeletionUntil = undefined;
  user.sunsetNoticeSentAt = undefined;
  await userRepo.save(user);
}

export async function processSunsetPolicy() {
  if (!AppDataSource.isInitialized) return;
  const userRepo = AppDataSource.getRepository(User);
  const cutoff = new Date(Date.now() - INACTIVITY_WARNING_DAYS * DAY_MS);

  const users = await userRepo
    .createQueryBuilder('user')
    .where('user.emailVerified = :verified', { verified: true })
    .andWhere('user.deletedAt IS NULL')
    .andWhere('user.suspended = false')
    .andWhere('user.inactive = false')
    .andWhere('user.supportBanned = false')
    .andWhere('user.deletionRequested = false')
    .andWhere(
      '(user.lastLoginAt IS NOT NULL AND user.lastLoginAt <= :cutoff) OR (user.lastLoginAt IS NULL AND user.createdAt IS NOT NULL AND user.createdAt <= :cutoff)',
      { cutoff: cutoff.toISOString() }
    )
    .getMany();

  for (const user of users) {
    if (!user.email) continue;

    const loginUrl = buildLoginUrl();
    const t = tForUser(user);
    const subject = t('email.sunsetPolicy.subject');
    const message = t('email.sunsetPolicy.message');
    const details = t('email.sunsetPolicy.details');
    const actionText = t('email.sunsetPolicy.actionText');

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
          action_text: actionText,
          details,
        },
        locale: resolveLocale({ user }),
      });
    } catch (err: any) {
      console.warn(
        '[sunsetPolicy] failed to send inactivity notice to',
        user.email,
        err?.message || err
      );
      continue;
    }

    user.inactive = true;
    user.sunsetNoticeSentAt = new Date();
    await userRepo.save(user);
  }
}
