import cron from 'node-cron';
import { AppDataSource } from '../config/typeorm';
import { ExportJob } from '../models/exportJob.entity';
import { cleanupExpiredExportArchives, processExportJob } from '../services/exportJobService';

const MAX_CONCURRENT = 1;
let activeCount = 0;

export async function runPendingExportJobs() {
  if (!AppDataSource.isInitialized) return;
  if (activeCount >= MAX_CONCURRENT) return;

  try {
    const cleaned = await cleanupExpiredExportArchives();
    if (cleaned.removed > 0) {
      console.log(`[exportJobRunner] cleaned ${cleaned.removed} expired export archive(s)`);
    }
  } catch (e) {
    console.error('[exportJobRunner] cleanupExpiredExportArchives failed', e);
  }

  const repo = AppDataSource.getRepository(ExportJob);
  const jobs = await repo.find({ where: { status: 'queued' }, order: { createdAt: 'ASC' }, take: MAX_CONCURRENT });

  for (const job of jobs) {
    activeCount += 1;
    try {
      await repo.update({ id: job.id, status: 'running' }, { message: 'Runner claimed job', progress: 1 });
      const picked = await repo.findOne({ where: { id: job.id } });
      if (!picked) continue;
      await processExportJob(picked);
    } catch (e) {
      console.error('[exportJobRunner] failed to process export job', job.id, e);
      await repo.update({ id: job.id }, { status: 'failed', progress: 100, message: String(e?.message || e) });
    } finally {
      activeCount -= 1;
    }
  }
}

export function scheduleExportJobRunner() {
  runPendingExportJobs().catch((e) => console.error('[exportJobRunner] Initial run failed', e));
  try {
    cron.schedule('*/1 * * * *', async () => {
      await runPendingExportJobs().catch((e) => console.error('[exportJobRunner] Cron run failed', e));
    });
  } catch (e) {
    console.error('[exportJobRunner] failed to schedule cron', e);
  }
}
