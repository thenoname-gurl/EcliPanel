import { schedule } from '../utils/cron';
import { processPendingOutboundEmails } from '../services/outboundEmailService';

export function scheduleOutboundEmailRunner() {
  processPendingOutboundEmails().catch(e =>
    console.error('[outboundEmailRunner] Initial run failed', e)
  );
  try {
    schedule('*/1 * * * *', async () => {
      await processPendingOutboundEmails().catch(e =>
        console.error('[outboundEmailRunner] Cron run failed', e)
      );
    });
  } catch (e) {
    console.error('[outboundEmailRunner] failed to schedule cron', e);
  }
}
