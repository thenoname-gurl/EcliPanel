import { AppDataSource } from '../config/typeorm';
import { TunnelDevice } from '../models/tunnelDevice.entity';
import { TunnelAllocation } from '../models/tunnelAllocation.entity';
import { AgentMessage, AllocationStatus, DeviceKind } from '../types/tunnels';
import { sendAgentMessage } from './agent.service';

const PORT_RANGE_DEFAULT = '20000-29999';
const MAX_PORT_ATTEMPTS = 500;

export async function verifyDeviceToken(
  jwt: { verify: (token: string) => unknown },
  token: string
): Promise<TunnelDevice | null> {
  try {
    const payload = jwt.verify(token) as { agent?: string } | null;
    if (!payload?.agent) return null;

    const repo = AppDataSource.getRepository(TunnelDevice);
    const device = await repo.findOne({
      where: { deviceCode: payload.agent },
    });

    if (!device?.approved || device.token !== token) return null;

    device.lastSeenAt = new Date();
    await repo.save(device);

    return device;
  } catch {
    return null;
  }
}

export async function allocatePort(): Promise<number> {
  const [min, max] = (process.env.TUNNEL_PORT_RANGE ?? PORT_RANGE_DEFAULT)
    .split('-')
    .map(Number);

  const safeMin = Number.isFinite(min) ? min : 20000;
  const safeMax = Number.isFinite(max) ? max : 29999;

  const repo = AppDataSource.getRepository(TunnelAllocation);
  const allocations = await repo.find({
    select: ['port'],
    where: [
      { status: 'pending' as AllocationStatus },
      { status: 'active' as AllocationStatus },
    ],
  });

  const usedPorts = new Set(allocations.map((a) => a.port));

  for (let attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt++) {
    const candidate =
      Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin;

    if (!usedPorts.has(candidate)) return candidate;
  }

  throw new Error('No free tunnel port available');
}

export async function getOnlineServerAgent(): Promise<TunnelDevice | null> {
  const { agentConnections } = await import('./agent.service');
  const repo = AppDataSource.getRepository(TunnelDevice);

  const servers = await repo.find({
    where: { kind: 'server' as DeviceKind, approved: true },
  });

  return servers.find((s) => agentConnections.has(s.deviceCode)) ?? null;
}

export async function assignPendingAllocations(
  serverDevice: TunnelDevice
): Promise<void> {
  const repo = AppDataSource.getRepository(TunnelAllocation);

  const pending = await repo.find({
    where: { status: 'pending' as AllocationStatus },
    relations: ['clientDevice', 'serverDevice'],
  });

  // Filter allocations with no server device assigned
  const unassigned = pending.filter((a) => !a.serverDevice);

  await Promise.all(
    unassigned.map(async (alloc) => {
      alloc.serverDevice = serverDevice;
      alloc.status = 'active';
      await repo.save(alloc);

      sendAgentMessage(serverDevice.deviceCode, {
        type: 'bind',
        allocationId: alloc.id,
        host: alloc.host,
        port: alloc.port,
        protocol: alloc.protocol,
      });
    })
  );
}