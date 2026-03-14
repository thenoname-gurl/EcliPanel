import { AppDataSource } from '../config/typeorm';
import { User } from '../models/user.entity';
import { authenticate } from '../middleware/auth';
import { t } from 'elysia';

export async function sessionRoutes(app: any, prefix = '') {
  app.post(prefix + '/sessions/logout', async (ctx: any) => {
    const { userId, sessionId } = ctx.body as { userId: number; sessionId: string };
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOneBy({ id: userId });
    if (!user || !user.sessions) {
      ctx.set.status = 404;
      return { error: 'User or session not found' };
    }
    user.sessions = user.sessions.filter((s: string) => s !== sessionId);
    await userRepo.save(user);
    return { success: true };
  }, {
   beforeHandle: authenticate,
    body: t.Object({ userId: t.Number(), sessionId: t.String() }),
    response: { 200: t.Any(), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Revoke a single session for a user', tags: ['Auth'] }
  });

  app.post(prefix + '/sessions/logout-all', async (ctx: any) => {
    const { userId } = ctx.body as { userId: number };
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOneBy({ id: userId });
    if (!user) {
      ctx.set.status = 404;
      return { error: 'User not found' };
    }
    user.sessions = [];
    await userRepo.save(user);
    return { success: true };
  }, {
   beforeHandle: authenticate,
    body: t.Object({ userId: t.Number() }),
    response: { 200: t.Any(), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Revoke all sessions for a user', tags: ['Auth'] }
  });

  app.get(prefix + '/sessions/:userId', async (ctx: any) => {
    const userId = Number(ctx.params['userId']);
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOneBy({ id: userId });
    if (!user) {
      ctx.set.status = 404;
      return { error: 'User not found' };
    }
    return { sessions: user.sessions || [] };
  }, {
   beforeHandle: authenticate,
    response: { 200: t.Object({ sessions: t.Array(t.String()) }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'List all active sessions for a given user', tags: ['Auth'] }
  });
}
