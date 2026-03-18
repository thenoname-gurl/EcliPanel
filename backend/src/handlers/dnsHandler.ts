import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import { CloudflareService } from '../services/cloudflareService';
import { t } from 'elysia';

export function createDnsService() {
  return new CloudflareService();
}

export async function dnsRoutes(app: any, prefix = '') {
  const svc = createDnsService();

  async function resolveZoneName(zoneIdOrName: string) {
    const name = String(zoneIdOrName || '').trim();
    if (!name) return null;

    if (name.includes('.')) {
      return name.replace(/\.$/, '');
    }

    try {
      const zone = await svc.getZone(name);
      if (zone && zone.name) return String(zone.name).replace(/\.$/, '');
    } catch {
      // skip
    }

    return null;
  }

  async function canManageZone(user: any, zoneIdOrName: string) {
    if (user.role === 'admin' || user.role === '*') return true;

    if (!user.org) return false;

    const name = await resolveZoneName(zoneIdOrName);
    if (!name) return false;

    const handle = user.org.handle.replace(/\.$/, '');

    if (name === handle || name.endsWith(`.${handle}`)) {
      if (user.id === user.org.ownerId) return true;
      if (user.orgRole === 'admin' || user.orgRole === 'owner') return true;
      return false;
    }

    const baseZone = process.env.CLOUDFLARE_BASE_ZONE?.replace(/\.$/, '');
    if (baseZone) {
      if (name === baseZone || name.endsWith(`.${baseZone}`)) return false;
    }

    return false;
  }

  app.get(prefix + '/infrastructure/dns/zones', async (ctx: any) => {
    try {
      const zones = await svc.listZones();
      const user = ctx.user;
      const normalized = (zones || []).map((z: any) => ({
        ...z,
        name: String(z.name || '').replace(/\.$/, ''),
        kind: z.kind ? String(z.kind).toLowerCase() : 'cloudflare',
      }));

      if (user.role !== 'admin' && user.role !== '*') {
        const handle = (user.org?.handle || '').replace(/\.$/, '');
        if (handle) {
          const filtered = normalized.filter((z: any) => {
            const name = (z.name || '').replace(/\.$/, '');
            return name === handle || name.endsWith(`.${handle}`);
          });
          return filtered;
        }
        return [];
      }
      return normalized;
    } catch (e: any) {
      ctx.set.status = 502;
      return { error: e.message };
    }
  }, { beforeHandle: [authenticate, authorize('infra:dns')],
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 502: t.Object({ error: t.String() }) },
    detail: { summary: 'List DNS zones', tags: ['DNS','Infrastructure'] }
  });

  app.post(prefix + '/infrastructure/dns/zones', async (ctx: any) => {
    try {
      const body = ctx.body as any;
      const user = ctx.user;
      const rawName: string = body.name;
      if (!rawName) {
        ctx.set.status = 400;
        return { error: 'Zone name required' };
      }
      const normalName = rawName.replace(/\.$/, '');
      if (!await canManageZone(user, normalName)) {
        ctx.set.status = 403;
        return { error: 'Forbidden zone' };
      }
      body.name = normalName;

      body.kind = body.kind || 'Cloudflare';

      if (user.org && normalName === user.org.handle.replace(/\.$/, '')) {
        body.rrsets = body.rrsets || [];
        body.rrsets.push({
          name: normalName,
          type: 'TXT',
          ttl: 3600,
          records: [{ content: `"abuse_contact=abuse@ecli.app organisation=${user.org.name}"`, disabled: false }],
        });
      }
      const zone = await svc.createZone(body);
      const out = Object.assign({}, zone);
      out.name = String(out.name || body.name || '').replace(/\.$/, '');
      out.kind = out.kind ? String(out.kind).toLowerCase() : 'cloudflare';
      return out;
    } catch (e: any) {
      ctx.set.status = 502;
      return { error: e.message };
    }
  }, { beforeHandle: [authenticate, authorize('infra:dns')],
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 502: t.Object({ error: t.String() }) },
    detail: { summary: 'Create DNS zone', tags: ['DNS','Infrastructure'] }
  });

  app.get(prefix + '/infrastructure/dns/zones/:id', async (ctx: any) => {
    try {
      const rawId = ctx.params.id as string;
      const zone = await svc.getZone(rawId);
      if (zone) {
        if (zone.name) zone.name = String(zone.name).replace(/\.$/, '');
        if (zone.rrsets && Array.isArray(zone.rrsets)) {
          zone.rrsets = zone.rrsets.map((r: any) => ({ ...r, name: String(r.name || '').replace(/\.$/, '') }));
        }
        if (zone.recordsList && Array.isArray(zone.recordsList)) {
          zone.recordsList = zone.recordsList.map((r: any) => ({ ...r, name: String(r.name || '').replace(/\.$/, '') }));
        }
      }
      return zone;
    } catch (e: any) {
      ctx.set.status = 502;
      return { error: e.message };
    }
  }, { beforeHandle: [authenticate, authorize('infra:dns')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 502: t.Object({ error: t.String() }) },
    detail: { summary: 'Get DNS zone', tags: ['DNS','Infrastructure'] }
  });

  app.post(prefix + '/infrastructure/dns/zones/:id/records', async (ctx: any) => {
    try {
      const rec = ctx.body as any;
      const rawZoneId = ctx.params.id as string;
      const user = ctx.user;
      if (!await canManageZone(user, rawZoneId)) {
        ctx.set.status = 403;
        return { error: 'Forbidden zone' };
      }
      if (user.role !== 'admin' && user.role !== '*') {
        const badTypes = ['NS','MX','SMTP'];
        if (badTypes.includes((rec.type||'').toUpperCase())) {
          ctx.set.status = 403;
          return { error: 'Record type not allowed' };
        }
      }
      const result = await svc.addRecord(rawZoneId, rec);
      return result;
    } catch (e: any) {
      ctx.set.status = 502;
      return { error: e.message };
    }
  }, { beforeHandle: [authenticate, authorize('infra:dns')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 502: t.Object({ error: t.String() }) },
    detail: { summary: 'Add DNS record', tags: ['DNS','Infrastructure'] }
  });

  app.put(prefix + '/infrastructure/dns/zones/:id/records/:rid', async (ctx: any) => {
    try {
      const rec = ctx.body as any;
      const rawZoneId = ctx.params.id as string;
      const recordId = ctx.params.rid as string;
      const user = ctx.user;
      if (!await canManageZone(user, rawZoneId)) {
        ctx.set.status = 403;
        return { error: 'Forbidden zone' };
      }
      if (user.role !== 'admin' && user.role !== '*') {
        const badTypes = ['NS','MX','SMTP'];
        if (badTypes.includes((rec.type||'').toUpperCase())) {
          ctx.set.status = 403;
          return { error: 'Record type not allowed' };
        }
      }
      const result = await svc.updateRecord(rawZoneId, recordId, rec);
      return result;
    } catch (e: any) {
      ctx.set.status = 502;
      return { error: e.message };
    }
  }, { beforeHandle: [authenticate, authorize('infra:dns')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 502: t.Object({ error: t.String() }) },
    detail: { summary: 'Update DNS record', tags: ['DNS','Infrastructure'] }
  });

  app.delete(prefix + '/infrastructure/dns/zones/:id/records/:rid', async (ctx: any) => {
    try {
      const rawZoneId = ctx.params.id as string;
      const recordId = ctx.params.rid as string;
      const user = ctx.user;
      if (!await canManageZone(user, rawZoneId)) {
        ctx.set.status = 403;
        return { error: 'Forbidden zone' };
      }
      const result = await svc.deleteRecord(rawZoneId, recordId);
      return result;
    } catch (e: any) {
      ctx.set.status = 502;
      return { error: e.message };
    }
  }, { beforeHandle: [authenticate, authorize('infra:dns')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 502: t.Object({ error: t.String() }) },
    detail: { summary: 'Delete DNS record', tags: ['DNS','Infrastructure'] }
  });

  app.delete(prefix + '/infrastructure/dns/zones/:id', async (ctx: any) => {
    try {
      const rawId = ctx.params.id as string;
      const user = ctx.user;

      if (!(user.role === 'admin' || user.role === '*')) {
        if (!await canManageZone(user, rawId)) {
          ctx.set.status = 403;
          return { error: 'Forbidden zone' };
        }
      }

      const result = await svc.deleteZone(rawId);
      return { success: true, deleted: !!result.deleted };
    } catch (e: any) {
      ctx.set.status = 502;
      return { error: e.message };
    }
  }, { beforeHandle: [authenticate, authorize('infra:dns')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 502: t.Object({ error: t.String() }) },
    detail: { summary: 'Delete DNS zone', tags: ['DNS','Infrastructure'] }
  });
}
