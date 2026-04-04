import { AppDataSource } from '../config/typeorm';
import { SocData } from '../models/socData.entity';
import { ServerConfig } from '../models/serverConfig.entity';
import { Node } from '../models/node.entity';
import { WingsApiService } from './wingsApiService';

function nodeMetricsKey(nodeId: number | string) {
  return `node:${String(nodeId)}`;
}

export function extractStats(metrics: any) {
  if (
    metrics &&
    typeof metrics === 'object' &&
    (metrics.cpu_absolute !== undefined ||
      metrics.memory_bytes !== undefined ||
      metrics.disk_bytes !== undefined ||
      metrics.network)
  ) {
    return {
      cpu_absolute: Number(metrics.cpu_absolute ?? metrics.cpu ?? 0),
      memory_bytes: Number(metrics.memory_bytes ?? metrics.memory ?? 0),
      disk_bytes: Number(metrics.disk_bytes ?? metrics.disk ?? 0),
      network: {
        rx_bytes: Number(metrics?.network?.rx_bytes ?? metrics?.network?.received ?? metrics?.network?.rx ?? 0),
        tx_bytes: Number(metrics?.network?.tx_bytes ?? metrics?.network?.sent ?? metrics?.network?.tx ?? 0),
      },
    };
  }

  const utilization = metrics?.utilization ?? metrics?.resources ?? null;
  const directNetwork = utilization?.network ?? metrics?.network ?? {};
  if (utilization && typeof utilization === 'object') {
    return {
      cpu_absolute: utilization?.cpu_absolute ?? utilization?.cpu ?? 0,
      memory_bytes: utilization?.memory_bytes ?? utilization?.memory ?? 0,
      disk_bytes: utilization?.disk_bytes ?? utilization?.disk ?? 0,
      network: {
        rx_bytes: directNetwork?.rx_bytes ?? directNetwork?.received ?? directNetwork?.rx ?? 0,
        tx_bytes: directNetwork?.tx_bytes ?? directNetwork?.sent ?? directNetwork?.tx ?? 0,
      },
    };
  }

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
        const snapshot = await svc.getServer(server.uuid);
        stats = snapshot?.data ?? null;
      } catch {
        try {
          const res = await svc.serverRequest(server.uuid, '/stats');
          stats = res.data;
        } catch {
          stats = null;
        }
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

  const nodes = await nodeRepo.find();
  for (const node of nodes) {
    try {
      const svc = new WingsApiService(node.backendWingsUrl || node.url, node.token);
      const statsRes = await svc.getSystemStats();
      const metrics = (statsRes as any)?.data?.stats ?? (statsRes as any)?.data ?? null;
      if (!metrics || typeof metrics !== 'object') continue;

      const soc = socRepo.create({
        serverId: nodeMetricsKey(node.id),
        timestamp: new Date(),
        metrics,
      });
      await socRepo.save(soc);
    } catch (e) {
      console.log(`[Metrics:${jobId}] Error collecting node metrics for node ${node.id}:`, e);
    }
  }

  console.log(`[Metrics:${jobId}] Metrics collection complete`);
}

export async function startMetricsCollector() {
  console.log('Starting Metrics Collector...');
  await collectAndStoreMetrics();
  setInterval(collectAndStoreMetrics, 60 * 1000);
}