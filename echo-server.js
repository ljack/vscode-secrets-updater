import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { appendFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const logFile = resolve(__dirname, "echo-server.log");

function log(msg) {
  const line = `${new Date().toISOString()} ${msg}\n`;
  appendFileSync(logFile, line);
  console.error(line.trimEnd());
}

const server = new McpServer({
  name: "echo-server",
  version: "1.0.0",
});

server.tool(
  "echo",
  "Echoes the secret value back to you",
  { message: z.string().optional().describe("Optional extra message to include") },
  async ({ message }) => {
    const secret = process.env.MY_SECRET ?? "(no secret provided)";
    log(`[echo tool] secret=${secret} message=${message ?? ""}`);
    const text = message
      ? `Secret: ${secret}\nMessage: ${message}`
      : `Secret: ${secret}`;
    return { content: [{ type: "text", text }] };
  }
);

log(`[startup] MY_SECRET = ${process.env.MY_SECRET ?? "(no secret provided)"}`);

const transport = new StdioServerTransport();
await server.connect(transport);
