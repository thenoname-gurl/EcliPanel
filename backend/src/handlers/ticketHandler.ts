import { AppDataSource } from '../config/typeorm';
import { Ticket } from '../models/ticket.entity';
import { authenticate } from '../middleware/auth';
import { t } from 'elysia';

const adminRoles = ['admin', 'rootAdmin', '*'];

// TODO: IMPROVE THIS, ALSO ADD REPLY FUNCTIONALITY TO
// TICKETS INSTEAD OF JUST ADMIN REPLY
export async function ticketRoutes(app: any, prefix = '') {
  const repo = AppDataSource.getRepository(Ticket);

  app.get(prefix + '/tickets', async (ctx: any) => {
    const user = ctx.user;
    if (adminRoles.includes(user.role)) {
      return await repo.find({ order: { created: 'DESC' } });
    }
    return await repo.find({ where: { userId: user.id }, order: { created: 'DESC' } });
  }, {beforeHandle: authenticate,
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'List tickets', tags: ['Tickets'] }
  });

  app.post(prefix + '/tickets', async (ctx: any) => {
    const user = ctx.user;
    const { subject, message, priority } = ctx.body as any;
    if (!subject || !message) {
      ctx.set.status = 400;
      return { error: 'subject and message required' };
    }
    const ticket = repo.create({
      userId: user.id,
      subject,
      message,
      priority: priority || 'medium',
      status: 'open',
    });
    await repo.save(ticket);
    return { success: true, ticket };
  }, {beforeHandle: authenticate,
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }) },
    detail: { summary: 'Create ticket', tags: ['Tickets'] }
  });

  app.get(prefix + '/tickets/:id', async (ctx: any) => {
    const user = ctx.user;
    const ticket = await repo.findOneBy({ id: Number(ctx.params.id) });
    if (!ticket) {
      ctx.set.status = 404;
      return { error: 'Ticket not found' };
    }
    if (ticket.userId !== user.id && !adminRoles.includes(user.role)) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    return ticket;
  }, {beforeHandle: authenticate,
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Get ticket by id', tags: ['Tickets'] }
  });

  app.put(prefix + '/tickets/:id', async (ctx: any) => {
    const user = ctx.user;
    const ticket = await repo.findOneBy({ id: Number(ctx.params.id) });
    if (!ticket) {
      ctx.set.status = 404;
      return { error: 'Ticket not found' };
    }
    if (!adminRoles.includes(user.role) && ticket.userId !== user.id) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    const { status, adminReply } = ctx.body as any;
    if (status) ticket.status = status;
    if (adminReply && adminRoles.includes(user.role)) ticket.adminReply = adminReply;
    await repo.save(ticket);
    return { success: true, ticket };
  }, {beforeHandle: authenticate,
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Update ticket (admin only)', tags: ['Tickets'] }
  });

  app.delete(prefix + '/tickets/:id', async (ctx: any) => {
    const user = ctx.user;
    if (!adminRoles.includes(user.role)) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    await repo.delete(Number(ctx.params.id));
    return { success: true };
  }, {beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Delete ticket (admin only)', tags: ['Tickets'] }
  });
}
