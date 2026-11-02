'use strict';

/* =====================================================================
   WIDGETS CON DATOS (clima, disco, red) — proceso principal

   Calcula el texto de cada widget y lo deja como { label, value } por clave
   (ver widgetKey en display.js). main.js lo manda al ESP32 como
   "SCT:<pantalla>,<hueco>,<etiqueta>|<valor>" y a la ventana para el visor.
   Todo es ASCII porque la fuente del firmware no tiene tildes.
   En el valor, "~" es un salto de línea y "{" / "}" son las flechas de bajada y subida (la red las muestra en dos filas);
   la app y el firmware las dibujan como ↓ y ↑.
   ===================================================================== */

const fs = require('fs');
const os = require('os');
const path = require('path');
const Display = require('./display');

const T = {
  es: {
    weather: 'Clima', offline: 'Sin conexion', notFound: 'Ciudad no encontrada',
    disk: 'Disco', free: 'libres', net: 'Red Mbps',
    wmo: { clear: 'Despejado', partly: 'Parcial', cloudy: 'Nublado', fog: 'Niebla', drizzle: 'Llovizna', rain: 'Lluvia', snow: 'Nieve', showers: 'Chubascos', storm: 'Tormenta' },
  },
  en: {
    weather: 'Weather', offline: 'Offline', notFound: 'City not found',
    disk: 'Disk', free: 'free', net: 'Network Mbps',
    wmo: { clear: 'Clear', partly: 'Partly cloudy', cloudy: 'Cloudy', fog: 'Fog', drizzle: 'Drizzle', rain: 'Rain', snow: 'Snow', showers: 'Showers', storm: 'Storm' },
  },
};

const ascii = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '').replace(/\|/g, '/');

// Código del tiempo de Open-Meteo (WMO) -> clave de texto.
function weatherKind(code) {
  if (code === 0) return 'clear';
  if (code <= 2) return 'partly';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if (code >= 61 && code <= 67) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 80 && code <= 82) return 'showers';
  if (code >= 95) return 'storm';
  return 'cloudy';
}

// Tiempo que falta para un reinicio: "2h10m", "4d3h", "35m". resetsAt acepta segundos, milisegundos o fecha ISO.
function resetMs(v) {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Date.parse(v);
  if (!Number.isFinite(n)) return null;
  return n < 1e12 ? n * 1000 : n;
}
function formatReset(ms, now) {
  if (ms == null) return '--';
  const m = Math.max(0, Math.round((ms - now) / 60000));
  if (m >= 1440) return `${Math.floor(m / 1440)}d${Math.floor((m % 1440) / 60)}h`;
  if (m >= 60) return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`;
  return `${m}m`;
}
// Una ventana del plan { used_percentage, resets_at } -> { pct, reset }. Si ya se reinició, vuelve a 0%.
function claudeWindow(win, now) {
  if (!win || typeof win.used_percentage !== 'number') return { pct: null, reset: '--' };
  const at = resetMs(win.resets_at);
  if (at != null && at <= now) return { pct: 0, reset: '--' };
  return { pct: Math.max(0, Math.min(100, Math.round(win.used_percentage))), reset: formatReset(at, now) };
}

// Bytes por segundo -> megabits por segundo (Mbps) con un decimal ("0.0" si no hay tráfico).
const formatMbps = (bytesPerSec) => ((Math.max(0, bytesPerSec || 0) * 8) / 1e6).toFixed(1);

class InfoWidgets {
  // deps: { si (systeminformation), fetch, now }
  constructor({ si, fetch: f, now = Date.now, claudeFile } = {}) {
    this.si = si; this.fetch = f || (typeof fetch === 'function' ? fetch : null); this.now = now;
    this.lang = 'es';
    this.weather = new Map();        // clave -> { at, data, busy, error }
    this.geo = new Map();            // ciudad -> { lat, lon, name }
    this.disk = { at: 0, busy: false, all: null };
    this.net = { at: 0, busy: false, rx: 0, tx: 0 };
    // Uso del plan de Claude: lo deja la línea de estado de Claude Code (rhub-usage-statusline.js).
    this.claudeFile = claudeFile || path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'rhub-usage.json');
    this.claude = { at: 0, data: null };
  }

  setLang(l) { this.lang = l === 'en' ? 'en' : 'es'; }
  get t() { return T[this.lang]; }

  async _geocode(city) {
    const key = city.toLowerCase();
    if (this.geo.has(key)) return this.geo.get(key);
    const r = await this.fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`);
    const j = await r.json();
    const hit = j && j.results && j.results[0];
    const g = hit ? { lat: hit.latitude, lon: hit.longitude, name: hit.name } : null;
    if (g) this.geo.set(key, g);
    return g;
  }

  async _loadWeather(key, city) {
    const e = this.weather.get(key);
    try {
      const g = await this._geocode(city);
      if (!g) { e.error = 'notFound'; return; }
      const r = await this.fetch(`https://api.open-meteo.com/v1/forecast?latitude=${g.lat}&longitude=${g.lon}&current=temperature_2m,weather_code`);
      const j = await r.json();
      e.data = { name: g.name, temp: j.current.temperature_2m, code: j.current.weather_code };
      e.error = null;
    } catch (err) {
      e.error = 'offline';
    } finally {
      e.at = this.now(); e.busy = false;
    }
  }

  // Todas las unidades con su uso (las que Windows reporta con tamaño).
  async listDrives() {
    const rows = await this.si.fsSize();
    return rows.filter((x) => x.size > 0).map((x) => ({
      mount: String(x.mount).replace(/[\\/]+$/, ''), use: Math.round(x.use),
      freeGB: Math.round((x.size - x.used) / 1024 ** 3), sizeGB: Math.round(x.size / 1024 ** 3),
    }));
  }

  async _loadDisk() {
    try { this.disk.all = await this.listDrives(); } catch (e) { this.disk.all = []; }
    this.disk.at = this.now(); this.disk.busy = false;
  }

  // La unidad pedida; si no se eligió ninguna, la del sistema (o la primera).
  _pickDrive(want) {
    const all = this.disk.all || [];
    if (want) return all.find((x) => x.mount.toUpperCase() === want.toUpperCase()) || null;
    const sys = (process.env.SystemDrive || 'C:').toUpperCase();
    return all.find((x) => x.mount.toUpperCase() === sys) || all[0] || null;
  }

  _readClaude() {
    try { this.claude.data = JSON.parse(fs.readFileSync(this.claudeFile, 'utf8')); } catch (e) { this.claude.data = null; }
    this.claude.at = this.now();
  }

  async _loadNet() {
    try {
      const rows = await this.si.networkStats('*');
      this.net.rx = rows.reduce((a, r) => a + (r.rx_sec > 0 ? r.rx_sec : 0), 0);
      this.net.tx = rows.reduce((a, r) => a + (r.tx_sec > 0 ? r.tx_sec : 0), 0);
    } catch (e) { /* deja el valor anterior */ }
    this.net.at = this.now(); this.net.busy = false;
  }

  // Arranca las lecturas que hagan falta (sin esperarlas) y devuelve el texto de cada widget en uso.
  tick(display) {
    const out = {};
    const now = this.now();
    for (const screen of display.screens) {
      for (const w of screen.slots) {
        const key = Display.widgetKey(w);
        if (key in out) continue;
        if (w.type === 'weather') {
          const city = (w.city || '').trim();
          if (!city) { out[key] = { label: this.t.weather, value: '--' }; continue; }
          let e = this.weather.get(key);
          if (!e) { e = { at: 0, busy: false, data: null, error: null }; this.weather.set(key, e); }
          const stale = now - e.at > (e.error ? 60000 : 600000);
          if (stale && !e.busy && this.fetch) { e.busy = true; this._loadWeather(key, city); }
          if (e.data) out[key] = { label: ascii(`${e.data.name}, ${this.t.wmo[weatherKind(e.data.code)]}`), value: `${Math.round(e.data.temp)}C` };
          else out[key] = { label: ascii(e.error ? this.t[e.error] : city), value: '--' };
        } else if (w.type === 'disk') {
          if (now - this.disk.at > 30000 && !this.disk.busy) { this.disk.busy = true; this._loadDisk(); }
          const d = this._pickDrive(w.drive);
          out[key] = d ? { label: `${d.mount} ${d.freeGB}G ${this.t.free}`, value: `${d.use}%` }
            : { label: w.drive ? `${w.drive} --` : this.t.disk, value: '--' };
        } else if (w.type === 'claude') {
          if (now - this.claude.at > 5000) this._readClaude();
          const d = this.claude.data || {};
          const five = claudeWindow(d.five_hour, now), week = claudeWindow(d.seven_day, now);
          const p = (x) => (x.pct == null ? '--' : String(x.pct));
          out[key] = { label: 'Claude', value: `${p(five)}%`, raw: `${p(five)},${p(week)},${five.reset},${week.reset}`, claude: { five, week } };
        } else if (w.type === 'net') {
          if (now - this.net.at > 2000 && !this.net.busy) { this.net.busy = true; this._loadNet(); }
          out[key] = { label: this.t.net, value: `{ ${formatMbps(this.net.rx)}~} ${formatMbps(this.net.tx)}` };
        }
      }
    }
    return out;
  }
}

// Lo que viaja al ESP32 en una sola línea (máximo 40 caracteres: MAX_TEXT del firmware).
// "~" (salto de línea del valor) es ASCII y pasa tal cual.
const infoLine = (v) => {
  if (v.raw) return v.raw;   // el widget Claude manda sus 4 datos tal cual: "37,12,2h10m,4d3h"
  const value = ascii(v.value);
  return `${ascii(v.label).slice(0, 39 - value.length)}|${value}`;
};

module.exports = { InfoWidgets, weatherKind, formatMbps, formatReset, claudeWindow, infoLine, ascii };
