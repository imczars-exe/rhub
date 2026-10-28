'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const oled = require('../spotify-oled');

test('toAscii: acentos, comillas tipográficas y símbolos raros', () => {
  assert.equal(oled.toAscii('Canción de amor'), 'Cancion de amor');
  assert.equal(oled.toAscii('Ñandú — “Best” of ‘90s’'), 'Nandu - "Best" of \'90s\'');
  assert.equal(oled.toAscii('Beyoncé feat. Jay-Z'), 'Beyonce feat. Jay-Z');
  assert.equal(oled.toAscii('a|b\nc\td'), 'a b c d');           // '|' y saltos no rompen el protocolo
  assert.equal(oled.toAscii('日本語の歌'), '?');                    // no representable -> un solo '?'
  assert.equal(oled.toAscii(null), '');
});

test('toAscii: recorta a 44 con "..."', () => {
  const s = oled.toAscii('x'.repeat(100));
  assert.equal(s.length, 44);
  assert.ok(s.endsWith('...'));
  assert.equal(oled.toAscii('corto'), 'corto');
});

test('buildStateLine: estados y flags', () => {
  const base = { status: 'connected', active: true, title: 'T', isPlaying: true, progressMs: 61234.4, durationMs: 200000, shuffle: false, repeat: 'off', liked: false };
  assert.equal(oled.buildStateLine(base), 'SPT:1,61234,200000,0\n');
  assert.equal(oled.buildStateLine({ ...base, isPlaying: false, shuffle: true, repeat: 'track', liked: true }), 'SPT:0,61234,200000,13\n'); // 1+4+8
  assert.equal(oled.buildStateLine({ ...base, repeat: 'context' }), 'SPT:1,61234,200000,2\n');
  assert.equal(oled.buildStateLine({ ...base, active: false }), 'SPT:2,0,0,0\n');
  assert.equal(oled.buildStateLine({ ...base, status: 'reauth' }), 'SPT:3,0,0,0\n');
  assert.equal(oled.buildStateLine({ ...base, status: 'no-client' }), 'SPT:3,0,0,0\n');
});

test('buildTextLines: ASCII y vacío cuando no hay nada', () => {
  const snap = { status: 'connected', active: true, title: 'Canción', artist: 'Ñu', isPlaying: true };
  assert.deepEqual(oled.buildTextLines(snap), ['SPTT:Cancion\n', 'SPTA:Nu\n']);
  assert.deepEqual(oled.buildTextLines({ status: 'disconnected' }), ['SPTT:\n', 'SPTA:\n']);
});

// BGRA de un solo color (lo que entrega nativeImage.toBitmap())
function solid(r, g, b, w = 64, h = 64) {
  const buf = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { buf[i * 4] = b; buf[i * 4 + 1] = g; buf[i * 4 + 2] = r; buf[i * 4 + 3] = 255; }
  return buf;
}

test('rgb565: blanco, negro y primarios', () => {
  assert.equal(oled.rgb565(255, 255, 255), 0xffff);
  assert.equal(oled.rgb565(0, 0, 0), 0x0000);
  assert.equal(oled.rgb565(255, 0, 0), 0xf800);
  assert.equal(oled.rgb565(0, 255, 0), 0x07e0);
  assert.equal(oled.rgb565(0, 0, 255), 0x001f);
});

test('bgraToArt: SPTK + 64 filas SPTR de 64 píxeles RGB565', () => {
  const { lines, color } = oled.bgraToArt(solid(255, 0, 0));
  assert.equal(lines.length, 1 + 64);
  assert.match(lines[0], /^SPTK:[0-9a-f]{4}\n$/);
  lines.slice(1).forEach((l, y) => {
    assert.match(l, new RegExp(`^SPTR:${y},[0-9a-f]{256}\\n$`));
    assert.ok(l.length < 320, 'cabe en el buffer de línea del firmware (320)');
  });
  assert.equal(lines[1].slice(lines[1].indexOf(',') + 1, -1), 'f800'.repeat(64)); // BGRA -> RGB bien ordenado
  assert.match(color, /^#[0-9a-f]{6}$/);
});

test('accent565: aclara colores oscuros para que se vean sobre negro', () => {
  assert.equal(oled.accent565('#ff0000'), 0xf800);
  const dark = oled.accent565('#200000');          // rojo muy oscuro -> rojo visible
  assert.ok((dark >> 11) >= 20, `rojo aclarado (fue ${dark.toString(16)})`);
  assert.equal(oled.accent565('#000000'), oled.rgb565(170, 170, 170)); // negro -> gris claro
});

test('averageColor: ignora casi-negro/casi-blanco', () => {
  const b = Buffer.alloc(4 * 4 * 4);
  for (let i = 0; i < 16; i++) { // BGRA: rojo puro (R=200) en la mitad, negro en la otra
    const red = i < 8;
    b[i * 4] = 20; b[i * 4 + 1] = 20; b[i * 4 + 2] = red ? 200 : 0; b[i * 4 + 3] = 255;
  }
  assert.equal(oled.averageColor(b, 4, 4), '#c81414');
});
