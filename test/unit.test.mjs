// unit.test.mjs — pure-function tests for fig2web helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  r2, esc, rgba, toHexColor, gid, slugify, weightOf, isZstd, radiusOf, paintToCss, imageExt,
} from '../src/lib/util.js';

test('r2 rounds to 2 decimals', () => {
  assert.equal(r2(1.005), 1.0);
  assert.equal(r2(3.14159), 3.14);
});

test('esc escapes HTML-sensitive chars', () => {
  assert.equal(esc('<a & "b">'), '&lt;a &amp; &quot;b&quot;&gt;');
});

test('rgba formats css color', () => {
  assert.equal(rgba({ r: 1, g: 0, b: 0.5, a: 1 }), 'rgba(255,0,128,1)');
  assert.equal(rgba({ r: 0, g: 0, b: 0, a: 0.5 }), 'rgba(0,0,0,0.5)');
});

test('toHexColor adds alpha only when < 1', () => {
  assert.equal(toHexColor({ r: 1, g: 1, b: 1, a: 1 }), '#ffffff');
  assert.equal(toHexColor({ r: 1, g: 0, b: 0, a: 0.5 }), '#ff000080');
});

test('gid formats session:local', () => {
  assert.equal(gid({ sessionID: 1, localID: 2 }), '1:2');
  assert.equal(gid(undefined), '');
});

test('slugify transliterates and truncates', () => {
  assert.equal(slugify('Home Page'), 'home-page');
  assert.equal(slugify('Écran! àé'), 'ecran-ae');
  assert.equal(slugify('///'), 'screen');
});

test('weightOf maps font styles', () => {
  assert.equal(weightOf('Bold'), 700);
  assert.equal(weightOf('Semi Bold'), 600);
  assert.equal(weightOf('Black Italic'), 900);
  assert.equal(weightOf('Regular'), 400);
});

test('isZstd detects zstd magic', () => {
  assert.ok(isZstd([0x28, 0xb5, 0x2f, 0xfd]));
  assert.ok(!isZstd([0, 0, 0, 0]));
});

test('radiusOf uniform and per-corner', () => {
  assert.equal(radiusOf({ cornerRadius: 8 }), 8);
  assert.equal(
    radiusOf({ rectangleTopLeftCornerRadius: 4 }),
    '4px 0px 0px 0px',
  );
});

test('paintToCss solid + gradient angle', () => {
  assert.equal(
    paintToCss({ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 } }),
    'rgba(0,0,0,1)',
  );
  const lin = paintToCss({
    type: 'GRADIENT_LINEAR',
    transform: { m00: 1, m01: 0, m10: 0, m11: 1 },
    stops: [{ color: { r: 0, g: 0, b: 0, a: 1 }, position: 0 }],
  });
  assert.match(lin, /linear-gradient\(90deg/);
});

test('imageExt sniffs magics', () => {
  assert.equal(imageExt(Buffer.from([0x89, 0x50, 1])), 'png');
  assert.equal(imageExt(Buffer.from([0xff, 0xd8, 1])), 'jpg');
  assert.equal(imageExt(Buffer.from('RIFF1234')), 'webp');
  assert.equal(imageExt(Buffer.from([9, 9, 9, 9])), 'bin');
});
