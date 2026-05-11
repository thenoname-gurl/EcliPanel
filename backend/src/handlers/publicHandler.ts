import { t } from 'elysia';
import { AppDataSource } from '../config/typeorm';
import { ShortUrl } from '../models/shortUrl.entity';
import { In, MoreThanOrEqual } from 'typeorm';
import { Node } from '../models/node.entity';
import { NodeHeartbeat } from '../models/nodeHeartbeat.entity';
import { getCountryAgeRules, getGeoBlockRulesWithDefaults } from '../utils/eu';
import { User } from '../models/user.entity';
import { ApiRequestLog } from '../models/apiRequestLog.entity';
import { SocData } from '../models/socData.entity';
import { TunnelAllocation } from '../models/tunnelAllocation.entity';
import { TunnelDevice } from '../models/tunnelDevice.entity';
import { withRedisCache } from '../config/redis';
const { getGithubContributorsSnapshot } = require('../services/githubContributorsService');

const readNumber = (source: any, paths: string[]): number => {
  for (const path of paths) {
    const parts = path.split('.');
    let cur = source;
    for (const p of parts) {
      if (cur == null) break;
      cur = cur[p];
    }
    const num = Number(cur);
    if (Number.isFinite(num)) return num;
  }
  return 0;
};

export async function publicRoutes(app: any, prefix = '') {
  const nodeRepo = () => AppDataSource.getRepository(Node);
  const hbRepo = () => AppDataSource.getRepository(NodeHeartbeat);
  const userRepo = () => AppDataSource.getRepository(User);

  app.get(prefix + '/public/status', async (ctx: any) => {
    return withRedisCache('public:status:v1', 15, async () => {
      const nodes = await nodeRepo().find();
      const total = nodes.length;
      const now = new Date();

      let online = 0;
      let degraded = 0;
      let offline = 0;

      const tunnelDeviceRepo = AppDataSource.getRepository(TunnelDevice);
      const tunnelCount = await tunnelDeviceRepo.count({ where: { kind: 'server', approved: true } });
      const activeWindowMs = 10 * 60 * 1000;
      const activeSince = new Date(now.getTime() - activeWindowMs);
      const tunnelActive = await tunnelDeviceRepo.count({
        where: {
          kind: 'server',
          approved: true,
          lastSeenAt: MoreThanOrEqual(activeSince),
        },
      });
      const tunnelInactive = Math.max(0, tunnelCount - tunnelActive);

      const nodeIds = nodes.map(n => n.id);
      let allHeartbeats: NodeHeartbeat[] = [];
      
      if (nodeIds.length > 0) {
        const recentSince = new Date(now.getTime() - 30 * 60 * 1000);
        allHeartbeats = await hbRepo().find({
          where: { nodeId: In(nodeIds), timestamp: MoreThanOrEqual(recentSince) },
          order: { id: 'DESC' },
        });
      }
      
      const hbMap = new Map<number, NodeHeartbeat>();
      for (const hb of allHeartbeats) {
        if (!hbMap.has(hb.nodeId)) {
          hbMap.set(hb.nodeId, hb);
        }
      }

      for (const node of nodes) {
        const latest = hbMap.get(node.id);
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
        tunnelCount,
        tunnelActive,
        tunnelInactive,
        status,
        timestamp: now.toISOString(),
      };
    });
  }, {
    response: {
      200: t.Object({
        nodeCount: t.Number(),
        online: t.Number(),
        degraded: t.Number(),
        offline: t.Number(),
        tunnelCount: t.Number(),
        tunnelActive: t.Number(),
        tunnelInactive: t.Number(),
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
    return withRedisCache(`public:wings:${win}:v1`, win === '24h' ? 30 : 60, async () => {
      const hours = win === '24h' ? 24 : 168;
      const since = new Date(Date.now() - hours * 3_600_000);

      const nodes = await nodeRepo().find();
      
      const nodeIds = nodes.map(n => n.id);
      let allHeartbeats: NodeHeartbeat[] = [];
      
      if (nodeIds.length > 0) {
        allHeartbeats = await hbRepo().find({
          where: { nodeId: In(nodeIds), timestamp: MoreThanOrEqual(since) },
          order: { timestamp: 'ASC' },
        });
      }
      
      const heartbeatsByNode = new Map<number, NodeHeartbeat[]>();
      for (const hb of allHeartbeats) {
        if (!heartbeatsByNode.has(hb.nodeId)) {
          heartbeatsByNode.set(hb.nodeId, []);
        }
        heartbeatsByNode.get(hb.nodeId)!.push(hb);
      }
      
      const nodeStats = nodes.map((node) => {
        const rows = heartbeatsByNode.get(node.id) || [];
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
      });

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
    });
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

  app.get(
    prefix + '/public/metrics',
    async (_ctx: any) => {
      return withRedisCache('public:metrics:24h:v1', 60, async () => {
        const windowHours = 24;
        const now = new Date();
        const since = new Date(now.getTime() - windowHours * 60 * 60 * 1000);
        const trafficStart = since.toISOString();
        const trafficEnd = now.toISOString();

        const socRepo = AppDataSource.getRepository(SocData);
        const apiRepo = AppDataSource.getRepository(ApiRequestLog);
        const nodeServerPrefix = 'node:%';

        const [recentRows, requestRow, totalUsers] = await Promise.all([
            socRepo
              .createQueryBuilder('soc')
              .select(['soc.serverId', 'soc.metrics', 'soc.timestamp'])
              .where('soc.timestamp >= :since', { since })
              .andWhere('soc.serverId LIKE :serverPrefix', { serverPrefix: nodeServerPrefix })
              .orderBy('soc.serverId', 'ASC')
              .addOrderBy('soc.timestamp', 'ASC')
              .getMany(),

          apiRepo
            .createQueryBuilder('l')
            .select('COUNT(*)', 'total')
            .where('l.timestamp >= :since', { since })
            .getRawOne(),

          userRepo().count(),
        ]);

        const serverIds = [
          ...new Set(
            recentRows.map((r: SocData) => r.serverId).filter(Boolean),
          ),
        ] as string[];

        const beforeRows: SocData[] =
          serverIds.length > 0
            ? await socRepo
              .createQueryBuilder('soc')
              .innerJoin(
                (subQuery) =>
                  subQuery
                    .select('soc2.serverId', 'serverId')
                    .addSelect('MAX(soc2.timestamp)', 'timestamp')
                    .from(SocData, 'soc2')
                    .where('soc2.timestamp < :since', { since })
                    .andWhere('soc2.serverId LIKE :serverPrefix', { serverPrefix: nodeServerPrefix })
                    .andWhere('soc2.serverId IN (:...serverIds)', { serverIds })
                    .groupBy('soc2.serverId'),
                'latest',
                'latest.serverId = soc.serverId AND latest.timestamp = soc.timestamp',
              )
              .setParameters({ since, serverIds, serverPrefix: nodeServerPrefix })
              .select(['soc.serverId', 'soc.metrics', 'soc.timestamp'])
              .getMany()
            : [];

        const firstBeforeByServer = new Map<string, SocData>(
          beforeRows.map((r) => [r.serverId, r]),
        );

        const rowsByServerId: Record<string, SocData[]> = {};
        for (const row of recentRows) {
          (rowsByServerId[row.serverId] ??= []).push(row as SocData);
        }

        let nodeTrafficBytes = 0;

        for (const sid of serverIds) {
          const rows = rowsByServerId[sid] ?? [];
          const before = firstBeforeByServer.get(sid);

          if (rows.length === 0 && !before) continue;
          const all: SocData[] = before ? [before, ...rows] : rows;
          if (all.length < 2) continue;

          let serverDelta = 0;

          for (let i = 1; i < all.length; i++) {
            const prev = all[i - 1];
            const curr = all[i];
            if (!prev?.metrics || !curr?.metrics) continue;

            const prevRx = readNumber(prev.metrics, [
              'network.rx_bytes',
              'network.rx',
              'network.received',
            ]);
            const prevTx = readNumber(prev.metrics, [
              'network.tx_bytes',
              'network.tx',
              'network.sent',
            ]);
            const currRx = readNumber(curr.metrics, [
              'network.rx_bytes',
              'network.rx',
              'network.received',
            ]);
            const currTx = readNumber(curr.metrics, [
              'network.tx_bytes',
              'network.tx',
              'network.sent',
            ]);

            serverDelta +=
              Math.max(0, currRx - prevRx) + Math.max(0, currTx - prevTx);
          }

          if (typeof sid === 'string' && sid.startsWith('node:')) {
            nodeTrafficBytes += serverDelta;
          }
        }

        const trafficBytes = nodeTrafficBytes;
        const requestCount = Number(requestRow?.total ?? 0);

        return {
          windowHours,
          trafficBytes,
          nodeTrafficBytes,
          requestCount,
          totalUsers,
          trafficStart,
          trafficEnd,
        };
      });
    },
    {
      response: {
        200: t.Object({
          windowHours: t.Number(),
          trafficBytes: t.Number(),
          nodeTrafficBytes: t.Number(),
          requestCount: t.Number(),
          totalUsers: t.Number(),
          trafficStart: t.String(),
          trafficEnd: t.String(),
        }),
      },
      detail: {
        tags: ['Public'],
        summary: 'Public usage metrics',
        description:
          'Returns the last 24 hours of node traffic, API call volume, and total user count.',
      },
    },
  );

  app.get(prefix + '/public/geoblock', async () => {
    return withRedisCache('public:geoblock:v1', 300, async () => {
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
            ...(level >= 1 ? ['Identity verification'] : []),
            ...(level >= 2 ? ['Free services'] : []),
            ...(level >= 3 ? ['Educational services'] : []),
            ...(level >= 4 ? ['Paid services'] : []),
            ...(level >= 5 ? ['Registration'] : []),
          ],
          explanation: {
            1: 'Identity verification is unavailable for this jurisdiction.',
            2: 'Free plans and trial products are blocked for this jurisdiction.',
            3: 'Educational services and student-specific offerings are blocked.',
            4: 'Paid subscriptions and premium services are blocked; this location may still retain limited subuser access.',
            5: 'New registrations are blocked for this jurisdiction.',
          }[level] ?? 'Geoblock restrictions apply.',
        }));

      return {
        source: 'database',
        generatedAt: new Date().toISOString(),
        notes,
        rules: countries,
      };
    });
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

    return withRedisCache(`public:short-url:${prefixValue}:${code}:v1`, 60, async () => {
      const repo = AppDataSource.getRepository(ShortUrl);
      const entry = await repo.findOne({ where: { code, prefix: prefixValue, active: true } });
      if (!entry) {
        ctx.set.status = 404;
        return { error: 'Short URL not found.' };
      }

      return { targetUrl: entry.targetUrl };
    });
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
    return withRedisCache('public:minimum-age:v1', 300, async () => {
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
    });
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

  app.get(prefix + '/public/contributors', async () => {
    return withRedisCache('public:contributors:v2', 60, async () => {
      return getGithubContributorsSnapshot();
    });
  }, {
    response: {
      200: t.Object({
        repo: t.Object({
          owner: t.String(),
          name: t.String(),
          url: t.String(),
        }),
        generatedAt: t.String(),
        totalContributors: t.Number(),
        totalTrackedCommits: t.Number(),
        totalTrackedPullRequests: t.Number(),
        totalMergedPullRequests: t.Number(),
        contributors: t.Array(t.Object({
          login: t.String(),
          avatarUrl: t.String(),
          profileUrl: t.String(),
          source: t.Optional(t.Union([t.Literal('github'), t.Literal('manual')])),
          userId: t.Optional(t.Number()),
          displayName: t.Optional(t.String()),
          title: t.Optional(t.Union([t.String(), t.Null()])),
          githubLogin: t.Optional(t.Union([t.String(), t.Null()])),
          githubProfileUrl: t.Optional(t.Union([t.String(), t.Null()])),
          githubAvatarUrl: t.Optional(t.Union([t.String(), t.Null()])),
          activity: t.Optional(t.Array(t.Object({
            date: t.String(),
            label: t.String(),
            details: t.Optional(t.String()),
            points: t.Optional(t.Number()),
            url: t.Optional(t.String()),
          }))),
          contributions: t.Number(),
          pullRequests: t.Number(),
          mergedPullRequests: t.Number(),
          isBot: t.Boolean(),
          lastCommitAt: t.Optional(t.String()),
          recentCommits: t.Array(t.Object({
            sha: t.String(),
            message: t.String(),
            url: t.String(),
            committedAt: t.String(),
          })),
          recentPullRequests: t.Array(t.Object({
            number: t.Number(),
            title: t.String(),
            url: t.String(),
            state: t.String(),
            createdAt: t.String(),
            mergedAt: t.Optional(t.String()),
            merged: t.Boolean(),
          })),
          commitHistory: t.Array(t.Object({
            date: t.String(),
            count: t.Number(),
          })),
        })),
      }),
    },
    detail: {
      tags: ['Public'],
      summary: 'Public GitHub contributors list',
      description: 'Returns GitHub-synced contributors plus linked EcliPanel contributor profiles, sorted by contribution count with recent activity.',
    },
  });
}

export default publicRoutes;
