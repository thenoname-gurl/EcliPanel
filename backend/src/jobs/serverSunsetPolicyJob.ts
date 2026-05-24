import { schedule } from '../utils/cron';
import { processServerSunsetPolicy } from '../services/serverSunsetPolicyService';

export function scheduleServerSunsetPolicyJob() {
  processServerSunsetPolicy().catch(e =>
    console.error('[serverSunsetPolicyJob] initial run failed', e)
  );
  schedule('0 * * * *', async () => {
    await processServerSunsetPolicy().catch(e =>
      console.error('[serverSunsetPolicyJob] run failed', e)
    );
  });
}
