import { t } from 'elysia';
import { AppDataSource } from '../config/typeorm';
import { ShortUrl } from '../models/shortUrl.entity';
import { MoreThanOrEqual } from 'typeorm';
import { Node } from '../models/node.entity';
import { NodeHeartbeat } from '../models/nodeHeartbeat.entity';
import { getCountryAgeRules, getGeoBlockRulesWithDefaults } from '../utils/eu';

export async function publicRoutes(app: any, prefix = '') {
  const nodeRepo = () => AppDataSource.getRepository(Node);
  const hbRepo = () => AppDataSource.getRepository(NodeHeartbeat);

  app.get(prefix + '/public/status', async (ctx: any) => {
    const nodes = await nodeRepo().find();
    const total = nodes.length;
    const now = new Date();

    let online = 0;
    let degraded = 0;
    let offline = 0;

    for (const node of nodes) {
      const latest = await hbRepo().findOne({ where: { nodeId: node.id }, order: { id: 'DESC' } });
      if (!latest) {
        offline++;
        continue;
      }
      const ageMs = now.getTime() - new Date(latest.timestamp).getTime();
      if (ageMs <= 2 * 60 * 1000 && latest.status === 'ok') {
        online++;
      } else if (ageMs <= 10 * 60 * 1000) {
        degraded++;
      } else {
        offline++;
      }
    }

    let status: 'online' | 'degraded' | 'offline' = 'offline';
    if (total === 0) status = 'offline';
    else if (online === total) status = 'online';
    else if (online > 0) status = 'degraded';

    return {
      nodeCount: total,
      online,
      degraded,
      offline,
      status,
      timestamp: now.toISOString(),
    };
  }, {
    response: {
      200: t.Object({
        nodeCount: t.Number(),
        online: t.Number(),
        degraded: t.Number(),
        offline: t.Number(),
        status: t.String(),
        timestamp: t.String(),
      }),
    },
    detail: {
      tags: ['Health'],
      summary: 'Public node status and platform health',
      description: 'Returns aggregated node availability and platform health status.',
    },
  });

  app.get(prefix + '/public/wings', async (ctx: any) => {
    const win = String(ctx.query?.window || '7d');
    const hours = win === '24h' ? 24 : 168;
    const since = new Date(Date.now() - hours * 3_600_000);

    const nodes = await nodeRepo().find();
    const nodeStats = await Promise.all(nodes.map(async (node) => {
      const rows = await hbRepo().find({
        where: { nodeId: node.id, timestamp: MoreThanOrEqual(since) },
        order: { timestamp: 'ASC' },
      });
      const total = rows.length;
      const okCount = rows.filter((r) => r.status === 'ok').length;
      const timeoutCount = rows.filter((r) => r.status === 'timeout').length;
      const errorCount = rows.filter((r) => r.status === 'error').length;
      const validMs = rows.filter((r) => r.responseMs != null).map((r) => r.responseMs!);
      const avg_ms = validMs.length > 0 ? Math.round(validMs.reduce((a, b) => a + b, 0) / validMs.length) : null;

      return {
        id: node.id,
        name: node.name,
        url: node.url,
        window: win,
        points: rows.map((r) => ({ timestamp: r.timestamp, responseMs: r.responseMs ?? null, status: r.status })),
        summary: {
          uptime_pct: total > 0 ? Math.round((okCount / total) * 1000) / 10 : 100,
          avg_ms,
          total_checks: total,
          okCount,
          timeoutCount,
          errorCount,
        },
      };
    }));

    const totals = nodeStats.reduce(
      (acc, n) => ({
        total_checks: acc.total_checks + n.summary.total_checks,
        ok: acc.ok + (n.summary.uptime_pct * n.summary.total_checks / 100),
      }),
      { total_checks: 0, ok: 0 },
    );

    return {
      window: win,
      generatedAt: new Date().toISOString(),
      nodes: nodeStats,
      summary: {
        total_nodes: nodeStats.length,
        total_checks: totals.total_checks,
        average_uptime_pct: totals.total_checks > 0 ? Math.round((totals.ok / totals.total_checks) * 1000) / 10 : 100,
      },
    };
  }, {
    response: {
      200: t.Any(),
    },
    detail: {
      tags: ['Health'],
      summary: 'Public wings uptime history',
      description: 'Returns last 7 days of node uptime metrics and heartbeat points publicly.',
    },
  });

  app.get(prefix + '/public/geoblock', async () => {
    const rules = await getGeoBlockRulesWithDefaults();
    const notes = [] as string[];
    if ((process.env.EU_ID_DISABLED || '').toLowerCase() === 'true') {
      notes.push('EU member states are subject to default identity verification restrictions (Level 1).');
    }
    const countries = Object.entries(rules)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([country, level]) => ({
        country,
        level,
        services: [
          ...(level >= 1 ? ["Identity verification"] : []),
          ...(level >= 2 ? ["Free services"] : []),
          ...(level >= 3 ? ["Educational services"] : []),
          ...(level >= 4 ? ["Paid services"] : []),
          ...(level >= 5 ? ["Registration"] : []),
        ],
        explanation: {
          1: "Identity verification is unavailable for this jurisdiction.",
          2: "Free plans and trial products are blocked for this jurisdiction.",
          3: "Educational services and student-specific offerings are blocked.",
          4: "Paid subscriptions and premium services are blocked; this location may still retain limited subuser access.",
          5: "New registrations are blocked for this jurisdiction.",
        }[level] ?? "Geoblock restrictions apply.",
      }));

    return {
      source: 'database',
      generatedAt: new Date().toISOString(),
      notes,
      rules: countries,
    };
  }, {
    response: {
      200: t.Object({
        source: t.String(),
        generatedAt: t.String(),
        notes: t.Array(t.String()),
        rules: t.Array(t.Object({
          country: t.String(),
          level: t.Number(),
          services: t.Array(t.String()),
          explanation: t.String(),
        })),
      }),
    },
    detail: {
      tags: ['Public'],
      summary: 'Public geoblock rules',
      description: 'Returns the current geoblocked countries and the services restricted for each jurisdiction.',
    },
  });

  app.get(prefix + '/public/short-url', async (ctx: any) => {
    const code = String(ctx.query?.code || '').trim().toLowerCase();
    const prefixValue = String(ctx.query?.prefix || 'root') === 'root' ? 'root' : 'a';

    if (!code) {
      ctx.set.status = 400;
      return { error: 'Missing short URL code.' };
    }

    const repo = AppDataSource.getRepository(ShortUrl);
    const entry = await repo.findOne({ where: { code, prefix: prefixValue, active: true } });
    if (!entry) {
      ctx.set.status = 404;
      return { error: 'Short URL not found.' };
    }

    return { targetUrl: entry.targetUrl };
  }, {
    response: {
      200: t.Object({ targetUrl: t.String() }),
      400: t.Object({ error: t.String() }),
      404: t.Object({ error: t.String() }),
    },
    detail: {
      tags: ['Public'],
      summary: 'Lookup a short URL redirect target',
      description: 'Return redirect target for a short URL code.',
    },
  });

  app.get(prefix + '/public/minimum-age', async () => {
    const rules = await getCountryAgeRules();
    const entries = Object.entries(rules)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([country, minimumAge]) => ({ country, minimumAge }));

    return {
      source: 'database',
      generatedAt: new Date().toISOString(),
      defaultMinimumAge: 13,
      euUkMinimumAge: 14,
      rules: entries,
    };
  }, {
    response: {
      200: t.Object({
        source: t.String(),
        generatedAt: t.String(),
        defaultMinimumAge: t.Number(),
        euUkMinimumAge: t.Number(),
        rules: t.Array(t.Object({
          country: t.String(),
          minimumAge: t.Number(),
        })),
      }),
    },
    detail: {
      tags: ['Public'],
      summary: 'Public minimum age rules',
      description: 'Returns country-specific minimum age overrides and default policy values.',
    },
  });
}

export default publicRoutes;
