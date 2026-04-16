import cron from 'node-cron';
import { processPendingAdminBroadcastJobs } from '../services/adminBroadcastService';

export function scheduleAdminBroadcastJobRunner() {
  processPendingAdminBroadcastJobs().catch((e) => console.error('[adminBroadcastJobRunner] Initial run failed', e));
  try {
    cron.schedule('*/1 * * * *', async () => {
      await processPendingAdminBroadcastJobs().catch((e) => console.error('[adminBroadcastJobRunner] Cron run failed', e));
    });
  } catch (e) {
    console.error('[adminBroadcastJobRunner] failed to schedule cron', e);
  }
}