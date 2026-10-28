'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { SpotifyClient, normalizePlayback, friendlyError, SpotifyError, REDIRECT_URI, REDIRECT_PORT } = require('../spotify');
const ACTIONS = require('../spotify-actions');

/* ---------------------------- utilidades de prueba ---------------------------- */
const CLIENT_ID = 'a'.repeat(32);

function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'retrohub-sp-')); }

function res(status, body, headers = {}) {
  const text = body === undefined || body === null ? '' : (typeof body === 'string' ? body : JSON.stringify(body));
  return { status, ok: status >= 200 && status < 300, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, text: async () => text };
}

// fetch falso: `routes` es una función (method, url) => respuesta | undefined
function makeFetch(routes) {
  const calls = [];
  const f = async (url, opts = {}) => {
    const u = new URL(url);
    const call = { method: opts.method || 'GET', url: u, path: u.pathname.replace(/^\/v1/, ''), query: Object.fromEntries(u.searchParams), headers: opts.headers || {}, body: opts.body };
    calls.push(call);
    const r = routes(call);
    if (!r) throw new Error(`ruta no mockeada: ${call.method} ${u}`);
    return r;
  };
  f.calls = calls;
  return f;
}

const TOKEN_OK = (extra = {}) => res(200, { access_token: 'AT-' + Math.random().toString(36).slice(2), expires_in: 3600, ...extra });

function playbackJson(over = {}) {
  return {
    is_playing: true, progress_ms: 30000, shuffle_state: false, repeat_state: 'off',
    currently_playing_type: 'track',
    device: { id: 'dev1', name: 'DESKTOP', type: 'Computer', volume_percent: 50, supports_volume: true, is_active: true },
    item: {
      id: 'T1', uri: 'spotify:track:T1', type: 'track', name: 'Canción', duration_ms: 200000,
      artists: [{ name: 'Ana' }, { name: 'Beto' }],
      album: { name: 'Disco', images: [{ url: 'big', width: 640 }, { url: 'mid', width: 300 }, { url: 'small', width: 64 }] },
    },
    ...over,
  };
}

// Cliente ya "conectado" (sin pasar por el navegador) y sin polling.
function connectedClient(routes, opts = {}) {
  const fetchImpl = makeFetch((c) => {
    if (c.url.host === 'accounts.spotify.com') return TOKEN_OK();
    return routes(c);
  });
  const client = new SpotifyClient({ userDataPath: tmpDir(), fetchImpl, ...opts });
  client.cfg.clientId = CLIENT_ID;
  client._refreshToken = 'RT';
  return { client, fetchImpl };
}

/* ------------------------------- normalización ------------------------------- */
test('normalizePlayback: canción normal', () => {
  const s = normalizePlayback(playbackJson(), 1000);
  assert.equal(s.title, 'Canción'); assert.equal(s.artist, 'Ana, Beto'); assert.equal(s.album, 'Disco');
  assert.equal(s.artUrl, 'mid');                 // la más chica que sea >= 200 px
  assert.equal(s.durationMs, 200000); assert.equal(s.progressMs, 30000); assert.equal(s.volume, 50);
  assert.equal(s.isPlaying, true); assert.equal(s.kind, 'track'); assert.equal(s.trackId, 'T1');
});
test('normalizePlayback: episodio, anuncio y sin sesión', () => {
  const ep = normalizePlayback({ is_playing: true, currently_playing_type: 'episode', device: {}, item: { type: 'episode', id: 'E', uri: 'spotify:episode:E', name: 'Cap 1', duration_ms: 1000, show: { name: 'Mi Podcast' }, images: [{ url: 'img', width: 300 }] } }, 0);
  assert.equal(ep.kind, 'episode'); assert.equal(ep.artist, 'Mi Podcast'); assert.equal(ep.artUrl, 'img');
  const ad = normalizePlayback({ is_playing: true, currently_playing_type: 'ad', device: {}, item: null }, 0);
  assert.equal(ad.kind, 'ad'); assert.equal(ad.title, 'Anuncio');
  const idle = normalizePlayback(null, 5);
  assert.equal(idle.active, false); assert.equal(idle.title, '');
});

/* --------------------------------- tokens --------------------------------- */
test('token: single-flight — 5 peticiones en paralelo, 1 solo refresh', async () => {
  let tokenCalls = 0;
  const fetchImpl = makeFetch((c) => {
    if (c.url.host === 'accounts.spotify.com') { tokenCalls++; return TOKEN_OK(); }
    return res(200, playbackJson());
  });
  const client = new SpotifyClient({ userDataPath: tmpDir(), fetchImpl });
  client.cfg.clientId = CLIENT_ID; client._refreshToken = 'RT';
  await Promise.all([1, 2, 3, 4, 5].map(() => client._request('GET', '/me/player')));
  assert.equal(tokenCalls, 1);
  await client._request('GET', '/me/player');       // token aún vigente -> no refresca de nuevo
  assert.equal(tokenCalls, 1);
});

test('token: 401 -> refresca y reintenta una vez', async () => {
  let n = 0;
  const { client, fetchImpl } = connectedClient((c) => (++n === 1 ? res(401, { error: { status: 401, message: 'expired' } }) : res(200, playbackJson())));
  const r = await client._request('GET', '/me/player');
  assert.equal(r.item.id, 'T1');
  assert.equal(fetchImpl.calls.filter((c) => c.url.host === 'accounts.spotify.com').length, 2);
});

test('token: refresh_token nuevo se guarda; si no viene, se conserva el actual', async () => {
  const dir = tmpDir();
  let rt = 'RT';
  const fetchImpl = makeFetch((c) => {
    if (c.url.host === 'accounts.spotify.com') { const b = new URLSearchParams(String(c.body)); assert.equal(b.get('refresh_token'), rt); return TOKEN_OK({ refresh_token: 'RT2' }); }
    return res(200, playbackJson());
  });
  const client = new SpotifyClient({ userDataPath: dir, fetchImpl });
  client.cfg.clientId = CLIENT_ID; client._refreshToken = rt;
  await client._request('GET', '/me/player');
  assert.equal(client._refreshToken, 'RT2');
});

test('token: invalid_grant (venció el refresh token de 6 meses) -> estado "reauth"', async () => {
  const fetchImpl = makeFetch((c) => (c.url.host === 'accounts.spotify.com' ? res(400, { error: 'invalid_grant', error_description: 'Refresh token revoked' }) : res(200, {})));
  const client = new SpotifyClient({ userDataPath: tmpDir(), fetchImpl });
  client.cfg.clientId = CLIENT_ID; client._refreshToken = 'RT';
  const statuses = []; client.on('status', (s) => statuses.push(s.state));
  await assert.rejects(() => client._request('GET', '/me/player'), (e) => e.code === 'REAUTH');
  assert.equal(client.getStatus().state, 'reauth');
  assert.ok(statuses.includes('reauth'));
  const r = await client.runAction('next');
  assert.equal(r.ok, false); assert.match(r.error, /venció/);
});

/* ------------------------------- rate limiting ------------------------------- */
test('429: respeta Retry-After y no vuelve a llamar hasta que pase', async () => {
  let now = 1_000_000;
  const { client, fetchImpl } = connectedClient((c) => res(429, { error: { status: 429, message: 'Too many requests' } }, { 'retry-after': '7' }), { now: () => now });
  await assert.rejects(() => client._request('GET', '/me/player'), (e) => e.code === 'RATE_LIMITED' && e.retryAfter === 7);
  const before = fetchImpl.calls.length;
  await assert.rejects(() => client._request('GET', '/me/player'), (e) => e.code === 'RATE_LIMITED');
  assert.equal(fetchImpl.calls.length, before, 'no debe llamar a la red mientras esté bloqueado');
  assert.equal(client._blockedUntil, 1_000_000 + 7000);
  now += 8000;
  assert.ok(client._blockedUntil < now);
});

test('429 QUOTA_EXCEEDED: espera al menos 60 s', async () => {
  const { client } = connectedClient(() => res(429, { error: { status: 429, message: 'Too many requests', reason: 'QUOTA_EXCEEDED' } }, { 'retry-after': '3' }));
  await assert.rejects(() => client._request('GET', '/me/player'), (e) => e.code === 'QUOTA' && e.retryAfter === 60);
  assert.match(friendlyError(new SpotifyError('', { code: 'QUOTA', retryAfter: 60 })), /cuota/);
});

/* ----------------------------------- acciones ----------------------------------- */
function routerWith(state, extra = () => undefined) {
  const log = [];
  return {
    log,
    routes: (c) => {
      log.push(`${c.method} ${c.path}${Object.keys(c.query).length ? '?' + new URLSearchParams(c.query) : ''}`);
      const x = extra(c); if (x) return x;
      if (c.method === 'GET' && c.path === '/me/player') return state.json === null ? res(204) : res(200, state.json);
      if (c.method === 'PUT' || c.method === 'POST') return res(204);
      if (c.method === 'DELETE') return res(200, {});
      return undefined;
    },
  };
}

test('acciones: todas las de spotify-actions.js tienen handler (y viceversa)', () => {
  const client = new SpotifyClient({ userDataPath: tmpDir() });
  assert.deepEqual(Object.keys(client._handlers).sort(), ACTIONS.map((a) => a.id).sort());
});

test('play_pause: sonando -> pausa; pausado -> play', async () => {
  const st = { json: playbackJson({ is_playing: true }) };
  const { routes, log } = routerWith(st);
  const { client } = connectedClient(routes);
  let r = await client.runAction('play_pause');
  assert.equal(r.ok, true);
  assert.ok(log.includes('PUT /me/player/pause'));
  assert.equal(client.getSnapshot().isPlaying, false);       // optimista

  st.json = playbackJson({ is_playing: false });
  client._pb.fetchedAt = 0;                                   // fuerza releer el estado
  r = await client.runAction('play_pause');
  assert.ok(log.includes('PUT /me/player/play'));
  assert.equal(client.getSnapshot().isPlaying, true);
  client.stopPolling();
});

test('play_pause: sin dispositivo activo -> transfiere a la PC y reproduce', async () => {
  const st = { json: null };
  const { routes, log } = routerWith(st, (c) => {
    if (c.path === '/me/player/play') return res(404, { error: { status: 404, message: 'Player command failed: No active device found', reason: 'NO_ACTIVE_DEVICE' } });
    if (c.path === '/me/player/devices') return res(200, { devices: [{ id: 'phone', type: 'Smartphone', is_active: false }, { id: 'pc', type: 'Computer', is_active: false }] });
  });
  const { client, fetchImpl } = connectedClient(routes);
  const r = await client.runAction('play_pause');
  assert.equal(r.ok, true);
  const transfer = fetchImpl.calls.find((c) => c.method === 'PUT' && c.path === '/me/player');
  assert.deepEqual(JSON.parse(transfer.body), { device_ids: ['pc'], play: true });
  client.stopPolling();
});

test('play_pause: 403 "Restriction violated" no es error (ya estaba en ese estado)', async () => {
  const st = { json: playbackJson({ is_playing: true }) };
  const { routes } = routerWith(st, (c) => (c.path === '/me/player/pause' ? res(403, { error: { status: 403, message: 'Player command failed: Restriction violated', reason: 'UNKNOWN' } }) : undefined));
  const { client } = connectedClient(routes);
  const r = await client.runAction('play_pause');
  assert.equal(r.ok, true);
  client.stopPolling();
});

test('play_pause: sin Premium -> mensaje claro', async () => {
  const st = { json: playbackJson({ is_playing: false }) };
  const { routes } = routerWith(st, (c) => (c.path === '/me/player/play' ? res(403, { error: { status: 403, message: 'Player command failed: Premium required', reason: 'PREMIUM_REQUIRED' } }) : undefined));
  const { client } = connectedClient(routes);
  const r = await client.runAction('play_pause');
  assert.equal(r.ok, false); assert.equal(r.code, 'PREMIUM'); assert.match(r.error, /Premium/);
  client.stopPolling();
});

test('next / prev usan POST', async () => {
  const { routes, log } = routerWith({ json: playbackJson() });
  const { client } = connectedClient(routes);
  await client.runAction('next'); await client.runAction('prev');
  assert.ok(log.includes('POST /me/player/next')); assert.ok(log.includes('POST /me/player/previous'));
  client.stopPolling();
});

test('like: guarda si no está, quita si ya está (endpoints /me/library con URIs)', async () => {
  let liked = false;
  const { routes, log } = routerWith({ json: playbackJson() }, (c) => {
    if (c.path === '/me/library/contains') return res(200, [liked]);
    if (c.path === '/me/library' && c.method === 'PUT') { liked = true; return res(200); }
    if (c.path === '/me/library' && c.method === 'DELETE') { liked = false; return res(200); }
  });
  const { client, fetchImpl } = connectedClient(routes);
  let r = await client.runAction('like');
  assert.equal(r.message, 'Guardada en Me gusta'); assert.equal(client.getSnapshot().liked, true);
  const put = fetchImpl.calls.find((c) => c.method === 'PUT' && c.path === '/me/library');
  assert.equal(put.query.uris, 'spotify:track:T1');
  r = await client.runAction('like');
  assert.equal(r.message, 'Quitada de Me gusta'); assert.equal(client.getSnapshot().liked, false);
  assert.ok(log.some((l) => l.startsWith('DELETE /me/library?uris=spotify')));
  client.stopPolling();
});

test('like: sin nada sonando -> error claro', async () => {
  const { routes } = routerWith({ json: null });
  const { client } = connectedClient(routes);
  const r = await client.runAction('like');
  assert.equal(r.ok, false); assert.equal(r.code, 'NO_TRACK');
  client.stopPolling();
});

test('shuffle y repeat: alternan / ciclan', async () => {
  const st = { json: playbackJson({ shuffle_state: false, repeat_state: 'off' }) };
  const { routes, log } = routerWith(st);
  const { client } = connectedClient(routes);
  let r = await client.runAction('shuffle');
  assert.equal(r.message, 'Aleatorio activado'); assert.ok(log.includes('PUT /me/player/shuffle?state=true'));
  r = await client.runAction('shuffle');
  assert.equal(r.message, 'Aleatorio desactivado'); assert.ok(log.includes('PUT /me/player/shuffle?state=false'));
  const seq = [];
  for (let i = 0; i < 4; i++) { seq.push((await client.runAction('repeat')).message); }
  assert.deepEqual(seq, ['Repetir: lista', 'Repetir: canción', 'Repetir: desactivado', 'Repetir: lista']);
  client.stopPolling();
});

test('volumen: ±10, con límites 0-100, y dispositivos sin control de volumen', async () => {
  const st = { json: playbackJson() };
  const { routes, log } = routerWith(st);
  const { client } = connectedClient(routes);
  await client.runAction('vol_up'); await client.runAction('vol_up');           // 50 -> 60 -> 70 (optimista, sin releer)
  assert.ok(log.includes('PUT /me/player/volume?volume_percent=60'));
  assert.ok(log.includes('PUT /me/player/volume?volume_percent=70'));
  for (let i = 0; i < 12; i++) await client.runAction('vol_up');
  assert.equal(client.getSnapshot().volume, 100);
  for (let i = 0; i < 12; i++) await client.runAction('vol_down');
  assert.equal(client.getSnapshot().volume, 0);
  client.stopPolling();

  const st2 = { json: playbackJson({ device: { name: 'iPhone', type: 'Smartphone', volume_percent: 40, supports_volume: false, is_active: true } }) };
  const c2 = connectedClient(routerWith(st2).routes).client;
  const r = await c2.runAction('vol_up');
  assert.equal(r.ok, false); assert.equal(r.code, 'NO_VOLUME');
  c2.stopPolling();
});

test('seek ±10 s: se interpola desde el progreso actual y respeta los bordes', async () => {
  let now = 5_000_000;
  const st = { json: playbackJson({ progress_ms: 30000 }) };
  const { routes, log } = routerWith(st);
  const { client } = connectedClient(routes, { now: () => now });
  now += 5000;                                        // pasaron 5 s desde el fetch -> ~35 s
  await client.runAction('seek_fwd');                  // el estado tiene 0 s de edad? -> se relee (30 s) primero
  const call = log.filter((l) => l.startsWith('PUT /me/player/seek')).pop();
  const pos = Number(new URLSearchParams(call.split('?')[1]).get('position_ms'));
  assert.ok(pos >= 40000 && pos <= 46000, `posición razonable (fue ${pos})`);
  // borde inferior
  st.json = playbackJson({ progress_ms: 3000 });
  client._pb.fetchedAt = 0;
  await client.runAction('seek_back');
  const call2 = log.filter((l) => l.startsWith('PUT /me/player/seek')).pop();
  assert.equal(new URLSearchParams(call2.split('?')[1]).get('position_ms'), '0');
  client.stopPolling();
});

test('acciones sin conexión / sin Client ID / id desconocido', async () => {
  const client = new SpotifyClient({ userDataPath: tmpDir() });
  assert.match((await client.runAction('next')).error, /Client ID/);
  client.cfg.clientId = CLIENT_ID;
  assert.match((await client.runAction('next')).error, /no está conectado/);
  client._refreshToken = 'x';
  assert.match((await client.runAction('bailar')).error, /desconocida/);
});

/* ----------------------------------- estado ----------------------------------- */
test('getSnapshot: interpola el progreso mientras suena y no cuando está en pausa', async () => {
  let now = 10_000;
  const st = { json: playbackJson({ progress_ms: 30000 }) };
  const { client } = connectedClient(routerWith(st).routes, { now: () => now });
  await client.refreshState();
  now += 4000;
  assert.equal(client.getSnapshot().progressMs, 34000);
  st.json = playbackJson({ is_playing: false, progress_ms: 50000 });
  await client.refreshState(); now += 4000;
  assert.equal(client.getSnapshot().progressMs, 50000);
  client.stopPolling();
});

test('refreshState: emite "changed" correcto (track / playing / flags / progress)', async () => {
  let now = 10_000;
  const st = { json: playbackJson() };
  const { client } = connectedClient(routerWith(st).routes, { now: () => now });
  const events = []; client.on('state', (s, changed) => events.push(changed));
  await client.refreshState();
  assert.ok(events.at(-1).includes('track') && events.at(-1).includes('playing'));
  now += 3000; st.json = playbackJson({ progress_ms: 33000 });
  await client.refreshState();
  assert.deepEqual(events.at(-1), []);                           // nada cambió (progreso coincide con lo predicho)
  now += 3000; st.json = playbackJson({ progress_ms: 90000 });    // el usuario saltó en la app de Spotify
  await client.refreshState();
  assert.deepEqual(events.at(-1), ['progress']);
  st.json = playbackJson({ is_playing: false, shuffle_state: true, progress_ms: 90000 });
  await client.refreshState();
  assert.ok(events.at(-1).includes('playing') && events.at(-1).includes('flags'));
  client.stopPolling();
});

test('polling adaptativo: intervalo según vista/estado y bloqueo por 429', () => {
  let now = 1000;
  const client = new SpotifyClient({ userDataPath: tmpDir(), now: () => now });
  client._pb = { isPlaying: true };
  assert.equal(client._nextInterval(), 20000);                    // fuera de vista
  client._viewActive = true;
  assert.equal(client._nextInterval(), 3000);
  client._pb = { isPlaying: false };
  assert.equal(client._nextInterval(), 5000);
  client._blockedUntil = now + 60000;
  assert.equal(client._nextInterval(), 60250);                    // espera a que termine el bloqueo
});

/* --------------------------------- persistencia --------------------------------- */
test('config: el refresh token se guarda cifrado y se recupera', () => {
  const dir = tmpDir();
  const fakeSafe = { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from('ENC[' + s.split('').reverse().join('') + ']'), decryptString: (b) => b.toString().slice(4, -1).split('').reverse().join('') };
  const a = new SpotifyClient({ userDataPath: dir, safeStorage: fakeSafe });
  assert.equal(a.setClientId(CLIENT_ID).ok, true);
  a._refreshToken = 'SUPER-SECRETO'; a._persist();
  const raw = fs.readFileSync(path.join(dir, 'config-spotify.json'), 'utf-8');
  assert.ok(!raw.includes('SUPER-SECRETO'), 'no debe quedar en texto plano');
  assert.ok(raw.includes('"mode": "safe"'));
  const b = new SpotifyClient({ userDataPath: dir, safeStorage: fakeSafe });
  b.init(); b.stopPolling();
  assert.equal(b._refreshToken, 'SUPER-SECRETO');
  assert.equal(b.getStatus().state, 'connected');
});

test('setClientId: valida formato y cambiarlo cierra la sesión', () => {
  const client = new SpotifyClient({ userDataPath: tmpDir() });
  assert.equal(client.setClientId('corto').ok, false);
  client.setClientId(CLIENT_ID); client._refreshToken = 'x';
  client.setClientId('b'.repeat(32));
  assert.equal(client._refreshToken, null);
  assert.equal(client.getStatus().state, 'disconnected');
  assert.equal(client.setClientId('').ok, true);
  assert.equal(client.getStatus().state, 'no-client');
});

/* -------------------------------- login PKCE real -------------------------------- */
function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => resolve({ status: r.statusCode, body: d })); }).on('error', reject);
  });
}

test('login PKCE: URL de autorización, servidor loopback, intercambio de código y guardado', async () => {
  const dir = tmpDir();
  let openedUrl = null; let tokenBody = null;
  const fetchImpl = makeFetch((c) => {
    if (c.url.host === 'accounts.spotify.com') { tokenBody = new URLSearchParams(String(c.body)); return res(200, { access_token: 'AT', refresh_token: 'RT-nuevo', expires_in: 3600 }); }
    if (c.path === '/me') return res(200, { display_name: 'Meiker' });
    return res(204);
  });
  const fakeSafe = { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from(s).reverse(), decryptString: (b) => Buffer.from(b).reverse().toString() };
  const client = new SpotifyClient({ userDataPath: dir, safeStorage: fakeSafe, fetchImpl, openExternal: (u) => { openedUrl = u; } });
  client.setClientId(CLIENT_ID);

  const p = client.connect();
  for (let i = 0; i < 50 && !openedUrl; i++) await new Promise((r) => setTimeout(r, 20));
  assert.ok(openedUrl, 'debe abrir el navegador');
  const u = new URL(openedUrl);
  assert.equal(u.origin + u.pathname, 'https://accounts.spotify.com/authorize');
  assert.equal(u.searchParams.get('client_id'), CLIENT_ID);
  assert.equal(u.searchParams.get('redirect_uri'), REDIRECT_URI);
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.ok(u.searchParams.get('scope').includes('user-modify-playback-state'));
  assert.ok(u.searchParams.get('scope').includes('user-library-modify'));
  assert.equal(REDIRECT_URI, `http://127.0.0.1:${REDIRECT_PORT}/callback`);

  const page = await httpGet(`${REDIRECT_URI}?code=CODIGO123&state=${u.searchParams.get('state')}`);
  assert.equal(page.status, 200); assert.match(page.body, /Spotify conectado/);
  const result = await p;
  assert.deepEqual(result, { ok: true });

  // El verifier debe corresponder al challenge (esto es lo que valida Spotify)
  const verifier = tokenBody.get('code_verifier');
  assert.equal(tokenBody.get('grant_type'), 'authorization_code');
  assert.equal(tokenBody.get('code'), 'CODIGO123');
  assert.equal(tokenBody.get('redirect_uri'), REDIRECT_URI);
  assert.ok(verifier.length >= 43 && verifier.length <= 128);
  assert.equal(crypto.createHash('sha256').update(verifier).digest('base64url'), u.searchParams.get('code_challenge'));

  assert.equal(client.getStatus().state, 'connected');
  assert.equal(client.getStatus().userName, 'Meiker');
  const raw = fs.readFileSync(path.join(dir, 'config-spotify.json'), 'utf-8');
  assert.ok(!raw.includes('RT-nuevo'));
  client.stopPolling();
});

test('login PKCE: state incorrecto o permiso denegado -> error y el puerto queda libre', async () => {
  let openedUrl = null;
  const client = new SpotifyClient({ userDataPath: tmpDir(), fetchImpl: makeFetch(() => res(204)), openExternal: (u) => { openedUrl = u; } });
  client.setClientId(CLIENT_ID);
  let p = client.connect();
  for (let i = 0; i < 50 && !openedUrl; i++) await new Promise((r) => setTimeout(r, 20));
  await httpGet(`${REDIRECT_URI}?code=X&state=OTRO`);
  let r = await p;
  assert.equal(r.ok, false);

  openedUrl = null;
  p = client.connect();      // el puerto debe estar libre otra vez
  for (let i = 0; i < 50 && !openedUrl; i++) await new Promise((r2) => setTimeout(r2, 20));
  await httpGet(`${REDIRECT_URI}?error=access_denied&state=${new URL(openedUrl).searchParams.get('state')}`);
  r = await p;
  assert.equal(r.ok, false); assert.match(r.error, /Cancelaste/);
});

test('login PKCE: puerto ocupado -> mensaje claro', async () => {
  const blocker = http.createServer(() => {}); await new Promise((r) => blocker.listen(REDIRECT_PORT, '127.0.0.1', r));
  try {
    const client = new SpotifyClient({ userDataPath: tmpDir(), fetchImpl: makeFetch(() => res(204)), openExternal: () => {} });
    client.setClientId(CLIENT_ID);
    const r = await client.connect();
    assert.equal(r.ok, false); assert.match(r.error, /ocupado/);
  } finally { blocker.close(); }
});


test('me gusta: se consulta una vez por canción, solo con "Ahora suena" a la vista', async () => {
  const st = { json: playbackJson() };
  let containsCalls = 0;
  const { routes } = routerWith(st, (c) => { if (c.path === '/me/library/contains') { containsCalls++; return res(200, [true]); } });
  const { client } = connectedClient(routes);
  await client.refreshState();                       // fuera de vista: no pregunta
  assert.equal(containsCalls, 0); assert.equal(client.getSnapshot().liked, null);
  client._viewActive = true;
  await client.refreshState();                       // ahora sí: pregunta una vez
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(containsCalls, 1); assert.equal(client.getSnapshot().liked, true);
  await client.refreshState(); await client.refreshState();
  assert.equal(containsCalls, 1, 'no repite mientras sea la misma canción');
  client.stopPolling();
});
