// server.js — MCP stdio server exposing fig2web to MCP clients
// (Claude Desktop, Claude Code, Cursor, ...).
//
// Tools:
//   convert_fig_to_html { fig_path, out_dir? }  -> rebuild screens on disk
//   inspect_fig { fig_path }                    -> structural JSON summary
//
// Low-level Server API keeps the dependency surface small (no zod peer).
import path from 'node:path';
import fs from 'node:fs';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { convertToHtml, inspectFig } from '../lib/index.js';

const VERSION = '0.1.0';

const TOOLS = [
  {
    name: 'convert_fig_to_html',
    description:
      'Rebuild every screen of a Figma .fig file as a static HTML/CSS bundle ' +
      '(index.html gallery + screens/*.html + assets/). Works fully offline, ' +
      'without a Figma account, Dev Mode or MCP service. Prefer absolute paths.',
    inputSchema: {
      type: 'object',
      properties: {
        fig_path: { type: 'string', description: 'Absolute path to the .fig file' },
        out_dir: { type: 'string', description: 'Output directory (default: <name>-html next to the file)' },
      },
      required: ['fig_path'],
    },
  },
  {
    name: 'inspect_fig',
    description:
      'Analyze a Figma .fig file: pages, screens, node counts, all text content, ' +
      'color palette, fonts, design tokens (variables), components and image assets. ' +
      'Read-only; returns JSON.',
    inputSchema: {
      type: 'object',
      properties: { fig_path: { type: 'string', description: 'Absolute path to the .fig file' } },
      required: ['fig_path'],
    },
  },
];

function toolResult(payload) {
  return {
    content: [{
      type: 'text',
      text: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2),
    }],
  };
}

function resolveFigPath(args = {}) {
  const figPath = args.fig_path;
  if (!figPath) throw new McpError(ErrorCode.InvalidParams, 'fig_path is required');
  const abs = path.resolve(figPath);
  if (!fs.existsSync(abs)) {
    throw new McpError(ErrorCode.InvalidParams, `file not found: ${abs}`);
  }
  return abs;
}

export function createFig2WebServer() {
  const server = new Server(
    { name: 'fig2web', version: VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    try {
      if (name === 'convert_fig_to_html') {
        const abs = resolveFigPath(args);
        const out = convertToHtml(abs, { outDir: args.out_dir });
        return toolResult({
          ok: true,
          screens: out.screens,
          out_dir: out.outDir,
          stats: out.stats,
          first_screens: out.screenList.slice(0, 20),
        });
      }
      if (name === 'inspect_fig') {
        const abs = resolveFigPath(args);
        return toolResult(inspectFig(abs, { sampleSize: 60 }));
      }
      throw new McpError(ErrorCode.MethodNotFound, `unknown tool: ${name}`);
    } catch (e) {
      if (e instanceof McpError) throw e;
      // surface conversion errors as tool errors, not server crashes
      return { content: [{ type: 'text', text: `error: ${e.message}` }], isError: true };
    }
  });

  return server;
}

/** Connect the server to stdio and start serving. */
export async function startFig2WebServer() {
  const server = createFig2WebServer();
  await server.connect(new StdioServerTransport());
  return server;
}
