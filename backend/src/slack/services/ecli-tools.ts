import { AppDataSource } from "../../config/typeorm";
import { ServerConfig } from "../../models/serverConfig.entity";
import { User } from "../../models/user.entity";
import { Node } from "../../models/node.entity";
import { Ticket } from "../../models/ticket.entity";
import { AIModel } from "../../models/aiModel.entity";
import { OrganisationDnsZone } from "../../models/organisationDnsZone.entity";
import { createActivityLog } from "../../handlers/logHandler";

async function logAction(userId: number, action: string, targetId?: string, targetType?: string, meta?: Record<string, unknown>) {
  try {
    await createActivityLog({ userId, action, targetId, targetType, metadata: { ...meta, source: "slack-bot", ranBy: "AI agent" }, ipAddress: "slack-bot" });
  } catch {}
}

function stripHtml(html: string, maxLen = 4000): string {
  let text = html;
  text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ");
  text = text.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/&[a-z]+;/gi, " ");
  text = text.replace(/&#\d+;/g, " ");
  text = text.replace(/\s+/g, " ").trim();
  return text.slice(0, maxLen);
}

function extractTagText(html: string): string {
  return stripHtml(html);
}

export interface ToolDef {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, any> };
  adminOnly?: boolean;
}

export function getEcliTools(isAdmin: boolean): ToolDef[] {
  const adminTools: ToolDef[] = [
    { type: "function", function: { name: "ecli_list_users", description: "Admin: List all users", parameters: { type: "object", properties: { page: { type: "number" }, limit: { type: "number" } } } }, adminOnly: true },
    { type: "function", function: { name: "ecli_get_user", description: "Admin: Get any user details", parameters: { type: "object", properties: { userId: { type: "number" } }, required: ["userId"] } }, adminOnly: true },
    { type: "function", function: { name: "ecli_list_nodes", description: "Admin: List all Wings nodes", parameters: { type: "object", properties: {} } }, adminOnly: true },
    { type: "function", function: { name: "ecli_get_node", description: "Admin: Get node details", parameters: { type: "object", properties: { nodeId: { type: "number" } }, required: ["nodeId"] } }, adminOnly: true },
    { type: "function", function: { name: "ecli_list_ai_models", description: "Admin: List AI models", parameters: { type: "object", properties: {} } }, adminOnly: true },
  ];

  const userTools: ToolDef[] = [
    { type: "function", function: { name: "ecli_my_servers", description: "List YOUR servers", parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "ecli_my_profile", description: "Get your profile, roles, and permissions", parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "ecli_create_ticket", description: "Create a support ticket", parameters: { type: "object", properties: { subject: { type: "string" }, message: { type: "string" }, priority: { type: "string", enum: ["low", "medium", "high", "urgent"] } }, required: ["subject", "message"] } } },
  ];

  const tools: ToolDef[] = [...userTools];

  if (isAdmin) {
    tools.push(
      { type: "function", function: { name: "ecli_list_servers", description: "Admin: List ALL servers", parameters: { type: "object", properties: { page: { type: "number" }, limit: { type: "number" } } } }, adminOnly: true },
      { type: "function", function: { name: "ecli_get_server", description: "Admin: Get ANY server details", parameters: { type: "object", properties: { serverId: { type: "string" } }, required: ["serverId"] } }, adminOnly: true },
      { type: "function", function: { name: "ecli_list_dns_zones", description: "Admin: List DNS zones for an org", parameters: { type: "object", properties: { orgId: { type: "number" } }, required: ["orgId"] } }, adminOnly: true },
      ...adminTools,
    );
  }

  tools.push(
    { type: "function", function: { name: "web_search", description: "Search the web via DuckDuckGo. Returns titles, snippets, URLs.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
    { type: "function", function: { name: "web_fetch", description: "Fetch and extract text from a URL. Use after web_search.", parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } } },
  );

  return tools;
}

export async function executeEcliTool(name: string, args: any, userId: number, isAdmin: boolean): Promise<string> {
  try {
    let result: any;
    switch (name) {
      case "ecli_my_servers": {
        const repo = AppDataSource.getRepository(ServerConfig);
        const rows = await repo.find({ where: { userId }, order: { createdAt: "DESC" as const } });
        await logAction(userId, "ai:server:list", undefined, "server", { count: rows.length, scope: "own" });
        result = rows.map((s: any) => ({ uuid: s.uuid, name: s.name, suspended: s.suspended, memory: s.memory, disk: s.disk, cpu: s.cpu, nodeId: s.nodeId, createdAt: s.createdAt }));
        break;
      }
      case "ecli_list_servers": {
        if (!isAdmin) { result = { error: "Permission denied." }; break; }
        const repo = AppDataSource.getRepository(ServerConfig);
        const [rows, total] = await repo.findAndCount({ skip: ((args.page || 1) - 1) * (args.limit || 25), take: args.limit || 25, order: { createdAt: "DESC" as const } });
        await logAction(userId, "ai:server:list", undefined, "server", { count: total, scope: "all" });
        result = { servers: rows.map((s: any) => ({ uuid: s.uuid, name: s.name, suspended: s.suspended, memory: s.memory, disk: s.disk, cpu: s.cpu, nodeId: s.nodeId, userId: s.userId, createdAt: s.createdAt })), total, page: args.page || 1 };
        break;
      }
      case "ecli_get_server": {
        if (!isAdmin) { result = { error: "Permission denied." }; break; }
        const repo = AppDataSource.getRepository(ServerConfig);
        const s = await repo.findOne({ where: { uuid: args.serverId } });
        await logAction(userId, "ai:server:view", args.serverId, "server");
        result = s ? { uuid: s.uuid, name: s.name, description: s.description, suspended: s.suspended, memory: s.memory, disk: s.disk, cpu: s.cpu, nodeId: s.nodeId, userId: s.userId, createdAt: s.createdAt } : { error: "Server not found" };
        break;
      }
      case "ecli_my_profile": {
        const repo = AppDataSource.getRepository(User);
        const u = await repo.findOne({ where: { id: userId }, relations: { userRoles: { role: { permissions: true } } } });
        await logAction(userId, "ai:user:view", String(userId), "user", { scope: "own" });
        if (!u) { result = { error: "Profile not found" }; break; }
        const roles: string[] = [];
        if (u.role === '*' || u.role === 'rootAdmin') roles.push(u.role);
        if (u.userRoles) for (const ur of u.userRoles) { if (ur.role) roles.push(ur.role.name); }
        const permissions: string[] = [];
        if (u.userRoles) for (const ur of u.userRoles) { if (ur.role?.permissions) for (const p of ur.role.permissions) { if (p.value && !permissions.includes(p.value)) permissions.push(p.value); } }
        result = { id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, suspended: u.suspended, role: u.role || "user", roles, permissions: permissions.length > 0 ? permissions : (u.role === '*' || u.role === 'rootAdmin' ? ["* (all)"] : []), createdAt: u.createdAt };
        break;
      }
      case "ecli_list_users": {
        if (!isAdmin) { result = { error: "Permission denied." }; break; }
        const repo = AppDataSource.getRepository(User);
        const [rows, total] = await repo.findAndCount({ skip: ((args.page || 1) - 1) * (args.limit || 25), take: args.limit || 25, order: { createdAt: "DESC" as const } });
        await logAction(userId, "ai:user:list", undefined, "user", { count: total });
        result = { users: rows.map((u: any) => ({ id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, suspended: u.suspended })), total, page: args.page || 1 };
        break;
      }
      case "ecli_get_user": {
        if (!isAdmin) { result = { error: "Permission denied." }; break; }
        const repo = AppDataSource.getRepository(User);
        const u = await repo.findOne({ where: { id: args.userId } });
        await logAction(userId, "ai:user:view", String(args.userId), "user");
        result = u ? { id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, suspended: u.suspended, createdAt: u.createdAt } : { error: "User not found" };
        break;
      }
      case "ecli_list_nodes": {
        if (!isAdmin) { result = { error: "Permission denied." }; break; }
        const repo = AppDataSource.getRepository(Node);
        const nodes = await repo.find();
        await logAction(userId, "ai:node:list", undefined, "node", { count: nodes.length });
        result = nodes.map((n: any) => ({ id: n.id, name: n.name, url: n.url, fqdn: n.fqdn, memory: n.memory, disk: n.disk, cpu: n.cpu, provider: n.provider }));
        break;
      }
      case "ecli_get_node": {
        if (!isAdmin) { result = { error: "Permission denied." }; break; }
        const repo = AppDataSource.getRepository(Node);
        const n = await repo.findOne({ where: { id: args.nodeId } });
        await logAction(userId, "ai:node:view", String(args.nodeId), "node");
        result = n ? { id: n.id, name: n.name, url: n.url, fqdn: n.fqdn, memory: n.memory, disk: n.disk, cpu: n.cpu, provider: n.provider } : { error: "Node not found" };
        break;
      }
      case "ecli_list_dns_zones": {
        if (!isAdmin) { result = { error: "Permission denied." }; break; }
        const repo = AppDataSource.getRepository(OrganisationDnsZone);
        const zones = await repo.find({ where: { organisationId: args.orgId } });
        await logAction(userId, "ai:dns:list", String(args.orgId), "dns_zone", { count: zones.length });
        result = zones.map((z: any) => ({ id: z.id, name: z.name, kind: z.kind, status: z.status }));
        break;
      }
      case "ecli_create_ticket": {
        const repo = AppDataSource.getRepository(Ticket);
        const ticket = repo.create({ userId, subject: args.subject, message: args.message, priority: args.priority || "medium", status: "opened" });
        await repo.save(ticket);
        await logAction(userId, "ai:ticket:create", String(ticket.id), "ticket", { subject: args.subject });
        result = { id: ticket.id, subject: ticket.subject, status: ticket.status, priority: ticket.priority };
        break;
      }
      case "ecli_list_ai_models": {
        if (!isAdmin) { result = { error: "Permission denied." }; break; }
        const repo = AppDataSource.getRepository(AIModel);
        const models = await repo.find();
        await logAction(userId, "ai:model:list", undefined, "ai_model", { count: models.length });
        result = models.map((m: any) => ({ id: m.id, name: m.name, tags: m.tags }));
        break;
      }
      case "web_search": {
        const q = encodeURIComponent(args.query);
        const res = await fetch(`https://html.duckduckgo.com/html/?q=${q}`);
        const html = await res.text();
        await logAction(userId, "ai:web:search", undefined, "web", { query: args.query });
        const results: Array<{ title: string; snippet: string; url: string }> = [];
        const linkRx = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        const snipRx = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
        const links = [...html.matchAll(linkRx)];
        const snippets = [...html.matchAll(snipRx)];
        for (let i = 0; i < Math.min(links.length, snippets.length, 8); i++) {
          const rawUrl = links[i][1].replace(/^\/\/duckduckgo\.com\/l\/\?uddg=/, "").split("&")[0];
          results.push({
            title: extractTagText(links[i][2]),
            snippet: snippets[i] ? extractTagText(snippets[i][1]) : "",
            url: decodeURIComponent(rawUrl),
          });
        }
        result = { query: args.query, results };
        break;
      }
      case "web_fetch": {
        const fetchRes = await fetch(args.url, { headers: { "User-Agent": "EcliBot/1.0" }, signal: AbortSignal.timeout(10000) });
        const pageHtml = await fetchRes.text();
        await logAction(userId, "ai:web:fetch", args.url, "web", { status: fetchRes.status });
        result = { url: args.url, text: stripHtml(pageHtml) };
        break;
      }
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
    return JSON.stringify(result);
  } catch (err: any) {
    return JSON.stringify({ error: err.message || String(err) });
  }
}
