import { AppDataSource } from '../config/typeorm';
import { SocData } from '../models/socData.entity';
import { ServerConfig } from '../models/serverConfig.entity';
import { Node } from '../models/node.entity';
import { WingsApiService } from './wingsApiService';

export function extractStats(metrics: any) {
  const s = metrics?.stats?.[''] ?? metrics?.stats ?? metrics;
  const cpu = s?.cpu?.[''] ?? s?.cpu ?? {};
  const memory = s?.memory?.[''] ?? s?.memory ?? {};
  const disk = s?.disk?.[''] ?? s?.disk ?? {};
  const network = s?.network?.[''] ?? s?.network ?? {};
  return {
    cpu_absolute: cpu?.used ?? cpu?.cpu_absolute ?? 0,
    memory_bytes: memory?.used ?? memory?.memory_bytes ?? 0,
    disk_bytes: disk?.used ?? disk?.disk_bytes ?? 0,
    network: {
      rx_bytes: network?.received ?? network?.rx_bytes ?? network?.rx ?? 0,
      tx_bytes: network?.sent ?? network?.tx_bytes ?? network?.tx ?? 0,
    },
  };
}

export async function collectAndStoreMetrics() {
  const jobId = Date.now();
  console.log(`[Metrics:${jobId}] Collecting metrics...`);
  const cfgRepo = AppDataSource.getRepository(ServerConfig);
  const nodeRepo = AppDataSource.getRepository(Node);
  const socRepo = AppDataSource.getRepository(SocData);

  const servers = await cfgRepo.find();
  for (const server of servers) {
    try {
      const node = await nodeRepo.findOneBy({ id: server.nodeId });
      if (!node) continue;
      const svc = new WingsApiService(node.backendWingsUrl || node.url, node.token);
      let stats = null;
      try {
        const res = await svc.serverRequest(server.uuid, '/stats');
        stats = res.data;
      } catch {
        try {
          const res = await svc.getSystemStats();
          stats = res.data;
        } catch {}
      }
      if (stats && typeof stats === 'object') {
        const extracted = extractStats(stats);
        const soc = socRepo.create({
          serverId: server.uuid,
          timestamp: new Date(),
          metrics: extracted,
        });
        await socRepo.save(soc);
      }
    } catch (e) {
      console.log(`[Metrics:${jobId}] Error collecting metrics for server ${server.uuid}:`, e);
    }
  }
  console.log(`[Metrics:${jobId}] Metrics collection complete`);
}

export async function startMetricsCollector() {
  console.log('Starting Metrics Collector...');
  await collectAndStoreMetrics();
  setInterval(collectAndStoreMetrics, 60 * 1000);
}