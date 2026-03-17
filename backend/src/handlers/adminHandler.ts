import { AppDataSource } from '../config/typeorm';
import { User } from '../models/user.entity';
import { Passkey } from '../models/passkey.entity';
import { Ticket } from '../models/ticket.entity';
import { IDVerification } from '../models/idVerification.entity';
import { DeletionRequest } from '../models/deletionRequest.entity';
import { Node } from '../models/node.entity';
import { Organisation } from '../models/organisation.entity';
import { WingsApiService } from '../services/wingsApiService';
import { authenticate } from '../middleware/auth';
import { UserLog } from '../models/userLog.entity';
import { ApiRequestLog } from '../models/apiRequestLog.entity';
import { AIModel } from '../models/aiModel.entity';
import { Egg } from '../models/egg.entity';
import { NodeService } from '../services/nodeService';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { t } from 'elysia';
import { PanelSetting } from '../models/panelSetting.entity';
import { saveServerConfig, removeServerConfig, mergeDuplicateServerConfigs } from './remoteHandler';
import { Mount } from '../models/mount.entity';
import { ServerMount } from '../models/serverMount.entity';
import { ServerConfig } from '../models/serverConfig.entity';
import { In } from 'typeorm';
import { Order } from '../models/order.entity';
import { Plan } from '../models/plan.entity';
import path from 'path';
import fs from 'fs';

const adminRoles = ['admin', 'rootAdmin', '*'];

function parseSizeToMB(input: any): number | null {
  if (input === null || input === undefined || input === '') return null;
  if (typeof input === 'number') return Number(input);
  if (typeof input !== 'string') return null;
  let s = input.trim().toLowerCase().replace(',', '.');
  const m = s.match(/^([0-9]+(?:\.[0-9]+)?)\s*(b|kb|k|mb|m|gb|g|tb|t)?s?$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = (m[2] || 'mb').toLowerCase();
  switch (unit) {
    case 'b': return Math.round(n / (1024 * 1024));
    case 'k': case 'kb': return Math.round(n / 1024);
    case 'm': case 'mb': return Math.round(n);
    case 'g': case 'gb': return Math.round(n * 1024);
    case 't': case 'tb': return Math.round(n * 1024 * 1024);
    default: return Math.round(n);
  }
}
function parseCpuInput(input: any): number | null {
  if (input === null || input === undefined || input === '') return null;
  if (typeof input === 'number') return Number(input);
  if (typeof input !== 'string') return null;
  let s = input.trim().toLowerCase().replace(',', '.');
  if (s.endsWith('%')) {
    const v = parseFloat(s.replace(/%/g, ''));
    return Number.isFinite(v) ? v : null;
  }
  if (s.match(/core|vcpu|vcore/)) {
    const m = s.match(/([0-9]+(?:\.[0-9]+)?)/);
    if (!m) return null;
    const v = parseFloat(m[1]);
    return Number.isFinite(v) ? Math.round(v * 100) : null;
  }
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : null;
}

function requireAdminCtx(ctx: any): true | { error: string } {
  const user = ctx.user as User | undefined;
  if (!user) {
    ctx.set.status = 401;
    return { error: 'Unauthorized' };
  }
  if (!adminRoles.includes(user.role ?? '')) {
    ctx.set.status = 403;
    return { error: 'Admin access required.' };
  }
  return true;
}

export async function adminRoutes(app: any, prefix = '') {
  app.get(prefix + '/admin/stats', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const userRepo = AppDataSource.getRepository(User);
    const nodeRepo = AppDataSource.getRepository(Node);
    const ticketRepo = AppDataSource.getRepository(Ticket);
    const verRepo = AppDataSource.getRepository(IDVerification);
    const delRepo = AppDataSource.getRepository(DeletionRequest);

    const orgRepo = AppDataSource.getRepository(Organisation);

    const [totalUsers, totalNodes, totalOrganisations, pendingTickets, pendingVerifications, pendingDeletions, fraudAlerts] = await Promise.all([
      userRepo.count(),
      nodeRepo.count(),
      orgRepo.count(),
      ticketRepo.count({ where: { status: 'open' } }),
      verRepo.count({ where: { status: 'pending' } }),
      delRepo.count({ where: { status: 'pending' } }),
      userRepo.count({ where: { fraudFlag: true } }),
    ]);

    let totalServers = 0;
    const nodes = await AppDataSource.getRepository(Node).find();
    for (const n of nodes) {
      try {
        const svc = new WingsApiService(n.url, n.token);
        const res = await svc.getServers();
        totalServers += (res.data || []).length;
      } catch { }
    }

    return { totalUsers, totalNodes, totalOrganisations, totalServers, pendingTickets, pendingVerifications, pendingDeletions, fraudAlerts };
  }, {
    beforeHandle: authenticate,
    response: {
      200: t.Object({
        totalUsers: t.Number(),
        totalNodes: t.Number(),
        totalOrganisations: t.Number(),
        totalServers: t.Number(),
        pendingTickets: t.Number(),
        pendingVerifications: t.Number(),
        pendingDeletions: t.Number(),
        fraudAlerts: t.Number(),
      }),
      401: t.Object({ error: t.String() }),
      403: t.Object({ error: t.String() }),
    },
    detail: { summary: 'Get aggregated admin statistics (admin only)', tags: ['Admin'] },
  });

  app.get(prefix + '/admin/users', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const userRepo = AppDataSource.getRepository(User);
    const passkeyRepo = AppDataSource.getRepository(Passkey);

    const users = await userRepo.find({ order: { id: 'ASC' } });
    const passkeyCounts = await passkeyRepo
      .createQueryBuilder('p')
      .select('p.userId', 'userId')
      .addSelect('COUNT(*)', 'count')
      .groupBy('p.userId')
      .getRawMany();

    const countMap: Record<number, number> = {};
    for (const row of passkeyCounts) countMap[Number(row.userId)] = Number(row.count);

    const result = users.map((u) => {
      const out: any = { ...u };
      delete out.passwordHash;
      delete out.sessions;
      out.passkeyCount = countMap[u.id] ?? 0;
      return out;
    });

    return result;
  }, {
    beforeHandle: authenticate,
    response: {
      200: t.Array(t.Any()),
      401: t.Object({ error: t.String() }),
      403: t.Object({ error: t.String() }),
    },
    detail: { summary: 'List all users (admin)', tags: ['Admin'] },
  });

  app.put(prefix + '/admin/users/:id', async (ctx) => {
    const adminErr = requireAdminCtx(ctx);
    if (adminErr !== true) return adminErr;
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOneBy({ id: Number(ctx.params.id) });
    if (!user) {
      ctx.set.status = 404;
      return { error: 'User not found' };
    }

    const { role, portalType, suspended, limits, nodeId, demoUsed, demoExpiresAt, demoOriginalPortalType, demoLimits } = ctx.body as any;
    const nodeRepo = AppDataSource.getRepository(Node);
    if (role !== undefined) user.role = role;
    if (portalType !== undefined) user.portalType = portalType;
    if (suspended !== undefined) user.suspended = suspended;
    if (nodeId !== undefined) user.nodeId = nodeId != null ? Number(nodeId) : undefined as any;
    if (demoUsed !== undefined) user.demoUsed = !!demoUsed;
    if (demoExpiresAt !== undefined) user.demoExpiresAt = demoExpiresAt ? new Date(demoExpiresAt) : undefined;
    if (demoOriginalPortalType !== undefined) user.demoOriginalPortalType = demoOriginalPortalType;
    if (demoLimits !== undefined) user.demoLimits = demoLimits;
    if (limits !== undefined) {
      if (limits && typeof limits === 'object') {
        const outLimits: any = { ...limits };
        if (limits.memory !== undefined) {
          const pm = parseSizeToMB(limits.memory);
          if (pm === null || pm < 0) { ctx.set.status = 400; return { error: 'Invalid memory value in limits' }; }
          outLimits.memory = pm;
        }
        if (limits.disk !== undefined) {
          const pd = parseSizeToMB(limits.disk);
          if (pd === null || pd < 0) { ctx.set.status = 400; return { error: 'Invalid disk value in limits' }; }
          outLimits.disk = pd;
        }
        if (limits.cpu !== undefined) {
          const pc = parseCpuInput(limits.cpu);
          if (pc === null || pc < 0) { ctx.set.status = 400; return { error: 'Invalid cpu value in limits' }; }
          outLimits.cpu = pc;
        }
        if (limits.serverLimit !== undefined) {
          const sl = Number(limits.serverLimit);
          if (!Number.isFinite(sl) || sl < 0) { ctx.set.status = 400; return { error: 'Invalid serverLimit value in limits' }; }
          outLimits.serverLimit = Math.round(sl);
        }
        user.limits = outLimits;
      } else {
        user.limits = limits;
      }
    }

    if (user.portalType === 'enterprise' && user.nodeId) {
      const node = await nodeRepo.findOneBy({ id: user.nodeId });
      if (node) {
        const enterpriseLimits: Record<string, number> = {};
        if (node.memory != null) enterpriseLimits.memory = Number(node.memory);
        if (node.disk != null) enterpriseLimits.disk = Number(node.disk);
        if (node.cpu != null) enterpriseLimits.cpu = Number(node.cpu);
        if (node.serverLimit != null) enterpriseLimits.serverLimit = Number(node.serverLimit);
        user.limits = Object.keys(enterpriseLimits).length ? enterpriseLimits : null;
      }
    }

    await userRepo.save(user);
    return { success: true };
  }, {
    beforeHandle: authenticate,
    schema: {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        role: t.Optional(t.String()),
        portalType: t.Optional(t.String()),
        suspended: t.Optional(t.Boolean()),
        limits: t.Optional(t.Any()),
        nodeId: t.Optional(t.Any()),
        demoUsed: t.Optional(t.Boolean()),
        demoExpiresAt: t.Optional(t.String()),
        demoOriginalPortalType: t.Optional(t.String()),
        demoLimits: t.Optional(t.Any()),
      }),
      response: {
        200: t.Object({ success: t.Boolean() }),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
    },
    detail: { summary: 'Modify a user record (admin)', tags: ['Admin'] },
  });

  app.delete(prefix + '/admin/users/:id', async (ctx) => {
    const adminErr = requireAdminCtx(ctx);
    if (adminErr !== true) return adminErr;
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOneBy({ id: Number(ctx.params.id) });
    if (!user) {
      ctx.set.status = 404;
      return { error: 'User not found' };
    }
    if (ctx.user?.id === user.id) {
      ctx.set.status = 400;
      return { error: 'Cannot delete your own account' };
    }
    await userRepo.remove(user);
    return { success: true };
  }, {
    beforeHandle: authenticate,
    response: {
      200: t.Object({ success: t.Boolean() }),
      400: t.Object({ error: t.String() }),
      401: t.Object({ error: t.String() }),
      403: t.Object({ error: t.String() }),
      404: t.Object({ error: t.String() }),
    },
    detail: { summary: 'Delete user account (admin)', tags: ['Admin'] },
  });

  app.get(prefix + '/admin/tickets', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const ticketRepo = AppDataSource.getRepository(Ticket);
    const userRepo = AppDataSource.getRepository(User);

    const tickets = await ticketRepo.find({ order: { created: 'DESC' } });
    const userIds = [...new Set(tickets.map((t) => t.userId))];
    const users = await userRepo.findByIds(userIds);
    const userMap: Record<number, Pick<User, 'firstName' | 'lastName' | 'email'>> = {};
    for (const u of users) userMap[u.id] = { firstName: u.firstName, lastName: u.lastName, email: u.email };

    const result = tickets.map((t) => ({
      ...t,
      user: userMap[t.userId] ?? null,
    }));
    return result;
  }, {
    beforeHandle: authenticate,
    response: {
      200: t.Array(t.Any()),
      401: t.Object({ error: t.String() }),
      403: t.Object({ error: t.String() }),
    },
    detail: { summary: 'List all support tickets (admin)', tags: ['Admin'] },
  });

  app.put(prefix + '/admin/tickets/:id', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const ticketRepo = AppDataSource.getRepository(Ticket);
    const ticket = await ticketRepo.findOneBy({ id: Number(ctx.params.id) });
    if (!ticket) {
      ctx.set.status = 404;
      return { error: 'Ticket not found' };
    }
    const { status, adminReply } = ctx.body as any;
    if (status) ticket.status = status;
    if (adminReply !== undefined) ticket.adminReply = adminReply;
    await ticketRepo.save(ticket);
    return { success: true, ticket };
  }, {
    beforeHandle: authenticate,
    schema: {
      params: t.Object({ id: t.String() }),
      body: t.Object({ status: t.Optional(t.String()), adminReply: t.Optional(t.String()) }),
      response: {
        200: t.Object({ success: t.Boolean(), ticket: t.Any() }),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
    },
    detail: { summary: 'Update a ticket (admin)', tags: ['Admin'] },
  });

  app.get(prefix + '/admin/verifications', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const verRepo = AppDataSource.getRepository(IDVerification);
    const userRepo = AppDataSource.getRepository(User);

    const records = await verRepo.find({ order: { id: 'DESC' } });
    const userIds = [...new Set(records.map((r) => r.userId))];
    const users = await userRepo.findByIds(userIds);
    const userMap: Record<number, Pick<User, 'firstName' | 'lastName' | 'email'>> = {};
    for (const u of users) userMap[u.id] = { firstName: u.firstName, lastName: u.lastName, email: u.email };

    const result = records.map((r) => ({ ...r, user: userMap[r.userId] ?? null }));
    return result;
  }, {
    beforeHandle: authenticate,
    response: {
      200: t.Array(t.Any()),
      401: t.Object({ error: t.String() }),
      403: t.Object({ error: t.String() }),
    },
    detail: { summary: 'List ID verification records', tags: ['Admin'] },
  });

  app.put(prefix + '/admin/verifications/:id', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const verRepo = AppDataSource.getRepository(IDVerification);
    const userRepo = AppDataSource.getRepository(User);

    const rec = await verRepo.findOneBy({ id: Number(ctx.params.id) });
    if (!rec) {
      ctx.set.status = 404;
      return { error: 'Not found' };
    }
    const { status } = ctx.body as any;
    if (!['verified', 'failed'].includes(status)) {
      ctx.set.status = 400;
      return { error: 'status must be verified or failed' };
    }
    rec.status = status;
    if (status === 'verified') {
      rec.verifiedAt = new Date();
      await userRepo.update({ id: rec.userId }, { idVerified: true });
    } else {
      rec.verifiedAt = null;
      await userRepo.update({ id: rec.userId }, { idVerified: false });
    }
    await verRepo.save(rec);
    return { success: true, rec };
  }, {
    beforeHandle: authenticate,
    schema: {
      params: t.Object({ id: t.String() }),
      body: t.Object({ status: t.String() }),
      response: {
        200: t.Object({ success: t.Boolean(), rec: t.Any() }),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
    },
    detail: { summary: 'Update a verification record', tags: ['Admin'] },
  });

  app.delete(prefix + '/admin/verifications/:id', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const verRepo = AppDataSource.getRepository(IDVerification);
    const rec = await verRepo.findOneBy({ id: Number(ctx.params.id) });
    if (!rec) {
      ctx.set.status = 404;
      return { error: 'Not found' };
    }
    const uploadDir = process.cwd();
    for (const field of ['idDocumentUrl', 'selfieUrl'] as const) {
      const url = rec[field];
      if (url) {
        const filepath = path.join(uploadDir, url.replace(/^\//, ''));
        try { fs.unlinkSync(filepath); } catch { }
        rec[field] = null;
      }
    }
    await verRepo.save(rec);
    return { success: true, rec };
  }, {
    beforeHandle: authenticate,
    schema: {
      params: t.Object({ id: t.String() }),
      response: {
        200: t.Object({ success: t.Boolean(), rec: t.Any() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
    },
    detail: { summary: 'Delete files attached to a verification', tags: ['Admin'] },
  });

  app.get(prefix + '/admin/deletions', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const delRepo = AppDataSource.getRepository(DeletionRequest);
    const userRepo = AppDataSource.getRepository(User);

    const records = await delRepo.find({ order: { requestedAt: 'DESC' } });
    const userIds = [...new Set(records.map((r) => r.userId))];
    const users = await userRepo.findByIds(userIds);
    const userMap: Record<number, Pick<User, 'firstName' | 'lastName' | 'email'>> = {};
    for (const u of users) userMap[u.id] = { firstName: u.firstName, lastName: u.lastName, email: u.email };

    const result = records.map((r) => ({ ...r, user: userMap[r.userId] ?? null }));
    return result;
  }, {
    beforeHandle: authenticate,
    response: {
      200: t.Array(t.Any()),
      401: t.Object({ error: t.String() }),
      403: t.Object({ error: t.String() }),
    },
    detail: { summary: 'List account deletion requests', tags: ['Admin'] },
  });

  app.put(prefix + '/admin/deletions/:id', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const delRepo = AppDataSource.getRepository(DeletionRequest);
    const adminUser = ctx.user as User;
    const rec = await delRepo.findOneBy({ id: Number(ctx.params.id) });
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
    rec.approvedBy = adminUser.id;

    if (status === 'approved') {
      const userRepo = AppDataSource.getRepository(require('../models/user.entity').User);
      const targetUser = await userRepo.findOneBy({ id: rec.userId });
      if (targetUser) {
        targetUser.deletionRequested = true;
        targetUser.deletionApproved = true;
        targetUser.suspended = true;
        await userRepo.save(targetUser);
      }
    }

    await delRepo.save(rec);
    return { success: true, rec };
  }, {
    beforeHandle: authenticate,
    schema: {
      params: t.Object({ id: t.String() }),
      body: t.Object({ status: t.String() }),
      response: {
        200: t.Object({ success: t.Boolean(), rec: t.Any() }),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
    },
    detail: { summary: 'Approve or reject a deletion request', tags: ['Admin'] },
  });

  app.get(prefix + '/admin/nodes', async (ctx) => {
    const adminErr = requireAdminCtx(ctx);
    if (adminErr !== true) return adminErr;
    const nodeRepo = AppDataSource.getRepository(Node);
    const nodes = await nodeRepo.find();
    return nodes;
  }, {
    beforeHandle: authenticate,
    response: {
      200: t.Array(t.Any()),
      401: t.Object({ error: t.String() }),
      403: t.Object({ error: t.String() }),
    },
    detail: { summary: 'List all nodes', tags: ['Admin'] },
  });

  app.get(prefix + '/admin/organisations', async (ctx) => {
    const adminErr = requireAdminCtx(ctx);
    if (adminErr !== true) return adminErr;
    const orgRepo = AppDataSource.getRepository(Organisation);
    const userRepo = AppDataSource.getRepository(User);

    const orgs = await orgRepo.find();
    const ownerIds = [...new Set(orgs.map((o) => o.ownerId))];
    const owners = ownerIds.length ? await userRepo.findByIds(ownerIds) : [];
    const ownerMap: Record<number, Pick<User, 'firstName' | 'lastName' | 'email'>> = {};
    for (const u of owners) ownerMap[u.id] = { firstName: u.firstName, lastName: u.lastName, email: u.email };

    const memberCounts = await userRepo
      .createQueryBuilder('u')
      .select('u.orgId', 'orgId')
      .addSelect('COUNT(*)', 'count')
      .where('u.orgId IS NOT NULL')
      .groupBy('u.orgId')
      .getRawMany();
    const countMap: Record<number, number> = {};
    for (const row of memberCounts) countMap[Number(row.orgId)] = Number(row.count);

    const result = orgs.map((o) => ({
      ...o,
      owner: ownerMap[o.ownerId] ?? null,
      memberCount: countMap[o.id] ?? 0,
    }));

    return result;
  }, {
    beforeHandle: authenticate,
    response: {
      200: t.Array(t.Any()),
      401: t.Object({ error: t.String() }),
      403: t.Object({ error: t.String() }),
    },
    detail: { summary: 'List organisations with owners and member counts', tags: ['Admin'] },
  });

  app.put(prefix + '/admin/organisations/:id', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const orgRepo = AppDataSource.getRepository(Organisation);
    const org = await orgRepo.findOneBy({ id: Number(ctx.params.id) });
    if (!org) {
      ctx.set.status = 404;
      return { error: 'Organisation not found' };
    }

    const { name, handle, portalTier, ownerId } = ctx.body as any;
    if (name !== undefined) org.name = name;
    if (handle !== undefined) org.handle = handle;
    if (portalTier !== undefined) org.portalTier = portalTier;
    if (ownerId !== undefined) org.ownerId = Number(ownerId);

    await orgRepo.save(org);
    return { success: true, org };
  }, {
    beforeHandle: authenticate,
    schema: {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        name: t.Optional(t.String()),
        handle: t.Optional(t.String()),
        portalTier: t.Optional(t.String()),
        ownerId: t.Optional(t.Any()),
      }),
      response: {
        200: t.Object({ success: t.Boolean(), org: t.Any() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
    },
    detail: { summary: 'Update organisation settings', tags: ['Admin'] },
  });

  app.post(prefix + '/admin/organisations/:id/members', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const orgRepo = AppDataSource.getRepository(Organisation);
    const userRepo = AppDataSource.getRepository(User);
    const org = await orgRepo.findOneBy({ id: Number(ctx.params.id) });
    if (!org) {
      ctx.set.status = 404;
      return { error: 'Organisation not found' };
    }
    const { userId, orgRole = 'member' } = ctx.body as any;
    if (!userId) {
      ctx.set.status = 400;
      return { error: 'userId required' };
    }
    const target = await userRepo.findOneBy({ id: Number(userId) });
    if (!target) {
      ctx.set.status = 404;
      return { error: 'User not found' };
    }
    target.org = org;
    target.orgRole = orgRole;
    await userRepo.save(target);
    ctx.set.status = 201;
    return { success: true };
  }, {
    beforeHandle: authenticate,
    schema: {
      params: t.Object({ id: t.String() }),
      body: t.Object({ userId: t.Any(), orgRole: t.Optional(t.String()) }),
      response: {
        201: t.Object({ success: t.Boolean() }),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
    },
    detail: { summary: 'Add member to organisation', tags: ['Admin'] },
  });

  app.delete(prefix + '/admin/organisations/:id/members/:userId', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const userRepo = AppDataSource.getRepository(User);
    const target = await userRepo.findOne({ where: { id: Number(ctx.params.userId) }, relations: ['org'] });
    if (!target) {
      ctx.set.status = 404;
      return { error: 'User not found' };
    }
    target.org = undefined as any;
    target.orgRole = 'member';
    await userRepo.save(target);
    return { success: true };
  }, {
    beforeHandle: authenticate,
    schema: {
      params: t.Object({ id: t.String(), userId: t.String() }),
      response: {
        200: t.Object({ success: t.Boolean() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
    },
    detail: { summary: 'Remove member from organisation', tags: ['Admin'] },
  });

  app.delete(prefix + '/admin/organisations/:id', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const orgRepo = AppDataSource.getRepository(Organisation);
    const userRepo = AppDataSource.getRepository(User);
    const org = await orgRepo.findOneBy({ id: Number(ctx.params.id) });
    if (!org) {
      ctx.set.status = 404;
      return { error: 'Organisation not found' };
    }

    try {
      await userRepo
        .createQueryBuilder()
        .update(User)
        .set({ orgRole: 'member' })
        .where('orgId = :orgId', { orgId: org.id })
        .execute();

      await AppDataSource.createQueryRunner().query('UPDATE `user` SET `orgId` = NULL WHERE `orgId` = ?', [org.id]);

      await orgRepo.remove(org);
    } catch (e: any) {
      console.error('Failed to clear organisation members before delete:', e?.message || e);
      ctx.set.status = 500;
      return { error: 'Failed to delete organisation' };
    }
    return { success: true };
  }, {
    beforeHandle: authenticate,
    schema: {
      params: t.Object({ id: t.String() }),
      response: {
        200: t.Object({ success: t.Boolean() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
    },
    detail: { summary: 'Delete an organisation and clear members', tags: ['Admin'] },
  });

  app.get(prefix + '/admin/servers', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const nodeRepo = AppDataSource.getRepository(Node);
    const nodes = await nodeRepo.find();
    const cfgRepo = AppDataSource.getRepository(require('../models/serverConfig.entity').ServerConfig);
    try { await mergeDuplicateServerConfigs(); } catch (e) { /* skip */ }
    const configs = await cfgRepo.find();
    const cfgMap = new Map(configs.map((c: any) => [c.uuid, c]));
    let all: any[] = [];
    for (const n of nodes) {
      try {
        const svc = new WingsApiService(n.url, n.token);
        const res = await svc.getServers();
        const servers = res.data || [];
        for (const s of servers) {
          const uuid: string = s.configuration?.uuid || s.uuid;
          const cfg = cfgMap.get(uuid);
          all.push({ ...s, uuid, status: s.state || s.status || 'offline', name: cfg?.name || s.configuration?.meta?.name || s.name || uuid, nodeName: n.name, nodeId: n.id, eggId: cfg?.eggId || null });
        }
      } catch { }
    }

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    for (const c of configs) {
      if (all.some((s: any) => s.uuid === c.uuid)) continue;
      const node = nodeMap.get(c.nodeId);
      all.push({
        uuid: c.uuid,
        name: c.name || c.uuid,
        status: c.hibernated ? 'hibernated' : 'unknown',
        hibernated: !!c.hibernated,
        is_suspended: c.suspended,
        resources: null,
        build: { memory_limit: c.memory, disk_space: c.disk, cpu_limit: c.cpu },
        container: { image: c.dockerImage },
        nodeId: c.nodeId,
        nodeName: node?.name,
        userId: c.userId,
        eggId: c.eggId ?? null,
      });
    }

    const seen = new Set<string>();
    const deduped: any[] = [];
    for (const s of all) {
      try {
        const raw = s.uuid || (s.configuration && s.configuration.uuid) || '';
        const norm = String(raw).replace(/-/g, '').toLowerCase();
        if (!norm) {
          deduped.push(s);
          continue;
        }
        if (seen.has(norm)) {
          console.log('admin: duplicate server skipped', { uuid: raw, nodeId: s.nodeId, nodeName: s.nodeName });
          continue;
        }
        seen.add(norm);
        deduped.push(s);
      } catch (e) {
        deduped.push(s);
      }
    }

    return deduped;
  }, {
    beforeHandle: authenticate,
    response: {
      200: t.Array(t.Any()),
      401: t.Object({ error: t.String() }),
      403: t.Object({ error: t.String() }),
    },
    detail: { summary: 'List all servers across nodes', tags: ['Admin'] },
  });

  app.post(prefix + '/admin/servers/:id/power', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const serverId = ctx.params.id as string;
    const { action } = ctx.body as any;
    if (!['start', 'stop', 'restart', 'kill'].includes(action)) {
      ctx.set.status = 400;
      return { error: 'Invalid action. Must be start, stop, restart or kill.' };
    }
    const cfgRepo = AppDataSource.getRepository(require('../models/serverConfig.entity').ServerConfig);
    const cfg = await cfgRepo.findOneBy({ uuid: serverId });
    const node = cfg ? await AppDataSource.getRepository(Node).findOneBy({ id: cfg.nodeId }) : null;
    if (!node) {
      ctx.set.status = 404;
      return { error: 'Server not found' };
    }
    if (cfg?.hibernated && (action === 'start' || action === 'restart')) {
      ctx.set.status = 403;
      return { error: 'Server is hibernated and cannot be started or restarted' };
    }
    try {
      const svc = new WingsApiService(node.url, node.token);
      const res = await svc.powerServer(serverId, action);
      return { success: true, data: res.data };
    } catch (e: any) {
      const status = e?.response?.status || 502;
      const msg = e?.response?.data?.errors?.[0]?.detail || e?.response?.data?.error || e.message;
      ctx.set.status = status;
      return { error: msg };
    }
  }, {
    beforeHandle: authenticate,
    schema: {
      params: t.Object({ id: t.String() }),
      body: t.Object({ action: t.Enum({ start: 'start', stop: 'stop', restart: 'restart', kill: 'kill' }) }),
      response: {
        200: t.Object({ success: t.Boolean(), data: t.Any() }),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
    },
    detail: { summary: 'Power control for server', tags: ['Admin'] },
  });

  app.put(prefix + '/admin/servers/:id', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const serverId = ctx.params.id as string;
    const { name, description, userId, memory, disk, cpu, swap, ioWeight, oomDisabled, dockerImage, startup, environment, allocations, eggId, hibernated } = ctx.body as any;
    const cfgRepo = AppDataSource.getRepository(require('../models/serverConfig.entity').ServerConfig);
    const cfg = await cfgRepo.findOneBy({ uuid: serverId });
    if (!cfg) {
      ctx.set.status = 404;
      return { error: 'Server not found' };
    }
    if (name !== undefined) cfg.name = name;
    if (description !== undefined) cfg.description = description;
    if (userId !== undefined) cfg.userId = Number(userId);
    if (memory !== undefined) {
      const pm = parseSizeToMB(memory);
      if (pm === null || pm < 0) { ctx.set.status = 400; return { error: 'Invalid memory value' }; }
      cfg.memory = pm;
    }
    if (disk !== undefined) {
      const pd = parseSizeToMB(disk);
      if (pd === null || pd < 0) { ctx.set.status = 400; return { error: 'Invalid disk value' }; }
      cfg.disk = pd;
    }
    if (cpu !== undefined) {
      const pc = parseCpuInput(cpu);
      if (pc === null || pc < 0) { ctx.set.status = 400; return { error: 'Invalid cpu value' }; }
      cfg.cpu = pc;
    }
    if (swap !== undefined) cfg.swap = Number(swap);
    if (ioWeight !== undefined) cfg.ioWeight = Number(ioWeight);
    if (hibernated !== undefined) cfg.hibernated = Boolean(hibernated);

    if (cfg.memory != null && (!(Number.isFinite(Number(cfg.memory)) && Number(cfg.memory) >= 0))) {
      ctx.set.status = 400; return { error: 'Invalid memory value' };
    }
    if (cfg.disk != null && (!(Number.isFinite(Number(cfg.disk)) && Number(cfg.disk) >= 0))) {
      ctx.set.status = 400; return { error: 'Invalid disk value' };
    }
    if (cfg.cpu != null && (!(Number.isFinite(Number(cfg.cpu)) && Number(cfg.cpu) >= 0))) {
      ctx.set.status = 400; return { error: 'Invalid cpu value' };
    }
    if (oomDisabled !== undefined) cfg.oomDisabled = Boolean(oomDisabled);
    if (dockerImage !== undefined) cfg.dockerImage = dockerImage;
    if (startup !== undefined) cfg.startup = startup;
    if (environment !== undefined) cfg.environment = environment;
    if (eggId !== undefined) cfg.eggId = Number(eggId);
    if (allocations !== undefined) {
      if (Array.isArray(allocations) && allocations.length > 0) {
        const defAlloc = allocations.find((a: any) => a.is_default) || allocations[0];
        const mappings: Record<string, number[]> = {};
        const fqdns: Record<string, string> = {};
        for (const a of allocations) {
          const ip = String(a.ip);
          if (!mappings[ip]) mappings[ip] = [];
          mappings[ip].push(Number(a.port));
          if (a.fqdn) fqdns[`${ip}:${a.port}`] = String(a.fqdn);
        }
        cfg.allocations = { default: { ip: String(defAlloc.ip), port: Number(defAlloc.port) }, mappings, ...(Object.keys(fqdns).length > 0 ? { fqdns } : {}) } as any;
      } else {
        cfg.allocations = null as any;
      }
    }
    await cfgRepo.save(cfg);
    const node = await AppDataSource.getRepository(Node).findOneBy({ id: cfg.nodeId });
    if (node) {
      const svc = new WingsApiService(node.url, node.token);
      await svc.syncServer(serverId, {}).catch(() => { });
    }
    return { success: true, server: cfg };
  }, {
    beforeHandle: authenticate,
    schema: {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        name: t.Optional(t.String()),
        description: t.Optional(t.String()),
        userId: t.Optional(t.Any()),
        memory: t.Optional(t.Any()),
        disk: t.Optional(t.Any()),
        cpu: t.Optional(t.Any()),
        swap: t.Optional(t.Any()),
        ioWeight: t.Optional(t.Any()),
        oomDisabled: t.Optional(t.Boolean()),
        dockerImage: t.Optional(t.String()),
        startup: t.Optional(t.String()),
        environment: t.Optional(t.Any()),
        allocations: t.Optional(t.Any()),
        eggId: t.Optional(t.Any()),
        hibernated: t.Optional(t.Boolean()),
      }),
      response: {
        200: t.Object({ success: t.Boolean(), server: t.Any() }),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
    },
    detail: { summary: 'Edit server configuration', tags: ['Admin'] },
  });

  app.delete(prefix + '/admin/servers/:id', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const serverId = ctx.params.id as string;
    const nodeRepo = AppDataSource.getRepository(Node);
    const nodes = await nodeRepo.find();
    for (const n of nodes) {
      try {
        const svc = new WingsApiService(n.url, n.token);
        await svc.getServer(serverId);
        await svc.serverRequest(serverId, '', 'delete');
        await removeServerConfig(serverId);
        return { success: true };
      } catch { }
    }
    ctx.set.status = 404;
    return { error: 'Server not found on any node' };
  }, {
    beforeHandle: authenticate,
    schema: {
      params: t.Object({ id: t.String() }),
      response: {
        200: t.Object({ success: t.Boolean() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
    },
    detail: { summary: 'Delete a server from any node', tags: ['Admin'] },
  });

  app.post(prefix + '/admin/servers', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const { nodeId, userId, eggId, name } = ctx.body as any;
    let memory = (ctx.body as any).memory ?? 1024;
    let disk = (ctx.body as any).disk ?? 10240;
    let cpu = (ctx.body as any).cpu ?? 100;

    const parsedMemory = parseSizeToMB(memory);
    const parsedDisk = parseSizeToMB(disk);
    const parsedCpu = parseCpuInput(cpu);
    if (parsedMemory === null || parsedMemory < 0) { ctx.set.status = 400; return { error: 'Invalid memory value' }; }
    if (parsedDisk === null || parsedDisk < 0) { ctx.set.status = 400; return { error: 'Invalid disk value' }; }
    if (parsedCpu === null || parsedCpu < 0) { ctx.set.status = 400; return { error: 'Invalid cpu value' }; }
    memory = parsedMemory;
    disk = parsedDisk;
    cpu = parsedCpu;
    if (!nodeId) {
      ctx.set.status = 400;
      return { error: 'nodeId is required' };
    }

    const ownerId: number = userId ? Number(userId) : ctx.user?.id;

    const node = await AppDataSource.getRepository(Node).findOneBy({ id: Number(nodeId) });
    if (!node) {
      ctx.set.status = 404;
      return { error: 'Node not found' };
    }

    const serverUuid = uuidv4();
    let dockerImage = 'ghcr.io/pterodactyl/yolks:nodejs_18';
    let startup = 'node index.js';
    let envObject: Record<string, string> = {};

    if (eggId) {
      const egg = await AppDataSource.getRepository(Egg).findOneBy({ id: Number(eggId) });
      if (egg) {
        dockerImage = egg.dockerImage || dockerImage;
        startup = egg.startup || startup;
        for (const entry of ((egg.envVars || []) as any[])) {
          if (typeof entry === 'string') {
            const [k, ...rest] = (entry as string).split('=');
            if (k) envObject[k.trim()] = rest.join('=').trim();
          } else if (entry && typeof entry === 'object') {
            const k = entry.name || entry.key;
            if (k) envObject[k] = String(entry.defaultValue ?? entry.value ?? '');
          }
        }
      }
    }

    const wingsPayload = {
      uuid: serverUuid,
      start_on_completion: false,
      skip_scripts: false,
      environment: envObject,
      build: {
        memory_limit: Number(memory),
        swap: 0,
        disk_space: Number(disk),
        io_weight: 500,
        cpu_limit: Number(cpu),
        threads: null,
      },
      container: { image: dockerImage, startup },
      ...(name ? { name } : {}),
    };

    try {
      const svc = new WingsApiService(node.url, node.token);
      const res = await svc.createServer(wingsPayload);
      const nodeSvc = new NodeService();
      await nodeSvc.mapServer(serverUuid, node.id);
      await saveServerConfig({
        uuid: serverUuid,
        nodeId: node.id,
        userId: ownerId,
        name: name || undefined,
        dockerImage,
        startup,
        environment: envObject,
        memory: Number(memory),
        disk: Number(disk),
        cpu: Number(cpu),
        eggId: eggId ? Number(eggId) : undefined,
      });
      const logRepo = AppDataSource.getRepository(UserLog);
      await logRepo.save(logRepo.create({ userId: ownerId, action: 'admin-create-server', timestamp: new Date() }));
      return { uuid: serverUuid, nodeId: node.id, ...res.data };
    } catch (e: any) {
      ctx.set.status = 502;
      return { error: e.message };
    }
  }, {
    beforeHandle: authenticate,
    schema: {
      body: t.Object({
        nodeId: t.Any(),
        userId: t.Optional(t.Any()),
        eggId: t.Optional(t.Any()),
        name: t.Optional(t.String()),
        memory: t.Optional(t.Any()),
        disk: t.Optional(t.Any()),
        cpu: t.Optional(t.Any()),
      }),
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
        502: t.Object({ error: t.String() }),
      },
    },
    detail: { summary: 'Create a new server on a node', tags: ['Admin'] },
  });

  app.post(prefix + '/admin/sync-wings', async (ctx: any) => {
    if (!requireAdminCtx(ctx)) return;
    const nodeRepo = AppDataSource.getRepository(Node);
    const cfgRepo = AppDataSource.getRepository(ServerConfig);

    const nodes = await nodeRepo.find();
    const configs = await cfgRepo.find();
    const results: any[] = [];

    for (const cfg of configs) {
      const node = nodes.find(n => n.id === cfg.nodeId);
      if (!node) {
        results.push({ uuid: cfg.uuid, status: 'node_not_found' });
        continue;
      }
      try {
        const svc = new WingsApiService(node.url, node.token);
        try {
          await svc.getServer(cfg.uuid);
          results.push({ uuid: cfg.uuid, status: 'exists', nodeId: node.id });
          continue;
        } catch (e: any) {
          const status = e?.response?.status;
          if (status === 401 || status === 403) {
            results.push({ uuid: cfg.uuid, status: 'auth_failed', nodeId: node.id });
            continue;
          }
          // skip
        }

        const egg = cfg.eggId ? await AppDataSource.getRepository(Egg).findOneBy({ id: cfg.eggId }) : null;
        const mounts = await AppDataSource.getRepository(ServerMount).findBy({ serverUuid: cfg.uuid });
        const mountEntities: any[] = [];
        if (mounts && mounts.length) {
          const mountIds = mounts.map((m: any) => m.mountId);
          const allMounts = await AppDataSource.getRepository(Mount).findBy({ id: In(mountIds) });
          for (const m of mounts) {
            const found = allMounts.find((am: any) => am.id === m.mountId);
            if (found) mountEntities.push(found);
          }
        }

        const payload: any = {
          uuid: cfg.uuid,
          start_on_completion: false,
          skip_scripts: !!cfg.skipEggScripts,
          environment: cfg.environment || {},
          build: {
            memory_limit: cfg.memory || 0,
            swap: cfg.swap || 0,
            disk_space: cfg.disk || 0,
            io_weight: cfg.ioWeight || 0,
            cpu_limit: cfg.cpu || 0,
            threads: null,
          },
          container: {
            image: cfg.dockerImage || (egg ? egg.dockerImage : undefined) || 'ghcr.io/pterodactyl/yolks:nodejs_18',
            startup: cfg.startup || (egg ? egg.startup : undefined) || 'node index.js',
          },
        };
        if (cfg.name) payload.name = cfg.name;
        if (cfg.description) payload.meta = { description: cfg.description };

        const res = await svc.createServer(payload);
        results.push({ uuid: cfg.uuid, status: 'created', nodeId: node.id, wingsStatus: res.status });
      } catch (err: any) {
        results.push({ uuid: cfg.uuid, status: 'error', message: err?.message || String(err) });
      }
    }

    return { results };
  }, {
    beforeHandle: authenticate,
    detail: { summary: 'Synchronize all server configs to Wings (admin)', tags: ['Admin'] },
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) }
  });

  // SO YOU DECIDED TO GO AGAINST LORDS WISHES HUH? 
  // WELL NOW YOUR SERVER IS SUSPENDED, HAVE FUN CRYING TO SUPPORT ABOUT IT
  app.post(prefix + '/admin/servers/:id/suspend', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const serverId = ctx.params.id as string;
    const nodes = await AppDataSource.getRepository(Node).find();
    for (const n of nodes) {
      try {
        const svc = new WingsApiService(n.url, n.token);
        await svc.getServer(serverId);
        await svc.powerServer(serverId, 'kill').catch(() => { });
        await svc.syncServer(serverId, { suspended: true });
        const cfgRepo = AppDataSource.getRepository(require('../models/serverConfig.entity').ServerConfig);
        await cfgRepo.update({ uuid: serverId }, { suspended: true });
        return { success: true };
      } catch { }
    }
    ctx.set.status = 404;
    return { error: 'Server not found on any node' };
  }, {
    beforeHandle: authenticate,
    schema: {
      params: t.Object({ id: t.String() }),
      response: {
        200: t.Object({ success: t.Boolean() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
    },
    detail: { summary: 'Suspend a server across nodes', tags: ['Admin'] },
  });

  app.post(prefix + '/admin/servers/:id/unsuspend', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const serverId = ctx.params.id as string;
    const nodes = await AppDataSource.getRepository(Node).find();
    for (const n of nodes) {
      try {
        const svc = new WingsApiService(n.url, n.token);
        await svc.getServer(serverId);
        await svc.syncServer(serverId, { suspended: false });
        const cfgRepo = AppDataSource.getRepository(require('../models/serverConfig.entity').ServerConfig);
        await cfgRepo.update({ uuid: serverId }, { suspended: false });
        return { success: true };
      } catch { }
    }
    ctx.set.status = 404;
    return { error: 'Server not found on any node' };
  }, {
    beforeHandle: authenticate,
    schema: {
      params: t.Object({ id: t.String() }),
      response: {
        200: t.Object({ success: t.Boolean() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
    },
    detail: { summary: 'Unsuspend a server across nodes', tags: ['Admin'] },
  });

  app.post(prefix + '/admin/servers/sync-from-wings', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const admin = ctx.user as User;
    const cfgRepo = AppDataSource.getRepository(require('../models/serverConfig.entity').ServerConfig);
    const ServerMapping = require('../models/serverMapping.entity').ServerMapping;
    const mappingRepo = AppDataSource.getRepository(ServerMapping);
    const nodes = await AppDataSource.getRepository(Node).find();

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const n of nodes) {
      try {
        const svc = new WingsApiService(n.url, n.token);
        const res = await svc.getServers();
        const servers: any[] = Array.isArray(res.data) ? res.data : (res.data?.servers ?? []);

        for (const s of servers) {
          const uuid: string = s.configuration?.uuid || s.uuid || s.id;
          if (!uuid) continue;

          const existing = await cfgRepo.findOneBy({ uuid });
          if (existing) { skipped++; continue; }

          const existingMap = await mappingRepo.findOneBy({ uuid });
          if (!existingMap) {
            await mappingRepo.save(mappingRepo.create({ uuid, nodeId: n.id }));
          }

          const userId: number = s.user ?? s.owner ?? admin.id;

          await cfgRepo.save(cfgRepo.create({
            uuid,
            nodeId: n.id,
            userId,
            name: s.configuration?.meta?.name ?? s.name ?? uuid,
            suspended: s.suspended ?? false,
            dockerImage: s.container?.image ?? s.image ?? '',
            startup: s.invocation ?? s.startup ?? '',
            environment: s.environment ?? {},
            memory: s.build?.memory_limit ?? s.limits?.memory ?? 1024,
            disk: s.build?.disk_space ?? s.limits?.disk ?? 10240,
            cpu: s.build?.cpu_limit ?? s.limits?.cpu ?? 100,
            swap: s.build?.swap ?? 0,
            ioWeight: s.build?.io_weight ?? 500,
            oomDisabled: s.build?.oom_disabled ?? true,
          }));
          created++;
        }
      } catch (e: any) {
        errors.push(`Node ${n.name ?? n.id}: ${e.message}`);
      }
    }

    return { success: true, created, skipped, errors };
  }, {
    beforeHandle: authenticate,
    response: {
      200: t.Object({ success: t.Boolean(), created: t.Number(), skipped: t.Number(), errors: t.Array(t.String()) }),
      401: t.Object({ error: t.String() }),
      403: t.Object({ error: t.String() }),
    },
    detail: { summary: 'Synchronize servers from Wings nodes', tags: ['Admin'] },
  });

  app.get(prefix + '/admin/users/:id/profile', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const userId = Number(ctx.params.id);
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOneBy({ id: userId });
    if (!user) {
      ctx.set.status = 404;
      return { error: 'User not found' };
    }

    const AIModelUser = require('../models/aiModelUser.entity').AIModelUser;
    const modelUserRepo = AppDataSource.getRepository(AIModelUser);
    const aiLinks = await modelUserRepo.find({ where: { user: { id: userId } }, relations: ['model'] });

    const servers: any[] = [];
    const nodes = await AppDataSource.getRepository(Node).find();
    for (const n of nodes) {
      try {
        const svc = new WingsApiService(n.url, n.token);
        const res = await svc.getServers();
        for (const s of (res.data || [])) {
          if (s.owner === userId || s.user === userId) {
            servers.push({ ...s, nodeName: n.name, nodeId: n.id });
          }
        }
      } catch { }
    }

    const Order = require('../models/order.entity').Order;
    const orders = await AppDataSource.getRepository(Order).find({ where: { userId } });

    const out: any = { ...user };
    delete out.passwordHash;
    delete out.sessions;
    out.aiModels = aiLinks.map((l: any) => ({ id: l.id, model: l.model, limits: l.limits }));
    out.servers = servers;
    out.orders = orders;
    return out;
  }, {
    beforeHandle: authenticate,
    schema: {
      params: t.Object({ id: t.String() }),
      response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    },
    detail: { summary: 'Get detailed profile for a user', tags: ['Admin'] },
  });

  app.delete('/admin/users/:id/ai/:linkId', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const AIModelUser = require('../models/aiModelUser.entity').AIModelUser;
    const repo = AppDataSource.getRepository(AIModelUser);
    const link = await repo.findOneBy({ id: Number(ctx.params.linkId) });
    if (!link) {
      ctx.set.status = 404;
      return { error: 'Link not found' };
    }
    await repo.remove(link);
    return { success: true };
  }, {
    beforeHandle: authenticate,
    schema: {
      params: t.Object({ id: t.String(), linkId: t.String() }),
      response: { 200: t.Object({ success: t.Boolean() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    },
    detail: { summary: 'Remove an AI model link for user', tags: ['Admin'] },
  });

  app.put(prefix + '/admin/users/:id/ai/:linkId', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const AIModelUser = require('../models/aiModelUser.entity').AIModelUser;
    const repo = AppDataSource.getRepository(AIModelUser);
    const link = await repo.findOneBy({ id: Number(ctx.params.linkId) });
    if (!link) {
      ctx.set.status = 404;
      return { error: 'Link not found' };
    }
    const { limits } = ctx.body as any;
    if (limits !== undefined) link.limits = limits;
    await repo.save(link);
    return { success: true, link };
  }, {
    beforeHandle: authenticate,
    schema: {
      params: t.Object({ id: t.String(), linkId: t.String() }),
      body: t.Object({ limits: t.Optional(t.Any()) }),
      response: { 200: t.Object({ success: t.Boolean(), link: t.Any() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    },
    detail: { summary: 'Update limits on AI model link', tags: ['Admin'] },
  });

  app.get(prefix + '/admin/logs', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const { userId, limit = 200, type = 'audit' } = ctx.query as any;
    const lim = Math.min(Number(limit), 500);

    if (type === 'requests') {
      const qb = AppDataSource.getRepository(ApiRequestLog)
        .createQueryBuilder('l')
        .orderBy('l.timestamp', 'DESC')
        .take(lim);
      if (userId) qb.where('l.userId = :uid', { uid: Number(userId) });
      const logs = await qb.getMany();
      return logs;
    }

    const qb = AppDataSource.getRepository(UserLog)
      .createQueryBuilder('l')
      .orderBy('l.timestamp', 'DESC')
      .take(lim);
    if (userId) qb.where('l.userId = :uid', { uid: Number(userId) });
    const entries = await qb.getMany();

    const userIds = [...new Set(entries.map((e) => e.userId).filter(Boolean))];
    const userMap: Record<number, { username: string; email: string }> = {};
    if (userIds.length > 0) {
      const users = await AppDataSource.getRepository(User)
        .createQueryBuilder('u')
        .select(['u.id', 'u.firstName', 'u.lastName', 'u.email'])
        .where('u.id IN (:...ids)', { ids: userIds })
        .getMany();
      users.forEach((u) => { userMap[u.id] = { username: `${u.firstName} ${u.lastName}`.trim(), email: u.email }; });
    }

    const logs = entries.map((e) => ({
      ...e,
      username: userMap[e.userId]?.username ?? null,
      email: userMap[e.userId]?.email ?? null,
    }));
    return logs;
  }, {
    beforeHandle: authenticate,
    schema: {
      query: t.Object({
        userId: t.Optional(t.Any()),
        limit: t.Optional(t.Number()),
        type: t.Optional(t.String()),
      }),
      response: {
        200: t.Array(t.Any()),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
      },
    },
    detail: { summary: 'Fetch audit or request logs', tags: ['Admin'] },
  });

  app.get(prefix + '/admin/fraud-alerts', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const userRepo = AppDataSource.getRepository(User);
    const flagged = await userRepo.find({ where: { fraudFlag: true }, order: { fraudDetectedAt: 'DESC' } });
    return flagged.map((u) => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      displayName: u.displayName,
      email: u.email,
      address: u.address,
      address2: u.address2,
      phone: u.phone,
      billingCompany: u.billingCompany,
      billingCity: u.billingCity,
      billingState: u.billingState,
      billingZip: u.billingZip,
      billingCountry: u.billingCountry,
      fraudReason: u.fraudReason,
      fraudDetectedAt: u.fraudDetectedAt,
      suspended: u.suspended,
    }));
  }, {
    beforeHandle: authenticate,
    response: {
      200: t.Array(t.Any()),
      401: t.Object({ error: t.String() }),
      403: t.Object({ error: t.String() }),
    },
    detail: { summary: 'List users flagged for fraud', tags: ['Admin'] },
  });

  // Grand Architector decided to add this... 
  // now you have no excuse to not use it and let the AI do the 
  // hard work of finding fraudsters for you
  app.post(prefix + '/admin/fraud-scan/:id', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const userId = Number(ctx.params.id);
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOneBy({ id: userId });
    if (!user) {
      ctx.set.status = 404;
      return { error: 'User not found' };
    }

    const modelRepo = AppDataSource.getRepository(AIModel);
    const models = await modelRepo.find();
    const model = models[0];
    if (!model) {
      ctx.set.status = 400;
      return { error: 'No AI model configured. Add one in AI Models settings.' };
    }

    const billingInfo = {
      legalName: `${user.firstName} ${user.middleName ? user.middleName + ' ' : ''}${user.lastName}`.trim(),
      email: user.email,
      address: user.address,
      address2: user.address2 || null,
      phone: user.phone || null,
      company: user.billingCompany || null,
      city: user.billingCity || null,
      state: user.billingState || null,
      zip: user.billingZip || null,
      country: user.billingCountry || null,
    };

    const systemPrompt = `You are a fraud detection analyst for a web hosting billing system. Analyze the following user billing information and determine if it looks fraudulent, fake, or suspicious.

Check for:
- Government buildings, embassies, military bases used as addresses
- Clearly fake names (e.g. "John Doe", "Test User", "asdf asdf")
- Mismatched or nonsensical addresses (e.g. "123 Fake Street")
- Phone numbers that are clearly invalid or placeholder
- Known fraud patterns in hosting (prepaid VoIP numbers, disposable email patterns)
- Company names that are obviously fake
- Addresses that don't exist or are famous landmarks/buildings

Respond with ONLY a JSON object (no markdown, no code fences):
{"fraudScore": <0-100>, "isSuspicious": <true|false>, "reasons": ["reason1", "reason2"]}

fraudScore: 0 = definitely legitimate, 100 = definitely fraudulent
isSuspicious: true if fraudScore >= 50`;

    try {
      const baseUrl = (model.endpoint || '').replace(/\/+$/, '').replace(/(\/v1(\/chat(\/completions)?)?)?$/, '');
      const chatUrl = `${baseUrl}/v1/chat/completions`;
      const res = await axios.post(
        chatUrl,
        {
          model: model.config?.modelId || model.name,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Analyze this user billing information:\n${JSON.stringify(billingInfo, null, 2)}` },
          ],
          max_tokens: 1024,
        },
        { headers: { Authorization: `Bearer ${model.apiKey || 'none'}`, 'Content-Type': 'application/json' }, timeout: 30000 }
      );

      const aiReply = res.data?.choices?.[0]?.message?.content || '';
      let result: any;
      try {
        const cleaned = aiReply.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
        result = JSON.parse(cleaned);
      } catch {
        result = { fraudScore: 0, isSuspicious: false, reasons: ['AI response could not be parsed: ' + aiReply.slice(0, 200)] };
      }

      if (result.isSuspicious) {
        user.fraudFlag = true;
        user.fraudReason = result.reasons?.join('; ') || 'Suspicious billing information';
        user.fraudDetectedAt = new Date();
        await userRepo.save(user);
      } else if (user.fraudFlag) {
        user.fraudFlag = false;
        user.fraudReason = undefined;
        user.fraudDetectedAt = undefined;
        await userRepo.save(user);
      }

      return { success: true, userId: user.id, ...result };
    } catch (err: any) {
      const status = err.response?.status;
      const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      ctx.set.status = 500;
      return { error: `AI fraud scan failed (${status ?? 'network'}): ${detail}` };
    }
  }, {
    beforeHandle: authenticate,
    schema: {
      params: t.Object({ id: t.String() }),
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
        500: t.Object({ error: t.String() }),
      },
    },
    detail: { summary: 'Run fraud AI scan on a user', tags: ['Admin'] },
  });

  app.post(prefix + '/admin/fraud-scan-all', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const userRepo = AppDataSource.getRepository(User);
    const users = await userRepo.find();
    const modelRepo = AppDataSource.getRepository(AIModel);
    const models = await modelRepo.find();
    const model = models[0];
    if (!model) {
      ctx.set.status = 400;
      return { error: 'No AI model configured.' };
    }

    const results: any[] = [];
    for (const user of users) {
      const billingInfo = {
        legalName: `${user.firstName} ${user.middleName ? user.middleName + ' ' : ''}${user.lastName}`.trim(),
        email: user.email,
        address: user.address,
        address2: user.address2 || null,
        phone: user.phone || null,
        company: user.billingCompany || null,
        city: user.billingCity || null,
        state: user.billingState || null,
        zip: user.billingZip || null,
        country: user.billingCountry || null,
      };

      try {
        const baseUrl = (model.endpoint || '').replace(/\/+$/, '').replace(/(\/v1(\/chat(\/completions)?)?)?$/, '');
        const chatUrl = `${baseUrl}/v1/chat/completions`;
        const res = await axios.post(
          chatUrl,
          {
            model: model.config?.modelId || model.name,
            messages: [
              { role: 'system', content: `You are a fraud detection analyst. Analyze the billing info and respond with ONLY JSON: {"fraudScore": <0-100>, "isSuspicious": <true|false>, "reasons": ["..."]}` },
              { role: 'user', content: JSON.stringify(billingInfo) },
            ],
            max_tokens: 512,
          },
          { headers: { Authorization: `Bearer ${model.apiKey || 'none'}`, 'Content-Type': 'application/json' }, timeout: 30000 }
        );
        const aiReply = res.data?.choices?.[0]?.message?.content || '';
        let result: any;
        try {
          const cleaned = aiReply.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
          result = JSON.parse(cleaned);
        } catch {
          result = { fraudScore: 0, isSuspicious: false, reasons: [] };
        }

        if (result.isSuspicious) {
          user.fraudFlag = true;
          user.fraudReason = result.reasons?.join('; ') || 'Suspicious';
          user.fraudDetectedAt = new Date();
          await userRepo.save(user);
          results.push({ userId: user.id, email: user.email, ...result });
        } else if (user.fraudFlag) {
          user.fraudFlag = false;
          user.fraudReason = undefined;
          user.fraudDetectedAt = undefined;
          await userRepo.save(user);
        }
      } catch {
        // skip
      }
    }

    return { success: true, flagged: results.length, results };
  }, {
    beforeHandle: authenticate,
    response: {
      200: t.Object({ success: t.Boolean(), flagged: t.Number(), results: t.Array(t.Any()) }),
      401: t.Object({ error: t.String() }),
      403: t.Object({ error: t.String() }),
      400: t.Object({ error: t.String() }),
    },
    detail: { summary: 'Run fraud scan on all users', tags: ['Admin'] },
  });

  app.put(prefix + '/admin/fraud-alerts/:id', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const userId = Number(ctx.params.id);
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOneBy({ id: userId });
    if (!user) {
      ctx.set.status = 404;
      return { error: 'User not found' };
    }
    const { action } = ctx.body as any;
    if (action === 'dismiss') {
      user.fraudFlag = false;
      user.fraudReason = undefined;
      user.fraudDetectedAt = undefined;
    } else if (action === 'suspend') {
      user.suspended = true;
    }
    await userRepo.save(user);
    return { success: true };
  }, {
    beforeHandle: authenticate,
    schema: {
      params: t.Object({ id: t.String() }),
      body: t.Object({ action: t.String() }),
      response: {
        200: t.Object({ success: t.Boolean() }),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
    },
    detail: { summary: 'Take action on a fraud alert', tags: ['Admin'] },
  });

  app.get(prefix + '/panel/settings', async (_ctx) => {
    const repo = AppDataSource.getRepository(PanelSetting);
    const rows = await repo.find();
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    let portalDescriptions: any = null;
    if (map['portalDescriptions']) {
      try { portalDescriptions = JSON.parse(map['portalDescriptions']); } catch { }
    }
    return {
      registrationEnabled: map['registrationEnabled'] !== 'false',
      registrationNotice: map['registrationNotice'] || '',
      portalDescriptions: portalDescriptions || null,
    };
  }, {
    response: {
      200: t.Object({
        registrationEnabled: t.Boolean(),
        registrationNotice: t.String(),
        portalDescriptions: t.Optional(t.Any()),
      }),
    },
    detail: { summary: 'Fetch public portal settings', tags: ['Admin'] },
  });

  app.get(prefix + '/admin/settings', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const repo = AppDataSource.getRepository(PanelSetting);
    const rows = await repo.find();
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    let portalDescriptions: any = null;
    if (map['portalDescriptions']) {
      try { portalDescriptions = JSON.parse(map['portalDescriptions']); } catch { }
    }
    return {
      registrationEnabled: map['registrationEnabled'] !== 'false',
      registrationNotice: map['registrationNotice'] || '',
      portalDescriptions: portalDescriptions || null,
    };
  }, {
    beforeHandle: authenticate,
    response: {
      200: t.Object({
        registrationEnabled: t.Boolean(),
        registrationNotice: t.String(),
        portalDescriptions: t.Optional(t.Any()),
      }),
      401: t.Object({ error: t.String() }),
      403: t.Object({ error: t.String() }),
    },
    detail: { summary: 'Fetch admin portal settings', tags: ['Admin'] },
  });

  /**
   * You better dont know how to use this endpoint or else you might break 
   * the portal descriptions and cause a lot of work for yourself trying to fix it 
   * by hand in the database... (HAPPENED TWICE!!)
   */
  app.put(prefix + '/admin/settings', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const repo = AppDataSource.getRepository(PanelSetting);
    const body = ctx.body as any;
    const allowed = ['registrationEnabled', 'registrationNotice'];
    for (const key of allowed) {
      if (body[key] !== undefined) {
        const value = typeof body[key] === 'boolean' ? String(body[key]) : String(body[key]);
        await repo.save({ key, value });
      }
    }
    if (body.portalDescriptions !== undefined) {
      await repo.save({ key: 'portalDescriptions', value: JSON.stringify(body.portalDescriptions) });
    }
    const rows = await repo.find();
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    let portalDescriptions: any = null;
    if (map['portalDescriptions']) {
      try { portalDescriptions = JSON.parse(map['portalDescriptions']); } catch { }
    }
    return {
      success: true,
      settings: {
        registrationEnabled: map['registrationEnabled'] !== 'false',
        registrationNotice: map['registrationNotice'] || '',
        portalDescriptions: portalDescriptions || null,
      },
    };
  }, {
    beforeHandle: authenticate,
    schema: {
      body: t.Object({
        registrationEnabled: t.Optional(t.Boolean()),
        registrationNotice: t.Optional(t.String()),
        portalDescriptions: t.Optional(t.Any()),
      }),
      response: {
        200: t.Object({ success: t.Boolean(), settings: t.Any() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
      },
    },
    detail: { summary: 'Update portal settings', tags: ['Admin'] },
  });

  // TODO: Check if it works
  app.get(prefix + '/admin/mounts', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const mounts = await AppDataSource.getRepository(Mount).find({ order: { name: 'ASC' } });
    return mounts;
  }, {
    beforeHandle: authenticate,
    response: {
      200: t.Array(t.Any()),
      401: t.Object({ error: t.String() }),
      403: t.Object({ error: t.String() }),
    },
    detail: { summary: 'List all mounts', tags: ['Admin'] },
  });

  app.post(prefix + '/admin/mounts', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const { name, description, source, target, read_only, allowed_eggs } = ctx.body as any;
    if (!name || !source || !target) {
      ctx.set.status = 400;
      return { error: 'name, source, and target are required' };
    }
    const repo = AppDataSource.getRepository(Mount);
    const mount = repo.create({ name, description, source, target, read_only: !!read_only, allowed_eggs });
    await repo.save(mount);
    ctx.set.status = 201;
    return mount;
  }, {
    beforeHandle: authenticate,
    schema: {
      body: t.Object({
        name: t.String(),
        description: t.Optional(t.String()),
        source: t.String(),
        target: t.String(),
        read_only: t.Optional(t.Boolean()),
        allowed_eggs: t.Optional(t.Any()),
      }),
      response: {
        201: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
      },
    },
    detail: { summary: 'Create a mount', tags: ['Admin'] },
  });

  app.put(prefix + '/admin/mounts/:id', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const repo = AppDataSource.getRepository(Mount);
    const mount = await repo.findOneBy({ id: Number(ctx.params.id) });
    if (!mount) {
      ctx.set.status = 404;
      return { error: 'Mount not found' };
    }
    const { name, description, source, target, read_only, allowed_eggs } = ctx.body as any;
    if (name !== undefined) mount.name = name;
    if (description !== undefined) mount.description = description;
    if (source !== undefined) mount.source = source;
    if (target !== undefined) mount.target = target;
    if (read_only !== undefined) mount.read_only = !!read_only;
    if (allowed_eggs !== undefined) mount.allowed_eggs = allowed_eggs;
    await repo.save(mount);
    return mount;
  }, {
    beforeHandle: authenticate,
    schema: {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        name: t.Optional(t.String()),
        description: t.Optional(t.String()),
        source: t.Optional(t.String()),
        target: t.Optional(t.String()),
        read_only: t.Optional(t.Boolean()),
        allowed_eggs: t.Optional(t.Any()),
      }),
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
    },
    detail: { summary: 'Update a mount', tags: ['Admin'] },
  });

  app.delete(prefix + '/admin/mounts/:id', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const id = Number(ctx.params.id);
    const repo = AppDataSource.getRepository(Mount);
    const mount = await repo.findOneBy({ id });
    if (!mount) {
      ctx.set.status = 404;
      return { error: 'Mount not found' };
    }
    await AppDataSource.getRepository(ServerMount).delete({ mountId: id });
    await repo.remove(mount);
    return { success: true };
  }, {
    beforeHandle: authenticate,
    schema: {
      params: t.Object({ id: t.String() }),
      response: {
        200: t.Object({ success: t.Boolean() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
    },
    detail: { summary: 'Delete a mount', tags: ['Admin'] },
  });

  app.post(prefix + '/admin/servers/:id/mounts', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const { id: uuid } = ctx.params as any;
    const { mountId } = ctx.body as any;
    if (!mountId) {
      ctx.set.status = 400;
      return { error: 'mountId is required' };
    }
    const mount = await AppDataSource.getRepository(Mount).findOneBy({ id: Number(mountId) });
    if (!mount) {
      ctx.set.status = 404;
      return { error: 'Mount not found' };
    }
    const smRepo = AppDataSource.getRepository(ServerMount);
    const existing = await smRepo.findOneBy({ serverUuid: uuid, mountId: mount.id });
    if (existing) {
      ctx.set.status = 409;
      return { error: 'Mount already attached' };
    }
    const link = smRepo.create({ serverUuid: uuid, mountId: mount.id });
    await smRepo.save(link);
    ctx.set.status = 201;
    return link;
  }, {
    beforeHandle: authenticate,
    schema: {
      params: t.Object({ id: t.String() }),
      body: t.Object({ mountId: t.Any() }),
      response: {
        201: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
        409: t.Object({ error: t.String() }),
      },
    },
    detail: { summary: 'Attach a mount to a server', tags: ['Admin'] },
  });

  app.delete(prefix + '/admin/servers/:id/mounts/:mountId', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const { id: uuid, mountId } = ctx.params as any;
    const smRepo = AppDataSource.getRepository(ServerMount);
    const link = await smRepo.findOneBy({ serverUuid: uuid, mountId: Number(mountId) });
    if (!link) {
      ctx.set.status = 404;
      return { error: 'Mount link not found' };
    }
    await smRepo.remove(link);
    return { success: true };
  }, {
    beforeHandle: authenticate,
    schema: {
      params: t.Object({ id: t.String(), mountId: t.String() }),
      response: {
        200: t.Object({ success: t.Boolean() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
    },
    detail: { summary: 'Remove mount link from server', tags: ['Admin'] },
  });

  app.get(prefix + '/admin/orders', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const { userId } = ctx.query as any;
    const orderRepo = AppDataSource.getRepository(Order);
    const orders = userId
      ? await orderRepo.find({ where: { userId: Number(userId) }, order: { createdAt: 'DESC' } })
      : await orderRepo.find({ order: { createdAt: 'DESC' } });
    return orders;
  }, {
    beforeHandle: authenticate,
    schema: {
      query: t.Object({ userId: t.Optional(t.Any()) }),
      response: {
        200: t.Array(t.Any()),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
      },
    },
    detail: { summary: 'List orders, optionally filtered by user', tags: ['Admin'] },
  });

  app.post(prefix + '/admin/orders', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const { userId, description, planId, amount, items, expiresAt, notes, status } = ctx.body as any;
    if (!userId) {
      ctx.set.status = 400;
      return { error: 'userId is required' };
    }

    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOneBy({ id: Number(userId) });
    if (!user) {
      ctx.set.status = 404;
      return { error: 'User not found' };
    }

    const orderRepo = AppDataSource.getRepository(Order);
    const order = orderRepo.create({
      userId: Number(userId),
      description: description || undefined,
      planId: planId ? Number(planId) : undefined,
      amount: amount != null ? Number(amount) : 0,
      items: items || (planId ? `plan:${planId}` : 'admin:manual'),
      status: status || 'active',
      notes: notes || undefined,
      createdAt: new Date(),
      expiresAt: expiresAt ? new Date(expiresAt) : new Date(Date.now() + 365 * 24 * 3600 * 1000),
      // Fuck leap year atp.
    });
    await orderRepo.save(order);
    return { success: true, order };
  }, {
    beforeHandle: authenticate,
    schema: {
      body: t.Object({
        userId: t.Any(),
        description: t.Optional(t.String()),
        planId: t.Optional(t.Any()),
        amount: t.Optional(t.Number()),
        items: t.Optional(t.String()),
        expiresAt: t.Optional(t.String()),
        notes: t.Optional(t.String()),
        status: t.Optional(t.String()),
      }),
      response: {
        200: t.Object({ success: t.Boolean(), order: t.Any() }),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
    },
    detail: { summary: 'Create a new order', tags: ['Admin'] },
  });

  app.put(prefix + '/admin/orders/:id', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const orderRepo = AppDataSource.getRepository(Order);
    const order = await orderRepo.findOneBy({ id: Number(ctx.params.id) });
    if (!order) {
      ctx.set.status = 404;
      return { error: 'Order not found' };
    }
    const { status, notes, expiresAt, description, amount, planId, items, userId } = ctx.body as any;
    if (status !== undefined) order.status = status;
    if (notes !== undefined) order.notes = notes;
    if (description !== undefined) order.description = description;
    if (expiresAt !== undefined) order.expiresAt = new Date(expiresAt);
    if (amount !== undefined) order.amount = Number(amount || 0);
    if (planId !== undefined) order.planId = planId != null ? Number(planId) : undefined as any;
    if (items !== undefined) order.items = items;
    if (userId !== undefined) {
      const userRepo = AppDataSource.getRepository(User);
      const u = await userRepo.findOneBy({ id: Number(userId) });
      if (!u) { ctx.set.status = 404; return { error: 'User not found' }; }
      order.userId = Number(userId);
    }
    await orderRepo.save(order);
    return { success: true, order };
  }, {
    beforeHandle: authenticate,
    schema: {
      params: t.Object({ id: t.String() }),
      body: t.Object({ status: t.Optional(t.String()), notes: t.Optional(t.String()), expiresAt: t.Optional(t.String()), description: t.Optional(t.String()), amount: t.Optional(t.Number()), planId: t.Optional(t.Any()), items: t.Optional(t.String()), userId: t.Optional(t.Any()) }),
      response: {
        200: t.Object({ success: t.Boolean(), order: t.Any() }),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
    },
    detail: { summary: 'Modify an order', tags: ['Admin'] },
  });

  app.delete(prefix + '/admin/orders/:id', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const orderRepo = AppDataSource.getRepository(Order);
    const order = await orderRepo.findOneBy({ id: Number(ctx.params.id) });
    if (!order) {
      ctx.set.status = 404;
      return { error: 'Order not found' };
    }
    await orderRepo.remove(order);
    return { success: true };
  }, {
    beforeHandle: authenticate,
    schema: {
      params: t.Object({ id: t.String() }),
      response: {
        200: t.Object({ success: t.Boolean() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
    },
    detail: { summary: 'Delete an order (admin)', tags: ['Admin'] },
  });

  app.get(prefix + '/admin/users/:id/current-plan', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const userId = Number(ctx.params.id);
    const orderRepo = AppDataSource.getRepository(Order);
    const planRepo = AppDataSource.getRepository(Plan);
    const orders = await orderRepo.find({ where: { userId, status: 'active' }, order: { createdAt: 'DESC' } });
    const order = orders.find(o => o.planId != null) || null;
    if (!order) return { plan: null, order: null };
    const plan = await planRepo.findOneBy({ id: order.planId! });
    return { plan: plan || null, order };
  }, {
    beforeHandle: authenticate,
    schema: {
      params: t.Object({ id: t.String() }),
      response: {
        200: t.Object({ plan: t.Any(), order: t.Any() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
    },
    detail: { summary: 'Get current plan for user', tags: ['Admin'] },
  });

  app.post(prefix + '/admin/users/:id/cancel-plan', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const userId = Number(ctx.params.id);
    const userRepo = AppDataSource.getRepository(User);
    const orderRepo = AppDataSource.getRepository(Order);

    const user = await userRepo.findOneBy({ id: userId });
    if (!user) {
      ctx.set.status = 404;
      return { error: 'User not found' };
    }

    const orders = await orderRepo.find({ where: { userId, status: 'active' }, order: { createdAt: 'DESC' } });
    const order = orders.find(o => o.planId != null);
    if (order) {
      order.status = 'cancelled';
      await orderRepo.save(order);
    }

    user.portalType = 'free';
    (user as any).limits = null;
    await userRepo.save(user);

    return { success: true };
  }, {
    beforeHandle: authenticate,
    schema: {
      params: t.Object({ id: t.String() }),
      response: {
        200: t.Object({ success: t.Boolean() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
    },
    detail: { summary: 'Cancel user plan and reset portal type', tags: ['Admin'] },
  });

  app.post(prefix + '/admin/users/:id/apply-plan', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const userId = Number(ctx.params.id);
    const { planId, temporary, expiresAt, notes, orgId } = ctx.body as any;
    if (!planId) {
      ctx.set.status = 400;
      return { error: 'planId is required' };
    }

    const userRepo = AppDataSource.getRepository(User);
    const planRepo = AppDataSource.getRepository(Plan);
    const nodeRepo = AppDataSource.getRepository(Node);

    const user = await userRepo.findOneBy({ id: userId });
    if (!user) {
      ctx.set.status = 404;
      return { error: 'User not found' };
    }

    const plan = await planRepo.findOneBy({ id: Number(planId) });
    if (!plan) {
      ctx.set.status = 404;
      return { error: 'Plan not found' };
    }

    let limits: Record<string, number> = {};
    if (plan.type === 'enterprise' && user.nodeId) {
      const node = await nodeRepo.findOneBy({ id: user.nodeId });
      if (node) {
        if (node.memory != null) limits.memory = Number(node.memory);
        if (node.disk != null) limits.disk = Number(node.disk);
        if (node.cpu != null) limits.cpu = Number(node.cpu);
        if (node.serverLimit != null) limits.serverLimit = Number(node.serverLimit);
      }
    }
    if (Object.keys(limits).length === 0) {
      if (plan.memory != null) limits.memory = plan.memory;
      if (plan.disk != null) limits.disk = plan.disk;
      if (plan.cpu != null) limits.cpu = plan.cpu;
      if (plan.serverLimit != null) limits.serverLimit = plan.serverLimit;
    }

    user.limits = Object.keys(limits).length ? limits : null;
    user.portalType = plan.type;
    await userRepo.save(user);

    if (orgId) {
      const orgRepo = AppDataSource.getRepository(Organisation);
      const org = await orgRepo.findOneBy({ id: Number(orgId) });
      if (org) {
        org.portalTier = plan.type;
        await orgRepo.save(org);
      }
    }

    let effectiveAmount = plan.price ?? 0;
    if (plan.type === 'enterprise' && user.nodeId) {
      const node = await nodeRepo.findOneBy({ id: user.nodeId });
      if (node?.cost != null) effectiveAmount = Number(node.cost);
    }
    const orderRepo = AppDataSource.getRepository(Order);
    const order = orderRepo.create({
      userId,
      description: `${plan.name}${temporary ? ' (temporary)' : ''}`,
      planId: plan.id,
      amount: effectiveAmount,
      items: `plan:${plan.id}`,
      status: 'active',
      notes: notes || undefined,
      createdAt: new Date(),
      expiresAt: expiresAt ? new Date(expiresAt) : new Date(Date.now() + 365 * 24 * 3600 * 1000),
    });
    await orderRepo.save(order);

    return { success: true, user: { id: user.id, portalType: user.portalType, limits: user.limits }, order };
  }, {
    beforeHandle: authenticate,
    schema: {
      params: t.Object({ id: t.String() }),
      body: t.Object({ planId: t.Any(), temporary: t.Optional(t.Boolean()), expiresAt: t.Optional(t.String()), notes: t.Optional(t.String()), orgId: t.Optional(t.Any()) }),
      response: {
        200: t.Object({ success: t.Boolean(), user: t.Any(), order: t.Any() }),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
    },
    detail: { summary: 'Apply a plan to user and create order', tags: ['Admin'] },
  });

  app.post(prefix + '/admin/ensure-portal-plans', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const body = (ctx.body as any) || {};
    const portalType = body.portalType as string | undefined;
    const userRepo = AppDataSource.getRepository(User);
    const planRepo = AppDataSource.getRepository(Plan);
    const orderRepo = AppDataSource.getRepository(Order);

    const users = portalType
      ? await userRepo.find({ where: { portalType } })
      : await userRepo.find();

    let assigned = 0;
    for (const user of users) {
      const orders = await orderRepo.find({ where: { userId: user.id, status: 'active' }, order: { createdAt: 'DESC' } });
      const existing = orders.find(o => o.planId != null);
      if (existing) {
        const plan = await planRepo.findOneBy({ id: existing.planId! });
        if (plan && plan.type === user.portalType) continue;
      }

      const plans = await planRepo.find({ where: { type: user.portalType }, order: { price: 'ASC' } });
      if (!plans || plans.length === 0) continue;

      let chosen = plans.find(p => p.isDefault) || plans[0];

      const nodeRepo = AppDataSource.getRepository(Node);
      let limits: Record<string, number> = {};
      if (chosen.type === 'enterprise' && user.nodeId) {
        const node = await nodeRepo.findOneBy({ id: user.nodeId });
        if (node) {
          if (node.memory != null) limits.memory = Number(node.memory);
          if (node.disk != null) limits.disk = Number(node.disk);
          if (node.cpu != null) limits.cpu = Number(node.cpu);
          if (node.serverLimit != null) limits.serverLimit = Number(node.serverLimit);
        }
      }
      if (Object.keys(limits).length === 0) {
        if (chosen.memory != null) limits.memory = chosen.memory;
        if (chosen.disk != null) limits.disk = chosen.disk;
        if (chosen.cpu != null) limits.cpu = chosen.cpu;
        if (chosen.serverLimit != null) limits.serverLimit = chosen.serverLimit;
      }

      user.limits = Object.keys(limits).length ? limits : null;
      user.portalType = chosen.type;
      await userRepo.save(user);

      const effectiveAmount = chosen.price ?? 0;
      const order = orderRepo.create({
        userId: user.id,
        description: `${chosen.name} (auto-assigned)`,
        planId: chosen.id,
        amount: effectiveAmount,
        items: `plan:${chosen.id}`,
        status: 'active',
        notes: 'Auto-assigned plan to match portal type',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      });
      await orderRepo.save(order);
      assigned++;
    }

    return { success: true, assigned };
  }, {
    beforeHandle: authenticate,
    schema: {
      body: t.Object({ portalType: t.Optional(t.String()) }),
      response: { 200: t.Object({ success: t.Boolean(), assigned: t.Number() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) }
    },
    detail: { summary: 'Ensure users have a plan matching their portalType', tags: ['Admin'] },
  });
}