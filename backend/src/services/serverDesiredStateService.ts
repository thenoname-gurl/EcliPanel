import { AppDataSource } from '../config/typeorm';
import { Node } from '../models/node.entity';
import { ServerConfig } from '../models/serverConfig.entity';
import { nodeService } from './nodeService';
import { WingsApiService } from './wingsApiService';

const RUNNING_STATES = new Set(['running', 'online', 'up', 'healthy', 'available', 'active']);

function normalizeStatus(value: any): string {
  return String(value || '').trim().toLowerCase();
}

async function getServerStatusMap(svc: WingsApiService): Promise<Map<string, string>> {
  const res = await svc.getServers();
  const data = Array.isArray(res.data) ? res.data : (res.data?.servers ?? []);
  const map = new Map<string, string>();
  for (const server of data) {
    const id = server?.uuid || server?.id;
    if (!id) continue;
    const rawStatus = server?.status ?? server?.state ?? server?.server_state ?? server?.runtime?.state ?? '';
    map.set(String(id), normalizeStatus(rawStatus));
  }
  return map;
}

export async function setDesiredPowerState(serverUuid: string, desired: boolean) {
  const cfgRepo = AppDataSource.getRepository(ServerConfig);
  await cfgRepo.update({ uuid: serverUuid }, { desiredPowerState: desired });
}

export async function restoreDesiredPowerStatesForNode(nodeId: number) {
  const nodeRepo = AppDataSource.getRepository(Node);
  const cfgRepo = AppDataSource.getRepository(ServerConfig);
  const node = await nodeRepo.findOneBy({ id: nodeId });
  if (!node) return;

  const configs = await cfgRepo.find({
    where: {
      nodeId,
      desiredPowerState: true,
      suspended: false,
      dmca: false,
      hibernated: false,
    },
  });

  if (!configs.length) return;

  const svc = await nodeService.getServiceForNode(nodeId);
  let statusMap: Map<string, string> | null = null;

  try {
    statusMap = await getServerStatusMap(svc);
  } catch {
    statusMap = null;
  }

  for (const cfg of configs) {
    const knownStatus = statusMap?.get(cfg.uuid) ?? '';
    if (knownStatus && RUNNING_STATES.has(knownStatus)) {
      continue;
    }

    try {
      await svc.powerServer(cfg.uuid, 'start');
    } catch (error: any) {
      console.warn(`Failed to restore desired state for server ${cfg.uuid} on node ${node.name}:`, error?.message || error);
    }
  }
}