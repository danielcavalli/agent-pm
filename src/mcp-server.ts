#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createRequire } from "node:module";
import { dispatchMcpToolCall, listMcpTools } from "./contracts/mcp-surface.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const server = new Server(
  { name: "pm-tools", version },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: listMcpTools(),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: rawArgs } = request.params;
  return dispatchMcpToolCall(name, (rawArgs ?? {}) as Record<string, unknown>);
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`PM MCP server error: ${message}\n`);
  process.exit(1);
});
