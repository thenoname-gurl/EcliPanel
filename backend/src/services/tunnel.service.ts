import { AppDataSource } from '../config/typeorm';
import { TunnelDevice } from '../models/tunnelDevice.entity';
import { TunnelAllocation } from '../models/tunnelAllocation.entity';
import type {
  AgentMessage,
  AllocationStatus,
  DeviceKind,
  TunnelServerType,
} from '../types/tunnels';
import { sendAgentMessage } from './agent.service';

const PORT_RANGE_DEFAULT = '20000-29999';
const MAX_PORT_ATTEMPTS = 500;
const CLOSED_REUSE_HOURS = 1;

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
      relations: { ownerUser: { org: true, organisationMemberships: true }, organisation: true },
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
  const [min, max] = (process.env.TUNNEL_PORT_RANGE ?? PORT_RANGE_DEFAULT).split('-').map(Number);

  const safeMin = Number.isFinite(min) ? min : 20000;
  const safeMax = Number.isFinite(max) ? max : 29999;

  const repo = AppDataSource.getRepository(TunnelAllocation);
  const allocations = await repo.find({
    select: { port: true, closedAt: true, status: true },
    where: [
      { status: 'pending' as AllocationStatus },
      { status: 'active' as AllocationStatus },
      { status: 'closed' as AllocationStatus },
    ],
  });

  const cutoff = new Date(Date.now() - CLOSED_REUSE_HOURS * 60 * 60 * 1000);
  const usedPorts = new Set(
    allocations
      .filter(a => {
        if (a.status === 'closed') {
          return a.closedAt != null && a.closedAt >= cutoff;
        }
        return true;
      })
      .map(a => a.port)
  );

  for (let attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt++) {
    const candidate = Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin;

    if (!usedPorts.has(candidate)) return candidate;
  }

  throw new Error('No free tunnel port available');
}

export async function tryReuseRecentPort(
  clientDevice: TunnelDevice,
  localHost: string,
  localPort: number
): Promise<TunnelAllocation | null> {
  const repo = AppDataSource.getRepository(TunnelAllocation);
  const cutoff = new Date(Date.now() - CLOSED_REUSE_HOURS * 60 * 60 * 1000);

  const recent = await repo.findOne({
    where: {
      clientDevice: { id: clientDevice.id },
      localHost,
      localPort,
      status: 'closed' as AllocationStatus,
    },
    relations: { clientDevice: true, serverDevice: true },
    order: { closedAt: 'DESC' },
  });

  if (!recent || !recent.closedAt || recent.closedAt < cutoff) return null;

  recent.status = 'active';
  recent.closedAt = null as any;
  await repo.save(recent);

  return recent;
}

function normalizePortalType(portalType?: string): string {
  if (!portalType) return 'free';
  if (portalType === 'educational') return 'free';
  return portalType;
}

function serverTypeMatchesClient(serverType: TunnelServerType, clientPortalType: string): boolean {
  if (clientPortalType === 'enterprise') {
    return true;
  }
  if (clientPortalType === 'paid') {
    return ['paid', 'free_and_paid'].includes(serverType);
  }
  return ['free', 'free_and_paid'].includes(serverType);
}

function getClientOrganisationIds(clientDevice: TunnelDevice): number[] {
  const orgIds = new Set<number>();
  if (clientDevice.organisation?.id) {
    orgIds.add(clientDevice.organisation.id);
  }
  if (clientDevice.ownerUser?.org?.id) {
    orgIds.add(clientDevice.ownerUser.org.id);
  }
  if (clientDevice.ownerUser?.organisationMemberships) {
    clientDevice.ownerUser.organisationMemberships.forEach((membership: any) => {
      if (membership.organisationId) {
        orgIds.add(membership.organisationId);
      }
    });
  }
  return Array.from(orgIds);
}

function getClientPortalType(clientDevice: TunnelDevice): string {
  if (clientDevice.organisation?.id) {
    return 'enterprise';
  }
  return normalizePortalType(clientDevice.ownerUser?.portalType);
}

function isServerEligibleForClient(
  serverDevice: TunnelDevice,
  clientDevice: TunnelDevice
): boolean {
  const clientPortalType = getClientPortalType(clientDevice);

  if (serverDevice.organisation?.id) {
    const clientOrgIds = getClientOrganisationIds(clientDevice);
    return clientOrgIds.includes(serverDevice.organisation.id);
  }

  if (clientPortalType === 'enterprise' && serverDevice.organisation?.id) {
    return false;
  }

  return serverTypeMatchesClient(serverDevice.serverType, clientPortalType);
}

function getServerTypeRank(type: TunnelServerType) {
  switch (type) {
    case 'enterprise':
      return 0;
    case 'paid':
      return 1;
    case 'free_and_paid':
      return 2;
    case 'free':
      return 3;
  }
}

function compareServers(a: TunnelDevice, b: TunnelDevice, clientDevice: TunnelDevice) {
  const aOrgMatch =
    a.organisation?.id && getClientOrganisationIds(clientDevice).includes(a.organisation.id)
      ? 0
      : 1;
  const bOrgMatch =
    b.organisation?.id && getClientOrganisationIds(clientDevice).includes(b.organisation.id)
      ? 0
      : 1;
  if (aOrgMatch !== bOrgMatch) return aOrgMatch - bOrgMatch;

  const aRank = getServerTypeRank(a.serverType as TunnelServerType);
  const bRank = getServerTypeRank(b.serverType as TunnelServerType);
  if (aRank !== bRank) return aRank - bRank;

  return a.id - b.id;
}

export async function getOnlineServerAgent(
  clientDevice: TunnelDevice
): Promise<TunnelDevice | null> {
  const { agentConnections } = await import('./agent.service');
  const repo = AppDataSource.getRepository(TunnelDevice);

  const servers = await repo.find({
    where: { kind: 'server' as DeviceKind, approved: true },
    relations: { ownerUser: true, organisation: true },
  });

  const onlineServers = servers.filter(s => agentConnections.has(s.deviceCode));
  const eligibleServers = onlineServers.filter(server =>
    isServerEligibleForClient(server, clientDevice)
  );

  if (eligibleServers.length === 0) return null;

  eligibleServers.sort((a, b) => compareServers(a, b, clientDevice));
  return eligibleServers[0];
}

export async function assignPendingAllocations(serverDevice: TunnelDevice): Promise<void> {
  const repo = AppDataSource.getRepository(TunnelAllocation);

  const pending = await repo.find({
    where: [{ status: 'pending' as AllocationStatus }, { status: 'active' as AllocationStatus }],
    relations: {
      clientDevice: { ownerUser: { org: true, organisationMemberships: true }, organisation: true },
      serverDevice: true,
    },
  });

  // rebind allocations which were already assigned to this server
  const alreadyAssigned = pending.filter(
    a => a.serverDevice?.deviceCode === serverDevice.deviceCode
  );
  for (const alloc of alreadyAssigned) {
    sendAgentMessage(serverDevice.deviceCode, {
      type: 'bind',
      allocationId: alloc.id,
      host: alloc.host,
      port: alloc.port,
      protocol: alloc.protocol,
    });
  }

  const unassigned = pending.filter(a => !a.serverDevice);
  const assignable = unassigned.filter(alloc =>
    isServerEligibleForClient(serverDevice, alloc.clientDevice)
  );

  await Promise.all(
    assignable.map(async alloc => {
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
