// smoke.js — optional end-to-end check against a real .fig file.
// Usage: FIG2WEB_SMOKE_FILE="/path/File.fig" npm run smoke
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { convertToHtml } from '../src/lib/index.js';

const candidates = [
  process.env.FIG2WEB_SMOKE_FILE,
  '/Users/hunghoang/Downloads/Ahad Mobile.fig',
].filter(Boolean);

const fig = candidates.find(p => fs.existsSync(p));
if (!fig) {
  console.log('smoke: no real .fig found (set FIG2WEB_SMOKE_FILE) — skipping');
  process.exit(0);
}

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'fig2web-smoke-'));
const res = convertToHtml(fig, { outDir: out });
console.log(`smoke ok: ${res.screens} screens -> ${out}`);
for (const s of res.screenList.slice(0, 5)) {
  console.log(`  ${s.file}  ${s.name} (${s.size}, ${s.nodes} nodes)`);
}
if (res.screens < 1) {
  console.error('smoke FAILED: 0 screens');
  process.exit(1);
}
