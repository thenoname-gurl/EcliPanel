import { AppDataSource } from '../config/typeorm';
import { ServerConfig } from '../models/serverConfig.entity';
import { nodeService } from '../services/nodeService';
import { removeServerConfig } from '../handlers/remoteHandler';
import { createActivityLog } from '../handlers/logHandler';

const INACTIVITY_MS = 30 * 60 * 1000;
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

export async function runCodeInstanceIdleJob() {
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
    console.error('codeInstanceIdleJob error', e);
  }
}

export function scheduleCodeInstanceIdleJob() {
  runCodeInstanceIdleJob().catch(() => {});
  try {
    setInterval(() => {
      runCodeInstanceIdleJob().catch(() => {});
    }, CHECK_INTERVAL_MS);
  } catch (e) {
    // skip
  }
}

export default runCodeInstanceIdleJob;