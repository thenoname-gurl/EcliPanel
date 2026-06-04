import { AppDataSource } from '../config/typeorm';
import { Node } from '../models/node.entity';
import { ServerMapping } from '../models/serverMapping.entity';
import { WingsApiService } from './wingsApiService';
import { ProxmoxApiService } from './proxmoxApiService';
import { encrypt, decrypt } from '../utils/crypto';
import type { NodeProvider } from '../types/nodeProvider';

export type ProviderService = WingsApiService | ProxmoxApiService;

export class NodeService {
  private cache: Map<number, WingsApiService> = new Map();
  private proxmoxCache: Map<number, ProxmoxApiService> = new Map();

  invalidateNode(nodeId: number) {
    this.cache.delete(nodeId);
    this.proxmoxCache.delete(nodeId);
  }

  invalidateAll() {
    this.cache.clear();
    this.proxmoxCache.clear();
  }

  async getServiceForServer(uuid: string): Promise<ProviderService> {
    const repo = AppDataSource.getRepository(ServerMapping);
    const mapping = await repo.findOne({ where: { uuid }, relations: { node: true } });
    if (!mapping) throw new Error('No node mapping for server');
    return this.getServiceForNode(mapping.node.id);
  }

  async getServiceForNode(nodeId: number): Promise<ProviderService> {
    const nodeRepo = AppDataSource.getRepository(Node);
    const node = await nodeRepo.findOneBy({ id: nodeId });
    if (!node) throw new Error('Node not found');

    if (node.provider === 'proxmox') {
      if (this.proxmoxCache.has(nodeId)) return this.proxmoxCache.get(nodeId)!;
      const svc = this.buildProxmoxService(node);
      this.proxmoxCache.set(nodeId, svc);
      return svc;
    }

    if (this.cache.has(nodeId)) return this.cache.get(nodeId)!;
    const base = node.backendWingsUrl || node.url;
    const svc = new WingsApiService(base, node.token);
    this.cache.set(nodeId, svc);
    return svc;
  }

  async getWingsService(nodeId: number): Promise<WingsApiService> {
    const svc = await this.getServiceForNode(nodeId);
    if (svc instanceof WingsApiService) return svc;
    throw new Error('Node is not a Wings node');
  }

  async getProxmoxService(nodeId: number): Promise<ProxmoxApiService> {
    const svc = await this.getServiceForNode(nodeId);
    if (svc instanceof ProxmoxApiService) return svc;
    throw new Error('Node is not a Proxmox node');
  }

  private buildProxmoxService(node: Node): ProxmoxApiService {
    if (!node.proxmoxHost || !node.proxmoxTokenId || !node.proxmoxSecret) {
      throw new Error('Proxmox node missing connection details');
    }
    return new ProxmoxApiService({
      host: node.proxmoxHost,
      tokenId: node.proxmoxTokenId,
      secret: node.proxmoxSecret,
      realm: node.proxmoxRealm || 'pam',
      proxmoxNode: node.proxmoxNode || 'pve',
      storage: node.proxmoxStorage || 'local',
      bridge: node.proxmoxBridge || 'vmbr0',
    });
  }

  async registerNode(
    name: string,
    url: string,
    token: string,
    nodeId?: string,
    backendWingsUrl?: string,
    provider?: string
  ) {
    const repo = AppDataSource.getRepository(Node);
    let node = repo.create({
      name,
      url,
      token,
      nodeId,
      backendWingsUrl,
      provider: (provider as any) || 'wings',
    });
    node = await repo.save(node);
    this.invalidateNode(node.id);
    return node;
  }

  async mapServer(uuid: string, nodeId: number) {
    const repo = AppDataSource.getRepository(ServerMapping);
    let mapping = repo.create({ uuid, node: { id: nodeId } as any });
    mapping = await repo.save(mapping);
    return mapping;
  }

  async unmapServer(uuid: string) {
    const repo = AppDataSource.getRepository(ServerMapping);
    await repo.delete({ uuid });
  }

  async updateCredentials(nodeId: number, rootUser: string, rootPassword: string) {
    const repo = AppDataSource.getRepository(Node);
    const node = await repo.findOneBy({ id: nodeId });
    if (!node) throw new Error('Node not found');
    node.rootUser = encrypt(rootUser);
    node.rootPassword = encrypt(rootPassword);
    await repo.save(node);
    this.invalidateNode(nodeId);
    return node;
  }

  async getCredentials(nodeId: number) {
    const repo = AppDataSource.getRepository(Node);
    const node = await repo.findOneBy({ id: nodeId });
    if (!node) throw new Error('Node not found');
    return {
      rootUser: node.rootUser ? decrypt(node.rootUser) : undefined,
      rootPassword: node.rootPassword ? decrypt(node.rootPassword) : undefined,
    };
  }

  isProxmoxNode(node: Node): boolean {
    return node.provider === 'proxmox';
  }

  isWingsNode(node: Node): boolean {
    return !node.provider || node.provider === 'wings';
  }
}

export const nodeService = new NodeService();
