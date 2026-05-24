import { schedule } from '../utils/cron';
import { AppDataSource } from '../config/typeorm';
import { TunnelAllocation } from '../models/tunnelAllocation.entity';
import { LessThan } from 'typeorm';

const CLEANUP_INTERVAL = '*/10 * * * *';
const CLOSED_RETENTION_HOURS = 1;

export function scheduleTunnelCleanupJob() {
  schedule(CLEANUP_INTERVAL, async () => {
    try {
      const repo = AppDataSource.getRepository(TunnelAllocation);
      const cutoff = new Date(Date.now() - CLOSED_RETENTION_HOURS * 60 * 60 * 1000);
      const expired = await repo.find({
        where: {
          status: 'closed',
          closedAt: LessThan(cutoff),
        },
        relations: {"serverDevice":true},
      });

      if (expired.length === 0) return;

      for (const alloc of expired) {
        await repo.remove(alloc);
      }

      console.log(`[tunnelCleanupJob] deleted ${expired.length} expired closed allocations`);
    } catch (e) {
      console.error('[tunnelCleanupJob] run failed', e);
    }
  });
}
