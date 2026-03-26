import { t } from 'elysia';
import { AppDataSource } from '../config/typeorm';
import { MoreThanOrEqual } from 'typeorm';
import { Node } from '../models/node.entity';
import { NodeHeartbeat } from '../models/nodeHeartbeat.entity';

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
}

export default publicRoutes;
