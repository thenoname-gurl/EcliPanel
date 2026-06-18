import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { serverTools } from "./tools/servers.js";
import { userTools } from "./tools/users.js";
import { nodeTools } from "./tools/nodes.js";
import { organisationTools } from "./tools/organisations.js";
import { ticketTools } from "./tools/tickets.js";
import { aiTools } from "./tools/ai.js";
import { adminTools } from "./tools/admin.js";

type ToolDef = {
  name: string;
  description: string;
  inputSchema: any;
  handler: (input: any) => Promise<any>;
};

const allTools: ToolDef[] = [
  ...serverTools,
  ...userTools,
  ...nodeTools,
  ...organisationTools,
  ...ticketTools,
  ...aiTools,
  ...adminTools,
];

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "eclipanel-mcp",
    version: "1.0.0",
  });

  for (const tool of allTools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema.shape,
      },
      async (input: any) => {
        try {
          const result = await tool.handler(input);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (err: any) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: ${err.message || String(err)}`,
              },
            ],
            isError: true,
          };
        }
      }
    );
  }

  return server;
}
