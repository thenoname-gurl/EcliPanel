import cron from 'node-cron';
import { v4 as uuidv4 } from 'uuid';
import { AppDataSource } from '../config/typeorm';
import { DeletionRequest } from '../models/deletionRequest.entity';
import { User } from '../models/user.entity';
import { DeletedUserRetention } from '../models/deletedUserRetention.entity';
import { Order } from '../models/order.entity';

export async function executeDeletionRequest(req: DeletionRequest, now = new Date()) {
  const reqRepo = AppDataSource.getRepository(DeletionRequest);
  const userRepo = AppDataSource.getRepository(User);
  const retentionRepo = AppDataSource.getRepository(DeletedUserRetention);
  const orderRepo = AppDataSource.getRepository(Order);

  const user = await userRepo.findOne({ where: { id: req.userId } });
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

  const exists = await retentionRepo.findOne({ where: { userId: user.id, deletionRequestId: req.id } as any });
  if (!exists) {
    await retentionRepo.save(retentionRepo.create({
      userId: user.id,
      deletionRequestId: req.id,
      firstName: user.firstName,
      middleName: user.middleName,
      lastName: user.lastName,
      email: user.email,
      hasBillingHistory,
      deletedAt: now,
      retainUntil,
    }));
  }

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
  user.passwordHash = uuidv4();
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
  return req;
}

export async function runDeletionExecutionJob() {
  if (!AppDataSource.isInitialized) return;

  const reqRepo = AppDataSource.getRepository(DeletionRequest);
  const retentionRepo = AppDataSource.getRepository(DeletedUserRetention);

  const now = new Date();

  const due = await reqRepo.createQueryBuilder('r')
    .where('r.status = :status', { status: 'pending_deletion' })
    .andWhere('r.scheduledDeletionAt IS NOT NULL')
    .andWhere('r.scheduledDeletionAt <= :now', { now: now.toISOString() })
    .orderBy('r.requestedAt', 'ASC')
    .getMany();

  for (const req of due) {
    await executeDeletionRequest(req, now);
  }

  await retentionRepo.createQueryBuilder()
    .delete()
    .where('retainUntil <= :now', { now: now.toISOString() })
    .execute();
}

export function scheduleDeletionExecutionJob() {
  runDeletionExecutionJob().catch((e) => console.error('[deletionExecutionJob] initial run failed', e));
  cron.schedule('0 * * * *', async () => {
    await runDeletionExecutionJob().catch((e) => console.error('[deletionExecutionJob] run failed', e));
  });
}