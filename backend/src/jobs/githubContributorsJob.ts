import { schedule } from '../utils/cron';
import { syncGithubContributors } from '../services/githubContributorsService';

export async function runGithubContributorsJob() {
  console.log('[GithubContributors] Running sync...');
  try {
    await syncGithubContributors();
  } catch (error) {
    console.error('[GithubContributors] Sync failed:', error);
  }
  console.log('[GithubContributors] Sync complete.');
}

export async function scheduleGithubContributorsJob() {
  console.log('Starting GitHub contributors sync job...');

  await runGithubContributorsJob().catch(error => {
    console.error('[GithubContributors] Initial sync failed:', error);
  });

  schedule('0 * * * *', async () => {
    await runGithubContributorsJob().catch(error => {
      console.error('[GithubContributors] Scheduled sync failed:', error);
    });
  });
}

export default runGithubContributorsJob;
