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
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { resizeImage } from '../workers/imageWorker';
import { WingsApiService } from '../services/wingsApiService';
import { createActivityLog } from './logHandler';
import { CloudflareService } from '../services/cloudflareService';
import { t } from 'elysia';
import { errorMessage, sanitizeError } from '../utils/sanitizeError';
import { consumeRateLimit, redisDelByPrefix, withRedisCache } from '../config/redis';
import { resolvePanelBaseUrl } from '../utils/url';
import type { AuthenticatedHandlerContext, BaseHandlerContext, OrganisationApp, DnsRecordBody, CloudflareRecord, OrgUpdateBody, SanitizedUser, SanitizedInvite } from '../types';

function parseDnsRecordBody(body: unknown): DnsRecordBody | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const name = String(b.name || '').trim();
  const type = String(b.type || 'A').toUpperCase();
  const ttl = Number(b.ttl || 3600);
  const content = String(b.content || '').trim();
  const proxied = !!b.proxied;
  if (!content || !type) return null;
  return { name, type, ttl, content, proxied };
}

function createDnsService() {
  return new CloudflareService();
}

async function acceptInviteLogic(
  memberRepo: import('typeorm').Repository<OrganisationMember>,
  inviteRepo: import('typeorm').Repository<OrganisationInvite>,
  user: User,
  inv: OrganisationInvite,
  orgId: number,
  ipAddress: string
) {
  const existingMembership = await memberRepo.findOne({ where: { userId: user.id, organisationId: orgId } });
  if (!existingMembership) {
    const membership = memberRepo.create({
      userId: user.id,
      organisationId: orgId,
      user,
      organisation: inv.organisation,
      orgRole: 'member' as const,
      createdAt: new Date(),
    });
    await memberRepo.save(membership);
  }
  inv.accepted = true;
  await inviteRepo.save(inv);
  await createActivityLog({
    userId: user.id,
    action: 'org:accept_invite',
    targetId: String(orgId),
    targetType: 'organisation',
    ipAddress,
  });
  return { success: true };
}

export async function organisationRoutes(app: OrganisationApp, prefix = '') {
  const orgRepo = AppDataSource.getRepository(Organisation);
  const dnsZoneRepo = AppDataSource.getRepository(OrganisationDnsZone);
  const inviteRepo = AppDataSource.getRepository(OrganisationInvite);
  const memberRepo = AppDataSource.getRepository(OrganisationMember);
  const userRepo = AppDataSource.getRepository(User);

  function sanitizeOrg(
    o: Organisation | undefined,
    opts?: { orgRole?: string; users?: SanitizedUser[]; invites?: SanitizedInvite[] }
  ) {
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

  async function listMembersForOrg(organisationId: number) {
    const memberships = await memberRepo.find({
      where: { organisationId },
      relations: { user: true },
    });
    return (Array.isArray(memberships) ? memberships : [])
      .map((m: OrganisationMember) => {
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

  function getRequesterIp(ctx: BaseHandlerContext): string {
    const forwarded = String(ctx?.headers?.['x-forwarded-for'] || '').trim();
    const firstForwarded = forwarded.split(',')[0]?.trim();
    const direct = String(ctx?.ip || '').trim();
    return (firstForwarded || direct || 'unknown').slice(0, 100);
  }

  async function enforceOrgUpdateRateLimit(ctx: BaseHandlerContext, userId: number) {
    try {
      const ip = getRequesterIp(ctx);
      const key = `rate:org-update:user:${userId}:ip:${ip}`;
      const result = await consumeRateLimit(key, 6, 60);
      if (result.allowed) return null;

      ctx.set.status = 429;
      ctx.set.headers = {
        ...(ctx.set.headers || {}),
        'Retry-After': String(result.retryAfterSeconds),
      };
      return { error: 'rate_limited', retryAfter: result.retryAfterSeconds };
    } catch {
      return null;
    }
  }

  async function enforceDnsMutationRateLimit(
    ctx: BaseHandlerContext,
    userId: number,
    scope: string,
    limit: number,
    windowSeconds: number
  ) {
    try {
      const ip = getRequesterIp(ctx);
      const key = `rate:dns:${scope}:user:${userId}:ip:${ip}`;
      const result = await consumeRateLimit(key, limit, windowSeconds);
      if (result.allowed) return null;

      ctx.set.status = 429;
      ctx.set.headers = {
        ...(ctx.set.headers || {}),
        'Retry-After': String(result.retryAfterSeconds),
      };
      return { error: 'rate_limited', retryAfter: result.retryAfterSeconds };
    } catch {
      return null;
    }
  }

  app.get(
    prefix + '/organisations',
    async (ctx: AuthenticatedHandlerContext) => {
      const user = ctx.user as User;
      return withRedisCache(`organisations:list:${user.id}:v1`, 20, async () => {
        const memberships = await memberRepo.find({
          where: { userId: user.id },
          relations: { organisation: true },
        });
        const orgs: Organisation[] = memberships.map((m: OrganisationMember) => m.organisation).filter(Boolean);
        const roleByOrgId = new Map<number, string>();
        for (const m of memberships) roleByOrgId.set(m.organisationId, m.orgRole || 'member');
        const owned = await orgRepo.find({ where: { ownerId: user.id } });
        for (const o of owned) {
          if (!orgs.some(x => x.id === o.id)) orgs.push(o);
        }
        return orgs.map(org =>
          sanitizeOrg(org, {
            orgRole: roleByOrgId.get(org.id) || (org.ownerId === user.id ? 'owner' : 'member'),
          })
        );
      });
    },
    {
      beforeHandle: authenticate,
      response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }) },
      detail: { summary: 'List organisations accessible to the user', tags: ['Organisations'] },
    }
  );

  app.post(
    prefix + '/organisations',
    async (ctx: AuthenticatedHandlerContext) => {
      const user = ctx.user as User;
      const body = ctx.body as Record<string, unknown>;
      const rawName = body.name;
      const rawHandle = body.handle;
      if (!rawName || !rawHandle) {
        ctx.set.status = 400;
        return { error: ctx.t('validation.nameAndHandleRequired') };
      }
      const name = String(rawName);
      const handle = String(rawHandle);
      if (!/^([a-z0-9]+\.)+[a-z]{2,}$/.test(handle)) {
        ctx.set.status = 400;
        return { error: ctx.t('organisation.invalidHandle') };
      }
      const existing = await orgRepo.findOneBy({ handle });
      if (existing) {
        ctx.set.status = 409;
        return { error: ctx.t('organisation.handleTaken') };
      }
      const org = orgRepo.create({ name, handle, ownerId: user.id });
      await orgRepo.save(org);
      const ownerMembership = memberRepo.create({
        userId: user.id,
        organisationId: org.id,
        user,
        organisation: org,
        orgRole: 'owner',
        createdAt: new Date(),
      });
      await memberRepo.save(ownerMembership);

      void (async () => {
        try {
          const zoneName = handle.replace(/\.$/, '');
          const existingZone = await dnsZoneRepo.findOne({
            where: { organisationId: org.id, name: zoneName },
          });
          if (!existingZone) {
            const zone = dnsZoneRepo.create({
              organisation: org,
              organisationId: org.id,
              name: zoneName,
              kind: 'cloudflare',
              status: 'active',
            });
            await dnsZoneRepo.save(zone);
          }
        } catch (e) {
          // skip
        }
      })();

      await createActivityLog({
        userId: user.id,
        action: 'org:create',
        targetId: String(org.id),
        targetType: 'organisation',
        metadata: { orgName: name, handle },
        ipAddress: ctx.ip,
      });
      return { success: true, org: sanitizeOrg(org, { orgRole: 'owner' }) };
    },
    {
      beforeHandle: [authenticate, authorize('org:create')],
      response: {
        200: t.Object({ success: t.Boolean(), org: t.Any() }),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        409: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Create a new organisation', tags: ['Organisations'] },
    }
  );

  async function userCanManageOrg(ctx: BaseHandlerContext, user: User, org: Organisation) {
    const membership = await getMembership(user.id, org.id);
    return (
      hasPermissionSync(ctx, 'org:write') ||
      user.role === 'staff' ||
      user.id === org.ownerId ||
      !!membership
    );
  }

  app.get(
    prefix + '/organisations/:id',
    async (ctx: AuthenticatedHandlerContext) => {
      const org = await orgRepo.findOne({ where: { id: Number(ctx.params['id']) } });
      if (!org) {
        ctx.set.status = 404;
        return { error: ctx.t('organisation.notFound') };
      }
      const user = ctx.user as User;
      const membership = await getMembership(user.id, org.id);
      if (user.id !== org.ownerId && !membership && !hasPermissionSync(ctx, 'org:read')) {
        ctx.set.status = 403;
        return { error: ctx.t('common.forbidden') };
      }
      return withRedisCache(`organisations:detail:${user.id}:${org.id}:v1`, 15, async () => {
        const users = await listMembersForOrg(org.id);
        const invites = await inviteRepo.find({ where: { organisation: { id: org.id } } });
        return sanitizeOrg(org, {
          orgRole: membership?.orgRole || (org.ownerId === user.id ? 'owner' : undefined),
          users,
          invites: (invites || []).map((i: OrganisationInvite) => ({
            id: i.id,
            email: i.email,
            accepted: i.accepted,
          })),
        });
      });
    },
    {
      beforeHandle: authenticate,
      response: {
        200: t.Any(),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Get organisation by id', tags: ['Organisations'] },
    }
  );

  app.get(
    prefix + '/organisations/:id/dns/zones',
    async (ctx: AuthenticatedHandlerContext) => {
      const f = await requireFeature(ctx, 'dns');
      if (f !== true) return f;
      const org = await orgRepo.findOne({ where: { id: Number(ctx.params['id']) } });
      if (!org) {
        ctx.set.status = 404;
        return { error: ctx.t('organisation.notFound') };
      }
      const user = ctx.user as User;
      try {
        ctx.log?.info?.(
          {
            action: 'org:dns:delete:auth-check',
            userId: user?.id,
            userRole: user?.role,
            orgId: org?.id,
            orgOwnerId: org?.ownerId,
          },
          'org DNS delete auth check'
        );
      } catch {}

      if (!(await userCanManageOrg(ctx, user, org))) {
        ctx.log?.info?.(
          {
            action: 'org:dns:delete:forbidden',
            userId: user?.id,
            userRole: user?.role,
            orgId: org?.id,
          },
          'forbidden org DNS delete attempt'
        );
        ctx.set.status = 403;
        return { error: ctx.t('common.forbidden') };
      }

      try {
        return await withRedisCache(
          `organisations:dns-zones:${org.id}:${user.id}:v1`,
          15,
          async () => {
            const zones = await dnsZoneRepo.find({
              where: { organisationId: org.id },
              order: { createdAt: 'ASC' },
            });
            return zones.map((z: OrganisationDnsZone) => ({
              id: z.id,
              name: String(z.name || '').replace(/\.$/, ''),
              kind: String(z.kind || 'cloudflare').toLowerCase(),
              status: z.status,
            }));
          }
        );
      } catch (e: unknown) {
        ctx.set.status = 500;
        console.error('[organisationHandler:dns-zones]', e);
        return { error: sanitizeError(e, 'organisationHandler:dns-zones') };
      }
    },
    {
      beforeHandle: authenticate,
      response: {
        200: t.Array(t.Any()),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        500: t.Object({ error: t.String() }),
      },
      detail: { summary: 'List organisation DNS subdomains', tags: ['Organisations', 'DNS'] },
    }
  );

  app.post(
    prefix + '/organisations/:id/dns/zones',
    async (ctx: AuthenticatedHandlerContext) => {
      const f = await requireFeature(ctx, 'dns');
      if (f !== true) return f;
      const org = await orgRepo.findOne({ where: { id: Number(ctx.params['id']) } });
      if (!org) {
        ctx.set.status = 404;
        return { error: ctx.t('organisation.notFound') };
      }
      const user = ctx.user as User;
      if (!(await userCanManageOrg(ctx, user, org))) {
        ctx.set.status = 403;
        return { error: ctx.t('common.forbidden') };
      }
      const dnsRateLimit = await enforceDnsMutationRateLimit(ctx, user.id, 'zone-create', 6, 60);
      if (dnsRateLimit) return dnsRateLimit;

      const body = ctx.body as Record<string, unknown>;
      const rawName = String(body.name || '')
        .trim()
        .replace(/\.$/, '');
      if (!rawName) {
        ctx.set.status = 400;
        return { error: ctx.t('organisation.subdomainRequired') };
      }

      const handle = org.handle.replace(/\.$/, '');
      if (rawName !== handle) {
        ctx.set.status = 403;
        return { error: ctx.t('system.onlyOrgZone') };
      }

      try {
        let zone = await dnsZoneRepo.findOne({ where: { organisationId: org.id, name: rawName } });
        if (!zone) {
          zone = dnsZoneRepo.create({
            organisation: org,
            organisationId: org.id,
            name: rawName,
            kind: 'cloudflare',
            status: 'active',
          });
          zone = await dnsZoneRepo.save(zone);
        }
        try {
          await redisDelByPrefix(`organisations:dns-zones:${org.id}:`);
        } catch {}
        return { id: zone.id, name: zone.name, kind: zone.kind, status: zone.status };
      } catch (e: unknown) {
        ctx.set.status = 500;
        return { error: errorMessage(e, 'Failed to create org DNS zone') };
      }
    },
    {
      beforeHandle: authenticate,
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        429: t.Object({ error: t.String(), retryAfter: t.Number() }),
        500: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Create organisation DNS subdomain', tags: ['Organisations', 'DNS'] },
    }
  );

  app.get(
    prefix + '/organisations/:id/dns/zones/:zoneId',
    async (ctx: AuthenticatedHandlerContext) => {
      const f = await requireFeature(ctx, 'dns');
      if (f !== true) return f;
      const org = await orgRepo.findOne({ where: { id: Number(ctx.params['id']) } });
      if (!org) {
        ctx.set.status = 404;
        return { error: ctx.t('organisation.notFound') };
      }
      const user = ctx.user as User;
      if (!(await userCanManageOrg(ctx, user, org))) {
        ctx.set.status = 403;
        return { error: ctx.t('common.forbidden') };
      }

      const zoneId = Number(ctx.params['zoneId']);
      const zone = await dnsZoneRepo.findOne({ where: { id: zoneId, organisationId: org.id } });
      if (!zone) {
        ctx.set.status = 404;
        return { error: ctx.t('organisation.zoneNotFound') };
      }

      const zoneName = String(zone.name || '').replace(/\.$/, '');
      const orgHandle = String(org.handle || '').replace(/\.$/, '');

      const mainZoneName = (process.env.CLOUDFLARE_BASE_ZONE || 'ecli.app').replace(/\.$/, '');
      const svc = createDnsService();
      try {
        const mainZone = await svc.getZone(mainZoneName);
        const records: CloudflareRecord[] = [];
        const allRecords: CloudflareRecord[] = mainZone.recordsList || mainZone.rrsets || [];
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
      } catch (e: unknown) {
        return {
          id: zone.id,
          name: zone.name,
          kind: zone.kind,
          status: zone.status,
          recordsList: [],
        };
      }
    },
    {
      beforeHandle: authenticate,
      response: {
        200: t.Any(),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
        500: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Get organisation DNS zone', tags: ['Organisations', 'DNS'] },
    }
  );

  app.post(
    prefix + '/organisations/:id/dns/zones/:zoneId/records',
    async (ctx: AuthenticatedHandlerContext) => {
      const f = await requireFeature(ctx, 'dns');
      if (f !== true) return f;
      try {
        const org = await orgRepo.findOne({ where: { id: Number(ctx.params['id']) } });
        if (!org) {
          ctx.set.status = 404;
          return { error: ctx.t('organisation.notFound') };
        }
        const user = ctx.user as User;
        if (!(await userCanManageOrg(ctx, user, org))) {
          ctx.set.status = 403;
          return { error: ctx.t('common.forbidden') };
        }
        const dnsRateLimit = await enforceDnsMutationRateLimit(
          ctx,
          user.id,
          'record-create',
          20,
          60
        );
        if (dnsRateLimit) return dnsRateLimit;

        const zoneId = Number(ctx.params['zoneId']);
        const zone = await dnsZoneRepo.findOne({ where: { id: zoneId, organisationId: org.id } });
        if (!zone) {
          ctx.set.status = 404;
          return { error: ctx.t('organisation.zoneNotFound') };
        }

        const parsed = parseDnsRecordBody(ctx.body);
        if (!parsed) {
          ctx.set.status = 400;
          return { error: ctx.t('organisation.recordTypeAndContentRequired') };
        }
        const { name, type, ttl, content, proxied } = parsed;
        const allowedTypes = ['A', 'AAAA', 'CNAME', 'TXT'];
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
      } catch (e: unknown) {
        ctx.set.status = 500;
        return { error: errorMessage(e, 'Internal error') };
      }
    },
    {
      beforeHandle: authenticate,
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
        429: t.Object({ error: t.String(), retryAfter: t.Number() }),
        502: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Create organisation DNS record', tags: ['Organisations', 'DNS'] },
    }
  );

  app.put(
    prefix + '/organisations/:id/dns/zones/:zoneId/records/:recordId',
    async (ctx: AuthenticatedHandlerContext) => {
      const f = await requireFeature(ctx, 'dns');
      if (f !== true) return f;
      try {
        const org = await orgRepo.findOne({ where: { id: Number(ctx.params['id']) } });
        if (!org) {
          ctx.set.status = 404;
          return { error: ctx.t('organisation.notFound') };
        }
        const user = ctx.user as User;
        if (!(await userCanManageOrg(ctx, user, org))) {
          ctx.set.status = 403;
          return { error: ctx.t('common.forbidden') };
        }
        const dnsRateLimit = await enforceDnsMutationRateLimit(
          ctx,
          user.id,
          'record-update',
          20,
          60
        );
        if (dnsRateLimit) return dnsRateLimit;

        const zoneId = Number(ctx.params['zoneId']);
        const zone = await dnsZoneRepo.findOne({ where: { id: zoneId, organisationId: org.id } });
        if (!zone) {
          ctx.set.status = 404;
          return { error: ctx.t('organisation.zoneNotFound') };
        }

        const recordId = String(ctx.params['recordId']);
        const parsed = parseDnsRecordBody(ctx.body);
        if (!parsed) {
          ctx.set.status = 400;
          return { error: ctx.t('organisation.recordTypeAndContentRequired') };
        }
        const { name, type, ttl, content, proxied } = parsed;
        const allowedTypes = ['A', 'AAAA', 'CNAME', 'TXT'];
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
      } catch (e: unknown) {
        ctx.set.status = 500;
        return { error: errorMessage(e, 'Internal error') };
      }
    },
    {
      beforeHandle: authenticate,
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
        429: t.Object({ error: t.String(), retryAfter: t.Number() }),
        502: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Update organisation DNS record', tags: ['Organisations', 'DNS'] },
    }
  );

  app.delete(
    prefix + '/organisations/:id/dns/zones/:zoneId/records/:recordId',
    async (ctx: AuthenticatedHandlerContext) => {
      const f = await requireFeature(ctx, 'dns');
      if (f !== true) return f;
      const org = await orgRepo.findOne({ where: { id: Number(ctx.params['id']) } });
      if (!org) {
        ctx.set.status = 404;
        return { error: ctx.t('organisation.notFound') };
      }
      const user = ctx.user as User;
      if (!(await userCanManageOrg(ctx, user, org))) {
        ctx.set.status = 403;
        return { error: ctx.t('common.forbidden') };
      }
      const dnsRateLimit = await enforceDnsMutationRateLimit(ctx, user.id, 'record-delete', 20, 60);
      if (dnsRateLimit) return dnsRateLimit;

      const zoneId = Number(ctx.params['zoneId']);
      const zone = await dnsZoneRepo.findOne({ where: { id: zoneId, organisationId: org.id } });
      if (!zone) {
        ctx.set.status = 404;
        return { error: ctx.t('organisation.zoneNotFound') };
      }

      const recordId = String(ctx.params['recordId']);
      const svc = createDnsService();
      const mainZoneName = (process.env.CLOUDFLARE_BASE_ZONE || 'ecli.app').replace(/\.$/, '');
      try {
        const mainZone = await svc.getZone(mainZoneName);
        const result = await svc.deleteRecord(mainZone.id, recordId);
        return result;
      } catch (e: unknown) {
        ctx.set.status = 502;
        return { error: errorMessage(e, 'Failed to delete DNS record') };
      }
    },
    {
      beforeHandle: authenticate,
      response: {
        200: t.Any(),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
        429: t.Object({ error: t.String(), retryAfter: t.Number() }),
        502: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Delete organisation DNS record', tags: ['Organisations', 'DNS'] },
    }
  );

  app.delete(
    prefix + '/organisations/:id/dns/zones/:zoneId',
    async (ctx: AuthenticatedHandlerContext) => {
      const f = await requireFeature(ctx, 'dns');
      if (f !== true) return f;
      const org = await orgRepo.findOne({ where: { id: Number(ctx.params['id']) } });
      if (!org) {
        ctx.set.status = 404;
        return { error: ctx.t('organisation.notFound') };
      }
      const user = ctx.user as User;
      if (!(await userCanManageOrg(ctx, user, org))) {
        ctx.set.status = 403;
        return { error: ctx.t('common.forbidden') };
      }
      const dnsRateLimit = await enforceDnsMutationRateLimit(ctx, user.id, 'zone-delete', 6, 60);
      if (dnsRateLimit) return dnsRateLimit;

      const zoneId = Number(ctx.params['zoneId']);
      const zone = await dnsZoneRepo.findOne({ where: { id: zoneId, organisationId: org.id } });
      if (!zone) {
        ctx.set.status = 404;
        return { error: ctx.t('organisation.zoneNotFound') };
      }

      const mainZoneName = (process.env.CLOUDFLARE_BASE_ZONE || 'ecli.app').replace(/\.$/, '');
      const svc = createDnsService();

      try {
        const mainZone = await svc.getZone(mainZoneName);
        const records = (mainZone.recordsList || mainZone.rrsets || []).filter((r: CloudflareRecord) => {
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
      try {
        await redisDelByPrefix(`organisations:dns-zones:${org.id}:`);
      } catch {}
      return { success: true };
    },
    {
      beforeHandle: authenticate,
      response: {
        200: t.Object({ success: t.Boolean() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
        429: t.Object({ error: t.String(), retryAfter: t.Number() }),
      },
      detail: { summary: 'Delete organisation DNS zone', tags: ['Organisations', 'DNS'] },
    }
  );

  app.put(
    prefix + '/organisations/:id',
    async (ctx: AuthenticatedHandlerContext) => {
      const org = await orgRepo.findOneBy({ id: Number(ctx.params['id']) });
      if (!org) {
        ctx.set.status = 404;
        return { error: ctx.t('organisation.notFound') };
      }
      const user = ctx.user as User;
      const userMembership = await getMembership(user.id, org.id);
      if (user.id !== org.ownerId && userMembership?.orgRole !== 'admin' && userMembership?.orgRole !== 'owner' && !hasPermissionSync(ctx, 'org:write')) {
        ctx.set.status = 403;
        return { error: ctx.t('common.forbidden') };
      }
      const orgRateLimit = await enforceOrgUpdateRateLimit(ctx, user.id);
      if (orgRateLimit) return orgRateLimit;

      const body = ctx.body as Record<string, unknown>;
      const { name, portalTier } = body as OrgUpdateBody;
      if (name) org.name = name;
      if (portalTier) org.portalTier = portalTier;
      await orgRepo.save(org);
      const actorMembership = await getMembership(user.id, org.id);
      return {
        success: true,
        org: sanitizeOrg(org, {
          orgRole: actorMembership?.orgRole || (org.ownerId === user.id ? 'owner' : undefined),
        }),
      };
    },
    {
      beforeHandle: authenticate,
      response: {
        200: t.Object({ success: t.Boolean(), org: t.Any() }),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
        429: t.Object({ error: t.String(), retryAfter: t.Number() }),
      },
      detail: { summary: 'Update organisation', tags: ['Organisations'] },
    }
  );

  app.get(
    prefix + '/organisations/:id/users',
    async (ctx: AuthenticatedHandlerContext) => {
      const org = await orgRepo.findOne({ where: { id: Number(ctx.params['id']) } });
      if (!org) {
        ctx.set.status = 404;
        return { error: ctx.t('organisation.notFound') };
      }
      const user = ctx.user as User;
      const actorMembership = await getMembership(user.id, org.id);
      const actorIsOrgAdminOrStaff =
        user.id === org.ownerId ||
        actorMembership?.orgRole === 'admin' ||
        actorMembership?.orgRole === 'owner' ||
        hasPermissionSync(ctx, 'org:read');
      if (!actorIsOrgAdminOrStaff) {
        ctx.set.status = 403;
        return { error: ctx.t('common.forbidden') };
      }
      return withRedisCache(`organisations:users:${user.id}:${org.id}:v1`, 15, async () => {
        return await listMembersForOrg(org.id);
      });
    },
    {
      beforeHandle: authenticate,
      response: {
        200: t.Array(t.Any()),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
      detail: { summary: 'List users in organisation', tags: ['Organisations'] },
    }
  );

  app.delete(
    prefix + '/organisations/:id/users/:userId',
    async (ctx: AuthenticatedHandlerContext) => {
      const org = await orgRepo.findOneBy({ id: Number(ctx.params['id']) });
      if (!org) {
        ctx.set.status = 404;
        return { error: ctx.t('organisation.notFound') };
      }
      const user = ctx.user as User;
      const actorMembership = await getMembership(user.id, org.id);
      const actorIsOrgAdminOrStaff =
        user.id === org.ownerId ||
        actorMembership?.orgRole === 'admin' ||
        actorMembership?.orgRole === 'owner' ||
        hasPermissionSync(ctx, 'org:write');
      if (!actorIsOrgAdminOrStaff) {
        ctx.set.status = 403;
        return { error: ctx.t('common.forbidden') };
      }
      const targetUserId = Number(ctx.params['userId']);
      const targetMembership = await getMembership(targetUserId, org.id);
      if (!targetMembership) {
        ctx.set.status = 404;
        return { error: ctx.t('user.userNotFoundInOrg') };
      }
      if (targetMembership.orgRole === 'owner' || targetUserId === org.ownerId) {
        ctx.set.status = 403;
        return { error: ctx.t('organisation.cannotRemoveOwner') };
      }
      await memberRepo.remove(targetMembership);
      await createActivityLog({
        userId: user.id,
        action: 'org:remove_member',
        targetId: String(org.id),
        targetType: 'organisation',
        metadata: { removedUserId: targetUserId },
        ipAddress: ctx.ip,
      });
      return { success: true };
    },
    {
      beforeHandle: authenticate,
      response: {
        200: t.Object({ success: t.Boolean() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Remove user from organisation', tags: ['Organisations'] },
    }
  );

  app.put(
    prefix + '/organisations/:id/users/:userId/role',
    async (ctx: AuthenticatedHandlerContext) => {
      const org = await orgRepo.findOneBy({ id: Number(ctx.params['id']) });
      if (!org) {
        ctx.set.status = 404;
        return { error: ctx.t('organisation.notFound') };
      }
      const user = ctx.user as User;
      const actorMembership = await getMembership(user.id, org.id);
      const actorIsOrgAdminOrStaff =
        user.id === org.ownerId ||
        actorMembership?.orgRole === 'admin' ||
        actorMembership?.orgRole === 'owner' ||
        hasPermissionSync(ctx, 'org:write');
      if (!actorIsOrgAdminOrStaff) {
        ctx.set.status = 403;
        return { error: ctx.t('common.forbidden') };
      }
      const targetUserId = Number(ctx.params['userId']);
      const targetMembership = await getMembership(targetUserId, org.id);
      if (!targetMembership) {
        ctx.set.status = 404;
        return { error: ctx.t('user.userNotFoundInOrg') };
      }
      const body = ctx.body as Record<string, unknown>;
      const rawRole = String(body.orgRole || '');
      if (!['member', 'admin', 'owner'].includes(rawRole)) {
        ctx.set.status = 400;
        return { error: ctx.t('validation.invalidRole') };
      }
      const orgRole = rawRole as 'member' | 'admin' | 'owner';
      if (orgRole === 'owner' && user.id !== org.ownerId && !hasPermissionSync(ctx, 'org:write')) {
        ctx.set.status = 403;
        return { error: ctx.t('organisation.onlyOwnerTransfer') };
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
      await createActivityLog({
        userId: user.id,
        action: 'org:change_role',
        targetId: String(org.id),
        targetType: 'organisation',
        metadata: { targetUserId, newRole: orgRole },
        ipAddress: ctx.ip,
      });
      return { success: true, target: targetMembership };
    },
    {
      beforeHandle: authenticate,
      response: {
        200: t.Object({ success: t.Boolean(), target: t.Any() }),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Change user role within organisation', tags: ['Organisations'] },
    }
  );

  app.post(
    prefix + '/organisations/:id/invite',
    async (ctx: AuthenticatedHandlerContext) => {
      const org = await orgRepo.findOneBy({ id: Number(ctx.params['id']) });
      if (!org) {
        ctx.set.status = 404;
        return { error: ctx.t('organisation.notFound') };
      }
      const inviter = ctx.user as User;
      const actorMembership = await getMembership(inviter.id, org.id);
      const actorIsOrgAdmin =
        inviter.id === org.ownerId ||
        actorMembership?.orgRole === 'admin' ||
        actorMembership?.orgRole === 'owner' ||
        hasPermissionSync(ctx, 'org:write');
      if (!actorIsOrgAdmin) {
        ctx.set.status = 403;
        return { error: ctx.t('common.forbidden') };
      }

      const rawEmail = (ctx.body as Record<string, unknown> | undefined)?.email;
      const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
      if (!email) {
        ctx.set.status = 400;
        return { error: ctx.t('validation.emailRequired_1') };
      }
      if (email === inviter.email?.toLowerCase()) {
        ctx.set.status = 400;
        return { error: ctx.t('organisation.cannotInviteSelf') };
      }

      const targetUser = await userRepo.findOneBy({ email }).catch(() => null);
      if (targetUser) {
        const existingTargetMembership = await getMembership(targetUser.id, org.id);
        if (existingTargetMembership) {
          ctx.set.status = 409;
          return { error: ctx.t('organisation.alreadyInOrg') };
        }
      }

      const existingInvite = await inviteRepo.findOne({
        where: { organisation: { id: org.id }, email, accepted: false } as import('typeorm').FindOptionsWhere<OrganisationInvite>,
      });
      if (existingInvite) {
        ctx.set.status = 409;
        return { error: ctx.t('organisation.inviteAlreadySent') };
      }

      const token = crypto.randomUUID();
      const inv = inviteRepo.create({
        organisation: org,
        email,
        token,
        accepted: false,
        createdAt: new Date(),
      });
      await inviteRepo.save(inv);
      await createActivityLog({
        userId: inviter.id,
        action: 'org:invite',
        targetId: String(org.id),
        targetType: 'organisation',
        metadata: { invitedEmail: email },
        ipAddress: ctx.ip,
      });

      const panelUrl = resolvePanelBaseUrl(ctx);
      const panelEmail = targetUser
        ? (await getMailboxAccountForUser(targetUser.id).catch(() => null))?.email
        : null;
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
          locale: ctx.locale,
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
    },
    {
      beforeHandle: [authenticate, authorize('org:invite')],
      response: {
        200: t.Object({ success: t.Boolean(), token: t.String() }),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Invite user to organisation', tags: ['Organisations'] },
    }
  );

  app.post(
    prefix + '/organisations/:id/invite/:inviteId/resend',
    async (ctx: AuthenticatedHandlerContext) => {
      const org = await orgRepo.findOneBy({ id: Number(ctx.params['id']) });
      if (!org) {
        ctx.set.status = 404;
        return { error: ctx.t('organisation.notFound') };
      }
      const inv = await inviteRepo.findOne({
        where: { id: Number(ctx.params['inviteId']) },
        relations: { organisation: true },
      });
      if (!inv || inv.organisation.id !== org.id) {
        ctx.set.status = 404;
        return { error: ctx.t('organisation.inviteNotFound') };
      }
      if (inv.accepted) {
        ctx.set.status = 400;
        return { error: ctx.t('organisation.inviteAlreadyAccepted') };
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
          locale: ctx.locale,
        });
        await createActivityLog({
          userId: (ctx.user as User).id,
          action: 'org:resend_invite',
          targetId: String(org.id),
          targetType: 'organisation',
          metadata: { inviteId: inv.id, invitedEmail: inv.email },
          ipAddress: ctx.ip,
        });
      } catch (e) {
        app.log.error({ err: e }, 'failed to resend invite email');
      }
      return { success: true };
    },
    {
      beforeHandle: [authenticate, authorize('org:invite')],
      response: {
        200: t.Object({ success: t.Boolean() }),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Resend organisation invite', tags: ['Organisations'] },
    }
  );

  app.delete(
    prefix + '/organisations/:id/invite/:inviteId',
    async (ctx: AuthenticatedHandlerContext) => {
      const org = await orgRepo.findOneBy({ id: Number(ctx.params['id']) });
      if (!org) {
        ctx.set.status = 404;
        return { error: ctx.t('organisation.notFound') };
      }
      const inv = await inviteRepo.findOne({
        where: { id: Number(ctx.params['inviteId']) },
        relations: { organisation: true },
      });
      if (!inv || inv.organisation.id !== org.id) {
        ctx.set.status = 404;
        return { error: ctx.t('organisation.inviteNotFound') };
      }
      await inviteRepo.remove(inv);
      await createActivityLog({
        userId: (ctx.user as User).id,
        action: 'org:revoke_invite',
        targetId: String(org.id),
        targetType: 'organisation',
        metadata: { inviteId: inv.id, invitedEmail: inv.email },
        ipAddress: ctx.ip,
      });
      return { success: true };
    },
    {
      beforeHandle: [authenticate, authorize('org:invite')],
      response: {
        200: t.Object({ success: t.Boolean() }),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Revoke organisation invite', tags: ['Organisations'] },
    }
  );

  app.post(
    prefix + '/organisations/:id/add-user',
    async (ctx: AuthenticatedHandlerContext) => {
      const org = await orgRepo.findOneBy({ id: Number(ctx.params['id']) });
      if (!org) {
        ctx.set.status = 404;
        return { error: ctx.t('organisation.notFound') };
      }
      const actor = ctx.user as User;
      const actorMembership = await getMembership(actor.id, org.id);
      const actorIsOrgAdmin =
        actor.id === org.ownerId ||
        actorMembership?.orgRole === 'admin' ||
        actorMembership?.orgRole === 'owner' ||
        hasPermissionSync(ctx, 'org:write');
      if (!actorIsOrgAdmin) {
        ctx.set.status = 403;
        return { error: ctx.t('common.forbidden') };
      }
      const body = ctx.body as Record<string, unknown>;
      const rawUserId = body.userId;
      const rawEmail = body.email;
      const rawRole = body.orgRole;
      if (!rawUserId && !rawEmail) {
        ctx.set.status = 400;
        return { error: ctx.t('validation.emailOrUserIdRequired') };
      }
      const target = rawUserId
        ? await userRepo.findOneBy({ id: Number(rawUserId) })
        : await userRepo.findOne({ where: { email: String(rawEmail) } });
      if (!target) {
        ctx.set.status = 404;
        return { error: ctx.t('user.notFound') };
      }
      const existingMembership = await getMembership(target.id, org.id);
      if (existingMembership) {
        ctx.set.status = 409;
        return { error: ctx.t('organisation.alreadyInOrg') };
      }
      const newRole: 'member' | 'admin' | 'owner' = ['member', 'admin', 'owner'].includes(String(rawRole))
        ? (String(rawRole) as 'member' | 'admin' | 'owner')
        : 'member';
      const membership = memberRepo.create({
        userId: target.id,
        organisationId: org.id,
        user: target,
        organisation: org,
        orgRole: newRole,
        createdAt: new Date(),
      });
      await memberRepo.save(membership);
      if (newRole === 'owner') {
        org.ownerId = target.id;
        await orgRepo.save(org);
      }
      await createActivityLog({
        userId: actor.id,
        action: 'org:add_user',
        targetId: String(org.id),
        targetType: 'organisation',
        metadata: { addedUserId: target.id },
        ipAddress: ctx.ip,
      });
      return {
        success: true,
        target: {
          id: target.id,
          email: target.email,
          firstName: target.firstName,
          lastName: target.lastName,
          orgRole: membership.orgRole,
        },
      };
    },
    {
      beforeHandle: authenticate,
      response: {
        200: t.Object({ success: t.Boolean(), target: t.Any() }),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
        409: t.Object({ error: t.String() }),
      },
      detail: {
        summary: 'Add existing user to organisation (admin only)',
        tags: ['Organisations'],
      },
    }
  );

  app.post(
    prefix + '/organisations/accept-invite',
    async (ctx: AuthenticatedHandlerContext) => {
      const body = ctx.body as Record<string, unknown>;
      const token = String(body.token || '');
      const inv = await inviteRepo.findOne({ where: { token }, relations: { organisation: true } });
      if (!inv || inv.accepted) {
        ctx.set.status = 400;
        return { error: ctx.t('validation.invalidInvite') };
      }
      const user = ctx.user as User;
      if (user.email !== inv.email) {
        ctx.set.status = 403;
        return { error: ctx.t('auth.emailMismatch') };
      }
      return await acceptInviteLogic(memberRepo, inviteRepo, user, inv, inv.organisation.id, ctx.ip ?? '');
    },
    {
      beforeHandle: authenticate,
      response: {
        200: t.Object({ success: t.Boolean() }),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Accept organisation invite', tags: ['Organisations'] },
    }
  );

  app.get(
    prefix + '/organisations/invites',
    async (ctx: AuthenticatedHandlerContext) => {
      const user = ctx.user as User;
      if (!user) {
        ctx.set.status = 401;
        return { error: ctx.t('auth.unauthorized') };
      }
      return withRedisCache(`organisations:invites:${user.id}:v1`, 10, async () => {
        const invites = await inviteRepo.find({
          where: { email: user.email, accepted: false },
          relations: { organisation: true },
          order: { createdAt: 'ASC' },
        });
        return invites.map(invite => ({
          id: invite.id,
          organisationId: invite.organisation?.id || null,
          organisationName: invite.organisation?.name || null,
          organisationExists: !!invite.organisation,
          email: invite.email,
          createdAt: invite.createdAt,
        }));
      });
    },
    {
      beforeHandle: authenticate,
      response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }) },
      detail: {
        summary: 'List pending organisation invites for current user',
        tags: ['Organisations'],
      },
    }
  );

  app.post(
    prefix + '/organisations/invites/:inviteId/accept',
    async (ctx: AuthenticatedHandlerContext) => {
      const user = ctx.user as User;
      if (!user) {
        ctx.set.status = 401;
        return { error: ctx.t('auth.unauthorized') };
      }
      const inviteId = Number(ctx.params['inviteId']);
      const inv = await inviteRepo.findOne({
        where: { id: inviteId, accepted: false },
        relations: { organisation: true },
      });
      if (!inv) {
        ctx.set.status = 404;
        return { error: ctx.t('organisation.inviteNotFound') };
      }
      if (user.email !== inv.email) {
        ctx.set.status = 403;
        return { error: ctx.t('common.forbidden') };
      }
      if (!inv.organisation) {
        ctx.set.status = 404;
        return { error: ctx.t('organisation.notFound') };
      }
      return await acceptInviteLogic(memberRepo, inviteRepo, user, inv, inv.organisation.id, ctx.ip ?? '');
    },
    {
      beforeHandle: authenticate,
      response: {
        200: t.Object({ success: t.Boolean() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Accept a pending organisation invite', tags: ['Organisations'] },
    }
  );

  app.post(
    prefix + '/organisations/invites/:inviteId/reject',
    async (ctx: AuthenticatedHandlerContext) => {
      const user = ctx.user as User;
      if (!user) {
        ctx.set.status = 401;
        return { error: ctx.t('auth.unauthorized') };
      }
      const inviteId = Number(ctx.params['inviteId']);
      const inv = await inviteRepo.findOne({ where: { id: inviteId, accepted: false } });
      if (!inv) {
        ctx.set.status = 404;
        return { error: ctx.t('organisation.inviteNotFound') };
      }
      if (user.email !== inv.email) {
        ctx.set.status = 403;
        return { error: ctx.t('common.forbidden') };
      }
      await inviteRepo.delete({ id: inv.id });
      await createActivityLog({
        userId: user.id,
        action: 'org:reject_invite',
        targetId: String(inv.organisation?.id || ''),
        targetType: 'organisation',
        metadata: { invitedEmail: inv.email },
        ipAddress: ctx.ip,
      });
      return { success: true };
    },
    {
      beforeHandle: authenticate,
      response: {
        200: t.Object({ success: t.Boolean() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Reject a pending organisation invite', tags: ['Organisations'] },
    }
  );

  app.post(
    prefix + '/organisations/:id/leave',
    async (ctx: AuthenticatedHandlerContext) => {
      const org = await orgRepo.findOneBy({ id: Number(ctx.params['id']) });
      if (!org) {
        ctx.set.status = 404;
        return { error: ctx.t('organisation.notFound') };
      }
      const user = ctx.user as User;
      const membership = await getMembership(user.id, org.id);
      if (!user || !membership) {
        ctx.set.status = 403;
        return { error: ctx.t('organisation.notMember') };
      }
      if (org.ownerId === user.id) {
        ctx.set.status = 403;
        return { error: ctx.t('organisation.ownerCannotLeave') };
      }

      await memberRepo.remove(membership);

      try {
        const mappingRepo = AppDataSource.getRepository(
          require('../models/serverMapping.entity').ServerMapping
        );
        const mappings = await mappingRepo.find({ relations: { node: true } });
        const uuids = mappings
          .filter((m: import('../models/serverMapping.entity').ServerMapping) => m.node?.organisation?.id === org.id)
          .map((m: import('../models/serverMapping.entity').ServerMapping) => m.uuid);
        if (uuids.length > 0) {
          const subuserRepo = AppDataSource.getRepository(
            require('../models/serverSubuser.entity').ServerSubuser
          );
          await subuserRepo
            .createQueryBuilder()
            .delete()
            .where('userId = :uid', { uid: user.id })
            .andWhere('serverUuid IN (:...uuids)', { uuids })
            .execute();
        }
      } catch (e) {
        // skip
      }

      await createActivityLog({
        userId: user.id,
        action: 'org:leave',
        targetId: String(org.id),
        targetType: 'organisation',
        metadata: {},
        ipAddress: ctx.ip,
      });
      return { success: true };
    },
    {
      beforeHandle: authenticate,
      response: {
        200: t.Object({ success: t.Boolean() }),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Leave organisation', tags: ['Organisations'] },
    }
  );

  app.get(
    prefix + '/organisations/:id/servers',
    async (ctx: AuthenticatedHandlerContext) => {
      const orgId = Number(ctx.params['id']);
      return withRedisCache(`organisations:servers:${orgId}:v1`, 10, async () => {
        const repo = AppDataSource.getRepository(require('../models/node.entity').Node);
        const nodes = await repo.find({ where: { organisation: { id: orgId } } });
        const results: Record<string, unknown>[] = [];
        for (const n of nodes) {
          const base = n.backendWingsUrl || n.url;
          const svc = new WingsApiService(base, n.token);
          const res = await svc.getServers();
          results.push(...(res.data || []).map((s: Record<string, unknown>) => ({ ...s, node: n.id })));
        }
        return results;
      });
    },
    {
      beforeHandle: authenticate,
      response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }) },
      detail: { summary: 'List servers for organisation', tags: ['Organisations'] },
    }
  );

  app.get(
    prefix + '/organisations/:id/nodes',
    async (ctx: AuthenticatedHandlerContext) => {
      const orgId = Number(ctx.params['id']);
      return withRedisCache(`organisations:nodes:${orgId}:v1`, 30, async () => {
        const repo = AppDataSource.getRepository(require('../models/node.entity').Node);
        const nodes = await repo.find({ where: { organisation: { id: orgId } } });
        return nodes;
      });
    },
    {
      beforeHandle: authenticate,
      response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }) },
      detail: { summary: 'List nodes for organisation', tags: ['Organisations'] },
    }
  );

  app.post(
    prefix + '/organisations/:id/avatar',
    async (ctx: AuthenticatedHandlerContext) => {
      const orgRepoLocal = AppDataSource.getRepository(Organisation);
      const org = await orgRepoLocal.findOneBy({ id: Number(ctx.params['id']) });
      if (!org) {
        ctx.set.status = 404;
        return { error: ctx.t('organisation.notFound') };
      }
      const user = ctx.user as User;
      if (!(await userCanManageOrg(ctx, user, org))) {
        ctx.set.status = 403;
        return { error: ctx.t('common.forbidden') };
      }
      const body = (ctx.body || {}) as Record<string, unknown>;
      const file = body.file;
      const uploadFile = Array.isArray(file) ? file[0] : file;
      if (!uploadFile) {
        ctx.set.status = 400;
        return { error: ctx.t('validation.noFile') };
      }

      const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
      const mime = (uploadFile.type || uploadFile.mimetype || '').toString();
      if (!allowed.includes(mime)) {
        ctx.set.status = 400;
        return { error: ctx.t('validation.invalidImageType') };
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

      const preserveOriginalAnimation =
        (mime === 'image/gif' || mime === 'image/webp') && isAnimated;
      const out = preserveOriginalAnimation
        ? buffer
        : await resizeImage(buffer, 256, 256).catch(async err => {
            try {
              return await sharp(buffer).rotate().resize(256, 256, { fit: 'cover' }).toBuffer();
            } catch (e) {
              throw err || e;
            }
          });
      const originalName = uploadFile.name || uploadFile.filename || `avatar_org_${org.id}`;
      const ext =
        path.extname(originalName) ||
        (mime === 'image/png'
          ? '.png'
          : mime === 'image/webp'
            ? '.webp'
            : mime === 'image/gif'
              ? '.gif'
              : '.jpg');
      const filename = `avatar_org_${org.id}` + ext;

      const uploadDir = path.join(process.cwd(), 'uploads');
      await fs.promises.mkdir(uploadDir, { recursive: true });
      const filepath = path.join(uploadDir, filename);
      await Bun.write(filepath, out);

      const backendBase =
        (process.env.BACKEND_URL || '').replace(/\/+$/, '') ||
        (() => {
          const proto = (ctx.request.headers.get('x-forwarded-proto') || 'https') as string;
          const host = (ctx.request.headers.get('host') || 'localhost') as string;
          return `${proto}://${host}`;
        })();

      org.avatarUrl = `${backendBase}/uploads/${filename}`;
      await orgRepoLocal.save(org);
      return { success: true, url: org.avatarUrl };
    },
    {
      body: t.Object({ file: t.File() }),
      beforeHandle: authenticate,
      response: {
        200: t.Object({ success: t.Boolean(), url: t.String() }),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Upload organisation avatar', tags: ['Organisations'] },
    }
  );
}
