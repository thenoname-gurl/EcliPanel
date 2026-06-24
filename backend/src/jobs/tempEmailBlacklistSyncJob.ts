import { schedule } from '../utils/cron';
import { clearTempEmailCache } from '../repositories/tempEmailRepository';
import path from 'path';

const BLACKLIST_URL = 'https://git.ecli.app/Noname/tempmails/raw/branch/main/blacklist.txt';
const DOMAINS_CONF_PATH = path.resolve(import.meta.dir, '../../resources/temp_email_domains.conf');

export async function runTempEmailBlacklistSync() {
  console.log('[TempEmailBlacklist] Fetching blacklist...');
  const response = await fetch(BLACKLIST_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch blacklist: ${response.status} ${response.statusText}`);
  }
  const content = await response.text();
  await Bun.write(DOMAINS_CONF_PATH, content);
  clearTempEmailCache();
  console.log('[TempEmailBlacklist] Blacklist updated and cache cleared.');
}

export async function scheduleTempEmailBlacklistSyncJob() {
  console.log('Starting temp email blacklist sync job...');

  schedule('0 6 10 * *', async () => {
    await runTempEmailBlacklistSync().catch(error => {
      console.error('[TempEmailBlacklist] Scheduled sync failed:', error);
    });
  });
}

export default runTempEmailBlacklistSync;