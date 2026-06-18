import { z } from "zod";
import { ecliApi } from "../ecli-client.js";

export const userTools = [
  {
    name: "ecli_get_profile",
    description: "Get the current authenticated user's profile information.",
    inputSchema: z.object({}),
    handler: async () => {
      return await ecliApi.users.me();
    },
  },
  {
    name: "ecli_list_users",
    description: "List all users in the panel (admin only).",
    inputSchema: z.object({
      page: z.number().optional().default(1).describe("Page number"),
      limit: z.number().optional().default(25).describe("Results per page"),
    }),
    handler: async ({ page, limit }: { page: number; limit: number }) => {
      const users = await ecliApi.users.list(page, limit);
      return { users, page, limit };
    },
  },
  {
    name: "ecli_get_user",
    description: "Get detailed information about a specific user.",
    inputSchema: z.object({
      userId: z.number().describe("The user ID"),
    }),
    handler: async ({ userId }: { userId: number }) => {
      return await ecliApi.users.get(userId);
    },
  },
];