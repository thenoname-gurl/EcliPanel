import { AppDataSource } from '../config/typeorm';
import { Node } from '../models/node.entity';
import { NodeHeartbeat } from '../models/nodeHeartbeat.entity';
import { ProxmoxApiService } from './proxmoxApiService';

const INTERVAL_MS = 30_000;
const PING_TIMEOUT = 8_000;
const RETENTION_DAYS = 7;
const ALLOW_INVALID_CERTS = process.env.WINGS_ALLOW_INVALID_CERT === 'true';

export class NodeHeartbeatService {
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  start() {
    this.runAll().catch(() => {});
    this.pingInterval = setInterval(() => this.runAll().catch(() => {}), INTERVAL_MS);

    this.cleanupInterval = setInterval(() => this.purgeOld().catch(() => {}), 60 * 60_000);
  }

  stop() {
    if (this.pingInterval) clearInterval(this.pingInterval);
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
    await Promise.allSettled(nodes.map(n => this.pingNode(n)));
  }

  private async pingNode(node: Node) {
    let responseMs: number | undefined;
    let status = 'ok';
    let errorMessage: string | undefined;
    const start = Date.now();

    try {
      if (node.provider === 'proxmox') {
        await this.pingProxmox(node);
      } else {
        await this.pingWings(node);
      }
      responseMs = Date.now() - start;
    } catch (e: any) {
      responseMs = Date.now() - start;
      errorMessage = e.code ? `${e.code}: ${e.message}` : e.message || String(e);
      if (
        e.code === 'ETIMEDOUT' ||
        e.code === 'ECONNABORTED' ||
        (e.message as string | undefined)?.includes('timeout')
      ) {
        status = 'timeout';
      } else {
        status = 'error';
      }
      console.warn(`[heartbeat] ${node.name} (id=${node.id}) ${status}: ${errorMessage}`);
    }

    const hbRepo = AppDataSource.getRepository(NodeHeartbeat);
    await hbRepo.save(hbRepo.create({ nodeId: node.id, responseMs, status, errorMessage })).catch(() => {});
  }

  private async pingWings(node: Node) {
    const raw = (node.backendWingsUrl || node.url).replace(/\/+$/, '');
    const baseUrl = raw.endsWith('/api') ? raw.slice(0, -4) : raw;
    const endpoint = `${baseUrl}/api/servers`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT);
    try {
      const fetchOpts: any = {
        method: 'GET',
        headers: { Authorization: `Bearer ${node.token}` },
        signal: controller.signal,
      };
      if (ALLOW_INVALID_CERTS) {
        fetchOpts.tls = { rejectUnauthorized: false };
        try { process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; } catch {}
      }
      const res = await fetch(endpoint, fetchOpts);
      if (!res.ok && res.status !== 401 && res.status !== 403) {
        throw new Error(`HTTP ${res.status}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  private async pingProxmox(node: Node) {
    if (!node.proxmoxHost || !node.proxmoxTokenId || !node.proxmoxSecret) {
      throw new Error('Proxmox node missing connection details');
    }
    const svc = new ProxmoxApiService({
      host: node.proxmoxHost,
      tokenId: node.proxmoxTokenId,
      secret: node.proxmoxSecret,
      realm: node.proxmoxRealm || 'pam',
      proxmoxNode: node.proxmoxNode || 'pve',
      storage: node.proxmoxStorage || 'local',
      bridge: node.proxmoxBridge || 'vmbr0',
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT);
    try {
      await svc.getVersion();
    } finally {
      clearTimeout(timeout);
    }
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
