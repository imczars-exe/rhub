const test = require('node:test');
const assert = require('node:assert');
const D = require('../display');

test('normalize: sin config devuelve las 3 pantallas de siempre', () => {
  const d = D.normalize(undefined);
  assert.deepStrictEqual(d.screens.map((s) => s.slots[0].type), ['clock', 'system', 'spotify']);
  assert.strictEqual(d.style, 'actual');
});

test('normalize: el video solo vale en una pantalla de 1 hueco', () => {
  const d = D.normalize({ screens: [{ layout: 'split', slots: [{ type: 'video', video: 'a.mp4' }, { type: 'clock' }] }] });
  assert.deepStrictEqual(d.screens[0].slots, [{ type: 'none' }, { type: 'clock' }]);
});

test('normalize: recorta pantallas, huecos y colores inválidos', () => {
  const many = Array.from({ length: 12 }, () => ({ layout: 'thirds', slots: [] }));
  const d = D.normalize({ style: 'terminal', colors: { accent: 'rojo' }, screens: many });
  assert.strictEqual(d.screens.length, D.MAX_SCREENS);
  assert.strictEqual(d.screens[0].slots.length, 3);
  assert.strictEqual(d.colors.accent, '#3ddc6e'); // el del estilo, porque "rojo" no es un color
});

test('los huecos de cada distribución cubren la pantalla sin pasarse', () => {
  for (const l of D.LAYOUTS) {
    const area = l.rects.reduce((a, [, , w, h]) => a + w * h, 0);
    assert.strictEqual(area, D.W * D.H, l.id);
    for (const [x, y, w, h] of l.rects) assert.ok(x + w <= D.W && y + h <= D.H, l.id);
  }
});

test('configLines: estilo, pantallas y texto sin tildes', () => {
  const lines = D.configLines({
    style: 'color', colors: { accent: '#ff0000', bg: '#000000', text: '#ffffff' },
    screens: [{ layout: 'split', slots: [{ type: 'text', text: 'Canción, ñ' }, { type: 'cpu' }] }],
  });
  assert.deepStrictEqual(lines, ['STY:3,f800,0000,ffff\n', 'SCN:1\n', 'SCD:0,1,8,3,0\n', 'SCT:0,0,Cancion, n\n']);
});

test('rgbaTo565: blanco, rojo puro y little-endian', () => {
  const out = D.rgbaTo565(new Uint8Array([255, 255, 255, 255, 255, 0, 0, 255]));
  assert.deepStrictEqual([...out], [0xff, 0xff, 0x00, 0xf8]);
});
