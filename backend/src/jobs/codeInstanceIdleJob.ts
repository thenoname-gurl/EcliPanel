import { AppDataSource } from '../config/typeorm';
import { ServerConfig } from '../models/serverConfig.entity';
import { nodeService } from '../services/nodeService';
import { removeServerConfig } from '../handlers/remoteHandler';
import { createActivityLog } from '../handlers/logHandler';
import cron from 'node-cron';

const INACTIVITY_MS = 30 * 60 * 1000;

export async function runCodeInstanceIdleJob() {
  const jobId = Date.now();
  console.log(`[CodeInstance:${jobId}] Running idle job...`);
  try {
    const cutoff = new Date(Date.now() - INACTIVITY_MS);
    const codeInstances = await AppDataSource.getRepository(ServerConfig).find({ where: { isCodeInstance: true } });

    for (const cfg of codeInstances) {
      if (!cfg.lastActivityAt || cfg.lastActivityAt > cutoff) continue;

      try {
        const svc = await nodeService.getServiceForServer(cfg.uuid);
        await svc.powerServer(cfg.uuid, 'stop').catch(() => {});
        await svc.serverRequest(cfg.uuid, '', 'delete').catch(() => {});
      } catch (e) {
        // skip
      }

      await removeServerConfig(cfg.uuid).catch(() => {});
      await nodeService.unmapServer(cfg.uuid).catch(() => {});

      try {
        await createActivityLog({
          userId: cfg.userId,
          action: 'codeInstance:idle-shutdown',
          targetId: cfg.uuid,
          targetType: 'code-instance',
          metadata: { reason: 'idle>30m' },
          ipAddress: '',
        });
      } catch {
        // skip
      }
    }
  } catch (e) {
    console.log(`[CodeInstance:${jobId}] Error running idle job:`, e);
  }
  console.log(`[CodeInstance:${jobId}] Finished idle job...`);
}

export async function scheduleCodeInstanceIdleJob() {
  console.log('Starting code instance idle job...');

  await runCodeInstanceIdleJob().catch((e) => {console.log('Error running code instance idle job', e)});
  try {
    cron.schedule('*/5 * * * *', async () => {
      await runCodeInstanceIdleJob().catch((e) => {console.log('Error running code instance idle job', e)});
    });
  } catch (e) {
    console.error('Failed to schedule code instance idle job via cron', e);
  }
}

export default runCodeInstanceIdleJob;