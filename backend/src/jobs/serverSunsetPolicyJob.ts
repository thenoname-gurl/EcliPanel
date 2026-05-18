import cron from 'node-cron';
import { processServerSunsetPolicy } from '../services/serverSunsetPolicyService';

export function scheduleServerSunsetPolicyJob() {
  processServerSunsetPolicy().catch((e) => console.error('[serverSunsetPolicyJob] initial run failed', e));
  cron.schedule('0 * * * *', async () => {
    await processServerSunsetPolicy().catch((e) => console.error('[serverSunsetPolicyJob] run failed', e));
  });
}