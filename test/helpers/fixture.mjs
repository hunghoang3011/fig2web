// fixture.mjs — build a tiny synthetic .fig (ZIP { canvas.fig, meta.json, images/ })
// without any Figma software: craft a kiwi binary schema + message by hand.
import kiwi from 'kiwi-schema';
import AdmZip from 'adm-zip';
import deflate from 'zlib';

export function crc32(buf) { // adm-zip computes CRCs itself; placeholder to keep the helper lean
  return 0;
}

/**
 * Minimal container agreeing with the field names our parser reads.
 * The embedded schema mirrors the observable wire subset of real files.
 */
export function buildMiniFig() {
  const F = (name, type, isArray = false) => ({ name, type, isArray, line: 0, column: 0, isDeprecated: false, value: 0 });
  const S = (name, fields) => ({ name, kind: 'STRUCT', line: 0, column: 0, fields });
  const schemaDef = {
    package: null,
    definitions: [
      S('Guid', [
        F('sessionID', 'uint64'), F('localID', 'uint'),
      ]),
      S('ParentIndex', [
        F('guid', 'Guid'), F('position', 'string'),
      ]),
      S('Vector', [
        F('x', 'float'), F('y', 'float'),
      ]),
      S('Color', [
        F('r', 'float'), F('g', 'float'), F('b', 'float'), F('a', 'float'),
      ]),
      S('TextData', [
        F('characters', 'string'),
      ]),
      S('Paint', [
        F('type', 'string'), F('color', 'Color'),
      ]),
      S('FontName', [
        F('family', 'string'), F('style', 'string'),
      ]),
      S('NodeChange', [
        F('guid', 'Guid'),
        F('parentIndex', 'ParentIndex'),
        F('phase', 'string'),
        F('type', 'string'),
        F('name', 'string'),
        F('visible', 'bool'),
        F('size', 'Vector'),
        F('fontSize', 'float'),
        F('fontName', 'FontName'),
        F('textData', 'TextData'),
        F('fillPaints', 'Paint', true),
      ]),
      S('Message', [
        F('nodeChanges', 'NodeChange', true),
      ]),
    ],
  };
  const compiled = kiwi.compileSchema(schemaDef);

  const SID = 1n;
  let lid = 0;
  const mkGuid = () => ({ sessionID: SID, localID: ++lid });
  const PARENT = { sessionID: 0n, localID: 0 }; // document root handle

  const docGuid = mkGuid();
  const pageGuid = mkGuid();
  const frameGuid = mkGuid();
  const textGuid = mkGuid();

  const blank = {
    fontSize: 0,
    fontName: { family: '', style: '' },
    textData: { characters: '' },
    fillPaints: [],
    size: { x: 0, y: 0 },
  };
  const nodeChanges = [
    {
      ...blank, guid: docGuid, parentIndex: { guid: PARENT, position: '0' },
      phase: 'CREATED', type: 'DOCUMENT', name: 'Doc', visible: true,
    },
    {
      ...blank, guid: pageGuid, parentIndex: { guid: docGuid, position: '0' },
      phase: 'CREATED', type: 'CANVAS', name: 'Page 1', visible: true,
    },
    {
      ...blank, guid: frameGuid, parentIndex: { guid: pageGuid, position: '0' },
      phase: 'CREATED', type: 'FRAME', name: 'Home', visible: true,
      size: { x: 375, y: 812 },
      fillPaints: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 } }],
    },
    {
      ...blank, guid: textGuid, parentIndex: { guid: frameGuid, position: '0' },
      phase: 'CREATED', type: 'TEXT', name: 'title', visible: true,
      size: { x: 200, y: 24 },
      fontSize: 17, fontName: { family: 'Inter', style: 'Bold' },
      textData: { characters: 'Hello fig2web' },
      fillPaints: [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1, a: 1 } }],
    },
  ];
    const msg = { nodeChanges };
  const encodedMsg = compiled.encodeMessage(msg);
  const schemaBytes = kiwi.encodeBinarySchema(schemaDef);

  // canvas.fig layout: magic(8) + u32 LE version + [u32 len][raw-deflate payload] chunks
  const deflatedSchema = deflate.deflateRawSync(Buffer.from(schemaBytes));
  const deflatedMsg = deflate.deflateRawSync(Buffer.from(encodedMsg));

  const parts = [];
  const head = Buffer.alloc(12);
  head.write('fig-kiwi', 0, 'latin1');
  head.writeUInt32LE(106, 8);
  parts.push(head);
  for (const payload of [deflatedSchema, deflatedMsg]) {
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32LE(payload.length, 0);
    parts.push(lenBuf, payload);
  }
  const canvas = Buffer.concat(parts);

  // meta.json — ISO-8601 timestamps, as observed in real exports
  const meta = Buffer.from(JSON.stringify({
    schemaVersion: 106,
    exportedAt: '2026-11-07T00:00:00Z',
    APP: 'desktop',
  }), 'utf8');

  const zip = new AdmZip();
  zip.addFile('canvas.fig', canvas);
  zip.addFile('meta.json', meta);
  zip.addFile('images/cafebadge', Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4])); // fake png
  return zip.toBuffer();
}
