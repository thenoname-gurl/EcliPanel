import { AppDataSource } from '../config/typeorm';
import { Ticket } from '../models/ticket.entity';
import { authenticate } from '../middleware/auth';
import { t } from 'elysia';

const adminRoles = ['admin', 'rootAdmin', '*'];

// TODO: IMPROVE THIS, ALSO ADD REPLY FUNCTIONALITY TO
// TICKETS INSTEAD OF JUST ADMIN REPLY
export async function ticketRoutes(app: any, prefix = '') {
  const repo = AppDataSource.getRepository(Ticket);

  const normalizeStatus = (status: any) => {
    const s = String(status || '').toLowerCase();
    if (['open', 'opened'].includes(s)) return 'opened';
    if (['pending', 'awaiting_staff_reply', 'waiting', 'waiting_staff'].includes(s)) return 'awaiting_staff_reply';
    if (['replied'].includes(s)) return 'replied';
    if (['closed'].includes(s)) return 'closed';
    return s || 'opened';
  };

  const computeLastReply = (ticket: any) => {
    const msgs = Array.isArray(ticket.messages) ? ticket.messages : [];
    if (msgs.length) {
      const last = msgs.reduce((prev, cur) => (new Date(cur.created) > new Date(prev.created) ? cur : prev), msgs[0]);
      return last.created;
    }
    return ticket.updatedAt || ticket.created;
  };

  app.get(prefix + '/tickets', async (ctx: any) => {
    const user = ctx.user;
    const tickets = adminRoles.includes(user.role)
      ? await repo.find({ order: { created: 'DESC' } })
      : await repo.find({ where: { userId: user.id }, order: { created: 'DESC' } });

    return tickets.map((t) => ({
      ...t,
      status: normalizeStatus(t.status),
      lastReply: computeLastReply(t),
    }));
  }, {beforeHandle: authenticate,
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'List tickets', tags: ['Tickets'] }
  });

  app.post(prefix + '/tickets', async (ctx: any) => {
    const user = ctx.user;
    const { subject, message, priority, department } = ctx.body as any;
    if (!subject || !message) {
      ctx.set.status = 400;
      return { error: 'subject and message required' };
    }

    const now = new Date();
    const ticket = repo.create({
      userId: user.id,
      subject,
      message,
      priority: priority || 'medium',
      status: 'opened',
      department: typeof department === 'string' ? department : null,
      messages: [{ sender: 'user', message, created: now }],
    });
    await repo.save(ticket);
    return { success: true, ticket: { ...ticket, lastReply: now, status: 'opened' } };
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
    return { ...ticket, status: normalizeStatus(ticket.status), lastReply: computeLastReply(ticket) };
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

    const { status, priority, reply, replyAs, message, assignedTo, department } = ctx.body as any;
    const now = new Date();

    if (status) ticket.status = normalizeStatus(status);
    if (priority) ticket.priority = priority;
    if (assignedTo != null) ticket.assignedTo = Number(assignedTo);
    if (typeof department === 'string') ticket.department = department;

    if (!Array.isArray(ticket.messages)) ticket.messages = [];

    if (typeof reply === 'string' && reply.trim()) {
      const isAdmin = adminRoles.includes(user.role);
      const sender: 'staff' | 'user' = replyAs === 'user' ? 'user' : replyAs === 'staff' ? 'staff' : (isAdmin ? 'staff' : 'user');
      ticket.messages.push({ sender, message: reply.trim(), created: now });

      if (sender === 'staff') {
        ticket.adminReply = reply.trim();
      }

      if (!status) {
        ticket.status = sender === 'staff' ? 'replied' : 'awaiting_staff_reply';
      }
    } else if (typeof message === 'string' && message.trim()) {
      ticket.message = `${ticket.message}\n\n---\n${message.trim()}`;
      ticket.messages.push({ sender: 'user', message: message.trim(), created: now });
      if (!status) ticket.status = 'awaiting_staff_reply';
    }

    await repo.save(ticket);
    return { ...ticket, status: normalizeStatus(ticket.status), lastReply: computeLastReply(ticket) };
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
