import { z } from "zod";
import { ecliApi } from "../ecli-client.js";

export const organisationTools = [
  {
    name: "ecli_list_organisations",
    description: "List all organisations the current user belongs to.",
    inputSchema: z.object({}),
    handler: async () => {
      return await ecliApi.organisations.list();
    },
  },
  {
    name: "ecli_get_organisation",
    description: "Get detailed information about a specific organisation.",
    inputSchema: z.object({
      orgId: z.number().describe("The organisation ID"),
    }),
    handler: async ({ orgId }: { orgId: number }) => {
      return await ecliApi.organisations.get(orgId);
    },
  },
  {
    name: "ecli_list_dns_zones",
    description: "List all DNS zones managed by an organisation (via Cloudflare).",
    inputSchema: z.object({
      orgId: z.number().describe("The organisation ID"),
    }),
    handler: async ({ orgId }: { orgId: number }) => {
      return await ecliApi.organisations.getDnsZones(orgId);
    },
  },
  {
    name: "ecli_list_dns_records",
    description: "List DNS records for a specific zone within an organisation.",
    inputSchema: z.object({
      orgId: z.number().describe("The organisation ID"),
      zoneId: z.string().describe("The DNS zone identifier"),
    }),
    handler: async ({ orgId, zoneId }: { orgId: number; zoneId: string }) => {
      return await ecliApi.organisations.getDnsRecords(orgId, zoneId);
    },
  },
];