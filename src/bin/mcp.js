#!/usr/bin/env node
// fig2web-mcp — stdio MCP server (add to Claude Desktop / Claude Code config).
import { startFig2WebServer } from '../mcp/server.js';

startFig2WebServer().catch((e) => {
  console.error(`fig2web-mcp: ${e.message}`);
  process.exit(1);
});
