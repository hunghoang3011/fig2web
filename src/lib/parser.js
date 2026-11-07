// parser.js — decode the kiwi payload and rebuild the node tree.
//
// The canvas payload is self-describing: chunk 0 embeds a Kiwi binary schema
// (Evan Wallace's kiwi-format), chunk 1 is a message conforming to it.
// Wire field names below are as observed in real files (verified empirically).
import kiwi from 'kiwi-schema';
import { splitCanvasChunks } from './container.js';
import { gid } from './util.js';

const ROOT = '_root'; // virtual parent for orphaned nodes

/**
 * Decode a canvas payload and rebuild parent/child relations.
 * @param {Buffer} canvasBytes
 * @returns {{
 *   magic: string, version: number,
 *   nodeChanges: object[], blobs: Uint8Array[],
 *   byId: Map<string, {n: object, children: string[]}>,  // includes virtual '_root'
 *   byIdAll: Map<string, object>,                        // last CREATED/UPDATED wins, DELETED removed
 *   pages: object[],                                     // CANVAS nodes (hidden pages INCLUDED)
 * }}
 */
export function parseCanvas(canvasBytes) {
  const { magic, version, chunks } = splitCanvasChunks(canvasBytes);
  const schemaDef = kiwi.decodeBinarySchema(chunks[0]);
  const compiled = kiwi.compileSchema(schemaDef);
  const msg = compiled.decodeMessage(chunks[1]);
  const nc = msg.nodeChanges || [];

  // ---- flatten: CREATED/UPDATED last-wins; DELETED removed ----
  const byIdAll = new Map();
  for (const n of nc) {
    const id = gid(n.guid);
    if (n.phase === 'DELETED') { byIdAll.delete(id); continue; }
    byIdAll.set(id, n);
  }

  // ---- rebuild hierarchy under the virtual root ----
  const byId = new Map();
  byId.set(ROOT, { n: { type: 'ROOT', name: 'root' }, children: [] });
  for (const [id, n] of byIdAll) byId.set(id, { n, children: [] });
  for (const [id, rec] of byId) {
    if (id === ROOT) continue;
    const p = gid(rec.n.parentIndex?.guid);
    // parent missing/deleted -> orphan shelf under the virtual root
    const target = (p && byId.has(p)) ? p : ROOT;
    byId.get(target).children.push(id);
  }

  // layer order = ascending parentIndex.position (numeric string); stable sort
  for (const rec of byId.values()) {
    rec.children.sort((a, b) => {
      const na = parseFloat(byId.get(a).n.parentIndex?.position ?? '');
      const nb = parseFloat(byId.get(b).n.parentIndex?.position ?? '');
      return isNaN(na) || isNaN(nb) ? 0 : na - nb;
    });
  }

  // hidden CANVAS pages included: they hold flows + master components
  const pages = [...byIdAll.values()].filter(n => n.type === 'CANVAS');

  return { magic, version, nodeChanges: nc, blobs: msg.blobs || [], byId, byIdAll, pages };
}

export { ROOT, gid };
