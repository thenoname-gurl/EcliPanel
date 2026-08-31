import { collectAndStoreMetrics } from '../services/metricsCollector';
import { schedule } from '../utils/cron';

export async function scheduleMetricsCollectionJob() {
  console.log('Starting metrics collection job...');
  try {
    await collectAndStoreMetrics();
  } catch (err) {
    console.error('[metricsCollectionJob] initial run failed:', err);
  }
  schedule('*/5 * * * * *', async () => {
    await collectAndStoreMetrics();
  });
}

export default scheduleMetricsCollectionJob;
