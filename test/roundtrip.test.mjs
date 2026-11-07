// roundtrip.test.mjs — synthetic .fig -> openContainer -> parseCanvas -> renderHtml.
// Validates container layout, kiwi decode (last-struct-is-root), tree rebuild
// and the HTML renderer end-to-end without needing a real design file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openContainer } from '../src/lib/container.js';
import { parseCanvas } from '../src/lib/parser.js';
import { renderHtml } from '../src/lib/renderer.js';
import { bundleHtml, writeFiles } from '../src/lib/emitter.js';
import { buildMiniFig } from './helpers/fixture.mjs';
import { buildInspect } from '../src/lib/inspector.js';

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fig2web-test-'));
}

test('mini .fig: container -> parse -> render -> bundle', () => {
  const figBytes = buildMiniFig();

  // --- container ---
  const opened = openContainer(figBytes);
  assert.equal(opened.kind, 'zip');
  assert.ok(opened.canvasBytes.length > 12);
  assert.equal(opened.images.size, 1);

  // --- parse ---
  const parsed = parseCanvas(opened.canvasBytes);
  assert.equal(parsed.magic, 'fig-kiwi');
  assert.equal(parsed.version, 106);
  assert.equal(parsed.nodeChanges.length, 4);
  assert.equal(parsed.pages.length, 1);
  assert.equal(parsed.pages[0].name, 'Page 1');

  // --- renderer ---
  const rendered = renderHtml(parsed, opened.images, { title: 'mini' });
  assert.equal(rendered.screenMeta.length, 1);
  const screen = rendered.screenMeta[0];
  assert.equal(screen.name, 'Home');
  assert.equal(screen.w, 375);
  assert.equal(screen.h, 812);
  assert.ok(screen.body.includes('Hello fig2web'), 'screen body contains the text node');
  assert.ok(screen.body.includes('font-weight:700'), 'font weight mapped (Bold->700)');
  assert.ok(screen.body.includes('width:375px'), 'frame size applied');
  assert.ok(screen.body.includes('background:rgba(255,255,255,1)'), 'frame fill applied');

  // --- bundle ---
  const { files } = bundleHtml(rendered, { title: 'mini' });
  const paths = files.map(f => f.path);
  assert.ok(paths.includes('index.html'));
  assert.ok(paths.includes('styles.css'));
  assert.ok(paths.some(p => p.startsWith('screens/')));

  // --- write to disk ---
  const out = tmpdir();
  writeFiles(out, files);
  assert.ok(fs.existsSync(path.join(out, 'index.html')));
  assert.ok(fs.existsSync(path.join(out, 'screens', `${screen.slug}.html`)));

  // --- inspect ---
  const { summary } = buildInspect(parsed, opened.images, { sampleSize: 10 });
  assert.equal(summary.screens, 1);
  assert.equal(summary.texts.total, 1);
  assert.ok(summary.colors.length >= 1);
});

test('file path input (not just Buffer) works identically', () => {
  const p = path.join(tmpdir(), 'mini.fig');
  fs.writeFileSync(p, buildMiniFig());
  const opened = openContainer(p);
  assert.equal(opened.kind, 'zip');
  const parsed = parseCanvas(opened.canvasBytes);
  const { summary } = buildInspect(parsed, opened.images, {});
  assert.equal(summary.screens, 1);
});
