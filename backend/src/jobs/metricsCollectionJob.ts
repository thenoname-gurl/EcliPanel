import { collectAndStoreMetrics } from '../services/metricsCollector';
import { schedule } from '../utils/cron';

export async function scheduleMetricsCollectionJob() {
  console.log('Starting metrics collection job...');
  await collectAndStoreMetrics();
  schedule('*/5 * * * * *', async () => {
    await collectAndStoreMetrics();
  });
}

export default scheduleMetricsCollectionJob;
