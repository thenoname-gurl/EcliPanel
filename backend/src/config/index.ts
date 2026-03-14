import { connectRedis } from './redis';
import { AppDataSource } from './typeorm';
import { initMail } from '../services/mailService';
import { startRetentionJobs } from '../services/retentionService';
import { WingsSocketService } from '../services/wingsSocketService';
import { NodeHeartbeatService } from '../services/nodeHeartbeatService';
import { startAllSftpProxies } from '../services/sftpProxyService';
import fs from 'fs';
import path from 'path';

const WINGS_RETRY_INITIAL = 30_000;
const WINGS_RETRY_MAX     = 10 * 60_000;

function connectNodeWithRetry(app: any, node: any, delay = WINGS_RETRY_INITIAL) {
  const sock = new WingsSocketService(node.url, node.token);
  sock.listenToAll().catch((e: any) => {
    const isTransient = ['ECONNREFUSED', 'ETIMEDOUT', 'ECONNABORTED', 'ENOTFOUND', 'ECONNRESET'].includes(e?.code);
    if (isTransient) {
      app.log.warn({ node: node.name, code: e.code, url: node.url },
        `wings node unreachable — retrying in ${Math.round(delay / 1000)}s`);
    } else {
      app.log.error({ e, node: node.name }, 'wings socket error');
    }
    const next = Math.min(delay * 2, WINGS_RETRY_MAX);
    setTimeout(() => connectNodeWithRetry(app, node, next), delay);
  });
}

export async function setupConfig(app: any) {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET environment variable must be set in production');
    }
    (app.log ?? console).warn('JWT_SECRET is not set — using insecure default. DO NOT deploy to production without setting this.');
  }
  
  await AppDataSource.initialize().catch((err) => {
    (app.log ?? console).error({ err }, 'Error during Data Source initialization');
    throw err;
  });
  
  connectRedis().catch((err) => {
    (app.log ?? console).error({ err }, 'Redis connection error');
  });

  initMail().catch((err) => {
    app.log.error({ err }, 'Mail initialization failed');
  });

  startRetentionJobs();

  const heartbeatSvc = new NodeHeartbeatService();
  heartbeatSvc.start();

  const uploadDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  try {
    const nodeRepo = AppDataSource.getRepository(require('../models/node.entity').Node);
    const nodes = await nodeRepo.find();
    if (nodes.length > 0) {
      for (const n of nodes) {
        connectNodeWithRetry(app, n);
      }
    } else {
      app.log.info('no wings nodes configured, skipping socket listeners');
    }
  } catch (e) {
    app.log.error({ e }, 'error checking nodes for wings socket startup');
  }
}