// renderer.js — rebuild visible top-level frames as static HTML screens.
//
// Port of the verified prototype (fig2html.mjs, 420-screen baseline) with the
// I/O stripped out: renderHtml() is pure — it returns a file list.
import { r2, esc, rgba, bytesToHex, gid, slugify, weightOf, radiusOf, paintToCss, imageExt } from './util.js';

const VECTOR_TYPES = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'REGULAR_POLYGON', 'BRUSH']);

/**
 * @param {object} parsed   result of parseCanvas()
 * @param {Map<string, Buffer>} images  hash -> bytes (from openContainer)
 * @param {{ title?: string }} [opts]
 * @returns {{ files: Array<{path: string, content: string|Buffer}>, stats: object, screens: Array<object> }}
 */
export function renderHtml(parsed, images, opts = {}) {
  const byId = parsed.byId;
  const BLOBS = parsed.blobs || [];

  // ---------------- path blob -> SVG d-string ----------------
  // Layout: [u8 cmd][little-endian f32 coords...]
  // Commands: 0=Z(close) 1=M(x y) 2=L(x y) 3=Q(cx cy x y) 4=C(6 floats)
  function parsePath(blob) {
    if (!blob) return '';
    const bb = Buffer.from(blob.buffer, blob.byteOffset, blob.byteLength);
    let d = ''; let i = 0;
    const f = () => { const v = bb.readFloatLE(i); i += 4; return r2(v); };
    while (i < blob.length) {
      const cmd = blob[i++];
      if (cmd === 0) d += 'Z ';
      else if (cmd === 1) d += `M${f()} ${f()} `;
      else if (cmd === 2) d += `L${f()} ${f()} `;
      else if (cmd === 3) d += `Q${f()} ${f()} ${f()} ${f()} `;
      else if (cmd === 4) d += `C${f()} ${f()} ${f()} ${f()} ${f()} ${f()} `;
      else break;
    }
    return d;
  }

  const fontsUsed = new Map();   // family -> Set(styles)
  const imagesUsed = new Map();  // hash -> {buf, ext}
  const totals = { nodes: 0, vectors: 0, texts: 0, images: 0, masks: 0 };

  function fillStyleDecls(n) {
    const decls = [];
    for (const p of (n.fillPaints || []).filter(p => p.visible !== false)) {
      if (p.type === 'IMAGE') {
        const hash = p.image?.hash instanceof Uint8Array ? bytesToHex(p.image.hash) : p.image?.hash;
        const img = hash && images.get(hash);
        if (img) {
          imagesUsed.set(hash, { buf: img, ext: imageExt(img) });
          totals.images++;
          const mode = p.imageScaleMode === 'FIT' ? 'contain' : 'cover';
          decls.push(`background:url(assets/${hash}.${imageExt(img)}) center/${mode} no-repeat;`);
        }
        continue;
      }
      const css = paintToCss(p);
      if (css) decls.push(`background:${css};`);
    }
    return decls.join('');
  }

  function strokeCss(n) {
    const s = (n.strokePaints || []).find(p => p.visible !== false);
    if (!s || !n.strokeWeight) return '';
    const col = s.type === 'SOLID' && s.color ? rgba(s.color) : '#888';
    if (n.strokeAlign === 'OUTSIDE') return `outline:${n.strokeWeight}px solid ${col};`;
    return `border:${n.strokeWeight}px solid ${col};box-sizing:border-box;`;
  }

  function shadowCss(n) {
    const fx = (n.effects || []).filter(e => e.visible !== false && e.type === 'DROP_SHADOW');
    if (!fx.length) return '';
    return `box-shadow:${fx.map(e =>
      `${e.offset?.x ?? 0}px ${e.offset?.y ?? 0}px ${e.radius ?? 0}px ${e.spread ?? 0}px ${rgba(e.color)}`).join(', ')};`;
  }

  function vectorSvg(n) {
    const w = n.size?.x ?? 100, h = n.size?.y ?? 100;
    const fillPaint = (n.fillPaints || []).find(p => p.visible !== false);
    const strokePaint = (n.strokePaints || []).find(p => p.visible !== false);
    const fillCol = fillPaint?.color ? rgba(fillPaint.color)
      : (strokePaint?.color ? rgba(strokePaint.color) : '#000');
    const paths = [];
    for (const g of (n.fillGeometry || [])) {
      const d = parsePath(BLOBS[g.commandsBlob]?.bytes);
      if (d) paths.push(`<path d="${d}" fill="${fillPaint ? fillCol : 'none'}"${g.windingRule === 'EVENODD' ? ' fill-rule="evenodd"' : ''}/>`);
    }
    if (!paths.length && strokePaint) {
      for (const g of (n.strokeGeometry || [])) {
        const d = parsePath(BLOBS[g?.commandsBlob]?.bytes);
        if (d) paths.push(`<path d="${d}" fill="none" stroke="${strokePaint.color ? rgba(strokePaint.color) : '#000'}" stroke-width="${n.strokeWeight ?? 1}"/>`);
      }
    }
    if (!paths.length) return null;
    totals.vectors++;
    return `<svg width="100%" height="100%" viewBox="0 0 ${r2(w)} ${r2(h)}" xmlns="http://www.w3.org/2000/svg" style="display:block;overflow:visible">${paths.join('')}</svg>`;
  }

  function textDecls(n) {
    const fam = n.fontName?.family || 'sans-serif';
    const styles = fontsUsed.get(fam) || new Set();
    styles.add(n.fontName?.style || 'Regular');
    fontsUsed.set(fam, styles);
    const lh = n.lineHeight
      ? (n.lineHeight.units === 'PIXELS' ? `${r2(n.lineHeight.value)}px` : `${r2(n.lineHeight.value)}`)
      : 'normal';
    const ls = n.letterSpacing
      ? (n.letterSpacing.units === 'PIXELS' ? `${r2(n.letterSpacing.value)}px` : `${r2(n.letterSpacing.value)}%`)
      : '0';
    const fill = (n.fillPaints || []).find(p => p.visible !== false);
    return `color:${fill?.color ? rgba(fill.color) : '#111'};` +
      `font-family:"${fam}",-apple-system,'Segoe UI',sans-serif;` +
      `font-size:${r2(n.fontSize ?? 16)}px;font-weight:${weightOf(n.fontName?.style)};` +
      `font-style:${/italic/i.test(n.fontName?.style || '') ? 'italic' : 'normal'};` +
      `line-height:${lh};letter-spacing:${ls};` +
      (n.textAlignHorizontal ? `text-align:${String(n.textAlignHorizontal).toLowerCase()};` : '');
  }

  // ---------------- node -> HTML ----------------
  function nodeHtml(n, depth, donatedRadius) {
    if (n.visible === false) return '';
    totals.nodes++;
    const rec = byId.get(gid(n.guid));
    const w = n.size?.x ?? 0, h = n.size?.y ?? 0;
    const wf = Number.isFinite(w) && w > 0, hf = Number.isFinite(h) && h > 0;
    const t = n.transform || { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 };
    const isIdentity = t.m00 === 1 && t.m10 === 0 && t.m01 === 0 && t.m11 === 1;
    const pos = `left:${r2(t.m02)}px;top:${r2(t.m12)}px;` +
      (isIdentity ? '' : `transform:matrix(${r2(t.m00)},${r2(t.m10)},${r2(t.m01)},${r2(t.m11)},0,0);`);
    const wh = (wf ? `width:${r2(w)}px;` : '') + (hf ? `height:${r2(h)}px;` : '');
    const type = n.type;

    if (type === 'TEXT') {
      totals.texts++;
      const chars = n.textData?.characters ?? '';
      return `<div style="position:absolute;${pos}${wh}${textDecls(n)}white-space:pre-wrap;">${esc(chars)}</div>`;
    }

    if (type === 'LINE') {
      const sp = (n.strokePaints || []).find(p => p.visible !== false);
      const col = sp?.color ? rgba(sp.color) : '#000';
      return `<div style="position:absolute;${pos}width:${r2(w)}px;height:${r2(n.strokeWeight ?? 1)}px;background:${col};"></div>`;
    }

    let extra = '';
    if (type === 'ELLIPSE') extra += 'border-radius:50%;';

    if (VECTOR_TYPES.has(type)) {
      const svg = vectorSvg(n);
      if (svg) {
        const kids = rec?.children.length ? nodeHtmlChildren(rec, depth) : '';
        return `<div style="position:absolute;${pos}${wh}${extra}">${svg}${kids}</div>`;
      }
    }

    // generic container (FRAME / GROUP / INSTANCE / SYMBOL / RECTANGLE / ...)
    const decls = [];
    const bg = fillStyleDecls(n);
    if (bg) decls.push(bg);
    let rad = radiusOf(n);
    if (donatedRadius && !rad) rad = donatedRadius;
    if (rad) decls.push(`border-radius:${typeof rad === 'number' ? `${rad}px` : rad};`);
    if (n.opacity !== undefined && n.opacity < 1) decls.push(`opacity:${r2(n.opacity)};`);
    decls.push(blendCss(n.blendMode));
    const sc = strokeCss(n); if (sc) decls.push(sc);
    const sh = shadowCss(n); if (sh) decls.push(sh);
    const clip = type === 'FRAME' ? n.clipContent !== false : false;
    if (clip) decls.push('overflow:hidden;');
    if (n.mask === true) decls.push('overflow:hidden;pointer-events:none;');
    const kidsHtml = rec?.children.length ? nodeHtmlChildren(rec, depth) : '';
    return `<div data-t="${type}" style="position:absolute;${pos}${wh}${decls.join('')}">${kidsHtml}</div>`;
  }

  function blendCss(b) {
    return (b && !['NORMAL', 'PASS_THROUGH'].includes(b))
      ? `mix-blend-mode:${String(b).toLowerCase().replaceAll('_', '-')};` : '';
  }

  function nodeHtmlChildren(rec, depth) {
    if (depth > 80) return '';
    let out = '';
    let pendingMask = null;
    for (const cid of rec.children) {
      const childRec = byId.get(cid);
      const child = childRec.n;
      if (child.visible === false) continue;
      // hide mask nodes; donate their radius to the next sibling (approximation)
      if (child.mask === true) {
        pendingMask = radiusOf(child) || 999;
        continue;
      }
      const donated = pendingMask ? (pendingMask === 999 ? 50 : pendingMask) : undefined;
      pendingMask = null;
      out += nodeHtml(child, depth + 1, donated);
    }
    return out;
  }

  // ---------------- screens ----------------
  const screens = [];
  for (const page of parsed.pages) {
    const pageRec = byId.get(gid(page.guid));
    if (!pageRec) continue;
    for (const topId of pageRec.children) {
      const rec = byId.get(topId);
      const n = rec.n;
      if (n.visible === false) continue;
      if (n.type === 'SECTION') {
        for (const sid of rec.children) {
          const sr = byId.get(sid);
          if (['FRAME', 'SYMBOL', 'GROUP'].includes(sr.n.type) && sr.n.visible !== false)
            screens.push({ page: page.name, node: sr.n });
        }
        continue;
      }
      if (['FRAME', 'SYMBOL', 'GROUP'].includes(n.type)) screens.push({ page: page.name, node: n });
    }
  }

  // ---------------- render each screen ----------------
  const screenMeta = [];
  const usedSlugs = new Map();
  for (const s of screens) {
    // the screen IS the origin — strip its canvas offset (clone keeps parse output reusable)
    const node = {
      ...s.node,
      transform: s.node.transform ? { ...s.node.transform, m02: 0, m12: 0 } : undefined,
    };
    const before = { ...totals };
    let body = '';
    try { body = nodeHtml(node, 0); } catch (e) {
      console.error(`screen "${s.node.name}" skipped: ${e.message}`);
      continue;
    }
    const per = {
      nodes: totals.nodes - before.nodes,
      vectors: totals.vectors - before.vectors,
      texts: totals.texts - before.texts,
      images: totals.images - before.images,
    };
    const base = slugify(`${s.page}-${s.node.name}`);
    const cnt = usedSlugs.get(base) ?? 0;
    usedSlugs.set(base, cnt + 1);
    const slug = cnt ? `${base}-${cnt + 1}` : base;
    const w = r2(s.node.size?.x ?? 375), h = r2(s.node.size?.y ?? 812);
    screenMeta.push({ slug, name: s.node.name, page: s.page, w, h, body, stats: per });
  }

  return {
    files: [],
    screenMeta,
    fontsUsed,
    imagesUsed,
    stats: {
      screens: screenMeta.length,
      nodes: totals.nodes,
      vectors: totals.vectors,
      texts: totals.texts,
      imageFills: totals.images,
      masks: totals.masks,
    },
  };
}
