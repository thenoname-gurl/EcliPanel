import cron from 'node-cron';
import { processSunsetPolicy } from '../services/sunsetPolicyService';

export function scheduleSunsetPolicyJob() {
  processSunsetPolicy().catch((e) => console.error('[sunsetPolicyJob] initial run failed', e));
  cron.schedule('0 4 * * *', async () => {
    await processSunsetPolicy().catch((e) => console.error('[sunsetPolicyJob] run failed', e));
  });
}