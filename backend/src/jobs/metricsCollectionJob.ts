import { collectAndStoreMetrics } from '../services/metricsCollector';
import cron from 'node-cron';

export async function scheduleMetricsCollectionJob() {
  console.log('Starting metrics collection job...');
  await collectAndStoreMetrics();
  cron.schedule('*/5 * * * * *', async () => {
    await collectAndStoreMetrics();
  });
}

export default scheduleMetricsCollectionJob;