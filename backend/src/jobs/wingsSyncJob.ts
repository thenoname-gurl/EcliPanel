import { schedule } from '../utils/cron';
import { AppDataSource } from '../config/typeorm';
import { Node } from '../models/node.entity';
import { nodeService } from '../services/nodeService';
import { WingsApiService } from '../services/wingsApiService';

export function scheduleWingsSyncJob() {
  schedule('*/5 * * * *', async () => {
    try {
      const nodes = await AppDataSource.getRepository(Node).find();
      let synced = 0;
      let failed = 0;

      for (const n of nodes) {
        try {
          const svc = await nodeService.getServiceForNode(n.id);
          if (!(svc instanceof WingsApiService)) continue;

          const res = await svc.getServers();
          const servers: any[] = Array.isArray(res.data) ? res.data : (res.data?.servers ?? []);
          if (servers.length === 0) continue;

          for (const s of servers) {
            const uuid: string = s.configuration?.uuid || s.uuid || s.id;
            if (!uuid) continue;
            try {
              await svc.syncServer(uuid, {});
              synced++;
            } catch {
              failed++;
            }
          }
        } catch {
          failed++;
        }
      }

      if (synced > 0 || failed > 0) {
        console.log(`[wingsSyncJob] synced ${synced} servers, ${failed} failed`);
      }
    } catch (e) {
      console.error('[wingsSyncJob] run failed', e);
    }
  });
}