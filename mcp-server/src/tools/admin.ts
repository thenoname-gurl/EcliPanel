import { z } from "zod";
import { ecliApi } from "../ecli-client.js";

export const adminTools = [
  {
    name: "ecli_admin_list_users",
    description: "Admin: List all users in the panel with full details.",
    inputSchema: z.object({
      page: z.number().optional().default(1).describe("Page number"),
      limit: z.number().optional().default(50).describe("Results per page"),
    }),
    handler: async ({ page, limit }: { page: number; limit: number }) => {
      const users = await ecliApi.admin.listUsers(page, limit);
      return { users, page, limit };
    },
  },
  {
    name: "ecli_admin_suspend_server",
    description: "Admin: Suspend a server, preventing it from running.",
    inputSchema: z.object({
      serverId: z.string().describe("The server identifier"),
    }),
    handler: async ({ serverId }: { serverId: string }) => {
      await ecliApi.admin.suspendServer(serverId);
      return { success: true, serverId, action: "suspended" };
    },
  },
  {
    name: "ecli_admin_unsuspend_server",
    description: "Admin: Unsuspend a previously suspended server.",
    inputSchema: z.object({
      serverId: z.string().describe("The server identifier"),
    }),
    handler: async ({ serverId }: { serverId: string }) => {
      await ecliApi.admin.unsuspendServer(serverId);
      return { success: true, serverId, action: "unsuspended" };
    },
  },
];