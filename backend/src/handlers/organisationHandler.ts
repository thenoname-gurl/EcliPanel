import { AppDataSource } from '../config/typeorm';
import { Organisation } from '../models/organisation.entity';
import { OrganisationDnsZone } from '../models/organisationDnsZone.entity';
import { OrganisationInvite } from '../models/organisationInvite.entity';
import { OrganisationMember } from '../models/organisationMember.entity';
import { authenticate } from '../middleware/auth';
import { authorize, hasPermissionSync } from '../middleware/authorize';
import { requireFeature } from '../middleware/featureToggle';
import { User } from '../models/user.entity';
import { createMailboxMessageForUser } from '../utils/mailboxMessage';
import { getMailboxAccountForUser } from '../services/mailcowService';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { resizeImage } from '../workers/imageWorker';
import { WingsApiService } from '../services/wingsApiService';
import { createActivityLog } from './logHandler';
import { CloudflareService } from '../services/cloudflareService';
import { t } from 'elysia';

function createDnsService() {
  return new CloudflareService();
}

export async function organisationRoutes(app: any, prefix = '') {
  const orgRepo = AppDataSource.getRepository(Organisation);
  const dnsZoneRepo = AppDataSource.getRepository(OrganisationDnsZone);
  const inviteRepo = AppDataSource.getRepository(OrganisationInvite);
  const memberRepo = AppDataSource.getRepository(OrganisationMember);
  const userRepo = AppDataSource.getRepository(User);

  function sanitizeOrg(o: Organisation | undefined, opts?: { orgRole?: string; users?: any[]; invites?: any[] }) {
    if (!o) return o;
    return {
      id: o.id,
      name: o.name,
      handle: o.handle,
      ownerId: o.ownerId,
      portalTier: o.portalTier,
      avatarUrl: o.avatarUrl,
      isStaff: !!o.isStaff,
      orgRole: opts?.orgRole,
      users: opts?.users || [],
      invites: opts?.invites || [],
    };
  }

  async function getMembership(userId: number, organisationId: number) {
    return await memberRepo.findOne({ where: { userId, organisationId } });
  }

  function resolvePanelBaseUrl(ctx: any): string {
    const rawUrl = String(process.env.PANEL_URL || process.env.FRONTEND_URL || '').trim();
    if (rawUrl && rawUrl !== '*' && rawUrl.toLowerCase() !== 'true') {
      return rawUrl.replace(/\/+$/, '');
    }
    const origin = String(ctx.headers?.origin || ctx.request?.headers?.get?.('origin') || '').trim();
    if (origin) return origin.replace(/\/+$/, '');
    return 'https://ecli.app';
  }

  async function listMembersForOrg(organisationId: number) {
    const memberships = await memberRepo.find({ where: { organisationId }, relations: ['user'] });
    return (Array.isArray(memberships) ? memberships : [])
      .map((m: any) => {
        const user = m?.user;
        if (!user || user.id == null) return null;
        return {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          avatarUrl: user.avatarUrl,
          orgRole: m?.orgRole,
        };
      })
      .filter(Boolean);
  }

  app.get(prefix + '/organisations', async (ctx: any) => {
    const user = ctx.user as User;
    const memberships = await memberRepo.find({ where: { userId: user.id }, relations: ['organisation'] });
    const orgs: Organisation[] = memberships.map((m: any) => m.organisation).filter(Boolean);
    const roleByOrgId = new Map<number, string>();
    for (const m of memberships) roleByOrgId.set(m.organisationId, m.orgRole || 'member');
    const owned = await orgRepo.find({ where: { ownerId: user.id } });
    for (const o of owned) {
      if (!orgs.some((x) => x.id === o.id)) orgs.push(o);
    }
    return orgs.map((org) => sanitizeOrg(org, { orgRole: roleByOrgId.get(org.id) || (org.ownerId === user.id ? 'owner' : 'member') }));
  }, {
    beforeHandle: authenticate,
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
    const ownerMembership = memberRepo.create({ userId: user.id, organisationId: org.id, user, organisation: org, orgRole: 'owner', createdAt: new Date() });
    await memberRepo.save(ownerMembership);

    void (async () => {
      try {
        const zoneName = handle.replace(/\.$/, '');
        const existingZone = await dnsZoneRepo.findOne({ where: { organisationId: org.id, name: zoneName } });
        if (!existingZone) {
          const zone = dnsZoneRepo.create({ organisation: org, organisationId: org.id, name: zoneName, kind: 'cloudflare', status: 'active' });
          await dnsZoneRepo.save(zone);
        }
      } catch (e) {
        // skip
      }
    })();

    await createActivityLog({ userId: user.id, action: 'org:create', targetId: String(org.id), targetType: 'organisation', metadata: { orgName: name, handle }, ipAddress: ctx.ip });
    return { success: true, org: sanitizeOrg(org, { orgRole: 'owner' }) };
  }, {
    beforeHandle: [authenticate, authorize('org:create')],
    response: { 200: t.Object({ success: t.Boolean(), org: t.Any() }), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 409: t.Object({ error: t.String() }) },
    detail: { summary: 'Create a new organisation', tags: ['Organisations'] }
  });

  async function userCanManageOrg(ctx: any, user: User, org: Organisation) {
    const membership = await getMembership(user.id, org.id);
    return (
      hasPermissionSync(ctx, 'org:write') ||
      user.role === 'staff' ||
      user.id === org.ownerId ||
      !!membership
    );
  }

  app.get(prefix + '/organisations/:id', async (ctx: any) => {
    const org = await orgRepo.findOne({ where: { id: Number(ctx.params['id']) } });
    if (!org) {
      ctx.set.status = 404;
      return { error: 'Organisation not found' };
    }
    const user = ctx.user as User;
    const membership = await getMembership(user.id, org.id);
    if (user.id !== org.ownerId && !membership && !hasPermissionSync(ctx, 'org:read')) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    const users = await listMembersForOrg(org.id);
    const invites = await inviteRepo.find({ where: { organisation: { id: org.id } } as any });
    return sanitizeOrg(org, {
      orgRole: membership?.orgRole || (org.ownerId === user.id ? 'owner' : undefined),
      users,
      invites: (invites || []).map((i: any) => ({ id: i.id, email: i.email, accepted: i.accepted })),
    });
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Get organisation by id', tags: ['Organisations'] }
  });

  app.get(prefix + '/organisations/:id/dns/zones', async (ctx: any) => {
    const f = await requireFeature(ctx, 'dns'); if (f !== true) return f;
    const org = await orgRepo.findOne({ where: { id: Number(ctx.params['id']) } });
    if (!org) {
      ctx.set.status = 404;
      return { error: 'Organisation not found' };
    }
    const user = ctx.user as User;
    try {
      ctx.log?.info?.({ action: 'org:dns:delete:auth-check', userId: user?.id, userRole: user?.role, orgId: org?.id, orgOwnerId: org?.ownerId }, 'org DNS delete auth check');
    } catch { }

    if (!(await userCanManageOrg(ctx, user, org))) {
      ctx.log?.info?.({ action: 'org:dns:delete:forbidden', userId: user?.id, userRole: user?.role, orgId: org?.id }, 'forbidden org DNS delete attempt');
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }

    try {
      const zones = await dnsZoneRepo.find({ where: { organisationId: org.id }, order: { createdAt: 'ASC' } });
      return zones.map((z: any) => ({ id: z.id, name: String(z.name || '').replace(/\.$/, ''), kind: String(z.kind || 'cloudflare').toLowerCase(), status: z.status }));
    } catch (e: any) {
      ctx.set.status = 500;
      return { error: e.message };
    }
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 500: t.Object({ error: t.String() }) },
    detail: { summary: 'List organisation DNS subdomains', tags: ['Organisations', 'DNS'] }
  });

  app.post(prefix + '/organisations/:id/dns/zones', async (ctx: any) => {
    const f = await requireFeature(ctx, 'dns'); if (f !== true) return f;
    const org = await orgRepo.findOne({ where: { id: Number(ctx.params['id']) } });
    if (!org) {
      ctx.set.status = 404;
      return { error: 'Organisation not found' };
    }
    const user = ctx.user as User;
    if (!(await userCanManageOrg(ctx, user, org))) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }

    const body = ctx.body as any;
    const rawName = String(body.name || '').trim().replace(/\.$/, '');
    if (!rawName) {
      ctx.set.status = 400;
      return { error: 'Subdomain name required' };
    }

    const handle = org.handle.replace(/\.$/, '');
    if (rawName !== handle) {
      ctx.set.status = 403;
      return { error: 'Only organisation handle zone can be created' };
    }

    try {
      let zone = await dnsZoneRepo.findOne({ where: { organisationId: org.id, name: rawName } });
      if (!zone) {
        zone = dnsZoneRepo.create({ organisation: org, organisationId: org.id, name: rawName, kind: 'cloudflare', status: 'active' });
        zone = await dnsZoneRepo.save(zone);
      }
      return { id: zone.id, name: zone.name, kind: zone.kind, status: zone.status };
    } catch (e: any) {
      ctx.set.status = 500;
      return { error: e?.message || 'Failed to create org DNS zone' };
    }
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 500: t.Object({ error: t.String() }) },
    detail: { summary: 'Create organisation DNS subdomain', tags: ['Organisations', 'DNS'] }
  });

  app.get(prefix + '/organisations/:id/dns/zones/:zoneId', async (ctx: any) => {
    const f = await requireFeature(ctx, 'dns'); if (f !== true) return f;
    const org = await orgRepo.findOne({ where: { id: Number(ctx.params['id']) } });
    if (!org) {
      ctx.set.status = 404;
      return { error: 'Organisation not found' };
    }
    const user = ctx.user as User;
    if (!(await userCanManageOrg(ctx, user, org))) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }

    const zoneId = Number(ctx.params['zoneId']);
    const zone = await dnsZoneRepo.findOne({ where: { id: zoneId, organisationId: org.id } });
    if (!zone) {
      ctx.set.status = 404;
      return { error: 'Zone not found' };
    }

    const zoneName = String(zone.name || '').replace(/\.$/, '');
    const orgHandle = String(org.handle || '').replace(/\.$/, '');

    const mainZoneName = (process.env.CLOUDFLARE_BASE_ZONE || 'ecli.app').replace(/\.$/, '');
    const svc = createDnsService();
    try {
      const mainZone = await svc.getZone(mainZoneName);
      const records: any[] = [];
      const allRecords = (mainZone.recordsList || mainZone.rrsets || []);
      const prefix = zone.name.replace(/\.$/, '');

      for (const r of allRecords) {
        const name = String(r.name || '').replace(/\.$/, '');
        if (prefix === mainZoneName) {
          records.push(r);
          continue;
        }
        if (name === prefix || name.endsWith(`.${prefix}`)) {
          records.push(r);
        }
      }

      return {
        id: zone.id,
        name: zone.name,
        kind: zone.kind,
        status: zone.status,
        recordsList: records,
      };
    } catch (e: any) {
      return {
        id: zone.id,
        name: zone.name,
        kind: zone.kind,
        status: zone.status,
        recordsList: [],
      };
    }
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }), 500: t.Object({ error: t.String() }) },
    detail: { summary: 'Get organisation DNS zone', tags: ['Organisations', 'DNS'] }
  });

  app.post(prefix + '/organisations/:id/dns/zones/:zoneId/records', async (ctx: any) => {
    const f = await requireFeature(ctx, 'dns'); if (f !== true) return f;
    try {
      const org = await orgRepo.findOne({ where: { id: Number(ctx.params['id']) } });
      if (!org) {
        ctx.set.status = 404;
        return { error: 'Organisation not found' };
      }
      const user = ctx.user as User;
      if (!(await userCanManageOrg(ctx, user, org))) {
        ctx.set.status = 403;
        return { error: 'Forbidden' };
      }

      const zoneId = Number(ctx.params['zoneId']);
      const zone = await dnsZoneRepo.findOne({ where: { id: zoneId, organisationId: org.id } });
      if (!zone) {
        ctx.set.status = 404;
        return { error: 'Zone not found' };
      }

      const body = ctx.body as any;
      const name = String(body.name || '').trim();
      const type = String(body.type || 'A').toUpperCase();
      const ttl = Number(body.ttl || 3600);
      const content = String(body.content || '').trim();
      const proxied = !!body.proxied;
      const allowedTypes = ['A', 'AAAA', 'CNAME', 'TXT'];

      if (!content || !type) {
        ctx.set.status = 400;
        return { error: 'Record type and content are required' };
      }
      if (!allowedTypes.includes(type)) {
        ctx.set.status = 400;
        return { error: `Only ${allowedTypes.join(', ')} records are allowed` };
      }

      const svc = createDnsService();
      const mainZoneName = (process.env.CLOUDFLARE_BASE_ZONE || 'ecli.app').replace(/\.$/, '');
      const mainZone = await svc.getZone(mainZoneName);
      const zoneName = zone.name.replace(/\.$/, '');
      let recordName = zoneName;
      if (name && name !== '@') {
        if (name === zoneName || name.endsWith(`.${zoneName}`)) {
          recordName = name;
        } else {
          recordName = `${name}.${zoneName}`;
        }
      }

      const created = await svc.addRecord(mainZone.id, {
        name: recordName,
        type,
        ttl,
        content,
        proxied,
      });
      return created;
    } catch (e: any) {
      ctx.set.status = 500;
      return { error: e?.message || 'Internal error' };
    }
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }), 502: t.Object({ error: t.String() }) },
    detail: { summary: 'Create organisation DNS record', tags: ['Organisations', 'DNS'] }
  });

  app.put(prefix + '/organisations/:id/dns/zones/:zoneId/records/:recordId', async (ctx: any) => {
    const f = await requireFeature(ctx, 'dns'); if (f !== true) return f;
    try {
      const org = await orgRepo.findOne({ where: { id: Number(ctx.params['id']) } });
      if (!org) {
        ctx.set.status = 404;
        return { error: 'Organisation not found' };
      }
      const user = ctx.user as User;
      if (!(await userCanManageOrg(ctx, user, org))) {
        ctx.set.status = 403;
        return { error: 'Forbidden' };
      }

      const zoneId = Number(ctx.params['zoneId']);
      const zone = await dnsZoneRepo.findOne({ where: { id: zoneId, organisationId: org.id } });
      if (!zone) {
        ctx.set.status = 404;
        return { error: 'Zone not found' };
      }

      const recordId = String(ctx.params['recordId']);
      const body = ctx.body as any;
      const name = String(body.name || '').trim();
      const type = String(body.type || 'A').toUpperCase();
      const ttl = Number(body.ttl || 3600);
      const content = String(body.content || '').trim();
      const proxied = !!body.proxied;
      const allowedTypes = ['A', 'AAAA', 'CNAME', 'TXT'];

      if (!content || !type) {
        ctx.set.status = 400;
        return { error: 'Record type and content are required' };
      }
      if (!allowedTypes.includes(type)) {
        ctx.set.status = 400;
        return { error: `Only ${allowedTypes.join(', ')} records are allowed` };
      }

      const svc = createDnsService();
      const mainZoneName = (process.env.CLOUDFLARE_BASE_ZONE || 'ecli.app').replace(/\.$/, '');
      const mainZone = await svc.getZone(mainZoneName);
      const zoneName = zone.name.replace(/\.$/, '');
      let recordName = zoneName;
      if (name && name !== '@') {
        if (name === zoneName || name.endsWith(`.${zoneName}`)) {
          recordName = name;
        } else {
          recordName = `${name}.${zoneName}`;
        }
      }

      const updated = await svc.updateRecord(mainZone.id, recordId, {
        name: recordName,
        type,
        ttl,
        content,
        proxied,
      });
      return updated;
    } catch (e: any) {
      ctx.set.status = 500;
      return { error: e?.message || 'Internal error' };
    }
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }), 502: t.Object({ error: t.String() }) },
    detail: { summary: 'Update organisation DNS record', tags: ['Organisations', 'DNS'] }
  });

  app.delete(prefix + '/organisations/:id/dns/zones/:zoneId/records/:recordId', async (ctx: any) => {
    const f = await requireFeature(ctx, 'dns'); if (f !== true) return f;
    const org = await orgRepo.findOne({ where: { id: Number(ctx.params['id']) } });
    if (!org) {
      ctx.set.status = 404;
      return { error: 'Organisation not found' };
    }
    const user = ctx.user as User;
    if (!(await userCanManageOrg(ctx, user, org))) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }

    const zoneId = Number(ctx.params['zoneId']);
    const zone = await dnsZoneRepo.findOne({ where: { id: zoneId, organisationId: org.id } });
    if (!zone) {
      ctx.set.status = 404;
      return { error: 'Zone not found' };
    }

    const recordId = String(ctx.params['recordId']);
    const svc = createDnsService();
    const mainZoneName = (process.env.CLOUDFLARE_BASE_ZONE || 'ecli.app').replace(/\.$/, '');
    try {
      const mainZone = await svc.getZone(mainZoneName);
      const result = await svc.deleteRecord(mainZone.id, recordId);
      return result;
    } catch (e: any) {
      ctx.set.status = 502;
      return { error: e?.message || 'Failed to delete DNS record' };
    }
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }), 502: t.Object({ error: t.String() }) },
    detail: { summary: 'Delete organisation DNS record', tags: ['Organisations', 'DNS'] }
  });

  app.delete(prefix + '/organisations/:id/dns/zones/:zoneId', async (ctx: any) => {
    const f = await requireFeature(ctx, 'dns'); if (f !== true) return f;
    const org = await orgRepo.findOne({ where: { id: Number(ctx.params['id']) } });
    if (!org) {
      ctx.set.status = 404;
      return { error: 'Organisation not found' };
    }
    const user = ctx.user as User;
    if (!(await userCanManageOrg(ctx, user, org))) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }

    const zoneId = Number(ctx.params['zoneId']);
    const zone = await dnsZoneRepo.findOne({ where: { id: zoneId, organisationId: org.id } });
    if (!zone) {
      ctx.set.status = 404;
      return { error: 'Zone not found' };
    }

    const mainZoneName = (process.env.CLOUDFLARE_BASE_ZONE || 'ecli.app').replace(/\.$/, '');
    const svc = createDnsService();

    try {
      const mainZone = await svc.getZone(mainZoneName);
      const records = (mainZone.recordsList || mainZone.rrsets || []).filter((r: any) => {
        const name = String(r.name || '').replace(/\.$/, '');
        const zoneName = zone.name.replace(/\.$/, '');
        return name === zoneName || name.endsWith(`.${zoneName}`);
      });

      for (const r of records) {
        try {
          await svc.deleteRecord(mainZone.id, String(r.id));
        } catch {
          // skip
        }
      }
    } catch {
      // skip
    }

    await dnsZoneRepo.delete({ id: zoneId, organisationId: org.id });
    return { success: true };
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Delete organisation DNS zone', tags: ['Organisations', 'DNS'] }
  });

  app.put(prefix + '/organisations/:id', async (ctx: any) => {
    const org = await orgRepo.findOneBy({ id: Number(ctx.params['id']) });
    if (!org) {
      ctx.set.status = 404;
      return { error: 'Organisation not found' };
    }
    const user = ctx.user as User;
    if (user.id !== org.ownerId && !hasPermissionSync(ctx, 'org:write')) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    const { name, portalTier } = ctx.body as any;
    if (name) org.name = name;
    if (portalTier) org.portalTier = portalTier;
    await orgRepo.save(org);
    const actorMembership = await getMembership(user.id, org.id);
    return { success: true, org: sanitizeOrg(org, { orgRole: actorMembership?.orgRole || (org.ownerId === user.id ? 'owner' : undefined) }) };
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean(), org: t.Any() }), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Update organisation', tags: ['Organisations'] }
  });

  app.get(prefix + '/organisations/:id/users', async (ctx: any) => {
    const org = await orgRepo.findOne({ where: { id: Number(ctx.params['id']) } });
    if (!org) {
      ctx.set.status = 404;
      return { error: 'Organisation not found' };
    }
    const user = ctx.user as User;
    const actorMembership = await getMembership(user.id, org.id);
    const actorIsOrgAdminOrStaff = user.id === org.ownerId || actorMembership?.orgRole === 'admin' || actorMembership?.orgRole === 'owner' || hasPermissionSync(ctx, 'org:read');
    if (!actorIsOrgAdminOrStaff) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    return await listMembersForOrg(org.id);
  }, {
    beforeHandle: authenticate,
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
    const actorMembership = await getMembership(user.id, org.id);
    const actorIsOrgAdminOrStaff = user.id === org.ownerId || actorMembership?.orgRole === 'admin' || actorMembership?.orgRole === 'owner' || hasPermissionSync(ctx, 'org:write');
    if (!actorIsOrgAdminOrStaff) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    const targetUserId = Number(ctx.params['userId']);
    const targetMembership = await getMembership(targetUserId, org.id);
    if (!targetMembership) {
      ctx.set.status = 404;
      return { error: 'User not found in org' };
    }
    if (targetMembership.orgRole === 'owner' || targetUserId === org.ownerId) {
      ctx.set.status = 403;
      return { error: 'Cannot remove organisation owner' };
    }
    await memberRepo.remove(targetMembership);
    await createActivityLog({ userId: user.id, action: 'org:remove_member', targetId: String(org.id), targetType: 'organisation', metadata: { removedUserId: targetUserId }, ipAddress: ctx.ip });
    return { success: true };
  }, {
    beforeHandle: authenticate,
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
    const actorMembership = await getMembership(user.id, org.id);
    const actorIsOrgAdminOrStaff = user.id === org.ownerId || actorMembership?.orgRole === 'admin' || actorMembership?.orgRole === 'owner' || hasPermissionSync(ctx, 'org:write');
    if (!actorIsOrgAdminOrStaff) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    const targetUserId = Number(ctx.params['userId']);
    const targetMembership = await getMembership(targetUserId, org.id);
    if (!targetMembership) {
      ctx.set.status = 404;
      return { error: 'User not found in org' };
    }
    const { orgRole } = ctx.body as any;
    if (!['member', 'admin', 'owner'].includes(orgRole)) {
      ctx.set.status = 400;
      return { error: 'Invalid role' };
    }
    if (orgRole === 'owner' && user.id !== org.ownerId && !hasPermissionSync(ctx, 'org:write')) {
      ctx.set.status = 403;
      return { error: 'Only owner can transfer ownership' };
    }
    targetMembership.orgRole = orgRole;
    if (orgRole === 'owner') {
      const prevOwnerMembership = await getMembership(org.ownerId, org.id);
      if (prevOwnerMembership && prevOwnerMembership.userId !== targetUserId) {
        prevOwnerMembership.orgRole = 'admin';
        await memberRepo.save(prevOwnerMembership);
      }
      org.ownerId = targetUserId;
      await orgRepo.save(org);
    }
    await memberRepo.save(targetMembership);
    await createActivityLog({ userId: user.id, action: 'org:change_role', targetId: String(org.id), targetType: 'organisation', metadata: { targetUserId, newRole: orgRole }, ipAddress: ctx.ip });
    return { success: true, target: targetMembership };
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean(), target: t.Any() }), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Change user role within organisation', tags: ['Organisations'] }
  });

  app.post(prefix + '/organisations/:id/invite', async (ctx: any) => {
    const org = await orgRepo.findOneBy({ id: Number(ctx.params['id']) });
    if (!org) {
      ctx.set.status = 404;
      return { error: 'Organisation not found' };
    }
    const inviter = ctx.user as User;
    const actorMembership = await getMembership(inviter.id, org.id);
    const actorIsOrgAdmin = inviter.id === org.ownerId || actorMembership?.orgRole === 'admin' || actorMembership?.orgRole === 'owner' || hasPermissionSync(ctx, 'org:write');
    if (!actorIsOrgAdmin) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }

    const rawEmail = ctx.body?.email;
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
    if (!email) {
      ctx.set.status = 400;
      return { error: 'email required' };
    }
    if (email === inviter.email?.toLowerCase()) {
      ctx.set.status = 400;
      return { error: 'Cannot invite yourself' };
    }

    const targetUser = await userRepo.findOneBy({ email }).catch(() => null);
    if (targetUser) {
      const existingTargetMembership = await getMembership(targetUser.id, org.id);
      if (existingTargetMembership) {
        ctx.set.status = 409;
        return { error: 'User already in organisation' };
      }
    }

    const existingInvite = await inviteRepo.findOne({ where: { organisation: org, email, accepted: false } as any });
    if (existingInvite) {
      ctx.set.status = 409;
      return { error: 'Invite already sent' };
    }

    const token = uuidv4();
    const inv = inviteRepo.create({ organisation: org, email, token, accepted: false, createdAt: new Date() });
    await inviteRepo.save(inv);
    await createActivityLog({ userId: inviter.id, action: 'org:invite', targetId: String(org.id), targetType: 'organisation', metadata: { invitedEmail: email }, ipAddress: ctx.ip });

    const panelUrl = resolvePanelBaseUrl(ctx);
    const panelEmail = targetUser ? (await getMailboxAccountForUser(targetUser.id).catch(() => null))?.email : null;
    const recipients = Array.from(new Set([email, panelEmail].filter(Boolean) as string[]));
    try {
      const { sendMail } = require('../services/mailService');
      await sendMail({
        to: recipients,
        from: process.env.SMTP_USER || 'noreply@ecli.app',
        subject: `Invitation to join ${org.name}`,
        template: 'invite',
        vars: {
          name: email.split('@')[0],
          orgName: org.name,
          link: `${panelUrl}/accept?token=${token}`,
        },
      });

      if (targetUser && panelEmail) {
        await createMailboxMessageForUser(targetUser, {
          subject: `Invitation to join ${org.name}`,
          body: `You have been invited to join the organisation ${org.name}. Review the invitation at ${panelUrl}/accept?token=${token}`,
          toAddress: panelEmail,
        });
      }
    } catch (e) {
      app.log.error({ err: e }, 'failed to send invite email');
    }
    return { success: true, token };
  }, {
    beforeHandle: [authenticate, authorize('org:invite')],
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
      const panelUrl = resolvePanelBaseUrl(ctx);
      const { sendMail } = require('../services/mailService');
      await sendMail({
        to: inv.email,
        from: process.env.SMTP_USER || 'noreply@ecli.app',
        subject: `Invitation to join ${org.name}`,
        template: 'invite',
        vars: {
          name: inv.email.split('@')[0],
          orgName: org.name,
          link: `${panelUrl}/accept?token=${inv.token}`,
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
    const actorMembership = await getMembership(actor.id, org.id);
    const actorIsOrgAdmin = actor.id === org.ownerId || actorMembership?.orgRole === 'admin' || actorMembership?.orgRole === 'owner' || hasPermissionSync(ctx, 'org:write');
    if (!actorIsOrgAdmin) {
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
    const existingMembership = await getMembership(target.id, org.id);
    if (existingMembership) {
      ctx.set.status = 409;
      return { error: 'User already in organisation' };
    }
    const newRole = ['member', 'admin', 'owner'].includes(orgRole) ? orgRole : 'member';
    const membership = memberRepo.create({ userId: target.id, organisationId: org.id, user: target, organisation: org, orgRole: newRole as any, createdAt: new Date() });
    await memberRepo.save(membership);
    if (newRole === 'owner') {
      org.ownerId = target.id;
      await orgRepo.save(org);
    }
    await createActivityLog({ userId: actor.id, action: 'org:add_user', targetId: String(org.id), targetType: 'organisation', metadata: { addedUserId: target.id }, ipAddress: ctx.ip });
    return { success: true, target: { id: target.id, email: target.email, firstName: target.firstName, lastName: target.lastName, orgRole: membership.orgRole } };
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
    const existingMembership = await getMembership(user.id, inv.organisation.id);
    if (!existingMembership) {
      const membership = memberRepo.create({ userId: user.id, organisationId: inv.organisation.id, user, organisation: inv.organisation, orgRole: 'member', createdAt: new Date() });
      await memberRepo.save(membership);
    }
    inv.accepted = true;
    await inviteRepo.save(inv);
    await createActivityLog({ userId: user.id, action: 'org:accept_invite', targetId: String(inv.organisation.id), targetType: 'organisation', ipAddress: ctx.ip });
    return { success: true };
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean() }), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Accept organisation invite', tags: ['Organisations'] }
  });

  app.get(prefix + '/organisations/invites', async (ctx: any) => {
    const user = ctx.user as User;
    if (!user) {
      ctx.set.status = 401;
      return { error: 'Unauthorized' };
    }
    const invites = await inviteRepo.find({ where: { email: user.email, accepted: false }, relations: ['organisation'], order: { createdAt: 'ASC' } });
    return invites.map((invite) => ({
      id: invite.id,
      organisationId: invite.organisation?.id || null,
      organisationName: invite.organisation?.name || null,
      organisationExists: !!invite.organisation,
      email: invite.email,
      createdAt: invite.createdAt,
    }));
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }) },
    detail: { summary: 'List pending organisation invites for current user', tags: ['Organisations'] }
  });

  app.post(prefix + '/organisations/invites/:inviteId/accept', async (ctx: any) => {
    const user = ctx.user as User;
    if (!user) {
      ctx.set.status = 401;
      return { error: 'Unauthorized' };
    }
    const inviteId = Number(ctx.params['inviteId']);
    const inv = await inviteRepo.findOne({ where: { id: inviteId, accepted: false }, relations: ['organisation'] });
    if (!inv) {
      ctx.set.status = 404;
      return { error: 'Invite not found' };
    }
    if (user.email !== inv.email) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    if (!inv.organisation) {
      ctx.set.status = 404;
      return { error: 'Organisation not found' };
    }
    const existingMembership = await getMembership(user.id, inv.organisation.id);
    if (!existingMembership) {
      const membership = memberRepo.create({ userId: user.id, organisationId: inv.organisation.id, user, organisation: inv.organisation, orgRole: 'member', createdAt: new Date() });
      await memberRepo.save(membership);
    }
    inv.accepted = true;
    await inviteRepo.save(inv);
    await createActivityLog({ userId: user.id, action: 'org:accept_invite', targetId: String(inv.organisation.id), targetType: 'organisation', ipAddress: ctx.ip });
    return { success: true };
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Accept a pending organisation invite', tags: ['Organisations'] }
  });

  app.post(prefix + '/organisations/invites/:inviteId/reject', async (ctx: any) => {
    const user = ctx.user as User;
    if (!user) {
      ctx.set.status = 401;
      return { error: 'Unauthorized' };
    }
    const inviteId = Number(ctx.params['inviteId']);
    const inv = await inviteRepo.findOne({ where: { id: inviteId, accepted: false } });
    if (!inv) {
      ctx.set.status = 404;
      return { error: 'Invite not found' };
    }
    if (user.email !== inv.email) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    await inviteRepo.delete({ id: inv.id });
    await createActivityLog({ userId: user.id, action: 'org:reject_invite', targetId: String(inv.organisation?.id || ''), targetType: 'organisation', metadata: { invitedEmail: inv.email }, ipAddress: ctx.ip });
    return { success: true };
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Reject a pending organisation invite', tags: ['Organisations'] }
  });

  app.post(prefix + '/organisations/:id/leave', async (ctx: any) => {
    const org = await orgRepo.findOneBy({ id: Number(ctx.params['id']) });
    if (!org) {
      ctx.set.status = 404;
      return { error: 'Organisation not found' };
    }
    const user = ctx.user as User;
    const membership = await getMembership(user.id, org.id);
    if (!user || !membership) {
      ctx.set.status = 403;
      return { error: 'Not a member of this organisation' };
    }
    if (org.ownerId === user.id) {
      ctx.set.status = 403;
      return { error: 'Owner cannot leave organisation without transferring ownership' };
    }

    await memberRepo.remove(membership);

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
      const base = (n as any).backendWingsUrl || n.url;
      const svc = new WingsApiService(base, n.token);
      const res = await svc.getServers();
      results.push(...(res.data || []).map((s: any) => ({ ...s, node: n.id })));
    }
    return results;
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }) },
    detail: { summary: 'List servers for organisation', tags: ['Organisations'] }
  });

  app.get(prefix + '/organisations/:id/nodes', async (ctx: any) => {
    const orgId = Number(ctx.params['id']);
    const repo = AppDataSource.getRepository(require('../models/node.entity').Node);
    const nodes = await repo.find({ where: { organisation: { id: orgId } } });
    return nodes;
  }, {
    beforeHandle: authenticate,
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
    if (!(await userCanManageOrg(ctx, user, org))) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    const { file } = (ctx.body || {}) as any;
    const uploadFile = Array.isArray(file) ? file[0] : file;
    if (!uploadFile) {
      ctx.set.status = 400;
      return { error: 'No file' };
    }

    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    const mime = (uploadFile.type || uploadFile.mimetype || '').toString();
    if (!allowed.includes(mime)) {
      ctx.set.status = 400;
      return { error: 'Invalid image type' };
    }

    const ab = await uploadFile.arrayBuffer();
    const buffer = Buffer.from(ab);
    
    let isAnimated = false;
    if (mime === 'image/gif' || mime === 'image/webp') {
      try {
        const meta = await sharp(buffer, { animated: true }).metadata();
        isAnimated = Number(meta.pages || 1) > 1;
      } catch {
        isAnimated = false;
      }
    }

    const preserveOriginalAnimation = (mime === 'image/gif' || mime === 'image/webp') && isAnimated;
    const out = preserveOriginalAnimation
      ? buffer
      : await resizeImage(buffer, 256, 256).catch(async (err) => {
        try {
          return await sharp(buffer).rotate().resize(256, 256, { fit: 'cover' }).toBuffer();
        } catch (e) {
          throw err || e;
        }
      });
    const originalName = uploadFile.name || uploadFile.filename || `avatar_org_${org.id}`;
    const ext = path.extname(originalName) || (mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : mime === 'image/gif' ? '.gif' : '.jpg');
    const filename = `avatar_org_${org.id}` + ext;

    const uploadDir = path.join(process.cwd(), 'uploads');
    fs.mkdirSync(uploadDir, { recursive: true });
    const filepath = path.join(uploadDir, filename);
    fs.writeFileSync(filepath, out);

    const backendBase = (process.env.BACKEND_URL || '').replace(/\/+$/, '') || (() => {
      const proto = (ctx.request.headers.get('x-forwarded-proto') || 'https') as string;
      const host = (ctx.request.headers.get('host') || 'localhost') as string;
      return `${proto}://${host}`;
    })();

    org.avatarUrl = `${backendBase}/uploads/${filename}`;
    await orgRepoLocal.save(org);
    return { success: true, url: org.avatarUrl };
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean(), url: t.String() }), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Upload organisation avatar', tags: ['Organisations'] }
  });
}
