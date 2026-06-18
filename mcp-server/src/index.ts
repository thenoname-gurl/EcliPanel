import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createMcpServer } from "./server.js";

const transport = process.env.MCP_TRANSPORT || "stdio";

async function main() {
  const server = createMcpServer();

  if (transport === "sse") {
    const port = parseInt(process.env.MCP_PORT || "3433", 10);
    Bun.serve({
      port,
      fetch(req: Request, srv: any) {
        const url = new URL(req.url);

        if (url.pathname === "/sse" && req.method === "GET") {
          const sseTransport = new SSEServerTransport("/messages", {
            send: (data: string) => srv.publish("sse", data),
            close: () => {},
          } as any);
          server.connect(sseTransport);
          return new Response("SSE connected", { status: 200 });
        }

        if (url.pathname === "/messages" && req.method === "POST") {
          return new Response("OK", { status: 200 });
        }

        return new Response("Not Found", { status: 404 });
      },
    });

    console.error(`[eclipanel-mcp] SSE transport listening on port ${port}`);
  } else {
    const stdioTransport = new StdioServerTransport();
    await server.connect(stdioTransport);
    console.error("[eclipanel-mcp] stdio transport connected");
  }
}

main().catch((err) => {
  console.error("[eclipanel-mcp] Fatal error:", err);
  process.exit(1);
});
