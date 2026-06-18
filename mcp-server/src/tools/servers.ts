import { z } from "zod";
import { ecliApi } from "../ecli-client.js";

export const serverTools = [
  {
    name: "ecli_list_servers",
    description: "List all servers managed by EcliPanel. Returns server name, status, node, and basic info.",
    inputSchema: z.object({
      page: z.number().optional().default(1).describe("Page number"),
      limit: z.number().optional().default(25).describe("Results per page"),
    }),
    handler: async ({ page, limit }: { page: number; limit: number }) => {
      const servers = await ecliApi.servers.list(page, limit);
      return { servers, page, limit };
    },
  },
  {
    name: "ecli_get_server",
    description: "Get detailed information about a specific server including its configuration, resources, and status.",
    inputSchema: z.object({
      serverId: z.string().describe("The server identifier"),
    }),
    handler: async ({ serverId }: { serverId: string }) => {
      return await ecliApi.servers.get(serverId);
    },
  },
  {
    name: "ecli_server_power",
    description: "Send a power action to a server. Actions: start, stop, restart, kill.",
    inputSchema: z.object({
      serverId: z.string().describe("The server identifier"),
      action: z.enum(["start", "stop", "restart", "kill"]).describe("Power action to perform"),
    }),
    handler: async ({ serverId, action }: { serverId: string; action: "start" | "stop" | "restart" | "kill" }) => {
      await ecliApi.servers.power(serverId, action);
      return { success: true, serverId, action };
    },
  },
  {
    name: "ecli_get_server_stats",
    description: "Get current resource usage statistics for a server (CPU, memory, disk, network).",
    inputSchema: z.object({
      serverId: z.string().describe("The server identifier"),
    }),
    handler: async ({ serverId }: { serverId: string }) => {
      return await ecliApi.servers.getStats(serverId);
    },
  },
  {
    name: "ecli_send_command",
    description: "Send a console command to a running server. Useful for game server RCON or terminal commands.",
    inputSchema: z.object({
      serverId: z.string().describe("The server identifier"),
      command: z.string().describe("The command to send to the server console"),
    }),
    handler: async ({ serverId, command }: { serverId: string; command: string }) => {
      await ecliApi.servers.sendCommand(serverId, command);
      return { success: true, serverId, command };
    },
  },
  {
    name: "ecli_list_files",
    description: "List files and directories in a server's file system.",
    inputSchema: z.object({
      serverId: z.string().describe("The server identifier"),
      directory: z.string().optional().default("/").describe("Directory path to list"),
    }),
    handler: async ({ serverId, directory }: { serverId: string; directory: string }) => {
      return await ecliApi.servers.getFiles(serverId, directory);
    },
  },
  {
    name: "ecli_read_file",
    description: "Read the contents of a file from a server's file system.",
    inputSchema: z.object({
      serverId: z.string().describe("The server identifier"),
      path: z.string().describe("Full path to the file"),
    }),
    handler: async ({ serverId, path }: { serverId: string; path: string }) => {
      return await ecliApi.servers.readFile(serverId, path);
    },
  },
  {
    name: "ecli_write_file",
    description: "Write content to a file on a server's file system. Creates the file if it doesn't exist.",
    inputSchema: z.object({
      serverId: z.string().describe("The server identifier"),
      path: z.string().describe("Full path to the file"),
      content: z.string().describe("Content to write to the file"),
    }),
    handler: async ({ serverId, path, content }: { serverId: string; path: string; content: string }) => {
      await ecliApi.servers.writeFile(serverId, path, content);
      return { success: true, serverId, path };
    },
  },
  {
    name: "ecli_list_backups",
    description: "List all backups for a server.",
    inputSchema: z.object({
      serverId: z.string().describe("The server identifier"),
    }),
    handler: async ({ serverId }: { serverId: string }) => {
      return await ecliApi.servers.getBackups(serverId);
    },
  },
  {
    name: "ecli_create_backup",
    description: "Create a new backup of a server.",
    inputSchema: z.object({
      serverId: z.string().describe("The server identifier"),
      name: z.string().optional().describe("Optional name for the backup"),
    }),
    handler: async ({ serverId, name }: { serverId: string; name?: string }) => {
      return await ecliApi.servers.createBackup(serverId, name);
    },
  },
];