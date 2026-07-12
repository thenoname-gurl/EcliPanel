import { AppDataSource } from '../config/typeorm';
import { AdminAuditEntry } from '../models/adminAuditEntry.entity';

const activeSessions = new Map<string, { lastAction: string; lastTime: number }>();

function sessionKey(adminUserId: number): string {
  return `admin:${adminUserId}`;
}

export async function logAdminAction(opts: {
  adminUserId: number;
  action: string;
  targetId?: string;
  targetType?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
}): Promise<void> {
  try {
    const repo = AppDataSource.getRepository(AdminAuditEntry);
    const now = Date.now();
    const key = sessionKey(opts.adminUserId);

    const prev = activeSessions.get(key);
    let sessionId = prev?.lastAction ? key + ':' + prev.lastTime : key + ':' + now;
    let durationMs = 0;

    if (prev) {
      const gap = now - prev.lastTime;
      durationMs = Math.min(gap, 30 * 60 * 1000);
    }

    activeSessions.set(key, { lastAction: opts.action, lastTime: now });

    await repo.save(
      repo.create({
        adminUserId: opts.adminUserId,
        action: opts.action,
        targetId: opts.targetId ?? null,
        targetType: opts.targetType ?? null,
        metadata: opts.metadata ?? undefined,
        sessionId,
        durationMs,
        ipAddress: opts.ipAddress ?? undefined,
      })
    );
  } catch (e) {
    console.error('[adminAudit] log failed:', e);
  }
}

export async function getAdminTimeReport(opts: {
  adminUserId?: number;
  since?: Date;
  until?: Date;
}): Promise<Array<{ adminUserId: number; action: string; totalMs: number; count: number }>> {
  const repo = AppDataSource.getRepository(AdminAuditEntry);
  const qb = repo
    .createQueryBuilder('a')
    .select('a.adminUserId', 'adminUserId')
    .addSelect('a.action', 'action')
    .addSelect('SUM(a.durationMs)', 'totalMs')
    .addSelect('COUNT(*)', 'count')
    .groupBy('a.adminUserId')
    .addGroupBy('a.action')
    .orderBy('SUM(a.durationMs)', 'DESC');

  if (opts.adminUserId) {
    qb.andWhere('a.adminUserId = :uid', { uid: opts.adminUserId });
  }
  if (opts.since) {
    qb.andWhere('a.timestamp >= :since', { since: opts.since });
  }
  if (opts.until) {
    qb.andWhere('a.timestamp <= :until', { until: opts.until });
  }

  const rows = await qb.getRawMany();
  return rows.map((r: any) => ({
    adminUserId: Number(r.adminUserId),
    action: String(r.action),
    totalMs: Number(r.totalMs) || 0,
    count: Number(r.count) || 0,
  }));
}

export async function getAdminAuditEntries(opts: {
  adminUserId?: number;
  action?: string;
  since?: Date;
  until?: Date;
  page?: number;
  perPage?: number;
}): Promise<{ entries: AdminAuditEntry[]; total: number }> {
  const repo = AppDataSource.getRepository(AdminAuditEntry);
  const page = Math.max(1, opts.page || 1);
  const perPage = Math.min(200, Math.max(1, opts.perPage || 50));

  const qb = repo.createQueryBuilder('a').orderBy('a.timestamp', 'DESC');

  if (opts.adminUserId) qb.andWhere('a.adminUserId = :uid', { uid: opts.adminUserId });
  if (opts.action) qb.andWhere('a.action = :action', { action: opts.action });
  if (opts.since) qb.andWhere('a.timestamp >= :since', { since: opts.since });
  if (opts.until) qb.andWhere('a.timestamp <= :until', { until: opts.until });

  const total = await qb.getCount();
  const entries = await qb
    .skip((page - 1) * perPage)
    .take(perPage)
    .getMany();

  return { entries, total };
}