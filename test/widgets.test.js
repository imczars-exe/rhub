const test = require('node:test');
const assert = require('node:assert');
const W = require('../widgets');
const D = require('../display');

test('formatMbps: megabits por segundo con un decimal', () => {
  assert.strictEqual(W.formatMbps(0), '0.0');
  assert.strictEqual(W.formatMbps(300), '0.0');
  assert.strictEqual(W.formatMbps(1_250_000), '10.0');   // 1.25 MB/s = 10 Mbps
});

test('el temporizador ya no existe como widget y uno guardado queda vacío', () => {
  assert.ok(!D.WIDGETS.some((w) => w.id === 'timer'));
  assert.strictEqual(D.normalize({ screens: [{ layout: 'full', slots: [{ type: 'timer' }] }] }).screens[0].slots[0].type, 'none');
});

test('InfoWidgets: clima, disco y red salen como etiqueta|valor en ASCII', async () => {
  const fetchStub = async (url) => ({ json: async () => url.includes('geocoding')
    ? { results: [{ latitude: 18.5, longitude: -69.9, name: 'Santo Domingo' }] }
    : { current: { temperature_2m: 29.4, weather_code: 3 } } });
  const si = { fsSize: async () => [{ mount: 'C:', use: 62.4, size: 500 * 1024 ** 3, used: 310 * 1024 ** 3 }],
    networkStats: async () => [{ rx_sec: 2 * 1024 ** 2, tx_sec: 300 }] };
  const iw = new W.InfoWidgets({ si, fetch: fetchStub });
  const display = D.normalize({ screens: [{ layout: 'thirds', slots: [{ type: 'weather', city: 'Santo Domingo' }, { type: 'disk' }, { type: 'net' }] }] });
  iw.tick(display);
  await new Promise((r) => setTimeout(r, 20));
  const v = iw.tick(display);
  assert.deepStrictEqual(v['weather:santo domingo'], { label: 'Santo Domingo, Nublado', value: '29C' });
  assert.deepStrictEqual(v['disk:'], { label: 'C: 190G libres', value: '62%' });
  assert.deepStrictEqual(v.net, { label: 'Red Mbps', value: '{ 16.8~} 0.0' });
  iw.setLang('en');
  assert.match(iw.tick(display)['disk:'].label, /free$/);
});

test('Disco: elige la unidad pedida, la del sistema por defecto y avisa si no existe', async () => {
  const GB = 1024 ** 3;
  const si = { fsSize: async () => [
    { mount: 'C:', use: 62.4, size: 500 * GB, used: 310 * GB },
    { mount: 'D:', use: 10, size: 1000 * GB, used: 100 * GB },
    { mount: 'E:', use: 0, size: 0, used: 0 } ] };
  const iw = new W.InfoWidgets({ si });
  assert.deepStrictEqual((await iw.listDrives()).map((x) => x.mount), ['C:', 'D:']);   // sin las de tamaño 0
  const display = D.normalize({ screens: [{ layout: 'thirds', slots: [{ type: 'disk' }, { type: 'disk', drive: 'd:' }, { type: 'disk', drive: 'Z:' }] }] });
  iw.tick(display); await new Promise((r) => setTimeout(r, 20));
  const v = iw.tick(display);
  assert.deepStrictEqual(v['disk:'], { label: 'C: 190G libres', value: '62%' });
  assert.deepStrictEqual(v['disk:d:'], { label: 'D: 900G libres', value: '10%' });
  assert.deepStrictEqual(v['disk:z:'], { label: 'Z: --', value: '--' });
});

test('InfoWidgets: sin ciudad o sin internet no revienta', async () => {
  const iw = new W.InfoWidgets({ si: {}, fetch: async () => { throw new Error('offline'); } });
  const display = D.normalize({ screens: [{ layout: 'split', slots: [{ type: 'weather' }, { type: 'weather', city: 'X' }] }] });
  iw.tick(display); await new Promise((r) => setTimeout(r, 20));
  const v = iw.tick(display);
  assert.strictEqual(v['weather:'].label, 'Clima');
  assert.deepStrictEqual(v['weather:x'], { label: 'Sin conexion', value: '--' });
});

test('infoLine cabe en 40 caracteres y conserva el valor', () => {
  const l = W.infoLine({ label: 'Una etiqueta muy larga que no cabe en la pantalla del RHub', value: '29C' });
  assert.ok(l.length <= 40); assert.ok(l.endsWith('|29C'));
  assert.strictEqual(W.infoLine({ label: 'Niebla | x', value: 'Ñandú' }), 'Niebla / x|Nandu');
  assert.strictEqual(W.infoLine({ label: 'Red Mbps', value: '{ 9.6~} 2.4' }), 'Red Mbps|{ 9.6~} 2.4');
});
