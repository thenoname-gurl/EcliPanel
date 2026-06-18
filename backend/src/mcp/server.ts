import { AppDataSource } from "../config/typeorm";
import { ServerConfig } from "../models/serverConfig.entity";
import { User } from "../models/user.entity";
import { Node } from "../models/node.entity";
import { AIModel } from "../models/aiModel.entity";
import { OrganisationDnsZone } from "../models/organisationDnsZone.entity";

async function listServers(page = 1, limit = 25) {
  const repo = AppDataSource.getRepository(ServerConfig);
  const [rows, total] = await repo.findAndCount({
    skip: (page - 1) * limit,
    take: limit,
    order: { createdAt: "DESC" as const },
  });
  return {
    servers: rows.map(s => ({
      uuid: s.uuid, name: s.name, suspended: s.suspended,
      memory: s.memory, disk: s.disk, cpu: s.cpu,
      nodeId: s.nodeId, userId: s.userId, createdAt: s.createdAt,
    })),
    total, page, limit,
  };
}

async function getServer(serverId: string) {
  const repo = AppDataSource.getRepository(ServerConfig);
  const s = await repo.findOne({ where: { uuid: serverId } });
  if (!s) throw new Error(`Server ${serverId} not found`);
  return {
    uuid: s.uuid, name: s.name, description: s.description,
    suspended: s.suspended, memory: s.memory, disk: s.disk, cpu: s.cpu,
    swap: s.swap, ioWeight: s.ioWeight, dockerImage: s.dockerImage,
    startup: s.startup, eggId: s.eggId, nodeId: s.nodeId, userId: s.userId,
    createdAt: s.createdAt,
  };
}

async function listUsers(page = 1, limit = 25) {
  const repo = AppDataSource.getRepository(User);
  const [rows, total] = await repo.findAndCount({
    skip: (page - 1) * limit, take: limit,
    order: { createdAt: "DESC" as const },
  });
  return { users: rows.map(u => ({ id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, suspended: u.suspended })), total, page, limit };
}

async function getUser(userId: number) {
  const repo = AppDataSource.getRepository(User);
  const u = await repo.findOne({ where: { id: userId } });
  if (!u) throw new Error(`User ${userId} not found`);
  return { id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, suspended: u.suspended, createdAt: u.createdAt };
}

async function listNodes() {
  const repo = AppDataSource.getRepository(Node);
  const nodes = await repo.find();
  return nodes.map(n => ({ id: n.id, name: n.name, url: n.url, fqdn: n.fqdn, memory: n.memory, disk: n.disk, cpu: n.cpu, provider: n.provider }));
}

async function getNode(nodeId: number) {
  const repo = AppDataSource.getRepository(Node);
  const n = await repo.findOne({ where: { id: nodeId } });
  if (!n) throw new Error(`Node ${nodeId} not found`);
  return { id: n.id, name: n.name, url: n.url, fqdn: n.fqdn, memory: n.memory, disk: n.disk, cpu: n.cpu, provider: n.provider, nodeType: n.nodeType, portRangeStart: n.portRangeStart, portRangeEnd: n.portRangeEnd };
}

async function listDnsZones(orgId: number) {
  const repo = AppDataSource.getRepository(OrganisationDnsZone);
  const zones = await repo.find({ where: { organisationId: orgId } });
  return zones.map(z => ({ id: z.id, name: z.name, kind: z.kind, status: z.status }));
}

async function listAiModels() {
  const repo = AppDataSource.getRepository(AIModel);
  const models = await repo.find();
  return models.map(m => ({ id: m.id, name: m.name, tags: m.tags }));
}

export const allMcpTools = [
  { name: "ecli_list_servers", description: "List all servers", handler: listServers },
  { name: "ecli_get_server", description: "Get server details", handler: getServer },
  { name: "ecli_list_users", description: "List users", handler: listUsers },
  { name: "ecli_get_user", description: "Get user details", handler: getUser },
  { name: "ecli_list_nodes", description: "List all nodes", handler: listNodes },
  { name: "ecli_get_node", description: "Get node details", handler: getNode },
  { name: "ecli_list_dns_zones", description: "List DNS zones for an org", handler: listDnsZones },
  { name: "ecli_list_ai_models", description: "List AI models", handler: listAiModels },
];

export type McpTool = typeof allMcpTools[number];