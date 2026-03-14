import { AppDataSource } from '../config/typeorm';
import { SocData } from '../models/socData.entity';
import { MoreThanOrEqual } from 'typeorm';

function flattenMetrics(obj: any, prefix = '', out: Record<string, number> = {}) {
  if (obj == null) return out;
  if (typeof obj === 'number') {
    out[prefix.replace(/\.$/, '')] = obj;
    return out;
  }
  if (typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'number') out[p] = v;
    else if (typeof v === 'object' && v !== null) flattenMetrics(v, p + '.', out);
  }
  return out;
}

function unflatten(flat: Record<string, number>) {
  const out: any = {};
  for (const [k, v] of Object.entries(flat)) {
    const parts = k.split('.');
    let cur = out;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (i === parts.length - 1) cur[p] = v;
      else { cur[p] = cur[p] ?? {}; cur = cur[p]; }
    }
  }
  return out;
}

export async function fetchHistorical(serverId: string, windowKey = '1h', points = 60) {
  const hours = windowKey === '7d' ? 24 * 7 : windowKey === '24h' ? 24 : windowKey === '6h' ? 6 : 1;
  const windowMs = hours * 3_600_000;
  const since = new Date(Date.now() - windowMs);
  const repo = AppDataSource.getRepository(SocData);
  const rows = await repo.find({ where: { serverId, timestamp: MoreThanOrEqual(since) } as any, order: { timestamp: 'ASC' } });

  if (!rows || rows.length === 0) return [];

  const start = since.getTime();
  const bucketSize = Math.max(1000, Math.ceil(windowMs / points));
  const buckets: Array<Record<string, { sum: number; count: number }>> = [];
  const bucketTimes: number[] = [];
  const bucketCount = Math.ceil(windowMs / bucketSize) + 1;
  for (let i = 0; i < bucketCount; i++) {
    buckets.push({});
    bucketTimes.push(start + i * bucketSize);
  }

  for (const r of rows) {
    const t = new Date(r.timestamp).getTime();
    const idx = Math.floor((t - start) / bucketSize);
    if (idx < 0 || idx >= buckets.length) continue;
    const flat = flattenMetrics(r.metrics ?? {});
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