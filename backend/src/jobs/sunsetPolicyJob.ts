import { schedule } from '../utils/cron';
import { processSunsetPolicy } from '../services/sunsetPolicyService';

export function scheduleSunsetPolicyJob() {
  processSunsetPolicy().catch((e) => console.error('[sunsetPolicyJob] initial run failed', e));
  schedule('0 4 * * *', async () => {
    await processSunsetPolicy().catch((e) => console.error('[sunsetPolicyJob] run failed', e));
  });
}