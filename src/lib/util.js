// util.js — shared pure helpers (no I/O, no state) used by renderer + inspector.
export const r2 = v => Math.round(v * 100) / 100;

export const esc = s => String(s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const rgba = c => `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${c.a ?? 1})`;

export const hex2 = v => v.toString(16).padStart(2, '0');
export const bytesToHex = b => [...b].map(hex2).join('');

export function toHexColor(c) {
  return '#' + [c.r, c.g, c.b].map(v => hex2(Math.round(v * 255))).join('') +
    (c.a !== undefined && c.a < 1 ? hex2(Math.round(c.a * 255)) : '');
}

export const gid = g => (g ? `${g.sessionID}:${g.localID}` : '');

export function slugify(s) {
  return s.toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'screen';
}

export function weightOf(style = '') {
  const s = String(style).toLowerCase();
  const table = [['thin', 100], ['extralight', 200], ['extra light', 200], ['light', 300],
    ['semibold', 600], ['semi bold', 600], ['medium', 500],
    ['extrabold', 800], ['extra bold', 800], ['bold', 700], ['black', 900]];
  for (const [k, weight] of table) if (s.includes(k)) return weight;
  return 400;
}

export const isZstd = raw =>
  raw[0] === 0x28 && raw[1] === 0xb5 && raw[2] === 0x2f && raw[3] === 0xfd;

export function rotationOf(transform) {
  if (!transform) return 0;
  return Math.round(Math.atan2(transform.m10, transform.m00) * 180 / Math.PI * 100) / 100;
}

export function radiusOf(n) {
  if (n.cornerRadius !== undefined && n.cornerRadius !== null) return n.cornerRadius;
  const tl = n.rectangleTopLeftCornerRadius, tr = n.rectangleTopRightCornerRadius,
    br = n.rectangleBottomRightCornerRadius, bl = n.rectangleBottomLeftCornerRadius;
  if ([tl, tr, br, bl].some(v => v !== undefined))
    return `${tl ?? 0}px ${tr ?? 0}px ${br ?? 0}px ${bl ?? 0}px`;
  return 0;
}

export function paintToCss(p) {
  if (!p || p.visible === false) return null;
  if (p.type === 'SOLID' && p.color) return rgba(p.color);
  if (p.type?.startsWith('GRADIENT')) {
    const stops = (p.stops || [])
      .map(s => `${rgba(s.color)} ${Math.round(s.position * 100)}%`).join(', ');
    let angle = 180;
    const t = p.transform;
    if (t) {
      const det = t.m00 * t.m11 - t.m01 * t.m10;
      if (Math.abs(det) > 1e-9) {
        const dx = t.m11 / det, dy = -t.m01 / det;
        angle = Math.round(Math.atan2(dx, -dy) * 180 / Math.PI);
      }
    }
    if (p.type === 'GRADIENT_RADIAL') return `radial-gradient(circle, ${stops})`;
    if (p.type === 'GRADIENT_ANGULAR') return `conic-gradient(${stops})`;
    return `linear-gradient(${angle}deg, ${stops})`;
  }
  return null;
}

export function imageExt(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF') return 'webp';
  return 'bin';
}
