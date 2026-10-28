'use strict';

/* =====================================================================
   SPOTIFY — biblioteca de acciones + estado de reproducción
   (proceso principal de Electron)

   Qué hace:
     - Inicia sesión con "Authorization Code + PKCE" (sin client secret).
     - Guarda el refresh token cifrado (safeStorage) en config-spotify.json.
     - Ejecuta acciones de reproducción vía Web API (requiere Premium).
     - Mantiene el estado de "qué está sonando" y avisa cuando cambia.

   Ojo con estas reglas de Spotify (2026, apps en Development Mode):
     - El dueño de la app debe tener Premium activo.
     - Máx. 5 usuarios en la allowlist.
     - El refresh token vence ~6 meses después de la autorización
       ORIGINAL (refrescar el access token NO reinicia ese reloj).
       Al vencer hay que volver a conectar -> lo detectamos (invalid_grant).
     - La cuota de peticiones es limitada y no está documentada en números
       -> hacemos polling ADAPTATIVO (rápido solo si la pantalla "Ahora
       suena" está a la vista) y respetamos Retry-After / QUOTA_EXCEEDED.
   ===================================================================== */

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const API_BASE = 'https://api.spotify.com/v1';
const ACCOUNTS_BASE = 'https://accounts.spotify.com';

// Spotify exige que el redirect URI coincida EXACTO con el registrado en el
// Dashboard. Loopback por IP (nunca "localhost") y con http permitido.
const REDIRECT_PORT = 9911;
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/callback`;

const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-library-read',
  'user-library-modify',
];

const REFRESH_LIFETIME_MS = 180 * 24 * 3600 * 1000; // ~6 meses, solo para avisar
const POLL_FAST_PLAYING_MS = 3000;  // pantalla "Ahora suena" a la vista + sonando
const POLL_FAST_PAUSED_MS = 5000;   // a la vista pero en pausa
const POLL_IDLE_MS = 20000;         // fuera de vista: solo mantener estados frescos
const STATE_MAX_AGE_MS = 4000;      // antes de decidir play/pausa, ¿cuán viejo puede ser el estado?
const REQUEST_TIMEOUT_MS = 8000;
const VOLUME_STEP = 10;
const VOLUME_LOCK_MS = 4000;        // tras cambiar el volumen, se confía en lo que pedimos (Spotify tarda en reflejarlo)
const SEEK_STEP_MS = 10000;
const REPEAT_CYCLE = ['off', 'context', 'track'];

/* ------------------------------ errores ------------------------------ */
class SpotifyError extends Error {
  constructor(message, { status = 0, reason = null, retryAfter = 0, code = 'HTTP' } = {}) {
    super(message);
    this.name = 'SpotifyError';
    this.status = status;
    this.reason = reason;
    this.retryAfter = retryAfter;
    this.code = code;
  }
}

// Mensajes para el usuario (en español), según el tipo de error.
function friendlyError(err) {
  if (!(err instanceof SpotifyError)) return (err && err.message) || 'Error desconocido con Spotify.';
  switch (err.code) {
    case 'NO_CLIENT_ID':     return 'Falta el Client ID de Spotify. Pégalo en Configuración → Spotify.';
    case 'NOT_CONNECTED':    return 'Spotify no está conectado. Conéctalo en Configuración → Spotify.';
    case 'REAUTH':           return 'La sesión de Spotify venció. Vuelve a conectarla en Configuración → Spotify.';
    case 'NO_DEVICE':        return 'No hay ningún dispositivo de Spotify activo. Abre Spotify y dale play una vez.';
    case 'PREMIUM':          return 'Esa acción requiere Spotify Premium.';
    case 'NOT_ALLOWLISTED':  return 'Tu cuenta no está en la lista de usuarios de la app. Agrégala en el Dashboard de Spotify → Users Management.';
    case 'QUOTA':            return `Spotify agotó la cuota de la app. Reintento en ~${err.retryAfter || 60} s.`;
    case 'RATE_LIMITED':     return `Spotify pidió ir más despacio. Reintento en ~${err.retryAfter || 2} s.`;
    case 'NETWORK':          return 'Sin conexión con Spotify.';
    case 'NO_TRACK':         return 'No hay nada sonando en Spotify.';
    case 'NO_VOLUME':        return 'Este dispositivo no permite cambiar el volumen desde Spotify.';
    case 'RESTRICTED':       return 'Spotify no permitió esa acción en este momento.';
    default:                 return err.message || 'Error de Spotify.';
  }
}

/* ------------------------- helpers de estado ------------------------- */
function idlePlayback(fetchedAt) {
  return {
    active: false, isPlaying: false, kind: null,
    title: '', artist: '', album: '', artUrl: null, uri: null, trackId: null,
    durationMs: 0, progressMs: 0, fetchedAt: fetchedAt || 0,
    shuffle: false, repeat: 'off', volume: null, supportsVolume: true,
    deviceName: '', deviceType: '', liked: null,
  };
}

// Elige la portada más chica que aún se vea bien (>= 200 px); si no hay, la más grande.
function pickImage(images) {
  if (!Array.isArray(images) || images.length === 0) return null;
  const sized = images.filter((i) => i && i.url).map((i) => ({ url: i.url, w: i.width || 0 }));
  if (sized.length === 0) return null;
  const big = sized.filter((i) => i.w >= 200).sort((a, b) => a.w - b.w);
  if (big.length) return big[0].url;
  return sized.sort((a, b) => b.w - a.w)[0].url;
}

// Convierte la respuesta de GET /me/player a nuestro formato plano.
// json === null (HTTP 204) significa "no hay sesión de reproducción".
function normalizePlayback(json, fetchedAt) {
  if (!json) return idlePlayback(fetchedAt);
  const item = json.item || null;
  const kind = json.currently_playing_type === 'ad' ? 'ad'
    : item && item.type === 'episode' ? 'episode'
    : item ? 'track' : null;

  let title = item ? (item.name || '') : '';
  let artist = '';
  let album = '';
  let images = [];
  if (kind === 'track') {
    artist = (item.artists || []).map((a) => a.name).filter(Boolean).join(', ');
    album = (item.album && item.album.name) || '';
    images = (item.album && item.album.images) || [];
  } else if (kind === 'episode') {
    artist = (item.show && (item.show.name || item.show.publisher)) || '';
    album = (item.show && item.show.name) || '';
    images = item.images || (item.show && item.show.images) || [];
  } else if (kind === 'ad') {
    title = 'Anuncio';
  }

  const device = json.device || {};
  return {
    active: true,
    isPlaying: !!json.is_playing,
    kind,
    title, artist, album,
    artUrl: pickImage(images),
    uri: item ? item.uri || null : null,
    trackId: item ? item.id || null : null,
    durationMs: item ? item.duration_ms || 0 : 0,
    progressMs: json.progress_ms || 0,
    fetchedAt,
    shuffle: !!json.shuffle_state,
    repeat: json.repeat_state || 'off',
    volume: typeof device.volume_percent === 'number' ? device.volume_percent : null,
    supportsVolume: device.supports_volume !== false,
    deviceName: device.name || '',
    deviceType: device.type || '',
    liked: null,
  };
}

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function authPage({ title, message, ok }) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>RHub</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:radial-gradient(circle at 30% 20%,#1a1a1d,#0a0a0b 65%);
    font-family:'Segoe UI',system-ui,sans-serif;color:#f2f2f3}
  .card{text-align:center;padding:40px}
  .logo{width:72px;height:72px;margin:0 auto 22px;border-radius:18px;background:linear-gradient(135deg,#2c2c31,#111113);
    border:1px solid #333338;display:flex;align-items:center;justify-content:center}
  .logo svg{width:32px;height:32px}
  h1{font-size:19px;font-weight:600;margin:0 0 8px}
  p{font-size:13.5px;color:#8a8a91;margin:0}
  .hint{margin-top:22px;font-size:11.5px;color:#4a4a51}
</style></head><body><div class="card"><div class="logo">
<svg viewBox="0 0 24 24" fill="none" stroke="#f2f2f3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
${ok ? '<path d="M20 6 9 17l-5-5"/>' : '<path d="M6 6l12 12M18 6 6 18"/>'}</svg></div>
<h1>${title}</h1><p>${message}</p><div class="hint">Ya puedes cerrar esta pestaña.</div></div></body></html>`;
}

/* ===================================================================== */
class SpotifyClient extends EventEmitter {
  /**
   * @param {object} o
   * @param {string} o.userDataPath      carpeta donde guardar config-spotify.json
   * @param {object} [o.safeStorage]     electron.safeStorage (para cifrar el refresh token)
   * @param {function} o.openExternal    (url) => abre el navegador del sistema
   * @param {function} [o.fetchImpl]     fetch (inyectable para pruebas)
   * @param {function} [o.now]           Date.now (inyectable para pruebas)
   */
  constructor({ userDataPath, safeStorage = null, openExternal, fetchImpl, now } = {}) {
    super();
    this.configPath = path.join(userDataPath, 'config-spotify.json');
    this.safeStorage = safeStorage;
    this.openExternal = openExternal || (() => {});
    this._fetch = fetchImpl || ((...a) => fetch(...a));
    this._now = now || Date.now;

    this.cfg = { clientId: '', refreshToken: null, authorizedAt: 0, userName: '' };
    this._refreshToken = null;
    this._accessToken = null;
    this._expiresAt = 0;
    this._refreshPromise = null;
    this._needsReauth = false;

    this._pb = null;                // último estado de reproducción (normalizado)
    this._lastError = null;         // último error del polling (texto)
    this._blockedUntil = 0;         // no llamar a la API antes de esto (429)
    this._blockedCode = null;

    this._polling = false;
    this._viewActive = false;
    this._pollTimer = null;
    this._pollInFlight = null;
    this._verifyTimer = null;
    this._likedTried = null;        // trackId por el que ya preguntamos si está en Me gusta

    this._attempt = 0;
    this._authAbort = null;

    // Volumen: las pulsaciones se atienden de a una y en orden (cada una parte del
    // volumen que ya pedimos, no del que Spotify todavía informa).
    this._volChain = Promise.resolve();
    this._volTarget = null;
    this._volLockUntil = 0;

    // Registro de acciones: id -> función. Los ids viven en spotify-actions.js
    this._handlers = {
      play_pause: () => this._playPause(),
      next:       () => this._skip('next'),
      prev:       () => this._skip('previous'),
      like:       () => this._toggleLike(),
      shuffle:    () => this._toggleShuffle(),
      repeat:     () => this._cycleRepeat(),
      vol_up:     () => this._changeVolume(+VOLUME_STEP),
      vol_down:   () => this._changeVolume(-VOLUME_STEP),
      seek_fwd:   () => this._seekBy(+SEEK_STEP_MS),
      seek_back:  () => this._seekBy(-SEEK_STEP_MS),
    };
  }

  /* ------------------------- config / tokens ------------------------- */
  init() {
    this._load();
    if (this.cfg.clientId && this._refreshToken) {
      this.startPolling();
    }
    this.emit('status', this.getStatus());
  }

  _load() {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
        this.cfg = { ...this.cfg, ...raw };
        this._refreshToken = this._decrypt(this.cfg.refreshToken);
        if (this.cfg.refreshToken && !this._refreshToken) {
          // No se pudo descifrar (otro usuario de Windows / otra PC): pedir reconexión.
          this.cfg.refreshToken = null;
        }
      }
    } catch (e) {
      this.emit('log', `Spotify: no se pudo leer la config (${e.message}), empiezo de cero.`);
    }
  }

  _persist() {
    const enc = this._refreshToken ? this._encrypt(this._refreshToken) : null;
    this.cfg.refreshToken = enc;
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.cfg, null, 2), 'utf-8');
    } catch (e) {
      this.emit('log', `Spotify: no se pudo guardar la config (${e.message}).`);
    }
  }

  _encrypt(text) {
    if (this.safeStorage && this.safeStorage.isEncryptionAvailable && this.safeStorage.isEncryptionAvailable()) {
      return { mode: 'safe', data: this.safeStorage.encryptString(text).toString('base64') };
    }
    // Sin cifrado del SO disponible: queda en base64 (NO es cifrado real).
    return { mode: 'plain', data: Buffer.from(text, 'utf-8').toString('base64') };
  }

  _decrypt(stored) {
    if (!stored || !stored.data) return null;
    try {
      const buf = Buffer.from(stored.data, 'base64');
      if (stored.mode === 'safe') return this.safeStorage.decryptString(buf);
      return buf.toString('utf-8');
    } catch (e) {
      return null;
    }
  }

  /* --------------------------- estado público --------------------------- */
  _statusKey() {
    if (!this.cfg.clientId) return 'no-client';
    if (!this._refreshToken) return 'disconnected';
    if (this._needsReauth) return 'reauth';
    return 'connected';
  }

  _isConnected() { return this._statusKey() === 'connected'; }

  _notConnectedMessage() {
    const k = this._statusKey();
    if (k === 'no-client') return friendlyError(new SpotifyError('', { code: 'NO_CLIENT_ID' }));
    if (k === 'reauth') return friendlyError(new SpotifyError('', { code: 'REAUTH' }));
    return friendlyError(new SpotifyError('', { code: 'NOT_CONNECTED' }));
  }

  getStatus() {
    return {
      state: this._statusKey(),          // no-client | disconnected | reauth | connected
      clientId: this.cfg.clientId || '',
      redirectUri: REDIRECT_URI,
      userName: this.cfg.userName || '',
      authorizedAt: this.cfg.authorizedAt || 0,
      reauthBy: this.cfg.authorizedAt ? this.cfg.authorizedAt + REFRESH_LIFETIME_MS : 0,
      error: this._lastError,
    };
  }

  // Foto del estado para la UI y el OLED. progressMs ya viene interpolado "a esta hora" (at).
  getSnapshot() {
    const now = this._now();
    const pb = this._pb || idlePlayback(now);
    let progress = pb.progressMs;
    if (pb.isPlaying && pb.durationMs) {
      progress = Math.min(pb.durationMs, pb.progressMs + Math.max(0, now - pb.fetchedAt));
    }
    return {
      status: this._statusKey(),
      connected: this._isConnected(),
      ...pb,
      progressMs: progress,
      at: now,
      error: this._lastError,
      blockedUntil: this._blockedUntil > now ? this._blockedUntil : 0,
    };
  }

  _emitState(changed) {
    this.emit('state', this.getSnapshot(), changed || []);
  }

  /* ------------------------------ login ------------------------------ */
  setClientId(id) {
    const clean = String(id || '').trim();
    if (clean && !/^[a-f0-9]{32}$/i.test(clean)) {
      return { ok: false, error: 'El Client ID debe tener 32 caracteres (letras a-f y números). Cópialo tal cual del Dashboard de Spotify.' };
    }
    if (clean !== this.cfg.clientId) {
      this._dropSession();
      this.cfg.clientId = clean;
      this._persist();
      this.emit('status', this.getStatus());
      this._emitState(['status']);
    }
    return { ok: true };
  }

  async connect() {
    if (!this.cfg.clientId) return { ok: false, error: friendlyError(new SpotifyError('', { code: 'NO_CLIENT_ID' })) };
    if (this._authAbort) this._authAbort(new Error('Se inició otro intento de conexión.'));

    const attempt = ++this._attempt;
    try {
      const verifier = b64url(crypto.randomBytes(48)); // 64 caracteres del set permitido
      const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
      const state = b64url(crypto.randomBytes(16));

      const code = await this._waitForAuthCode(challenge, state);
      const t = await this._tokenRequest({
        grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, code_verifier: verifier,
      });

      this._accessToken = t.access_token;
      this._expiresAt = this._now() + (t.expires_in || 3600) * 1000;
      this._refreshToken = t.refresh_token;
      this._needsReauth = false;
      this._lastError = null;
      this.cfg.authorizedAt = this._now();
      this._persist();

      // Nombre para mostrar (best-effort: si falla, no pasa nada)
      try {
        const me = await this._request('GET', '/me');
        if (me && me.display_name) { this.cfg.userName = me.display_name; this._persist(); }
      } catch (e) { /* opcional */ }

      this.startPolling();
      this.emit('status', this.getStatus());
      this._emitState(['status']);
      return { ok: true };
    } catch (e) {
      if (attempt !== this._attempt) return { ok: false, error: 'cancelado' };
      return { ok: false, error: e && e.message ? e.message : 'No se pudo conectar con Spotify.' };
    }
  }

  // Levanta el servidor loopback, abre el navegador y espera el ?code=
  _waitForAuthCode(challenge, state) {
    return new Promise((resolve, reject) => {
      let done = false;
      let timeoutId = null;
      const server = http.createServer((req, res) => {
        const url = new URL(req.url, `http://127.0.0.1:${REDIRECT_PORT}`);
        if (url.pathname !== '/callback') { res.statusCode = 404; res.end(); return; }
        res.setHeader('Content-Type', 'text/html; charset=utf-8');

        const err = url.searchParams.get('error');
        const code = url.searchParams.get('code');
        const returned = url.searchParams.get('state');

        if (err || !code || returned !== state) {
          res.end(authPage({ title: 'No se pudo conectar', message: err === 'access_denied' ? 'Cancelaste el permiso en Spotify.' : 'El enlace es inválido o venció.', ok: false }));
          finish(new Error(err === 'access_denied' ? 'Cancelaste el permiso en Spotify.' : 'Respuesta de Spotify inválida.'));
          return;
        }
        res.end(authPage({ title: 'Spotify conectado', message: 'Ya puedes volver a RHub.', ok: true }));
        finish(null, code);
      });

      const finish = (error, code) => {
        if (done) return;
        done = true;
        clearTimeout(timeoutId);
        this._authAbort = null;
        server.close();
        if (server.closeAllConnections) server.closeAllConnections();
        if (error) reject(error); else resolve(code);
      };
      this._authAbort = (e) => finish(e);

      server.on('error', (e) => {
        finish(new Error(e.code === 'EADDRINUSE'
          ? `El puerto ${REDIRECT_PORT} está ocupado por otro programa. Ciérralo e intenta de nuevo.`
          : `No se pudo abrir el puerto local ${REDIRECT_PORT}: ${e.message}`));
      });

      server.listen(REDIRECT_PORT, '127.0.0.1', () => {
        const authUrl = `${ACCOUNTS_BASE}/authorize?` + new URLSearchParams({
          response_type: 'code',
          client_id: this.cfg.clientId,
          scope: SCOPES.join(' '),
          redirect_uri: REDIRECT_URI,
          state,
          code_challenge_method: 'S256',
          code_challenge: challenge,
        });
        this.openExternal(authUrl);
      });

      timeoutId = setTimeout(() => finish(new Error('Se agotó el tiempo de espera (5 min).')), 5 * 60 * 1000);
    });
  }

  disconnect() {
    if (this._authAbort) this._authAbort(new Error('cancelado'));
    this._dropSession();
    this.cfg.userName = '';
    this.cfg.authorizedAt = 0;
    this._persist();
    this.emit('status', this.getStatus());
    this._emitState(['status']);
    return { ok: true };
  }

  _dropSession() {
    this.stopPolling();
    this._refreshToken = null;
    this._accessToken = null;
    this._expiresAt = 0;
    this._needsReauth = false;
    this._pb = null;
    this._lastError = null;
    this._blockedUntil = 0;
    this.cfg.refreshToken = null;
  }

  /* ---------------------------- HTTP / tokens ---------------------------- */
  async _tokenRequest(params) {
    const body = new URLSearchParams({ client_id: this.cfg.clientId, ...params });
    let res;
    try {
      res = await this._fetch(`${ACCOUNTS_BASE}/api/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (e) {
      throw new SpotifyError('Sin conexión con Spotify.', { code: 'NETWORK' });
    }
    const text = await res.text();
    let json = {};
    try { json = text ? JSON.parse(text) : {}; } catch (e) { /* respuesta no-JSON */ }
    if (!res.ok) {
      const reason = json.error || null;
      throw new SpotifyError(
        json.error_description || json.error || `Spotify respondió ${res.status} al pedir el token.`,
        { status: res.status, reason, code: reason === 'invalid_grant' ? 'REAUTH' : 'HTTP' },
      );
    }
    return json;
  }

  async _ensureAccessToken() {
    if (!this.cfg.clientId) throw new SpotifyError('', { code: 'NO_CLIENT_ID' });
    if (!this._refreshToken) throw new SpotifyError('', { code: 'NOT_CONNECTED' });
    if (this._needsReauth) throw new SpotifyError('', { code: 'REAUTH' });
    if (this._accessToken && this._now() < this._expiresAt - 60000) return this._accessToken;

    if (!this._refreshPromise) {
      this._refreshPromise = this._refresh().finally(() => { this._refreshPromise = null; });
    }
    return this._refreshPromise;
  }

  async _refresh() {
    try {
      const t = await this._tokenRequest({ grant_type: 'refresh_token', refresh_token: this._refreshToken });
      this._accessToken = t.access_token;
      this._expiresAt = this._now() + (t.expires_in || 3600) * 1000;
      // A veces no viene un refresh_token nuevo: en ese caso se sigue usando el actual.
      if (t.refresh_token && t.refresh_token !== this._refreshToken) {
        this._refreshToken = t.refresh_token;
        this._persist();
      }
      return this._accessToken;
    } catch (e) {
      if (e.code === 'REAUTH') this._markReauth();
      throw e;
    }
  }

  _markReauth() {
    this._needsReauth = true;
    this._accessToken = null;
    this.stopPolling();
    this.emit('status', this.getStatus());
    this._emitState(['status']);
  }

  async _request(method, pathname, { query, body, retried = false } = {}) {
    const now = this._now();
    if (now < this._blockedUntil) {
      throw new SpotifyError('', {
        status: 429, code: this._blockedCode || 'RATE_LIMITED',
        retryAfter: Math.ceil((this._blockedUntil - now) / 1000),
      });
    }

    const token = await this._ensureAccessToken();
    const url = new URL(API_BASE + pathname);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }
    const headers = { Authorization: `Bearer ${token}` };
    let payload;
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }

    let res;
    try {
      res = await this._fetch(url.toString(), { method, headers, body: payload, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (e) {
      throw new SpotifyError('Sin conexión con Spotify.', { code: 'NETWORK' });
    }

    if (res.status === 401) {
      if (!retried) { this._accessToken = null; return this._request(method, pathname, { query, body, retried: true }); }
      this._markReauth();
      throw new SpotifyError('', { status: 401, code: 'REAUTH' });
    }
    if (res.status === 204) return null;

    const text = await res.text();
    let json = null;
    if (text) { try { json = JSON.parse(text); } catch (e) { /* no-JSON */ } }
    if (res.ok) return json;
    throw this._toError(res, json);
  }

  _toError(res, json) {
    const status = res.status;
    const e = (json && json.error) || {};
    const reason = (typeof e === 'object' ? e.reason : null) || null;
    const message = (typeof e === 'object' ? e.message : String(e || '')) || `Spotify respondió ${status}.`;

    if (status === 429) {
      const header = Number(res.headers && res.headers.get && res.headers.get('retry-after')) || 0;
      const quota = reason === 'QUOTA_EXCEEDED';
      const wait = quota ? Math.max(header, 60) : Math.max(header, 2);
      this._blockedUntil = this._now() + wait * 1000;
      this._blockedCode = quota ? 'QUOTA' : 'RATE_LIMITED';
      return new SpotifyError(message, { status, reason, retryAfter: wait, code: this._blockedCode });
    }
    if (status === 404 && (reason === 'NO_ACTIVE_DEVICE' || /no active device/i.test(message))) {
      return new SpotifyError(message, { status, reason, code: 'NO_DEVICE' });
    }
    if (status === 403) {
      if (reason === 'PREMIUM_REQUIRED' || /premium/i.test(message)) return new SpotifyError(message, { status, reason, code: 'PREMIUM' });
      if (/volume/i.test(reason || '') || /volume/i.test(message)) return new SpotifyError(message, { status, reason, code: 'NO_VOLUME' });
      if (/restriction violated/i.test(message)) return new SpotifyError(message, { status, reason, code: 'RESTRICTED' });
      if (/not registered|allowlist|user may not be registered/i.test(message)) return new SpotifyError(message, { status, reason, code: 'NOT_ALLOWLISTED' });
      return new SpotifyError(message, { status, reason, code: 'FORBIDDEN' });
    }
    return new SpotifyError(message, { status, reason, code: 'HTTP' });
  }

  /* ------------------------ estado de reproducción ------------------------ */
  refreshState() {
    if (this._pollInFlight) return this._pollInFlight;
    this._pollInFlight = this._doRefresh().finally(() => { this._pollInFlight = null; });
    return this._pollInFlight;
  }

  async _doRefresh() {
    if (!this._isConnected()) return null;
    try {
      const json = await this._request('GET', '/me/player', { query: { additional_types: 'episode' } });
      const prevErr = this._lastError;
      this._lastError = null;
      this._applyPlayback(json);
      if (prevErr) this.emit('status', this.getStatus());
    } catch (e) {
      const msg = friendlyError(e);
      if (msg !== this._lastError) {
        this._lastError = msg;
        this.emit('status', this.getStatus());
      }
      this._emitState(['status']);
    }
    return this._pb;
  }

  _applyPlayback(json) {
    const now = this._now();
    const prev = this._pb;
    const next = normalizePlayback(json, now);
    if (this._volTarget !== null && now < this._volLockUntil && next.active && next.volume !== null) {
      next.volume = this._volTarget;
    }

    const sameTrack = prev && prev.trackId && prev.trackId === next.trackId;
    next.liked = sameTrack ? prev.liked : null;

    const changed = [];
    if (!prev || prev.trackId !== next.trackId || prev.title !== next.title) changed.push('track');
    if (!prev || prev.isPlaying !== next.isPlaying || prev.active !== next.active) changed.push('playing');
    if (!prev || prev.shuffle !== next.shuffle || prev.repeat !== next.repeat) changed.push('flags');
    if (!prev || prev.volume !== next.volume || prev.deviceName !== next.deviceName) changed.push('device');
    if (prev && prev.liked !== next.liked) changed.push('liked');
    if (prev && prev.isPlaying && next.isPlaying && sameTrack) {
      const predicted = prev.progressMs + (now - prev.fetchedAt);
      if (Math.abs(predicted - next.progressMs) > 2500) changed.push('progress'); // salto / seek externo
    }

    this._pb = next;
    this._emitState(changed);

    // ¿La canción está en Me gusta? Se pregunta una sola vez por canción, y solo
    // si "Ahora suena" está a la vista (así el corazón aparece al abrir la pantalla).
    if (this._viewActive && next.kind === 'track' && next.uri && next.liked === null && this._likedTried !== next.trackId) {
      this._likedTried = next.trackId;
      this._fetchLiked(next.trackId, next.uri);
    }
  }

  async _fetchLiked(trackId, uri) {
    try {
      const r = await this._request('GET', '/me/library/contains', { query: { uris: uri } });
      if (Array.isArray(r) && this._pb && this._pb.trackId === trackId) this._patch({ liked: !!r[0] });
    } catch (e) { /* el corazón es opcional: si falla, no molestamos */ }
  }

  // Cambia campos del estado en memoria sin esperar al servidor (UI instantánea).
  _patch(partial) {
    if (!this._pb) this._pb = idlePlayback(this._now());
    const snap = this.getSnapshot();
    this._pb = { ...this._pb, progressMs: snap.progressMs, fetchedAt: this._now(), ...partial };
    const keys = Object.keys(partial).map((k) => (
      k === 'isPlaying' ? 'playing'
        : k === 'shuffle' || k === 'repeat' ? 'flags'
        : k === 'volume' ? 'device'
        : k === 'progressMs' ? 'progress' : k));
    this._emitState([...new Set(keys)]);
  }

  // Devuelve el estado; si está más viejo que maxAge, lo vuelve a pedir.
  async _freshState(maxAge) {
    const now = this._now();
    if (!this._pb || now - this._pb.fetchedAt > maxAge) await this.refreshState();
    return this._pb || idlePlayback(this._now());
  }

  // Tras una acción, reconcilia con el servidor un momento después (debounced).
  _scheduleVerify(ms = 450) {
    clearTimeout(this._verifyTimer);
    this._verifyTimer = setTimeout(() => { this.refreshState().then(() => this._reschedulePoll()); }, ms);
  }

  /* ------------------------------- polling ------------------------------- */
  startPolling() {
    this._polling = true;
    this._schedulePoll(400);
  }

  stopPolling() {
    this._polling = false;
    clearTimeout(this._pollTimer);
    clearTimeout(this._verifyTimer);
    this._pollTimer = null;
  }

  // La UI (o el OLED) avisa si la pantalla "Ahora suena" está a la vista.
  setViewActive(active) {
    active = !!active;
    if (active === this._viewActive) return;
    this._viewActive = active;
    if (!this._polling) return;
    if (active) this._schedulePoll(0);   // refresca YA
    else this._reschedulePoll();
  }

  _nextInterval() {
    const playing = this._pb && this._pb.isPlaying;
    const base = this._viewActive ? (playing ? POLL_FAST_PLAYING_MS : POLL_FAST_PAUSED_MS) : POLL_IDLE_MS;
    const blocked = this._blockedUntil - this._now();
    return Math.max(base, blocked > 0 ? blocked + 250 : 0);
  }

  _schedulePoll(delay) {
    clearTimeout(this._pollTimer);
    if (!this._polling) return;
    this._pollTimer = setTimeout(async () => {
      if (!this._polling) return;
      await this.refreshState();
      this._schedulePoll(this._nextInterval());
    }, delay);
  }

  _reschedulePoll() {
    if (this._polling) this._schedulePoll(this._nextInterval());
  }

  /* -------------------------------- acciones -------------------------------- */
  // Nunca lanza: devuelve { ok, message? , error?, code? }.
  async runAction(id) {
    const handler = this._handlers[id];
    if (!handler) return { ok: false, error: `Acción de Spotify desconocida: "${id}"`, code: 'UNKNOWN' };
    if (!this._isConnected()) return { ok: false, error: this._notConnectedMessage(), code: 'NOT_CONNECTED' };
    try {
      const message = await handler();
      return { ok: true, message: message || undefined };
    } catch (e) {
      return { ok: false, error: friendlyError(e), code: e && e.code };
    }
  }

  async _playPause() {
    const s = await this._freshState(STATE_MAX_AGE_MS);
    if (s.isPlaying) {
      await this._softRequest('PUT', '/me/player/pause');
      this._patch({ isPlaying: false });
    } else {
      try {
        await this._softRequest('PUT', '/me/player/play');
      } catch (e) {
        if (e.code !== 'NO_DEVICE') throw e;
        await this._transferAndPlay();   // Spotify abierto pero "dormido": lo despertamos
      }
      this._patch({ isPlaying: true, active: true });
    }
    this._scheduleVerify();
  }

  // Igual que _request, pero si Spotify dice "restricción" (p. ej. pausar algo ya
  // pausado) lo tratamos como éxito: el estado ya es el que el usuario quería.
  async _softRequest(method, pathname, opts) {
    try {
      return await this._request(method, pathname, opts);
    } catch (e) {
      if (e.code === 'RESTRICTED') { this._scheduleVerify(200); return null; }
      throw e;
    }
  }

  async _transferAndPlay() {
    const r = await this._request('GET', '/me/player/devices');
    const list = (r && r.devices) || [];
    const target = list.find((d) => d.is_active)
      || list.find((d) => d.type === 'Computer' && !d.is_restricted)
      || list.find((d) => !d.is_restricted);
    if (!target) throw new SpotifyError('', { code: 'NO_DEVICE' });
    await this._request('PUT', '/me/player', { body: { device_ids: [target.id], play: true } });
  }

  async _skip(dir) {
    await this._request('POST', `/me/player/${dir}`);
    this._scheduleVerify(500);
  }

  async _toggleLike() {
    const s = await this._freshState(8000);
    if (!s.uri || s.kind === 'ad') throw new SpotifyError('', { code: 'NO_TRACK' });
    const r = await this._request('GET', '/me/library/contains', { query: { uris: s.uri } });
    const isLiked = Array.isArray(r) ? !!r[0] : false;
    await this._request(isLiked ? 'DELETE' : 'PUT', '/me/library', { query: { uris: s.uri } });
    this._patch({ liked: !isLiked });
    return isLiked ? 'Quitada de Me gusta' : 'Guardada en Me gusta';
  }

  async _toggleShuffle() {
    const s = await this._freshState(STATE_MAX_AGE_MS);
    if (!s.active) throw new SpotifyError('', { code: 'NO_DEVICE' });
    const next = !s.shuffle;
    await this._request('PUT', '/me/player/shuffle', { query: { state: next } });
    this._patch({ shuffle: next });
    this._scheduleVerify(800);
    return next ? 'Aleatorio activado' : 'Aleatorio desactivado';
  }

  async _cycleRepeat() {
    const s = await this._freshState(STATE_MAX_AGE_MS);
    if (!s.active) throw new SpotifyError('', { code: 'NO_DEVICE' });
    const idx = REPEAT_CYCLE.indexOf(s.repeat);
    const next = REPEAT_CYCLE[(idx + 1) % REPEAT_CYCLE.length];
    await this._request('PUT', '/me/player/repeat', { query: { state: next } });
    this._patch({ repeat: next });
    this._scheduleVerify(800);
    return { off: 'Repetir: desactivado', context: 'Repetir: lista', track: 'Repetir: canción' }[next];
  }

  // Serializa las pulsaciones: dos botones seguidos (subir y bajar, o subir dos veces)
  // ya no se pisan entre sí ni parten del mismo valor viejo.
  _changeVolume(delta) {
    const run = this._volChain.then(() => this._applyVolumeDelta(delta));
    this._volChain = run.catch(() => {});
    return run;
  }

  async _applyVolumeDelta(delta) {
    let base;
    if (this._volTarget !== null && this._now() < this._volLockUntil) {
      base = this._volTarget;                       // pulsaciones seguidas: se suma a lo ya pedido
    } else {
      const s = await this._freshState(STATE_MAX_AGE_MS);
      if (!s.active) throw new SpotifyError('', { code: 'NO_DEVICE' });
      if (!s.supportsVolume || s.volume === null) throw new SpotifyError('', { code: 'NO_VOLUME' });
      base = s.volume;
    }
    const v = clamp(base + delta, 0, 100);
    this._volTarget = v;
    this._volLockUntil = this._now() + VOLUME_LOCK_MS;
    try {
      await this._request('PUT', '/me/player/volume', { query: { volume_percent: v } });
    } catch (e) {
      this._volTarget = null;                       // no se aplicó: la próxima parte del valor real
      this._volLockUntil = 0;
      throw e;
    }
    this._volLockUntil = this._now() + VOLUME_LOCK_MS;
    this._patch({ volume: v });
    return `Volumen de Spotify: ${v} %`;
  }

  async _seekBy(deltaMs) {
    const s = await this._freshState(STATE_MAX_AGE_MS);
    if (!s.active || !s.durationMs) throw new SpotifyError('', { code: 'NO_TRACK' });
    const now = this.getSnapshot().progressMs;
    const target = clamp(now + deltaMs, 0, Math.max(0, s.durationMs - 1000));
    await this._request('PUT', '/me/player/seek', { query: { position_ms: Math.round(target) } });
    this._patch({ progressMs: Math.round(target) });
    this._scheduleVerify(600);
  }
}

module.exports = {
  SpotifyClient,
  SpotifyError,
  friendlyError,
  normalizePlayback,
  pickImage,
  REDIRECT_URI,
  REDIRECT_PORT,
  SCOPES,
  REFRESH_LIFETIME_MS,
};