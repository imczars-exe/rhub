'use strict';

/* =====================================================================
   PANTALLAS PERSONALIZABLES — modelo y protocolo compartidos

   Lo usan los dos lados:
     - main.js          -> require('./display')   (manda la config al ESP32)
     - script.js        -> <script src="display.js"> deja window.RHUB_DISPLAY
                           (vista previa, editor, imágenes y video)

   Modelo (va dentro de config-deck.json como "display"):
     { style, colors: { accent, bg, text }, screens: [ { layout, slots: [widget...] } ] }
     widget = { type, text?, image? (data URL ya recortada al hueco), video? (ruta del archivo) }

   Protocolo PC -> ESP32 (ver retrohub_firmware.ino):
     STY:<estilo>,<acento>,<fondo>,<texto>    colores en 4 hex RGB565
     SCN:<cantidad>                           cuántas pantallas hay (1-8)
     SCD:<i>,<layout>,<t0>,<t1>,<t2>          layout y tipo de widget de cada hueco
     SCT:<i>,<hueco>,<texto>                  texto del widget "Texto" (ASCII); en clima, disco
                                              y red es 'etiqueta|valor' y la app lo renueva sola
     IMG:<x>,<y>,<w>,<h>,<escala>,<bytes>\n + bytes RGB565 little-endian -> el ESP32 responde ACK
   ===================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RHUB_DISPLAY = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const W = 284, H = 76;
  const MAX_SCREENS = 8;
  const MAX_TEXT = 40;

  const STYLES = [
    { id: 'actual',   label: 'Actual',   colors: { accent: '#ffffff', bg: '#000000', text: '#ffffff' } },
    { id: 'minimal',  label: 'Minimal',  colors: { accent: '#ffffff', bg: '#000000', text: '#ffffff' } },
    { id: 'terminal', label: 'Terminal', colors: { accent: '#3ddc6e', bg: '#020a04', text: '#3ddc6e' } },
    { id: 'color',    label: 'Color',    colors: { accent: '#ff8a3d', bg: '#0d0d10', text: '#ffffff' } },
  ];

  // Huecos de cada distribución, en píxeles de la pantalla real (284x76).
  const LAYOUTS = [
    { id: 'full',   label: '1 grande',          rects: [[0, 0, 284, 76]] },
    { id: 'split',  label: '2 iguales',         rects: [[0, 0, 142, 76], [142, 0, 142, 76]] },
    { id: 'thirds', label: '3 iguales',         rects: [[0, 0, 95, 76], [95, 0, 94, 76], [189, 0, 95, 76]] },
    { id: 'big2',   label: '1 grande + 2 chicos', rects: [[0, 0, 180, 76], [180, 0, 104, 38], [180, 38, 104, 38]] },
  ];

  const WIDGETS = [
    { id: 'none',    label: 'Vacío' },
    { id: 'clock',   label: 'Hora y fecha' },
    { id: 'system',  label: 'Sistema (RAM, CPU, GPU)' },
    { id: 'cpu',     label: 'CPU' },
    { id: 'ram',     label: 'RAM' },
    { id: 'gpu',     label: 'GPU' },
    { id: 'spotify', label: 'Spotify' },
    { id: 'image',   label: 'Imagen' },
    { id: 'text',    label: 'Texto' },
    { id: 'video',   label: 'Video', fullOnly: true },
    // Widgets con datos que calcula la app (widgets.js) y llegan al ESP32 como texto 'etiqueta|valor'.
    { id: 'weather', label: 'Clima' },
    { id: 'disk',    label: 'Disco' },
    { id: 'net',     label: 'Red' },
  ];
  const INFO_TYPES = ['weather', 'disk', 'net'];
  const MAX_CITY = 30;

  const VIDEO_W = W / 2, VIDEO_H = H / 2;   // el video viaja a media resolución y el ESP32 lo duplica

  function defaultDisplay() {
    return {
      style: 'actual',
      colors: { ...STYLES[0].colors },
      screens: [
        { layout: 'full', slots: [{ type: 'clock' }] },
        { layout: 'full', slots: [{ type: 'system' }] },
        { layout: 'full', slots: [{ type: 'spotify' }] },
      ],
    };
  }

  const isHex = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
  const indexOf = (list, id) => Math.max(0, list.findIndex((x) => x.id === id));

  // Deja la config siempre válida (archivos viejos, valores a mano, etc.).
  function normalize(d) {
    const def = defaultDisplay();
    if (!d || typeof d !== 'object') return def;
    const style = STYLES[indexOf(STYLES, d.style)];
    const c = d.colors || {};
    const colors = {
      accent: isHex(c.accent) ? c.accent : style.colors.accent,
      bg: isHex(c.bg) ? c.bg : style.colors.bg,
      text: isHex(c.text) ? c.text : style.colors.text,
    };
    let screens = Array.isArray(d.screens) ? d.screens.slice(0, MAX_SCREENS) : def.screens;
    screens = screens.map((s) => {
      const layout = LAYOUTS[indexOf(LAYOUTS, s && s.layout)];
      const slots = layout.rects.map((_, i) => {
        const w = (s && Array.isArray(s.slots) && s.slots[i]) || {};
        const meta = WIDGETS[indexOf(WIDGETS, w.type)];
        const type = meta.fullOnly && layout.id !== 'full' ? 'none' : meta.id;
        const out = { type };
        if (type === 'text') out.text = String(w.text || '').slice(0, MAX_TEXT);
        if (type === 'weather') out.city = String(w.city || '').slice(0, MAX_CITY);
        if (type === 'disk' && typeof w.drive === 'string' && /^[A-Za-z]:$/.test(w.drive.trim())) out.drive = w.drive.trim().toUpperCase();
        if (type === 'image' && typeof w.image === 'string') out.image = w.image;
        if (type === 'video' && typeof w.video === 'string') out.video = w.video;
        return out;
      });
      return { layout: layout.id, slots };
    });
    if (!screens.length) screens = def.screens;
    return { style: style.id, colors, screens };
  }

  function slotRects(screen) {
    return LAYOUTS[indexOf(LAYOUTS, screen && screen.layout)].rects;
  }

  function hexTo565(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return ((r & 0xf8) << 8) | ((g & 0xfc) << 3) | (b >> 3);
  }
  const hex4 = (v) => v.toString(16).padStart(4, '0');

  // El firmware usa la fuente ASCII de Adafruit: sin tildes ni símbolos fuera de ASCII.
  function asciiText(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^\x20-\x7e]/g, '').slice(0, MAX_TEXT);
  }

  // Líneas de texto que describen estilo y pantallas (sin imágenes).
  function configLines(display) {
    const d = normalize(display);
    const lines = [
      `STY:${indexOf(STYLES, d.style)},${hex4(hexTo565(d.colors.accent))},${hex4(hexTo565(d.colors.bg))},${hex4(hexTo565(d.colors.text))}`,
      `SCN:${d.screens.length}`,
    ];
    d.screens.forEach((s, i) => {
      const types = [0, 1, 2].map((k) => indexOf(WIDGETS, s.slots[k] ? s.slots[k].type : 'none'));
      lines.push(`SCD:${i},${indexOf(LAYOUTS, s.layout)},${types.join(',')}`);
      s.slots.forEach((w, k) => { if (w.type === 'text') lines.push(`SCT:${i},${k},${asciiText(w.text)}`); });
    });
    return lines.map((l) => l + '\n');
  }

  // RGBA (de un canvas) -> RGB565 little-endian, lo que el ESP32 copia directo a su búfer.
  function rgbaTo565(rgba) {
    const out = new Uint8Array((rgba.length / 4) * 2);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += 2) {
      const v = ((rgba[i] & 0xf8) << 8) | ((rgba[i + 1] & 0xfc) << 3) | (rgba[i + 2] >> 3);
      out[j] = v & 255;
      out[j + 1] = v >> 8;
    }
    return out;
  }

  // Clave con la que la app y el visor identifican los datos de un widget (dos climas de ciudades distintas no se pisan).
  const widgetKey = (w) => (w.type === 'weather' ? 'weather:' + (w.city || '').trim().toLowerCase()
    : w.type === 'disk' ? 'disk:' + (w.drive || '').toLowerCase() : w.type);

  const hasType = (screen, type) => !!screen && screen.slots.some((w) => w.type === type);

  return {
    W, H, MAX_SCREENS, MAX_TEXT, MAX_CITY, INFO_TYPES, widgetKey, VIDEO_W, VIDEO_H, STYLES, LAYOUTS, WIDGETS,
    defaultDisplay, normalize, slotRects, configLines, rgbaTo565, hexTo565, asciiText, hasType,
  };
});
