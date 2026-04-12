import { AppDataSource } from '../config/typeorm';
import { TunnelAllocation } from '../models/tunnelAllocation.entity';
import { ConnectionMapping } from '../types/tunnels';
import { sendAgentMessage } from './agent.service';
import { v4 as uuidv4 } from 'uuid';

const connectionMap = new Map<string, ConnectionMapping>();

export async function handleServerConnectionOpen(
  msg: Record<string, unknown>,
  serverAgentId: string
): Promise<void> {
  const allocationId = Number(msg.allocationId);
  if (!Number.isFinite(allocationId)) return;

  const connectionId = String(msg.connectionId ?? uuidv4());

  const repo = AppDataSource.getRepository(TunnelAllocation);
  const allocation = await repo.findOne({
    where: { id: allocationId },
    relations: ['clientDevice', 'serverDevice'],
  });

  if (
    !allocation?.clientDevice ||
    allocation.serverDevice?.deviceCode !== serverAgentId
  ) {
    console.warn(
      `[tunnel] Rejected connection.open: invalid allocation ${allocationId} for server ${serverAgentId}`
    );
    return;
  }

  connectionMap.set(connectionId, {
    allocationId: allocation.id,
    clientAgentId: allocation.clientDevice.deviceCode,
    serverAgentId,
  });

  sendAgentMessage(allocation.clientDevice.deviceCode, {
    type: 'connection.open',
    allocationId: allocation.id,
    connectionId,
    localHost: allocation.localHost,
    localPort: allocation.localPort,
    remoteAddr: msg.remoteAddr ?? null,
    remotePort: msg.remotePort ?? null,
  });
}

export function handleConnectionData(
  msg: Record<string, unknown>,
  senderAgentId: string,
  senderKind: string
): void {
  const connectionId = String(msg.connectionId ?? '');
  const mapping = connectionMap.get(connectionId);
  if (!mapping) return;

  const targetAgentId =
    senderKind === 'server' ? mapping.clientAgentId : mapping.serverAgentId;

  sendAgentMessage(targetAgentId, {
    type: 'connection.data',
    allocationId: mapping.allocationId,
    connectionId,
    data: msg.data,
  });
}

export function handleConnectionClose(
  msg: Record<string, unknown>,
  senderAgentId: string,
  senderKind: string
): void {
  const connectionId = String(msg.connectionId ?? '');
  const mapping = connectionMap.get(connectionId);
  if (!mapping) return;

  const targetAgentId =
    senderKind === 'server' ? mapping.clientAgentId : mapping.serverAgentId;

  sendAgentMessage(targetAgentId, {
    type: 'connection.close',
    allocationId: mapping.allocationId,
    connectionId,
  });

  connectionMap.delete(connectionId);
}

export function cleanupConnectionsByAgent(agentId: string): void {
  for (const [id, mapping] of connectionMap.entries()) {
    if (
      mapping.clientAgentId === agentId ||
      mapping.serverAgentId === agentId
    ) {
      const targetId =
        mapping.clientAgentId === agentId
          ? mapping.serverAgentId
          : mapping.clientAgentId;

      sendAgentMessage(targetId, {
        type: 'connection.close',
        allocationId: mapping.allocationId,
        connectionId: id,
      });

      connectionMap.delete(id);
    }
  }
}