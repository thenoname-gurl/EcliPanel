import { runSecurityScan } from '../services/securityScanner';
import { schedule } from '../utils/cron';

export async function scheduleSecurityScanJob() {
  console.log('[securityScanJob] Scheduling security scan every 30 minutes');

  try {
    const result = await runSecurityScan();
    console.log(
      `[securityScanJob] Initial scan: ${result.created} created, ${result.resolved} resolved, ${result.totalOpen} total open`
    );
  } catch (err) {
    console.error('[securityScanJob] Initial scan failed:', err);
  }

  schedule('*/30 * * * *', async () => {
    try {
      const result = await runSecurityScan();
      console.log(
        `[securityScanJob] Scheduled scan: ${result.created} created, ${result.resolved} resolved, ${result.totalOpen} total open`
      );
    } catch (err) {
      console.error('[securityScanJob] Scheduled scan failed:', err);
    }
  });
}

export default scheduleSecurityScanJob;