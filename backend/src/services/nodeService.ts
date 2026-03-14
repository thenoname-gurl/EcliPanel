import { AppDataSource } from '../config/typeorm';
import { Node } from '../models/node.entity';
import { ServerMapping } from '../models/serverMapping.entity';
import { WingsApiService } from './wingsApiService';
import { encrypt, decrypt } from '../utils/crypto';

export class NodeService {
  private cache: Map<number, WingsApiService> = new Map();

  async getServiceForServer(uuid: string): Promise<WingsApiService> {
    const repo = AppDataSource.getRepository(ServerMapping);
    const mapping = await repo.findOne({ where: { uuid }, relations: ['node'] });
    if (!mapping) throw new Error('No node mapping for server');
    return this.getServiceForNode(mapping.node.id);
  }

  async getServiceForNode(nodeId: number): Promise<WingsApiService> {
    if (this.cache.has(nodeId)) return this.cache.get(nodeId)!;
    const nodeRepo = AppDataSource.getRepository(Node);
    const node = await nodeRepo.findOneBy({ id: nodeId });
    if (!node) throw new Error('Node not found');
    const svc = new WingsApiService(node.url, node.token);
    this.cache.set(nodeId, svc);
    return svc;
  }

  async registerNode(name: string, url: string, token: string) {
    const repo = AppDataSource.getRepository(Node);
    let node = repo.create({ name, url, token });
    node = await repo.save(node);
    this.cache.delete(node.id);
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
}
