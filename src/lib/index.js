// index.js — public API of fig2web.
//
//   import { openContainer, parseCanvas, renderHtml, bundleHtml } from 'fig2web';
//
//   const opened = openContainer('design.fig');
//   const parsed = parseCanvas(opened.canvasBytes);
//   const out = renderHtml(parsed, opened.images, { title: 'design' });
//   const { files } = bundleHtml(out, { title: 'design' });
//   writeFiles('./out', files);
//
import path from 'node:path';
import { openContainer } from './container.js';
import { parseCanvas } from './parser.js';
import { renderHtml } from './renderer.js';
import { bundleHtml, writeFiles } from './emitter.js';
import { buildInspect } from './inspector.js';

export { openContainer, splitCanvasChunks } from './container.js';
export { parseCanvas } from './parser.js';
export { renderHtml } from './renderer.js';
export { bundleHtml, writeFiles } from './emitter.js';
export { buildInspect } from './inspector.js';
export * as util from './util.js';

const DEFAULT_OUT_SUFFIX = '-html';

/** Derive default outDir "Foo.fig" -> "Foo-html". */
function defaultOutDir(input) {
  const base = path.basename(String(input)).replace(/\.fig$/i, '');
  return path.join(path.dirname(path.resolve(String(input))), `${base}${DEFAULT_OUT_SUFFIX}`);
}

/**
 * One-call conversion: .fig path/Buffer -> HTML bundle on disk.
 * @param {string|Buffer} input .fig file path (or raw bytes)
 * @param {{ outDir?: string, imagesDir?: string, quiet?: boolean }} [opts]
 * @returns {{ outDir: string, screens: number, stats: object, screenList: Array }}
 */
export function convertToHtml(input, opts = {}) {
  const outDir = path.resolve(opts.outDir || defaultOutDir(input));
  const title = path.basename(String(input || 'Figma')).replace(/\.fig$/i, '');

  const opened = openContainer(input, { imagesDir: opts.imagesDir });
  const parsed = parseCanvas(opened.canvasBytes);
  const rendered = renderHtml(parsed, opened.images, { title });
  const { files } = bundleHtml(rendered, { title });
  writeFiles(outDir, files);

  const screenList = rendered.screenMeta.map(s => ({
    file: `screens/${s.slug}.html`,
    name: s.name,
    page: s.page,
    size: `${s.w}x${s.h}`,
    nodes: s.stats.nodes,
  }));

  return { outDir, screens: rendered.screenMeta.length, stats: rendered.stats, screenList };
}

/**
 * Structural inspection without writing anything.
 * @param {string|Buffer} input .fig file path (or raw bytes)
 * @param {{ full?: boolean, outDir?: string, sampleSize?: number, imagesDir?: string }} [opts]
 */
export function inspectFig(input, opts = {}) {
  const opened = openContainer(input, { imagesDir: opts.imagesDir });
  const parsed = parseCanvas(opened.canvasBytes);
  const { summary, files } = buildInspect(parsed, opened.images, {
    sampleSize: opts.sampleSize,
    full: opts.full,
  });
  if (opts.full && opts.outDir && files) {
    writeFiles(opts.outDir, files);
  }
  return summary;
}
