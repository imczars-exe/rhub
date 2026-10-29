const test = require('node:test');
const assert = require('node:assert');
const I = require('../i18n');
const D = require('../display');
const SA = require('../spotify-actions');

test('tr: texto exacto, con espacios alrededor y con regla', () => {
  assert.strictEqual(I.tr('Conectar'), 'Connect');
  assert.strictEqual(I.tr('  Guardar \n'), '  Save \n');
  assert.strictEqual(I.tr('Botón 7'), 'Button 7');
  assert.strictEqual(I.tr('Widget de Izquierda'), 'Widget for Left');
  assert.strictEqual(I.tr('Texto que nadie tradujo'), null);
});

test('las etiquetas de estilos, distribuciones y widgets de display.js tienen traducción', () => {
  const labels = [...D.STYLES, ...D.LAYOUTS, ...D.WIDGETS].map((x) => x.label);
  const missing = labels.filter((l) => I.tr(l) === null && !/^(CPU|RAM|GPU|Spotify|Terminal|Minimal|Color|Video)$/.test(l));
  assert.deepStrictEqual(missing, []);
});

test('las acciones de Spotify tienen su texto en inglés', () => {
  const acts = SA; assert.strictEqual(acts.length, 10);
  const missing = acts.flatMap((a) => [a.label, a.desc]).filter((l) => l && I.tr(l) === null);
  assert.deepStrictEqual(missing, []);
});
