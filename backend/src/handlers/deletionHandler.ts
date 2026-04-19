import { AppDataSource } from '../config/typeorm';
import { DeletionRequest } from '../models/deletionRequest.entity';
import { authenticate } from '../middleware/auth';
import { hasPermissionSync } from '../middleware/authorize';
import { t } from 'elysia';

// I hope this will never be a very popular feature, but here we are.
// Demons are in the details with this one,
// so lets be very careful and do as much as we can to prevent abuse or mistakes 
// or better yet, make deletion even more annoying to prevent deletions in the first place.
// SCARY VERY SCARY THEYRE EREASI-
export async function deletionRoutes(app: any, prefix = '') {
  app.post(prefix + '/deletion-requests', async (ctx: any) => {
    const user = ctx.user;
    const repo = AppDataSource.getRepository(DeletionRequest);
    const existing = await repo.findOne({ where: [{ userId: user.id, status: 'pending' }, { userId: user.id, status: 'pending_deletion' }] });
    if (existing) {
      ctx.set.status = 400;
      return { error: 'Request already pending' };
    }
    const record = repo.create({ userId: user.id, status: 'pending', requestedAt: new Date(), idVerified: user.idVerified });
    await repo.save(record);
    return { success: true, record };
  }, {
   beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean(), record: t.Any() }), 400: t.Object({ error: t.String() }) },
    detail: {
      summary: 'Create deletion request',
      description: 'Creates a new account deletion request for the authenticated user.',
      tags: ['Users'],
      operationId: 'postApiDeletionRequests',
    }
  });

  app.put(prefix + '/deletion-requests/:id', async (ctx: any) => {
    const user = ctx.user;
    if (!hasPermissionSync(ctx, 'deletions:write')) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    const repo = AppDataSource.getRepository(DeletionRequest);
    const rec = await repo.findOneBy({ id: Number(ctx.params['id']) });
    if (!rec) {
      ctx.set.status = 404;
      return { error: 'Not found' };
    }
    const { status } = ctx.body as any;
    if (status !== 'approved' && status !== 'rejected') {
      ctx.set.status = 400;
      return { error: 'Invalid status' };
    }
    rec.status = status;
    rec.approvedBy = user.id;

    if (status === 'approved') {
      const userRepo = AppDataSource.getRepository(require('../models/user.entity').User);
      const targetUser = await userRepo.findOneBy({ id: rec.userId });
      if (targetUser) {
        targetUser.deletionRequested = true;
        targetUser.deletionApproved = false;
        targetUser.pendingDeletionUntil = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
        targetUser.suspended = true;
        await userRepo.save(targetUser);
      }
      rec.status = 'pending_deletion';
      rec.approvedAt = new Date();
      rec.scheduledDeletionAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    }

    await repo.save(rec);
    return { success: true, rec };
  }, {
   beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean(), rec: t.Any() }), 400: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: {
      summary: 'Update deletion request',
      description: 'Updates the status of a deletion request (admin only).',
      tags: ['Users'],
      operationId: 'putApiDeletionRequestsId',
    }
  });
}
