import { AppDataSource } from '../config/typeorm';
import { Node } from '../models/node.entity';
import { NodeHeartbeat } from '../models/nodeHeartbeat.entity';

const INTERVAL_MS    = 30_000; 
const PING_TIMEOUT   =  8_000; 
const RETENTION_DAYS =      7; 
const ALLOW_INVALID_CERTS = process.env.WINGS_ALLOW_INVALID_CERT === 'true';

export class NodeHeartbeatService {
  private pingInterval:   ReturnType<typeof setInterval> | null = null;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  start() {
    this.runAll().catch(() => {});
    this.pingInterval = setInterval(() => this.runAll().catch(() => {}), INTERVAL_MS);

    this.cleanupInterval = setInterval(() => this.purgeOld().catch(() => {}), 60 * 60_000);
  }

  stop() {
    if (this.pingInterval)    clearInterval(this.pingInterval);
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    this.pingInterval = null;
    this.cleanupInterval = null;
  }

  private async runAll() {
    let nodes: Node[] = [];
    try {
      nodes = await AppDataSource.getRepository(Node).find();
    } catch {
      return;
    }
    await Promise.allSettled(nodes.map((n) => this.pingNode(n)));
  }

  private async pingNode(node: Node) {
    const raw     = ((node as any).backendWingsUrl || node.url).replace(/\/+$/, '');
    const baseUrl = raw.endsWith('/api') ? raw.slice(0, -4) : raw;
    const endpoint = `${baseUrl}/api/servers`;

    let responseMs: number | undefined;
    let status = 'ok';
    const start = Date.now();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT);
      try {
        const fetchOpts: RequestInit & { tls?: { rejectUnauthorized: boolean } } = {
          method: 'GET',
          headers: { Authorization: `Bearer ${node.token}` },
          signal: controller.signal,
        };
        if (ALLOW_INVALID_CERTS) fetchOpts.tls = { rejectUnauthorized: false };
        await fetch(endpoint, fetchOpts);
      } finally {
        clearTimeout(timeout);
      }
      responseMs = Date.now() - start;
    } catch (e: any) {
      if (
        e.code === 'ETIMEDOUT' ||
        e.code === 'ECONNABORTED' ||
        (e.message as string | undefined)?.includes('timeout')
      ) {
        status = 'timeout';
      } else {
        status = 'error';
      }
    }

    const hbRepo = AppDataSource.getRepository(NodeHeartbeat);
    await hbRepo.save(hbRepo.create({ nodeId: node.id, responseMs, status })).catch(() => {});
  }

  private async purgeOld() {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
    await AppDataSource.getRepository(NodeHeartbeat)
      .createQueryBuilder()
      .delete()
      .where('timestamp < :cutoff', { cutoff })
      .execute()
      .catch(() => {});
  }
}
