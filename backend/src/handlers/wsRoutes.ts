import { authenticate } from '../middleware/auth';
// Peak code that surely works!
export interface RawRequest { params?: any; query?: any; headers?: any; url?: string; }

export async function handleSocConnection(app: any, socket: any, req: RawRequest) {
  try {
    await authenticate(req as any);
  } catch {
    socket.close();
    return;
  }
  const user = (req as any).user;
  const apiKey = (req as any).apiKey;
  if (!user && !apiKey) {
    socket.close();
    return;
  }

  let allowedIds: string[] | null = null;
  if (!user || (!(user.role === 'admin' || user.role === '*') && !apiKey)) {
    const { NodeService } = require('../services/nodeService');
    const nodeSvc: any = new NodeService();
    const nodesRepo = require('../config/typeorm').AppDataSource.getRepository(require('../models/node.entity').Node);
    const nodes = await nodesRepo.find({ where: user && user.org ? { organisation: { id: user.org.id } } : {} });
    allowedIds = [];
    for (const n of nodes) {
      const svc = new (require('../services/wingsApiService').WingsApiService)(n.url, n.token);
      try {
        const res = await svc.getServers();
        const servs = res.data || [];
        for (const s of servs) {
          if (user && (user.role === 'admin' || user.role === '*')) {
            allowedIds.push(s.uuid);
          } else if (user && s.owner === user.id) {
            allowedIds.push(s.uuid);
          } else if (apiKey && apiKey.user && apiKey.user.id === s.owner) {
            allowedIds.push(s.uuid);
          }
        }
      } catch {}
    }
  }

  const { socEmitter } = require('../services/socSocketService');
  const listener = (data: any) => {
    if (allowedIds && data.serverId && !allowedIds.includes(data.serverId)) return;
    try { socket.send(JSON.stringify({ type: 'soc:update', data })); } catch {};
  };
  socEmitter.on('update', listener);
  socket.on('close', () => {
    socEmitter.off('update', listener);
  });
}

export async function handleAiConnection(app: any, socket: any, req: RawRequest) {
  try {
    await authenticate(req as any);
  } catch {
    socket.close();
    return;
  }
  const user = (req as any).user;
  const apiKey = (req as any).apiKey;
  if (!user && !apiKey) {
    socket.close();
    return;
  }
  const { aiEmitter } = require('../services/aiSocketService');
  const listener = (data: any) => {
    if (user && (user.role === 'admin' || user.role === '*')) {
      // send
    } else if (user && data.userId === user.id) {
      // send
    } else if (user && user.org && data.organisationId === user.org.id) {
      // send
    } else if (apiKey && apiKey.type === 'admin') {
      // send
    } else if (apiKey && apiKey.user && data.userId === apiKey.user.id) {
      // send
    } else {
      return;
    }
    try { socket.send(JSON.stringify({ type: 'ai:usage', data })); } catch {};
  };
  aiEmitter.on('usage', listener);
  socket.on('close', () => {
    aiEmitter.off('usage', listener);
  });
}

export async function handleServerConnection(app: any, socket: any, req: RawRequest) {
  try {
    await authenticate(req as any);
  } catch {
    socket.close();
    return;
  }
  if (!(req as any).user && !(req as any).apiKey) {
    socket.close();
    return;
  }
  const nodeSvc = new (require('./../services/nodeService').NodeService)();
  const serverId = (req.params as any).id;
  try {
    const svc: any = await nodeSvc.getServiceForServer(serverId);
    const remote = svc.connectServerWebsocket(serverId, (msg: any) => {
      try { socket.send(JSON.stringify(msg)); } catch {};
    });
    socket.on('message', (m: any) => {
      try { remote.send(m); } catch {};
    });
    socket.on('close', () => {
      try { remote.close(); } catch {};
    });
  } catch (e) {
    socket.close();
  }
}
