import { authenticate } from '../middleware/auth';
import { hasPermissionSync } from '../middleware/authorize';
import { AppDataSource } from '../config/typeorm';
import { Node } from '../models/node.entity';
import { In } from 'typeorm';
import { WingsApiService } from '../services/wingsApiService';
import { socEmitter } from '../services/socSocketService';
import { aiEmitter } from '../services/aiSocketService';

export interface RawRequest {
  params?: any;
  query?: any;
  headers?: any;
  url?: string;
  user?: any;
  apiKey?: any;
}

export async function handleSocConnection(app: any, socket: any, req: RawRequest) {
  try {
    await authenticate(req as any);
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

  const listener = (data: any) => {
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

  socket.on('error', (err: any) => {
    console.error('SOC socket error:', err);
    socEmitter.off('update', listener);
  });

  try {
    socket.send(JSON.stringify({ type: 'connected', timestamp: Date.now() }));
  } catch {}
}

export async function handleAiConnection(app: any, socket: any, req: RawRequest) {
  try {
    await authenticate(req as any);
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
  const orgMemberRepo = AppDataSource.getRepository(require('../models/organisationMember.entity').OrganisationMember);
  const userOrgIds = user ? (await orgMemberRepo.find({ where: { userId: user.id } })).map((m: any) => Number(m.organisationId)) : [];

  const listener = (data: any) => {
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

  socket.on('error', (err: any) => {
    console.error('AI socket error:', err);
    aiEmitter.off('usage', listener);
  });

  try {
    socket.send(JSON.stringify({ type: 'connected', timestamp: Date.now() }));
  } catch {}
}

export async function handleServerConnection(app: any, socket: any, req: RawRequest) {
  try {
    await authenticate(req as any);
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

  let remoteWs: any = null;

  try {
    const { nodeService } = require('../services/nodeService');
    const svc = await nodeService.getServiceForServer(serverId);

    if (!svc) {
      sendError(socket, 'Server not found or node unavailable');
      socket.close();
      return;
    }

    remoteWs = svc.connectServerWebsocket(serverId, (msg: any) => {
      try {
        const text = typeof msg === 'string' ? msg : JSON.stringify(msg);
        socket.send(text);
      } catch (err) {
        console.error('Failed to forward Wings message:', err);
      }
    });

    socket.on('message', (m: any) => {
      if (!remoteWs) return;
      try {
        const text = typeof m === 'string' ? m : m.toString();
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

    socket.on('error', (err: any) => {
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

async function getAllowedServerIds(user: any, apiKey: any): Promise<string[]> {
  const allowedIds: string[] = [];

  try {
    const nodesRepo = AppDataSource.getRepository(Node);
    
    let whereClause: any = {};
    if (user?.id) {
      const orgMemberRepo = AppDataSource.getRepository(require('../models/organisationMember.entity').OrganisationMember);
      const memberships = await orgMemberRepo.find({ where: { userId: user.id } });
      const orgIds = memberships.map((m: any) => Number(m.organisationId)).filter((v: number) => Number.isFinite(v));
      if (orgIds.length > 0) {
        whereClause = { organisation: { id: In(orgIds) } } as any;
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

function sendError(socket: any, message: string) {
  try {
    socket.send(JSON.stringify({ type: 'error', message }));
  } catch {}
}