import { AppDataSource } from '../config/typeorm';
import { TelemetryEvent } from '../models/telemetryEvent.entity';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import * as jwtLib from 'jsonwebtoken';

const DAY_MS = 86_400_000;

function startOfUtcDay(d: Date): Date {
  const u = new Date(d);
  u.setUTCHours(0, 0, 0, 0);
  return u;
}

function formatUtcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function utcDayKeys(start: Date, days: number): string[] {
  const keys: string[] = [];
  for (let i = 0; i < days; i++) {
    keys.push(formatUtcDayKey(new Date(start.getTime() + i * DAY_MS)));
  }
  return keys;
}

interface IngestPayload {
  events: Array<{
    event: string;
    category?: string;
    label?: string;
    path?: string;
    metadata?: Record<string, unknown>;
    timestamp?: number;
  }>;
}

export async function telemetryIngestRoutes(app: any, prefix = '') {
  app.post(
    prefix + '/telemetry/ingest',
    async (ctx: any) => {
      const body = ctx.body as IngestPayload;
      if (!body?.events || !Array.isArray(body.events) || body.events.length === 0) {
        ctx.set.status = 400;
        return { error: 'events array required' };
      }

      if (body.events.length > 100) {
        ctx.set.status = 400;
        return { error: 'max 100 events per batch' };
      }

      let userId: number | null = null;
      if (ctx.user?.id) {
        userId = ctx.user.id;
      } else if ((ctx.jwtPayload as any)?.userId) {
        userId = (ctx.jwtPayload as any).userId;
      } else {
        try {
          const cookieName = process.env.JWT_COOKIE_NAME || 'token';
          let token: string | undefined;
          if (ctx.cookie?.[cookieName]?.value) {
            token = ctx.cookie[cookieName].value;
          } else {
            const cookieHeader = ctx.headers?.cookie;
            if (cookieHeader) {
              const pair = String(cookieHeader)
                .split(';')
                .map((s: string) => s.trim())
                .find((p: string) => p.startsWith(cookieName + '='));
              if (pair) token = pair.slice(cookieName.length + 1);
            }
          }
          if (token && process.env.JWT_SECRET) {
            const decoded = jwtLib.verify(token, process.env.JWT_SECRET) as any;
            if (decoded?.userId) userId = Number(decoded.userId);
          }
        } catch {
          // uwu
        }
      }
      const sessionId = (ctx.query as any)?.sid ?? null;

      const repo = AppDataSource.getRepository(TelemetryEvent);
      const entities = body.events.map((e) =>
        repo.create({
          userId,
          sessionId: String(sessionId || ''),
          event: String(e.event || '').slice(0, 128),
          category: e.category ? String(e.category).slice(0, 64) : undefined,
          label: e.label ? String(e.label).slice(0, 255) : undefined,
          path: e.path ? String(e.path).slice(0, 512) : undefined,
          metadata: e.metadata ?? undefined,
          timestamp: e.timestamp ? new Date(e.timestamp) : new Date(),
        }),
      );

      await repo.save(entities);
      return { ok: true, count: entities.length };
    },
  );
}

export async function telemetryAdminRoutes(app: any, prefix = '') {
  app.get(
    prefix + '/admin/telemetry',
    async (ctx: any) => {
      const repo = AppDataSource.getRepository(TelemetryEvent);

      const queryDays = Number((ctx.query as any)?.days ?? 30);
      const days = Number.isFinite(queryDays)
        ? Math.min(365, Math.max(7, Math.floor(queryDays)))
        : 30;

      const endDay = startOfUtcDay(new Date());
      const rangeStart = new Date(endDay.getTime() - (days - 1) * DAY_MS);
      const rangeEndExclusive = new Date(endDay.getTime() + DAY_MS);

      const dailyRows = await repo
        .createQueryBuilder('e')
        .select("DATE(e.timestamp)", 'day')
        .addSelect('COUNT(*)', 'count')
        .where('e.timestamp >= :from AND e.timestamp < :to', {
          from: rangeStart,
          to: rangeEndExclusive,
        })
        .groupBy('day')
        .orderBy('day', 'ASC')
        .getRawMany<{ day: string; count: string }>();

      const topEvents = await repo
        .createQueryBuilder('e')
        .select('e.event', 'event')
        .addSelect('e.category', 'category')
        .addSelect('COUNT(*)', 'count')
        .where('e.timestamp >= :from AND e.timestamp < :to', {
          from: rangeStart,
          to: rangeEndExclusive,
        })
        .groupBy('e.event')
        .addGroupBy('e.category')
        .orderBy('count', 'DESC')
        .limit(30)
        .getRawMany<{ event: string; category: string | null; count: string }>();

      const topPages = await repo
        .createQueryBuilder('e')
        .select('e.path', 'path')
        .addSelect('COUNT(*)', 'count')
        .where('e.event = :event AND e.timestamp >= :from AND e.timestamp < :to', {
          event: 'pageview',
          from: rangeStart,
          to: rangeEndExclusive,
        })
        .groupBy('e.path')
        .orderBy('count', 'DESC')
        .limit(30)
        .getRawMany<{ path: string; count: string }>();

      const totalEvents = await repo
        .createQueryBuilder('e')
        .where('e.timestamp >= :from AND e.timestamp < :to', {
          from: rangeStart,
          to: rangeEndExclusive,
        })
        .getCount();

      const uniqueUsers = await repo
        .createQueryBuilder('e')
        .select('COUNT(DISTINCT e.userId)', 'count')
        .where('e.userId IS NOT NULL')
        .andWhere('e.timestamp >= :from AND e.timestamp < :to', {
          from: rangeStart,
          to: rangeEndExclusive,
        })
        .getRawOne<{ count: string }>();

      const dayKeys = utcDayKeys(rangeStart, days);
      const dailyMap = new Map<string, number>();
      for (const row of dailyRows) {
        dailyMap.set(row.day, Number(row.count));
      }

      const series = dayKeys.map((key) => ({
        date: key,
        events: dailyMap.get(key) || 0,
      }));

      return {
        window: { days, start: rangeStart.toISOString(), end: endDay.toISOString() },
        summary: {
          totalEvents,
          uniqueUsers: Number(uniqueUsers?.count ?? 0),
        },
        topEvents: topEvents.map((e) => ({
          event: e.event,
          category: e.category ?? null,
          count: Number(e.count),
        })),
        topPages: topPages.map((p) => ({
          path: p.path,
          count: Number(p.count),
        })),
        series,
      };
    },
    {
      beforeHandle: [authenticate, authorize('admin:metrics')],
    },
  );

  app.post(
    prefix + '/admin/telemetry/clear',
    async (ctx: any) => {
      const repo = AppDataSource.getRepository(TelemetryEvent);
      await repo.clear();
      return { ok: true };
    },
    {
      beforeHandle: [authenticate, authorize('admin:metrics')],
    },
  );
}