'use strict';

/* =====================================================================
   SPOTIFY -> PANTALLA TFT  (PC -> ESP32-C3, por el mismo puerto serie)
   (el archivo conserva su nombre de cuando la pantalla era un OLED)

   Protocolo (una línea por mensaje, 115200 baud):

     SPT:<p>,<progreso_ms>,<duracion_ms>,<flags>
         p      0 = pausado · 1 = sonando · 2 = nada sonando · 3 = Spotify sin conectar
         flags  suma de bits: 1 aleatorio · 2 repetir lista · 4 repetir canción · 8 me gusta
     SPTT:<titulo>          (ASCII, máx. 44 caracteres)
     SPTA:<artista>         (ASCII, máx. 44 caracteres)
     SPTK:<4 hex>           (color de acento RGB565 de la portada; el firmware
                             borra la portada anterior al recibirlo)
     SPTR:<fila>,<256 hex>  (una fila de la portada 64x64: 64 píxeles RGB565)
     SPTC                   (borra la portada: no hay imagen para esta canción)

   La fuente por defecto de Adafruit_GFX solo dibuja ASCII: acentos y ñ se
   convierten a su letra base; lo que no se pueda representar queda como "?".
   ===================================================================== */

const TEXT_MAX = 44;
const ART_SIZE = 64;                 // portada 64x64 (la pantalla mide 76 px de alto)
const CLEAR_ART_LINE = 'SPTC\n';

const REPLACEMENTS = {
  '‘': "'", '’': "'", '‚': ',', '“': '"', '”': '"',
  '–': '-', '—': '-', '…': '...', '×': 'x', '·': '.',
  '¿': '?', '¡': '!', 'ß': 'ss', 'æ': 'ae', 'Æ': 'AE',
  'ø': 'o', 'Ø': 'O', 'ł': 'l', 'Ł': 'L', 'đ': 'd', 'Đ': 'D',
  ' ': ' ',
};

// Deja solo ASCII imprimible, sin '|', y recorta a maxLen con "..." si hace falta.
function toAscii(str, maxLen = TEXT_MAX) {
  let s = String(str == null ? '' : str);
  s = s.replace(/[‘’‚“”–—…×·¿¡ßæÆøØłŁđĐ ]/g, (c) => REPLACEMENTS[c]);
  s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');   // á -> a, ñ -> n
  s = s.replace(/[\r\n\t|]/g, ' ');
  s = s.replace(/[^\x20-\x7e]/g, '?');                      // lo que quede (CJK, emoji...)
  s = s.replace(/\?{2,}/g, '?').replace(/\s{2,}/g, ' ').trim();
  if (s.length > maxLen) s = s.slice(0, maxLen - 3).trimEnd() + '...';
  return s;
}

function playbackCode(snap) {
  if (!snap || snap.status !== 'connected') return 3;
  if (!snap.active || !snap.title) return 2;
  return snap.isPlaying ? 1 : 0;
}

function flagsBits(snap) {
  let f = 0;
  if (snap.shuffle) f |= 1;
  if (snap.repeat === 'context') f |= 2;
  if (snap.repeat === 'track') f |= 4;
  if (snap.liked) f |= 8;
  return f;
}

function buildStateLine(snap) {
  const p = playbackCode(snap);
  const prog = p === 0 || p === 1 ? Math.max(0, Math.round(snap.progressMs || 0)) : 0;
  const dur = p === 0 || p === 1 ? Math.max(0, Math.round(snap.durationMs || 0)) : 0;
  return `SPT:${p},${prog},${dur},${p <= 1 ? flagsBits(snap) : 0}\n`;
}

function buildTextLines(snap) {
  const p = playbackCode(snap);
  const title = p <= 1 ? toAscii(snap.title) : '';
  const artist = p <= 1 ? toAscii(snap.artist) : '';
  return [`SPTT:${title}\n`, `SPTA:${artist}\n`];
}

/* ----------------------------- portada a color ----------------------------- */
function rgb565(r, g, b) {
  return ((r & 0xf8) << 8) | ((g & 0xfc) << 3) | (b >> 3);
}

const hex4 = (v) => v.toString(16).padStart(4, '0');

function averageColor(bgra, w, h) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < w * h; i++) {
    const bb = bgra[i * 4], gg = bgra[i * 4 + 1], rr = bgra[i * 4 + 2];
    // ignora casi-negros y casi-blancos: dan un color "muerto" para el brillo de fondo
    const l = 0.299 * rr + 0.587 * gg + 0.114 * bb;
    if (l < 24 || l > 236) continue;
    r += rr; g += gg; b += bb; n++;
  }
  if (!n) return '#dfe7ea';
  const hex = (v) => Math.round(v / n).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

// Color de acento para la pantalla (barra de progreso, íconos activos): el color
// promedio de la portada, aclarado si hace falta para que se vea sobre fondo negro.
function accent565(hexColor) {
  let r = parseInt(hexColor.slice(1, 3), 16);
  let g = parseInt(hexColor.slice(3, 5), 16);
  let b = parseInt(hexColor.slice(5, 7), 16);
  const max = Math.max(r, g, b);
  if (max < 170) {
    const k = max ? 170 / max : 1;
    r = Math.min(255, Math.round(max ? r * k : 170));
    g = Math.min(255, Math.round(max ? g * k : 170));
    b = Math.min(255, Math.round(max ? b * k : 170));
  }
  return rgb565(r, g, b);
}

// bgra: Buffer/Uint8Array con 4 bytes por pixel (lo que entrega nativeImage.toBitmap()).
function bgraToRowLines(bgra, w = ART_SIZE, h = ART_SIZE) {
  const lines = [];
  for (let y = 0; y < h; y++) {
    let hex = '';
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      hex += hex4(rgb565(bgra[i + 2], bgra[i + 1], bgra[i]));
    }
    lines.push(`SPTR:${y},${hex}\n`);
  }
  return lines;
}

// Todo junto: BGRA 64x64 -> { lines (SPTK + 64 SPTR), color (para la ventana) }
function bgraToArt(bgra, w = ART_SIZE, h = ART_SIZE) {
  const color = averageColor(bgra, w, h);
  return { lines: [`SPTK:${hex4(accent565(color))}\n`, ...bgraToRowLines(bgra, w, h)], color };
}

module.exports = {
  TEXT_MAX, ART_SIZE, CLEAR_ART_LINE,
  toAscii, playbackCode, flagsBits,
  buildStateLine, buildTextLines,
  rgb565, averageColor, accent565, bgraToRowLines, bgraToArt,
};
