import { schedule } from '../utils/cron';
import { AppDataSource } from '../config/typeorm';
import { DeletionRequest } from '../models/deletionRequest.entity';
import { User } from '../models/user.entity';
import { DeletedUserRetention } from '../models/deletedUserRetention.entity';
import { Order } from '../models/order.entity';
import { getMailboxAccountForUser, removeMailboxAccount } from '../services/mailcowService';
import { sendMail } from '../services/mailService';
import { resolveLocale } from '../i18n/resolve';
import { auditLog } from '../utils/auditLog';

export async function executeDeletionRequest(req: DeletionRequest, now = new Date()) {
  const reqRepo = AppDataSource.getRepository(DeletionRequest);
  const userRepo = AppDataSource.getRepository(User);
  const retentionRepo = AppDataSource.getRepository(DeletedUserRetention);
  const orderRepo = AppDataSource.getRepository(Order);

  const user = await userRepo.findOne({ where: { id: req.userId } });
  if (user && (user.role === '*' || user.role === 'rootAdmin')) {
    req.status = 'cancelled';
    req.scheduledDeletionAt = undefined;
    await reqRepo.save(req);
    console.warn('[deletionExecutionJob] skipping super admin account', user.id);
    return req;
  }
  if (!user) {
    req.status = 'deleted';
    req.deletedAt = now;
    await reqRepo.save(req);
    return req;
  }

  const orderCount = await orderRepo.count({ where: { userId: user.id } });
  const hasBillingHistory = orderCount > 0;
  const retentionYears = hasBillingHistory ? 10 : 1;
  const retainUntil = new Date(Date.now() + retentionYears * 365 * 24 * 60 * 60 * 1000);

  const exists = await retentionRepo.findOne({
    where: { userId: user.id, deletionRequestId: req.id } as any,
  });
  if (!exists) {
    await retentionRepo.save(
      retentionRepo.create({
        userId: user.id,
        deletionRequestId: req.id,
        firstName: user.firstName,
        middleName: user.middleName,
        lastName: user.lastName,
        email: user.email,
        hasBillingHistory,
        deletedAt: now,
        retainUntil,
      })
    );
  }

  try {
    const mailboxAccount = await getMailboxAccountForUser(user.id);
    if (mailboxAccount) {
      await removeMailboxAccount(mailboxAccount);
    }
  } catch (err: any) {
    console.warn(
      '[deletionExecutionJob] failed to remove Mailcow mailbox account for user',
      user.id,
      err?.message || err
    );
  }

  const panelUrl = process.env.PANEL_URL || 'https://ecli.app';
  sendMail({
    to: user.email,
    template: 'deletion-deleted',
    vars: {
      title: 'Account Deleted',
      message: 'Your EclipseSystems account has been permanently deleted as requested.',
      details: `Your account and associated data have been removed from our systems.\n\nCertain information has been retained for legal and audit purposes as required by applicable law.\n\nIf you did not request this deletion, please contact our support team immediately at ${panelUrl}/contact.`,
    },
    locale: resolveLocale({ user }),
  }).catch((e: any) => console.error('[deletionExecutionJob] failed to send deletion email', e));

  user.firstName = 'Deleted';
  user.middleName = undefined;
  user.lastName = `User ${user.id}`;
  user.displayName = 'Deleted User';
  user.address = '';
  user.address2 = undefined;
  user.phone = undefined;
  user.billingCompany = undefined;
  user.billingCity = undefined;
  user.billingState = undefined;
  user.billingZip = undefined;
  user.billingCountry = undefined;
  user.avatarUrl = undefined;
  user.passwordHash = crypto.randomUUID();
  user.email = `deleted+${user.id}+${Date.now()}@deleted.local`;
  user.sessions = [];
  user.suspended = true;
  user.deletionRequested = true;
  user.deletionApproved = true;
  user.pendingDeletionUntil = undefined;
  user.deletedAt = now;
  await userRepo.save(user);

  req.status = 'deleted';
  req.deletedAt = now;
  await reqRepo.save(req);
  void auditLog({ userId: req.userId, action: 'system:user:deleted', targetId: String(req.userId), targetType: 'user', metadata: { deletionRequestId: req.id, hasBillingHistory, retentionYears } });
  return req;
}

export async function runDeletionExecutionJob() {
  if (!AppDataSource.isInitialized) return;

  const reqRepo = AppDataSource.getRepository(DeletionRequest);
  const retentionRepo = AppDataSource.getRepository(DeletedUserRetention);

  const now = new Date();

  const due = await reqRepo
    .createQueryBuilder('r')
    .where('r.status = :status', { status: 'pending_deletion' })
    .andWhere('r.scheduledDeletionAt IS NOT NULL')
    .andWhere('r.scheduledDeletionAt <= :now', { now: now.toISOString() })
    .orderBy('r.requestedAt', 'ASC')
    .getMany();

  for (const req of due) {
    await executeDeletionRequest(req, now);
  }

  await retentionRepo
    .createQueryBuilder()
    .delete()
    .where('retainUntil <= :now', { now: now.toISOString() })
    .execute();
}

export function scheduleDeletionExecutionJob() {
  runDeletionExecutionJob().catch(e =>
    console.error('[deletionExecutionJob] initial run failed', e)
  );
  schedule('0 * * * *', async () => {
    await runDeletionExecutionJob().catch(e =>
      console.error('[deletionExecutionJob] run failed', e)
    );
  });
}
