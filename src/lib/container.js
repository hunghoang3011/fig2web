// container.js — open a Figma .fig container without any Figma software.
//
// Container layout (reverse-engineered, verified against real files):
//   *.fig (outer) = ZIP {
//     canvas.fig     <- the kiwi payload
//     meta.json      <- { version, ... } with ISO-8601 timestamps
//     thumbnail.png
//     images/<sha1>  <- image binaries (filename = sha1 of content, no extension)
//   }
//   canvas.fig = "fig-kiwi" (8B magic)  (also seen: fig-jam. / fig-deck / fig-makee)
//                + u32 LE version (e.g. 106)
//                + chunks of [u32 len][payload]:
//                    chunk 0 = kiwi binary schema (raw-deflate)
//                    chunk 1 = message { nodeChanges[], blobs[] } (zstd or raw-deflate)
//
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import AdmZip from 'adm-zip';
import { decompress as fzstdDecompress } from 'fzstd';
import { isZstd } from './util.js';

export const FIG_MAGICS = ['fig-kiwi', 'fig-jam.', 'fig-deck', 'fig-makee'];

function decompressChunk(raw) {
  if (isZstd(raw)) {
    // Node >= 22.15/23.8 ships a native zstd; older (>=18) falls back to fzstd.
    if (typeof zlib.zstdDecompressSync === 'function') {
      try { return zlib.zstdDecompressSync(raw); } catch { /* fall through */ }
    }
    return Buffer.from(fzstdDecompress(raw));
  }
  return zlib.inflateRawSync(raw);
}

/**
 * Split a canvas payload into its compressed chunks.
 * @param {Buffer} bytes full canvas.fig contents
 * @returns {{ magic: string, version: number, chunks: Buffer[] }}
 */
export function splitCanvasChunks(bytes) {
  const magic = bytes.subarray(0, 8).toString('latin1');
  if (!magic.startsWith('fig-')) {
    throw new Error(`unexpected magic "${magic}" - not a Figma canvas payload`);
  }
  const version = bytes.readUInt32LE(8);
  const chunks = [];
  let off = 12;
  while (off + 4 <= bytes.length) {
    const len = bytes.readUInt32LE(off); off += 4;
    if (len === 0 || off + len > bytes.length) break;
    const raw = bytes.subarray(off, off + len);
    off += len;
    chunks.push(decompressChunk(raw));
  }
  if (!chunks.length) throw new Error('canvas payload contains no readable chunks');
  return { magic, version, chunks };
}

/**
 * Open a .fig file (ZIP container) or a bare canvas payload.
 * @param {string|Buffer} input path to .fig / canvas.fig, or raw bytes
 * @param {{ imagesDir?: string }} [opts] extra images dir for bare-canvas mode
 * @returns {{ canvasBytes: Buffer, images: Map<string, Buffer>, meta: object|null, kind: 'zip'|'canvas' }}
 */
export function openContainer(input, opts = {}) {
  let bytes;
  let isZip;
  if (Buffer.isBuffer(input)) {
    bytes = input;
    isZip = bytes.subarray(0, 2).toString('latin1') === 'PK';
  } else {
    bytes = fs.readFileSync(input);
    isZip = bytes.subarray(0, 2).toString('latin1') === 'PK';
  }

  const images = new Map();
  let canvasBytes;
  let meta = null;
  let kind;

  if (isZip) {
    kind = 'zip';
    const zip = new AdmZip(bytes);
    for (const e of zip.getEntries()) {
      if (!e.isDirectory && e.entryName.startsWith('images/')) {
        images.set(path.basename(e.entryName), e.getData());
      }
    }
    canvasBytes = zip.getEntry('canvas.fig')?.getData();
    if (!canvasBytes) throw new Error('no canvas.fig inside the .fig ZIP container');
    const metaEntry = zip.getEntry('meta.json');
    if (metaEntry) {
      try { meta = JSON.parse(metaEntry.getData().toString('utf8')); } catch { /* tolerate */ }
    }
  } else {
    kind = 'canvas';
    canvasBytes = bytes;
    if (opts.imagesDir) {
      for (const f of fs.readdirSync(opts.imagesDir)) {
        images.set(f, fs.readFileSync(path.join(opts.imagesDir, f)));
      }
    }
  }

  return { canvasBytes, images, meta, kind };
}
