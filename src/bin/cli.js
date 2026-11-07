#!/usr/bin/env node
// fig2web — rebuild Figma .fig files as static HTML/CSS, fully offline.
//
//   fig2web <file.fig>                  rebuild all screens -> <name>-html/
//   fig2web <file.fig> -o outDir        custom output dir
//   fig2web <file.fig> --inspect        structural analysis instead of HTML
//   fig2web <file.fig> --json           machine-readable summary on stdout
import fs from 'node:fs';
import path from 'node:path';
import { convertToHtml, inspectFig } from '../lib/index.js';

const argv = process.argv.slice(2);
const flags = { inspect: false, json: false, quiet: false };
let file;
let outDir;
let imagesDir;

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '-h' || a === '--help') {
    console.log(`fig2web - rebuild Figma .fig screens as static HTML/CSS, offline

Usage:
  fig2web <file.fig> [options]

Options:
  -o, --out <dir>     output directory (default: <file>-html)
      --images <dir>  images dir for bare canvas.fig mode
      --inspect       write analysis reports (tree/texts/palette) instead of HTML
      --json          print JSON summary to stdout
  -q, --quiet         suppress progress output
  -h, --help          show this help
  -v, --version       show version`);
    process.exit(0);
  }
  if (a === '-v' || a === '--version') {
    // lightweight version print without importing package.json (bun/edge safe)
    const pkg = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    console.log(pkg.version);
    process.exit(0);
  }
  if (a === '--inspect') { flags.inspect = true; continue; }
  if (a === '--json') { flags.json = true; continue; }
  if (a === '-q' || a === '--quiet') { flags.quiet = true; continue; }
  if (a === '-o' || a === '--out') { outDir = argv[++i]; continue; }
  if (a === '--images') { imagesDir = argv[++i]; continue; }
  if (a.startsWith('-')) {
    console.error(`unknown flag: ${a} (see --help)`);
    process.exit(2);
  }
  file = a; // positional
}

if (!file) {
  console.error('usage: fig2web <file.fig> [-o outDir] [--inspect] [--json]\n       fig2web --help');
  process.exit(2);
}
if (!fs.existsSync(file)) {
  console.error(`file not found: ${file}`);
  process.exit(1);
}

try {
  if (flags.inspect) {
    const out = outDir || `${path.basename(file).replace(/\.fig$/i, '')}-inspect`;
    const summary = inspectFig(file, { full: true, outDir: out, imagesDir });
    if (flags.json) console.log(JSON.stringify(summary, null, 2));
    else {
      console.log(`pages:      ${summary.pages.length}`);
      console.log(`screens:    ${summary.screens}`);
      console.log(`nodes:      ${summary.nodes}`);
      console.log(`texts:      ${summary.texts.total} (${summary.texts.readable} readable)`);
      console.log(`colors:     ${summary.colors.length} top colors`);
      console.log(`variables:  ${summary.variables.length}`);
      console.log(`components: ${summary.components.total}`);
      console.log(`assets:     ${summary.assets.unique} unique hashes (${summary.assets.available} have binaries)`);
    }
    console.log(`reports -> ${path.resolve(out)}`);
  } else {
    const res = convertToHtml(file, { outDir, imagesDir, quiet: flags.quiet });
    if (flags.json) console.log(JSON.stringify(res.stats ? {
      screens: res.screens,
      stats: res.stats,
      outDir: res.outDir,
      screenList: res.screenList,
    } : res, null, 2));
    else {
      console.log(`ok ${res.screens} screens -> ${res.outDir}`);
      for (const s of res.screenList.slice(0, 10)) {
        console.log(`   ${s.file}  ${s.name} (${s.size}, ${s.nodes} nodes)`);
      }
      if (res.screenList.length > 10) console.log(`   ... and ${res.screenList.length - 10} more`);
    }
  }
} catch (e) {
  console.error(`fig2web: ${e.message}`);
  process.exit(1);
}
