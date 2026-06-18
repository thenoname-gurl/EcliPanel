import { z } from "zod";
import { ecliApi } from "../ecli-client.js";

export const ticketTools = [
  {
    name: "ecli_list_tickets",
    description: "List support tickets.",
    inputSchema: z.object({
      page: z.number().optional().default(1).describe("Page number"),
      limit: z.number().optional().default(25).describe("Results per page"),
    }),
    handler: async ({ page, limit }: { page: number; limit: number }) => {
      const tickets = await ecliApi.tickets.list(page, limit);
      return { tickets, page, limit };
    },
  },
  {
    name: "ecli_get_ticket",
    description: "Get a specific support ticket with its replies.",
    inputSchema: z.object({
      ticketId: z.number().describe("The ticket ID"),
    }),
    handler: async ({ ticketId }: { ticketId: number }) => {
      return await ecliApi.tickets.get(ticketId);
    },
  },
  {
    name: "ecli_create_ticket",
    description: "Create a new support ticket.",
    inputSchema: z.object({
      subject: z.string().describe("Ticket subject line"),
      message: z.string().describe("Initial ticket message body"),
      priority: z.enum(["low", "medium", "high", "urgent"]).optional().describe("Ticket priority"),
    }),
    handler: async ({ subject, message, priority }: { subject: string; message: string; priority?: string }) => {
      return await ecliApi.tickets.create(subject, message, priority);
    },
  },
  {
    name: "ecli_reply_ticket",
    description: "Reply to an existing support ticket.",
    inputSchema: z.object({
      ticketId: z.number().describe("The ticket ID"),
      message: z.string().describe("Reply message"),
    }),
    handler: async ({ ticketId, message }: { ticketId: number; message: string }) => {
      await ecliApi.tickets.reply(ticketId, message);
      return { success: true, ticketId };
    },
  },
];