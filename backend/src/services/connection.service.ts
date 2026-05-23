import { AppDataSource } from '../config/typeorm';
import { TunnelAllocation } from '../models/tunnelAllocation.entity';
import { ConnectionMapping } from '../types/tunnels';
import { sendAgentMessage } from './agent.service';
import { v4 as uuidv4 } from 'uuid';

const connectionMap = new Map<string, ConnectionMapping>();

// Buffer for connection.data messages that arrive before connection.open's
// DB queries resolve.  After the mapping is created they are replayed.
const pendingConnectionData = new Map<
  string,
  Array<{
    msg: Record<string, unknown>;
    senderAgentId: string;
    senderKind: string;
  }>
>();

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
    relations: {"clientDevice":true,"serverDevice":true},
  });

  if (
    !allocation?.clientDevice ||
    allocation.serverDevice?.deviceCode !== serverAgentId
  ) {
    console.warn(
      `[tunnel] Rejected connection.open: allocation=${allocationId} serverAgent=${serverAgentId} ` +
        `serverDevice=${allocation?.serverDevice?.deviceCode ?? 'none'} clientDevice=${allocation?.clientDevice?.deviceCode ?? 'none'}`
    );
    return;
  }

  connectionMap.set(connectionId, {
    allocationId: allocation.id,
    clientAgentId: allocation.clientDevice.deviceCode,
    serverAgentId,
    directToken: uuidv4(),
  });

  const mapping = connectionMap.get(connectionId);
  if (!mapping) return;

  const serverTokenSent = sendAgentMessage(serverAgentId, {
    type: 'direct.token',
    connectionId,
    directToken: mapping.directToken,
  });
  if (!serverTokenSent) {
    console.warn(
      `[tunnel] Failed to deliver direct token to server agent ${serverAgentId} for connection ${connectionId}`
    );
  }

  const protocol = (msg.protocol as string | undefined) ?? allocation.protocol;
  const directPort =
    (msg.directPort as number | undefined) ??
    (protocol === 'udp' ? allocation.port + 1 : allocation.port);

  const clientOpenSent = sendAgentMessage(allocation.clientDevice.deviceCode, {
    type: 'connection.open',
    allocationId: allocation.id,
    connectionId,
    localHost: allocation.localHost,
    localPort: allocation.localPort,
    publicHost: allocation.host,
    publicPort: allocation.port,
    protocol,
    directPort,
    directToken: mapping.directToken,
    remoteAddr: msg.remoteAddr ?? null,
    remotePort: msg.remotePort ?? null,
  });
  if (!clientOpenSent) {
    console.warn(
      `[tunnel] Failed to deliver connection.open to client agent ${allocation.clientDevice.deviceCode} for connection ${connectionId}`
    );
  }

  dispatchPendingData(connectionId);
}

export function handleConnectionData(
  msg: Record<string, unknown>,
  senderAgentId: string,
  senderKind: string
): void {
  const connectionId = String(msg.connectionId ?? '');
  const mapping = connectionMap.get(connectionId);
  if (!mapping) {
    // connection.open might still be processing (async DB).  Queue for later.
    if (!pendingConnectionData.has(connectionId)) {
      pendingConnectionData.set(connectionId, []);
    }
    pendingConnectionData.get(connectionId)!.push({
      msg,
      senderAgentId,
      senderKind,
    });
    return;
  }

  const targetAgentId =
    senderKind === 'server' ? mapping.clientAgentId : mapping.serverAgentId;

  sendAgentMessage(targetAgentId, {
    type: 'connection.data',
    allocationId: mapping.allocationId,
    connectionId,
    data: msg.data,
  });
}

function dispatchPendingData(connectionId: string): void {
  const pending = pendingConnectionData.get(connectionId);
  if (!pending) return;
  pendingConnectionData.delete(connectionId);
  const mapping = connectionMap.get(connectionId);
  if (!mapping) return;
  for (const { msg, senderKind } of pending) {
    const targetAgentId =
      senderKind === 'server' ? mapping.clientAgentId : mapping.serverAgentId;
    sendAgentMessage(targetAgentId, {
      type: 'connection.data',
      allocationId: mapping.allocationId,
      connectionId,
      data: msg.data,
    });
  }
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
  pendingConnectionData.delete(connectionId);
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
      pendingConnectionData.delete(id);
    }
  }
}