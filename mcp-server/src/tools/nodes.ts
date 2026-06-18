import { z } from "zod";
import { ecliApi } from "../ecli-client.js";

export const nodeTools = [
  {
    name: "ecli_list_nodes",
    description: "List all Wings nodes registered in the panel.",
    inputSchema: z.object({}),
    handler: async () => {
      return await ecliApi.nodes.list();
    },
  },
  {
    name: "ecli_get_node",
    description: "Get detailed information about a specific node including its resources and allocation stats.",
    inputSchema: z.object({
      nodeId: z.number().describe("The node ID"),
    }),
    handler: async ({ nodeId }: { nodeId: number }) => {
      return await ecliApi.nodes.get(nodeId);
    },
  },
];