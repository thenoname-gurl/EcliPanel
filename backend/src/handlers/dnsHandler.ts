import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import { PowerdnsService } from '../services/powerdnsService';
import { t } from 'elysia';

// TODO: Fix this with cloudflare
// This heck refuses TO WORK PROPERLY!!!
// I guess PDNS fault?
export async function dnsRoutes(app: any, prefix = '') {
  const svc = new PowerdnsService();

  function canManageZone(user: any, zoneName: string) {
    if (user.role === 'admin' || user.role === '*') return true;
    if (!user.org) return false;
    const name = zoneName.replace(/\.$/, '');
    const handle = user.org.handle.replace(/\.$/, '');
    if (name === handle) return true;
    if (name.endsWith(`.${handle}`)) return true;
    return false;
  }

  app.get(prefix + '/infrastructure/dns/zones', async (ctx: any) => {
    try {
      const zones = await svc.listZones();
      const user = ctx.user;
      if (user.role !== 'admin' && user.role !== '*') {
        const handle = (user.org?.handle || '').replace(/\.$/, '');
        if (handle) {
          const allZones = (zones as any[]) || [];
          const filtered = allZones.filter((z: any) => {
            const name = (z.name || '').replace(/\.$/, '');
            return name === handle || name.endsWith(`.${handle}`);
          });
          return filtered;
        }
        return [];
      }
      return zones;
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
      const canonicalName = rawName.endsWith('.') ? rawName : rawName + '.';
      if (!canManageZone(user, canonicalName)) {
        ctx.set.status = 403;
        return { error: 'Forbidden zone' };
      }
      body.name = canonicalName;
      body.kind = body.kind || 'Native';
      const normalName = rawName.replace(/\.$/, '');
      if (user.org && normalName === user.org.handle.replace(/\.$/, '')) {
        body.rrsets = body.rrsets || [];
        body.rrsets.push({
          name: canonicalName,
          type: 'TXT',
          ttl: 3600,
          records: [{ content: `"abuse_contact=abuse@ecli.app organisation=${user.org.name}"`, disabled: false }],
        });
      }
      const zone = await svc.createZone(body);
      return zone;
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
      const zoneId = rawId.endsWith('.') ? rawId : rawId + '.';
      const zone = await svc.getZone(zoneId);
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
      const rawZoneName = ctx.params.id as string;
      const zoneName = rawZoneName.endsWith('.') ? rawZoneName : rawZoneName + '.';
      const user = ctx.user;
      if (!canManageZone(user, zoneName)) {
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
      if (!rec.name) {
        rec.name = zoneName;
      } else if (rec.name.endsWith('.')) {
        // already a canonical FQDN
      } else if (rec.name.endsWith(zoneName.replace(/\.$/, ''))) {
        rec.name = rec.name + '.';
      } else {
        rec.name = `${rec.name}.${zoneName}`;
      }
      const result = await svc.addRecord(zoneName, rec);
      return result;
    } catch (e: any) {
      ctx.set.status = 502;
      return { error: e.message };
    }
  }, { beforeHandle: [authenticate, authorize('infra:dns')],
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 502: t.Object({ error: t.String() }) },
    detail: { summary: 'Add DNS record', tags: ['DNS','Infrastructure'] }
  });
}
