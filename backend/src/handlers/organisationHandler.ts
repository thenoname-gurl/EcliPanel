import { AppDataSource } from '../config/typeorm';
import { Organisation } from '../models/organisation.entity';
import { OrganisationInvite } from '../models/organisationInvite.entity';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import { User } from '../models/user.entity';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { WingsApiService } from '../services/wingsApiService';
import { createActivityLog } from './logHandler';
import { t } from 'elysia';

export async function organisationRoutes(app: any, prefix = '') {
  const orgRepo = AppDataSource.getRepository(Organisation);
  const inviteRepo = AppDataSource.getRepository(OrganisationInvite);
  const userRepo = AppDataSource.getRepository(User);

  function sanitizeOrg(o: Organisation | undefined) {
    if (!o) return o;
    return {
      id: o.id,
      name: o.name,
      handle: o.handle,
      ownerId: o.ownerId,
      portalTier: o.portalTier,
      avatarUrl: o.avatarUrl,
      users: o.users?.map((u: any) => ({ id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, orgRole: u.orgRole, avatarUrl: u.avatarUrl })) || [],
      invites: o.invites?.map((i: any) => ({ id: i.id, email: i.email, accepted: i.accepted })) || [],
    };
  }

  app.get(prefix + '/organisations', async (ctx: any) => {
    const user = ctx.user as User;
    const userWithOrg = await userRepo.findOne({ where: { id: user.id }, relations: ['org'] });
    const orgs: Organisation[] = [];
    if (userWithOrg?.org) orgs.push(userWithOrg.org);
    const owned = await orgRepo.find({ where: { ownerId: user.id } });
    for (const o of owned) {
      if (!orgs.some((x) => x.id === o.id)) orgs.push(o);
    }
    return orgs.map(sanitizeOrg);
  }, {beforeHandle: authenticate,
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }) },
    detail: { summary: 'List organisations accessible to the user', tags: ['Organisations'] }
  });

  app.post(prefix + '/organisations', async (ctx: any) => {
    const user = ctx.user as User;
    if (user.demoExpiresAt && new Date(user.demoExpiresAt) > new Date()) {
      ctx.set.status = 403;
      return { error: 'Cannot create an organisation while in demo mode' };
    }

    const { name, handle } = ctx.body as any;
    if (!name || !handle) {
      ctx.set.status = 400;
      return { error: 'name and handle required' };
    }
    if (!/^([a-z0-9]+\.)+[a-z]{2,}$/.test(handle)) {
      ctx.set.status = 400;
      return { error: 'invalid handle format' };
    }
    const existing = await orgRepo.findOneBy({ handle });
    if (existing) {
      ctx.set.status = 409;
      return { error: 'handle taken' };
    }
    const org = orgRepo.create({ name, handle, ownerId: user.id });
    await orgRepo.save(org);
    user.org = org;
    user.orgRole = 'owner';
    await userRepo.save(user);
    await createActivityLog({ userId: user.id, action: 'org:create', targetId: String(org.id), targetType: 'organisation', metadata: { orgName: name, handle }, ipAddress: ctx.ip });
    return { success: true, org: sanitizeOrg(org) };
  }, { beforeHandle: [authenticate, authorize('org:create')],
    response: { 200: t.Object({ success: t.Boolean(), org: t.Any() }), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 409: t.Object({ error: t.String() }) },
    detail: { summary: 'Create a new organisation', tags: ['Organisations'] }
  });

  app.get(prefix + '/organisations/:id', async (ctx: any) => {
    const org = await orgRepo.findOne({ where: { id: Number(ctx.params['id']) }, relations: ['users', 'invites'] });
    if (!org) {
      ctx.set.status = 404;
      return { error: 'Organisation not found' };
    }
    const user = ctx.user as User;
    if (user.id !== org.ownerId && !org.users.some((u) => u.id === user.id) && user.role !== 'admin') {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    return sanitizeOrg(org);
  }, {beforeHandle: authenticate,
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Get organisation by id', tags: ['Organisations'] }
  });

  app.put(prefix + '/organisations/:id', async (ctx: any) => {
    const org = await orgRepo.findOneBy({ id: Number(ctx.params['id']) });
    if (!org) {
      ctx.set.status = 404;
      return { error: 'Organisation not found' };
    }
    const user = ctx.user as User;
    if (user.id !== org.ownerId && user.role !== 'admin' && user.role !== '*') {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    const { name, portalTier } = ctx.body as any;
    if (name) org.name = name;
    if (portalTier) org.portalTier = portalTier;
    await orgRepo.save(org);
    return { success: true, org: sanitizeOrg(org) };
  }, {beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean(), org: t.Any() }), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Update organisation', tags: ['Organisations'] }
  });

  app.get(prefix + '/organisations/:id/users', async (ctx: any) => {
    const org = await orgRepo.findOne({ where: { id: Number(ctx.params['id']) }, relations: ['users'] });
    if (!org) {
      ctx.set.status = 404;
      return { error: 'Organisation not found' };
    }
    const user = ctx.user as User;
    const actorIsOrgAdminOrStaff = user.id === org.ownerId || (user.org?.id === org.id && user.orgRole === 'admin') || user.role === 'admin' || user.role === '*';
    if (!actorIsOrgAdminOrStaff) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    return (org.users || []).map((u: any) => ({ id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, orgRole: u.orgRole, avatarUrl: u.avatarUrl }));
  }, {beforeHandle: authenticate,
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'List users in organisation', tags: ['Organisations'] }
  });

  app.delete(prefix + '/organisations/:id/users/:userId', async (ctx: any) => {
    const org = await orgRepo.findOneBy({ id: Number(ctx.params['id']) });
    if (!org) {
      ctx.set.status = 404;
      return { error: 'Organisation not found' };
    }
    const user = ctx.user as User;
    const actorIsOrgAdminOrStaff = user.id === org.ownerId || (user.org?.id === org.id && user.orgRole === 'admin') || user.role === 'admin' || user.role === '*';
    if (!actorIsOrgAdminOrStaff) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    const target = await userRepo.findOneBy({ id: Number(ctx.params['userId']) });
    if (!target || target.org?.id !== org.id) {
      ctx.set.status = 404;
      return { error: 'User not found in org' };
    }
    if (target.orgRole === 'owner') {
      ctx.set.status = 403;
      return { error: 'Cannot remove organisation owner' };
    }
    target.org = undefined as any;
    target.orgRole = 'member';
    await userRepo.save(target);
    await createActivityLog({ userId: user.id, action: 'org:remove_member', targetId: String(org.id), targetType: 'organisation', metadata: { removedUserId: target.id }, ipAddress: ctx.ip });
    return { success: true };
  }, {beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Remove user from organisation', tags: ['Organisations'] }
  });

  app.put(prefix + '/organisations/:id/users/:userId/role', async (ctx: any) => {
    const org = await orgRepo.findOneBy({ id: Number(ctx.params['id']) });
    if (!org) {
      ctx.set.status = 404;
      return { error: 'Organisation not found' };
    }
    const user = ctx.user as User;
    const actorIsOrgAdminOrStaff = user.id === org.ownerId || (user.org?.id === org.id && user.orgRole === 'admin') || user.role === 'admin' || user.role === '*';
    if (!actorIsOrgAdminOrStaff) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    const target = await userRepo.findOneBy({ id: Number(ctx.params['userId']) });
    if (!target || target.org?.id !== org.id) {
      ctx.set.status = 404;
      return { error: 'User not found in org' };
    }
    const { orgRole } = ctx.body as any;
    if (!['member', 'admin', 'owner'].includes(orgRole)) {
      ctx.set.status = 400;
      return { error: 'Invalid role' };
    }
    if (orgRole === 'owner' && user.id !== org.ownerId && user.role !== 'admin' && user.role !== '*') {
      ctx.set.status = 403;
      return { error: 'Only owner can transfer ownership' };
    }
    target.orgRole = orgRole;
    if (orgRole === 'owner') {
      org.ownerId = target.id;
      await orgRepo.save(org);
    }
    await userRepo.save(target);
    await createActivityLog({ userId: user.id, action: 'org:change_role', targetId: String(org.id), targetType: 'organisation', metadata: { targetUserId: target.id, newRole: orgRole }, ipAddress: ctx.ip });
    return { success: true, target };
  }, {beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean(), target: t.Any() }), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Change user role within organisation', tags: ['Organisations'] }
  });

  app.post(prefix + '/organisations/:id/invite', async (ctx: any) => {
    const org = await orgRepo.findOneBy({ id: Number(ctx.params['id']) });
    if (!org) {
      ctx.set.status = 404;
      return { error: 'Organisation not found' };
    }
    const { email } = ctx.body as any;
    if (!email) {
      ctx.set.status = 400;
      return { error: 'email required' };
    }
    const token = uuidv4();
    const inv = inviteRepo.create({ organisation: org, email, token, accepted: false, createdAt: new Date() });
    await inviteRepo.save(inv);
    const inviter = ctx.user as User;
    await createActivityLog({ userId: inviter.id, action: 'org:invite', targetId: String(org.id), targetType: 'organisation', metadata: { invitedEmail: email }, ipAddress: ctx.ip });
    try {
      const { sendMail } = require('../services/mailService');
      await sendMail({
        to: email,
        from: process.env.SMTP_FROM || 'no-reply@ecli.app',
        subject: `Invitation to join ${org.name}`,
        template: 'invite',
        vars: {
          name: email.split('@')[0],
          orgName: org.name,
          link: `${process.env.FRONTEND_URL || 'https://ecli.app'}/accept?token=${token}`,
        },
      });
    } catch (e) {
      app.log.error({ err: e }, 'failed to send invite email');
    }
    return { success: true, token };
  }, { beforeHandle: [authenticate, authorize('org:invite')],
    response: { 200: t.Object({ success: t.Boolean(), token: t.String() }), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Invite user to organisation', tags: ['Organisations'] }
  });

  app.post(prefix + '/organisations/:id/invite/:inviteId/resend', async (ctx: any) => {
    const org = await orgRepo.findOneBy({ id: Number(ctx.params['id']) });
    if (!org) {
      ctx.set.status = 404;
      return { error: 'Organisation not found' };
    }
    const inv = await inviteRepo.findOne({ where: { id: Number(ctx.params['inviteId']) }, relations: ['organisation'] });
    if (!inv || inv.organisation.id !== org.id) {
      ctx.set.status = 404;
      return { error: 'Invite not found' };
    }
    if (inv.accepted) {
      ctx.set.status = 400;
      return { error: 'Invite already accepted' };
    }
    try {
      const { sendMail } = require('../services/mailService');
      await sendMail({
        to: inv.email,
        from: process.env.SMTP_FROM || 'no-reply@ecli.app',
        subject: `Invitation to join ${org.name}`,
        template: 'invite',
        vars: {
          name: inv.email.split('@')[0],
          orgName: org.name,
          link: `${process.env.FRONTEND_URL || 'https://ecli.app'}/accept?token=${inv.token}`,
        },
      });
      await createActivityLog({ userId: (ctx.user as User).id, action: 'org:resend_invite', targetId: String(org.id), targetType: 'organisation', metadata: { inviteId: inv.id, invitedEmail: inv.email }, ipAddress: ctx.ip });
    } catch (e) {
      app.log.error({ err: e }, 'failed to resend invite email');
    }
    return { success: true };
  }, { beforeHandle: [authenticate, authorize('org:invite')], response: { 200: t.Object({ success: t.Boolean() }), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) }, detail: { summary: 'Resend organisation invite', tags: ['Organisations'] } });

  app.delete(prefix + '/organisations/:id/invite/:inviteId', async (ctx: any) => {
    const org = await orgRepo.findOneBy({ id: Number(ctx.params['id']) });
    if (!org) {
      ctx.set.status = 404;
      return { error: 'Organisation not found' };
    }
    const inv = await inviteRepo.findOne({ where: { id: Number(ctx.params['inviteId']) }, relations: ['organisation'] });
    if (!inv || inv.organisation.id !== org.id) {
      ctx.set.status = 404;
      return { error: 'Invite not found' };
    }
    await inviteRepo.remove(inv);
    await createActivityLog({ userId: (ctx.user as User).id, action: 'org:revoke_invite', targetId: String(org.id), targetType: 'organisation', metadata: { inviteId: inv.id, invitedEmail: inv.email }, ipAddress: ctx.ip });
    return { success: true };
  }, { beforeHandle: [authenticate, authorize('org:invite')], response: { 200: t.Object({ success: t.Boolean() }), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) }, detail: { summary: 'Revoke organisation invite', tags: ['Organisations'] } });

  app.post(prefix + '/organisations/:id/add-user', async (ctx: any) => {
    const org = await orgRepo.findOneBy({ id: Number(ctx.params['id']) });
    if (!org) {
      ctx.set.status = 404;
      return { error: 'Organisation not found' };
    }
    const actor = ctx.user as User;
    const adminRoles = ['admin', 'rootAdmin', '*'];
    if (!adminRoles.includes(actor.role ?? '')) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    const { userId, email, orgRole } = ctx.body as any;
    if (!userId && !email) {
      ctx.set.status = 400;
      return { error: 'userId or email required' };
    }
    const target = userId ? await userRepo.findOneBy({ id: Number(userId) }) : await userRepo.findOne({ where: { email } });
    if (!target) {
      ctx.set.status = 404;
      return { error: 'User not found' };
    }
    if (target.org?.id === org.id) {
      ctx.set.status = 409;
      return { error: 'User already in organisation' };
    }
    target.org = org as any;
    target.orgRole = ['member','admin','owner'].includes(orgRole) ? orgRole : 'member';
    await userRepo.save(target);
    await createActivityLog({ userId: actor.id, action: 'org:add_user', targetId: String(org.id), targetType: 'organisation', metadata: { addedUserId: target.id }, ipAddress: ctx.ip });
    return { success: true, target: { id: target.id, email: target.email, firstName: target.firstName, lastName: target.lastName, orgRole: target.orgRole } };
  }, { beforeHandle: authenticate, response: { 200: t.Object({ success: t.Boolean(), target: t.Any() }), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }), 409: t.Object({ error: t.String() }) }, detail: { summary: 'Add existing user to organisation (admin only)', tags: ['Organisations'] } });

  app.post(prefix + '/organisations/accept-invite', async (ctx: any) => {
    const { token } = ctx.body as any;
    const inv = await inviteRepo.findOne({ where: { token }, relations: ['organisation'] });
    if (!inv || inv.accepted) {
      ctx.set.status = 400;
      return { error: 'Invalid invite' };
    }
    const user = ctx.user as User;
    if (user.email !== inv.email) {
      ctx.set.status = 403;
      return { error: 'Email mismatch' };
    }
    user.org = inv.organisation;
    user.orgRole = 'member';
    await userRepo.save(user);
    inv.accepted = true;
    await inviteRepo.save(inv);
    await createActivityLog({ userId: user.id, action: 'org:accept_invite', targetId: String(inv.organisation.id), targetType: 'organisation', ipAddress: ctx.ip });
    return { success: true };
  }, {beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean() }), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Accept organisation invite', tags: ['Organisations'] }
  });

  app.post(prefix + '/organisations/:id/leave', async (ctx: any) => {
    const org = await orgRepo.findOneBy({ id: Number(ctx.params['id']) });
    if (!org) {
      ctx.set.status = 404;
      return { error: 'Organisation not found' };
    }
    const user = ctx.user as User;
    if (!user || user.org?.id !== org.id) {
      ctx.set.status = 403;
      return { error: 'Not a member of this organisation' };
    }
    if (org.ownerId === user.id) {
      ctx.set.status = 403;
      return { error: 'Owner cannot leave organisation without transferring ownership' };
    }

    user.org = undefined as any;
    user.orgRole = 'member';
    await userRepo.save(user);

    try {
      const mappingRepo = AppDataSource.getRepository(require('../models/serverMapping.entity').ServerMapping);
      const mappings = await mappingRepo.find({ relations: ['node'] });
      const uuids = mappings.filter((m: any) => m.node?.organisation?.id === org.id).map((m: any) => m.uuid);
      if (uuids.length > 0) {
        const subuserRepo = AppDataSource.getRepository(require('../models/serverSubuser.entity').ServerSubuser);
        await subuserRepo.createQueryBuilder().delete().where('userId = :uid', { uid: user.id }).andWhere('serverUuid IN (:...uuids)', { uuids }).execute();
      }
    } catch (e) {
      // skip
    }

    await createActivityLog({ userId: user.id, action: 'org:leave', targetId: String(org.id), targetType: 'organisation', metadata: {}, ipAddress: ctx.ip });
    return { success: true };
  }, { beforeHandle: authenticate, response: { 200: t.Object({ success: t.Boolean() }), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) }, detail: { summary: 'Leave organisation', tags: ['Organisations'] } });

  app.get(prefix + '/organisations/:id/servers', async (ctx: any) => {
    const orgId = Number(ctx.params['id']);
    const repo = AppDataSource.getRepository(require('../models/node.entity').Node);
    const nodes = await repo.find({ where: { organisation: { id: orgId } } });
    let results: any[] = [];
    for (const n of nodes) {
      const svc = new WingsApiService(n.url, n.token);
      const res = await svc.getServers();
      results.push(...(res.data || []).map((s: any) => ({ ...s, node: n.id })));
    }
    return results;
  }, {beforeHandle: authenticate,
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }) },
    detail: { summary: 'List servers for organisation', tags: ['Organisations'] }
  });

  app.get(prefix + '/organisations/:id/nodes', async (ctx: any) => {
    const orgId = Number(ctx.params['id']);
    const repo = AppDataSource.getRepository(require('../models/node.entity').Node);
    const nodes = await repo.find({ where: { organisation: { id: orgId } } });
    return nodes;
  }, {beforeHandle: authenticate,
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }) },
    detail: { summary: 'List nodes for organisation', tags: ['Organisations'] }
  });

  app.post(prefix + '/organisations/:id/avatar', async (ctx: any) => {
    const orgRepoLocal = AppDataSource.getRepository(Organisation);
    const org = await orgRepoLocal.findOneBy({ id: Number(ctx.params['id']) });
    if (!org) {
      ctx.set.status = 404;
      return { error: 'Organisation not found' };
    }
    const user = ctx.user as User;
    if (user.org?.id !== org.id && user.role !== 'admin') {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    const file = await ctx.file();
    if (!file) {
      ctx.set.status = 400;
      return { error: 'No file' };
    }
    const allowed = ['image/png','image/jpeg','image/webp'];
    if (!allowed.includes(file.mimetype)) {
      ctx.set.status = 400;
      return { error: 'Invalid image type' };
    }
    const buffer = await file.toBuffer();
    const out = await sharp(buffer).rotate().resize(256,256,{fit:'cover'}).toBuffer();
    const filename = `avatar_org_${org.id}` + path.extname(file.filename || '.png');
    const filepath = path.join(process.cwd(),'uploads',filename);
    fs.writeFileSync(filepath, out);
    org.avatarUrl = `/uploads/${filename}`;
    await orgRepoLocal.save(org);
    return { success: true, url: org.avatarUrl };
  }, {beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean(), url: t.String() }), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Upload organisation avatar', tags: ['Organisations'] }
  });
}
