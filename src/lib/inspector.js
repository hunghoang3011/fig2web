// inspector.js — structural analysis of a parsed .fig (for `fig2web inspect`
// and the MCP inspect_fig tool). Pure: returns data, writes nothing.
import { gid, bytesToHex, toHexColor, r2 } from './util.js';

/**
 * @param {object} parsed  result of parseCanvas()
 * @param {Map<string, Buffer>} images hash -> bytes
 * @param {{ sampleSize?: number, full?: boolean }} [opts]
 * @returns {{ summary: object, files?: Array<{path: string, content: string}> }}
 */
export function buildInspect(parsed, images, opts = {}) {
  const sampleSize = opts.sampleSize ?? 40;
  const byId = parsed.byId;
  const byIdAll = parsed.byIdAll;

  // ---------------- walkers ----------------
  const texts = [];
  const colors = new Map();
  const fonts = new Map();
  const assets = new Map();   // hash -> usage count
  let textMissing = 0;
  let nodeCount = 0;

  function walk(id, depth, pathStr, out) {
    const rec = byId.get(id);
    if (!rec) return;
    const n = rec.n;
    nodeCount++;

    if (n.type === 'TEXT') {
      const chars = n.textData?.characters;
      if (typeof chars === 'string') {
        texts.push({ path: pathStr, text: chars });
      } else {
        textMissing++;
      }
      const fk = `${n.fontName?.family ?? '?'} / ${n.fontName?.style ?? '?'}`;
      fonts.set(fk, (fonts.get(fk) || 0) + 1);
    }

    for (const p of [...(n.fillPaints || []), ...(n.strokePaints || [])]) {
      if (p?.type === 'SOLID' && p.color) {
        const h = toHexColor(p.color);
        colors.set(h, (colors.get(h) || 0) + 1);
      }
      if (p?.type === 'IMAGE') {
        const raw = p.image?.hash;
        const h = raw instanceof Uint8Array ? bytesToHex(raw) : raw;
        if (h) assets.set(h, (assets.get(h) || 0) + 1);
      }
    }

    if (out) {
      const size = n.size ? ` ${n.size.x}x${n.size.y}` : '';
      const hid = n.visible === false ? ' [hidden]' : '';
      out.push(`${'  '.repeat(Math.min(depth, 40))}${n.type} "${n.name}"${size}${hid}`);
    }

    for (const c of rec.children) walk(c, depth + 1, `${pathStr} > ${n.name}`, out);
  }

  // start from DOCUMENT roots under the virtual root
  const rootChildren = byId.get('_root')?.children ?? [];
  const outline = [];
  for (const id of rootChildren) walk(id, 0, '', outline);

  // ---------------- pages / screens ----------------
  const topFrameTypes = new Set(['FRAME', 'SYMBOL', 'GROUP']);
  const pages = [];
  let screenCount = 0;
  for (const page of parsed.pages) {
    const pageRec = byId.get(gid(page.guid));
    if (!pageRec) continue;
    const pageScreens = [];
    for (const topId of pageRec.children) {
      const rec = byId.get(topId);
      const n = rec.n;
      if (n.visible === false) continue;
      if (n.type === 'SECTION') {
        for (const sid of rec.children) {
          const sr = byId.get(sid);
          if (topFrameTypes.has(sr.n.type) && sr.n.visible !== false) pageScreens.push(sr.n.name);
        }
        continue;
      }
      if (topFrameTypes.has(n.type)) pageScreens.push(n.name);
    }
    screenCount += pageScreens.length;
    pages.push({ name: page.name, screens: pageScreens.length, names: pageScreens.slice(0, 20) });
  }

  // ---------------- variables (design tokens) ----------------
  const variables = [];
  for (const n of parsed.nodeChanges) {
    if (n.type !== 'VARIABLE') continue;
    const entry = n.variableDataValues?.entries?.[0];
    const cv = entry?.variableData?.value?.colorValue;
    variables.push({
      name: n.name,
      resolved: cv ? toHexColor(cv) : undefined,
      type: n.variableResolvedType,
    });
  }

  // ---------------- components ----------------
  const components = [];
  for (const n of parsed.nodeChanges) {
    if (n.type === 'SYMBOL' && n.hasOwnProperty && Object.prototype.hasOwnProperty.call(n, 'name')) {
      if (components.length < 500) components.push({ name: n.name });
    }
  }

  // ---------------- summary ----------------
  const summary = {
    magic: parsed.magic,
    version: parsed.version,
    nodes: nodeCount,
    pages,
    screens: screenCount,
    texts: {
      total: texts.length + textMissing,
      readable: texts.length,
      sample: texts.slice(0, sampleSize).map(t => t.text.replace(/\n/g, '\\n')),
    },
    colors: [...colors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)
      .map(([hex, count]) => ({ hex, count })),
    fonts: [...fonts.entries()].sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count })),
    variables,
    components: { total: components.length, names: components.slice(0, 40).map(c => c.name) },
    assets: {
      unique: assets.size,
      available: [...assets.keys()].filter(h => images.has(h)).length,
    },
  };

  const result = { summary };

  // ---------------- full text reports (optional) ----------------
  if (opts.full) {
    const files = [];
    files.push({ path: 'tree.txt', content: outline.join('\n') + '\n' });
    files.push({
      path: 'texts.txt',
      content: texts.map(t => `${t.path} :: ${t.text.replace(/\n/g, '\\n')}`).join('\n') + '\n',
    });
    files.push({
      path: 'palette.txt',
      content: ['# colors (hex, usage count)',
        ...[...colors.entries()].sort((a, b) => b[1] - a[1]).map(pair => `${pair[0]}  x${pair[1]}`),
        '',
        '# fonts',
        ...[...fonts.entries()].sort((a, b) => b[1] - a[1]).map(pair => `${pair[0]}  x${pair[1]}`),
      ].join('\n') + '\n',
    });
    result.files = files;
  }

  return result;
}
