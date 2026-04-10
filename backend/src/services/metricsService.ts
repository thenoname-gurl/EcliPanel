import { AppDataSource } from '../config/typeorm';
import { Between, FindOperator } from 'typeorm';
import { SocData } from '../models/socData.entity';

function flattenMetrics(obj: any, prefix = '', out: Record<string, number> = {}) {
  if (obj == null) return out;
  if (typeof obj === 'number') {
    out[prefix.replace(/\.$/, '')] = obj;
    return out;
  }
  if (typeof obj === 'string') {
    const parsed = Number(obj);
    if (Number.isFinite(parsed)) {
      out[prefix.replace(/\.$/, '')] = parsed;
    }
    return out;
  }
  if (typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj)) {
    const p = k === '' ? prefix : (prefix ? `${prefix}.${k}` : k);
    if (typeof v === 'number') {
      out[p] = v;
    } else if (typeof v === 'object' && v !== null) {
      flattenMetrics(v, p, out);
    }
  }
  return out;
}

function unflatten(flat: Record<string, number>) {
  const out: any = {};
  for (const [k, v] of Object.entries(flat)) {
    const parts = k.split('.').filter((part) => part !== '');
    let cur = out;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (i === parts.length - 1) {
        cur[p] = v;
      } else {
        cur[p] = cur[p] ?? {};
        cur = cur[p];
      }
    }
  }
  return out;
}

export async function fetchHistorical(serverId: string, windowKey = '1h', points = 60) {
  const minutes =
    windowKey === '7d' ? 24 * 60 * 7 :
    windowKey === '24h' ? 24 * 60 :
    windowKey === '6h' ? 6 * 60 :
    windowKey === '1h' ? 60 :
    windowKey === '10m' ? 10 :
    windowKey === '5m' ? 5 :
    windowKey === 'live' ? 1 :
    60;
  const windowMs = minutes * 60_000;

  const now = Date.now();
  const truncNow = Math.floor(now / 60_000) * 60_000;
  const since = new Date(truncNow - windowMs);
  const until = windowKey === 'live' ? new Date(now) : new Date(truncNow);

  const repo = AppDataSource.getRepository(SocData);
  const count = await repo.count({
    where: {
      serverId,
      timestamp: Between(since, until) as FindOperator<Date>,
    } as any,
  });

  if (count === 0) return [];

  const start = since.getTime();
  const bucketSize = Math.max(1000, Math.ceil(windowMs / points));
  const maxExactRows = Math.max(points * 8, 5000);

  const parseMetrics = (metrics: any) => {
    if (metrics == null) return {};
    if (typeof metrics === 'string') {
      try {
        return JSON.parse(metrics);
      } catch {
        return {};
      }
    }
    return metrics;
  };

  let rows: Array<{ timestamp: string | Date; metrics: any }> = [];

  if (count > maxExactRows) {
    const dbType = String(AppDataSource.options.type || '').toLowerCase();
    const bucketExpr =
      dbType === 'postgres'
        ? `FLOOR((EXTRACT(EPOCH FROM soc.timestamp) * 1000 - :startMs) / :bucketSize)`
        : `FLOOR((UNIX_TIMESTAMP(soc.timestamp) * 1000 - :startMs) / :bucketSize)`;

    try {
      const bucketed = repo.createQueryBuilder('soc')
        .select('MAX(soc.id)', 'id')
        .addSelect(bucketExpr, 'bucket')
        .where('soc.serverId = :serverId', { serverId })
        .andWhere('soc.timestamp >= :since', { since })
        .andWhere('soc.timestamp < :until', { until })
        .groupBy('bucket');

      rows = await repo.createQueryBuilder('soc')
        .select('soc.timestamp', 'timestamp')
        .addSelect('soc.metrics', 'metrics')
        .innerJoin(`(${bucketed.getQuery()})`, 'bucketed', 'soc.id = bucketed.id')
        .orderBy('soc.timestamp', 'ASC')
        .setParameters(bucketed.getParameters())
        .setParameter('startMs', start)
        .setParameter('bucketSize', bucketSize)
        .getRawMany();
    } catch {
      rows = await repo
        .createQueryBuilder('soc')
        .select(['soc.timestamp', 'soc.metrics'])
        .where('soc.serverId = :serverId', { serverId })
        .andWhere('soc.timestamp >= :since', { since })
        .andWhere('soc.timestamp < :until', { until })
        .orderBy('soc.timestamp', 'ASC')
        .getMany();
    }
  } else {
    rows = await repo
      .createQueryBuilder('soc')
      .select(['soc.timestamp', 'soc.metrics'])
      .where('soc.serverId = :serverId', { serverId })
      .andWhere('soc.timestamp >= :since', { since })
      .andWhere('soc.timestamp < :until', { until })
      .orderBy('soc.timestamp', 'ASC')
      .getMany();
  }

  if (!rows || rows.length === 0) return [];

  const buckets: Array<Record<string, { sum: number; count: number }>> = [];
  const bucketTimes: number[] = [];
  const bucketCount = Math.ceil(windowMs / bucketSize);
  for (let i = 0; i < bucketCount; i++) {
    buckets.push({});
    bucketTimes.push(start + i * bucketSize);
  }

  for (const r of rows) {
    const t = new Date(r.timestamp).getTime();
    const idx = Math.floor((t - start) / bucketSize);
    if (idx < 0 || idx >= buckets.length) continue;
    const flat = flattenMetrics(parseMetrics(r.metrics) ?? {});
    const bucket = buckets[idx];
    for (const [k, v] of Object.entries(flat)) {
      const cur = bucket[k] ?? { sum: 0, count: 0 };
      cur.sum += v;
      cur.count += 1;
      bucket[k] = cur;
    }
  }

  const result: Array<{ timestamp: string; metrics: Record<string, any> }> = [];
  for (let i = 0; i < buckets.length; i++) {
    const flatAgg: Record<string, number> = {};
    for (const [k, v] of Object.entries(buckets[i])) {
      flatAgg[k] = v.count > 0 ? v.sum / v.count : 0;
    }
    result.push({ timestamp: new Date(bucketTimes[i]).toISOString(), metrics: unflatten(flatAgg) });
  }

  return result;
}