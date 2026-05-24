import { authenticate } from '../middleware/auth';
import { hasPermissionSync } from '../middleware/authorize';
import { AppDataSource } from '../config/typeorm';
import { Node } from '../models/node.entity';
import { In, type FindOptionsWhere } from 'typeorm';
import { WingsApiService } from '../services/wingsApiService';
import { socEmitter } from '../services/socSocketService';
import { aiEmitter } from '../services/aiSocketService';
import type WebSocket from 'ws';
import type { ApiKey } from '../models/apiKey.entity';
import type { User } from '../models/user.entity';
import { OrganisationMember } from '../models/organisationMember.entity';
import type { RequestHeaderLike, RequestContext } from '../types/request';
import type { WsSocket, SocUpdatePayload, AiUsagePayload, RawRequest, AuthRequest } from '../types/ws';

import { wsRawDataToText } from '../types/ws';

export async function handleSocConnection(_app: unknown, socket: WsSocket, req: RawRequest) {
  try {
    await authenticate(req as AuthRequest);
  } catch {
    sendError(socket, 'Authentication failed');
    socket.close();
    return;
  }

  const user = req.user;
  const apiKey = req.apiKey;

  if (!user && !apiKey) {
    sendError(socket, 'No valid credentials');
    socket.close();
    return;
  }

  let allowedIds: string[] | null = null;
  const isAdmin = hasPermissionSync(req, 'soc:read') || apiKey?.type === 'admin';

  if (!isAdmin) {
    allowedIds = await getAllowedServerIds(user, apiKey);
  }

  const listener = (data: SocUpdatePayload) => {
    if (allowedIds && data.serverId && !allowedIds.includes(data.serverId)) {
      return;
    }

    try {
      socket.send(JSON.stringify({ type: 'soc:update', data }));
    } catch (err) {
      console.error('Failed to send SOC update:', err);
    }
  };

  socEmitter.on('update', listener);

  socket.on('close', () => {
    socEmitter.off('update', listener);
  });

  socket.on('error', (err: unknown) => {
    console.error('SOC socket error:', err);
    socEmitter.off('update', listener);
  });

  try {
    socket.send(JSON.stringify({ type: 'connected', timestamp: Date.now() }));
  } catch {}
}

export async function handleAiConnection(_app: unknown, socket: WsSocket, req: RawRequest) {
  try {
    await authenticate(req as AuthRequest);
  } catch {
    sendError(socket, 'Authentication failed');
    socket.close();
    return;
  }

  const user = req.user;
  const apiKey = req.apiKey;

  if (!user && !apiKey) {
    sendError(socket, 'No valid credentials');
    socket.close();
    return;
  }

  const isAdmin = hasPermissionSync(req, 'ai:read') || apiKey?.type === 'admin';
  const orgMemberRepo = AppDataSource.getRepository(OrganisationMember);
  const userOrgIds = user
    ? (await orgMemberRepo.find({ where: { userId: user.id } })).map(m =>
        Number(m.organisationId)
      )
    : [];

  const listener = (data: AiUsagePayload) => {
    let allowed = false;

    if (isAdmin) {
      allowed = true;
    } else if (user && data.userId === user.id) {
      allowed = true;
    } else if (user && data.organisationId && userOrgIds.includes(Number(data.organisationId))) {
      allowed = true;
    } else if (apiKey?.user && data.userId === apiKey.user.id) {
      allowed = true;
    }

    if (!allowed) return;

    try {
      socket.send(JSON.stringify({ type: 'ai:usage', data }));
    } catch (err) {
      console.error('Failed to send AI usage:', err);
    }
  };

  aiEmitter.on('usage', listener);

  socket.on('close', () => {
    aiEmitter.off('usage', listener);
  });

  socket.on('error', (err: unknown) => {
    console.error('AI socket error:', err);
    aiEmitter.off('usage', listener);
  });

  try {
    socket.send(JSON.stringify({ type: 'connected', timestamp: Date.now() }));
  } catch {}
}

export async function handleServerConnection(_app: unknown, socket: WsSocket, req: RawRequest) {
  try {
    await authenticate(req as AuthRequest);
  } catch {
    sendError(socket, 'Authentication failed');
    socket.close();
    return;
  }

  if (!req.user && !req.apiKey) {
    sendError(socket, 'No valid credentials');
    socket.close();
    return;
  }

  const serverId = req.params?.id;
  if (!serverId) {
    sendError(socket, 'Missing server ID');
    socket.close();
    return;
  }

  let remoteWs: WebSocket | null = null;

  try {
    const { nodeService } = require('../services/nodeService');
    const svc = await nodeService.getServiceForServer(serverId);

    if (!svc) {
      sendError(socket, 'Server not found or node unavailable');
      socket.close();
      return;
    }

    remoteWs = svc.connectServerWebsocket(serverId, (msg: unknown) => {
      try {
        const text = typeof msg === 'string' ? msg : JSON.stringify(msg);
        socket.send(text);
      } catch (err) {
        console.error('Failed to forward Wings message:', err);
      }
    });

    socket.on('message', (m: WebSocket.RawData) => {
      if (!remoteWs) return;
      try {
        const text = wsRawDataToText(m);
        remoteWs.send(text);
      } catch (err) {
        console.error('Failed to send to Wings:', err);
      }
    });

    socket.on('close', () => {
      if (remoteWs) {
        try {
          remoteWs.close();
        } catch {}
        remoteWs = null;
      }
    });

    socket.on('error', (err: unknown) => {
      console.error('Server socket error:', err);
      if (remoteWs) {
        try {
          remoteWs.close();
        } catch {}
        remoteWs = null;
      }
    });
  } catch (err) {
    console.error('Failed to connect to server:', err);
    sendError(socket, 'Failed to connect to server');
    socket.close();
  }
}

async function getAllowedServerIds(user?: User | null, apiKey?: ApiKey | null): Promise<string[]> {
  const allowedIds: string[] = [];

  try {
    const nodesRepo = AppDataSource.getRepository(Node);

    let whereClause: FindOptionsWhere<Node> = {};
    if (user?.id) {
      const orgMemberRepo = AppDataSource.getRepository(OrganisationMember);
      const memberships = await orgMemberRepo.find({ where: { userId: user.id } });
      const orgIds = memberships
        .map(m => Number(m.organisationId))
        .filter((v: number) => Number.isFinite(v));
      if (orgIds.length > 0) {
        whereClause = { organisation: { id: In(orgIds) } };
      }
    }
    const nodes = await nodesRepo.find({ where: whereClause });

    for (const node of nodes) {
      try {
        const svc = new WingsApiService(node.url, node.token);
        const res = await svc.getServers();
        const servers = res.data || [];

        for (const server of servers) {
          if (user && server.owner === user.id) {
            allowedIds.push(server.uuid);
          } else if (apiKey?.user && server.owner === apiKey.user.id) {
            allowedIds.push(server.uuid);
          }
        }
      } catch (err) {
        console.error(`Failed to get servers from node ${node.id}:`, err);
      }
    }
  } catch (err) {
    console.error('Failed to get allowed server IDs:', err);
  }

  return allowedIds;
}

function sendError(socket: WsSocket, message: string) {
  try {
    socket.send(JSON.stringify({ type: 'error', message }));
  } catch {}
}
