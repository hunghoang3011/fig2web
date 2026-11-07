// mcp.test.mjs — spawn the fig2web-mcp stdio server and exercise it over JSON-RPC.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMiniFig } from './helpers/fixture.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.join(__dirname, '..', 'src', 'bin', 'mcp.js');

function rpc(proc, obj) {
  proc.stdin.write(JSON.stringify(obj) + '\n');
}

function waitFor(fn, ms = 5000) {
  const deadline = Date.now() + ms;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const v = fn();
      if (v !== undefined) resolve(v);
      else if (Date.now() > deadline) reject(new Error('timeout waiting for MCP response'));
      else setTimeout(tick, 25);
    };
    tick();
  });
}

test('fig2web-mcp: initialize -> tools/list -> tools/call inspect_fig', async () => {
  // materialize a fixture .fig on disk for the tool call
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fig2web-mcp-'));
  const figPath = path.join(dir, 'mini.fig');
  fs.writeFileSync(figPath, buildMiniFig());

  const proc = spawn(process.execPath, [BIN], { stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '';
  const messages = [];
  proc.stdout.on('data', d => {
    buf += d;
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (line) {
        try { messages.push(JSON.parse(line)); } catch { /* skip */ }
      }
    }
  });
  proc.stderr.on('data', d => process.stderr.write(d));

  try {
    // initialize handshake
    rpc(proc, {
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '0' },
      },
    });
    rpc(proc, { jsonrpc: '2.0', method: 'notifications/initialized' });

    // tools/list
    rpc(proc, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
    await waitFor(() => messages.find(m => m.id === 2));
    const tools = messages.find(m => m.id === 2).result.tools;
    const names = tools.map(t => t.name);
    assert.deepEqual(names.sort(), ['convert_fig_to_html', 'inspect_fig']);

    // tools/call inspect_fig
    rpc(proc, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: {
      name: 'inspect_fig', arguments: { fig_path: figPath },
    } });
    await waitFor(() => messages.find(m => m.id === 3));
    const callRes = messages.find(m => m.id === 3).result;
    const text = callRes.content[0].text;
    const parsed = JSON.parse(text);
    assert.equal(parsed.screens, 1);
    assert.ok(parsed.texts.sample.includes('Hello fig2web'));

    // tools/call convert_fig_to_html
    rpc(proc, { jsonrpc: '2.0', id: 4, method: 'tools/call', params: {
      name: 'convert_fig_to_html', arguments: { fig_path: figPath, out_dir: path.join(dir, 'out') },
    } });
    await waitFor(() => messages.find(M => M.id === 4));
    const convRes = messages.find(m => m.id === 4).result;
    assert.match(convRes.content[0].text, /"screens": 1|"screens":1/);
    assert.ok(fs.existsSync(path.join(dir, 'out', 'index.html')));
  } finally {
    proc.kill();
  }
});
