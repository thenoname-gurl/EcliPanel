import cron from 'node-cron';
import { AppDataSource } from '../config/typeorm';
import { User } from '../models/user.entity';
import { ensureMailboxAccountForUser, isMailcowConfigured } from '../services/mailcowService';

export async function syncMailboxAccounts() {
  if (!AppDataSource.isInitialized) return;
  if (!isMailcowConfigured()) {
    console.warn('[mailboxSyncJob] skipped because Mailcow is not configured');
    return;
  }

  const userRepo = AppDataSource.getRepository(User);
  const allUsers = await userRepo.find();
  let sawCriticalFailure = false;

  for (const user of allUsers) {
    if (sawCriticalFailure) break;
    try {
      await ensureMailboxAccountForUser(user);
    } catch (err: any) {
      const message = String(err?.message || err || 'Unknown error');
      console.error('[mailboxSyncJob] failed to ensure mailbox for user', user.id, message);
      if (/Mailcow API timeout|Mailcow API error.*get\/domain|Mailcow domain not found/i.test(message)) {
        sawCriticalFailure = true;
        console.error('[mailboxSyncJob] aborting remaining mailbox sync due to Mailcow connectivity issue');
      }
    }
  }
}

export function scheduleMailboxSyncJob() {
  syncMailboxAccounts().catch((e) => console.error('[mailboxSyncJob] Initial run failed', e));

  try {
    cron.schedule('0 */4 * * *', async () => {
      await syncMailboxAccounts().catch((e) => console.error('[mailboxSyncJob] Cron run failed', e));
    });
  } catch (e) {
    console.error('[mailboxSyncJob] failed to schedule cron', e);
  }
}