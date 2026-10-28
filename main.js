const { app, BrowserWindow, ipcMain, shell, clipboard, Menu, Tray, safeStorage, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { exec, execFile } = require('child_process');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const { keyboard, Key } = require('@nut-tree-fork/nut-js');
const os = require('os');
const si = require('systeminformation');
const { SpotifyClient } = require('./spotify');
const spotifyOled = require('./spotify-oled');

// La app pasó a llamarse RHub: fija la carpeta de datos de siempre para no perder
// la config, los perfiles ni la sesión de Spotify al cambiar el productName.
app.setPath('userData', path.join(app.getPath('appData'), 'retro-deck'));
const SPOTIFY_ACTIONS = require('./spotify-actions');
const Display = require('./display');
keyboard.config.autoDelayMs = 15; // velocidad al "tipear" macros de texto

// =============================================================
// 1) VENTANA
// =============================================================
let mainWindow;
let tray = null;
let isQuitting = false; // solo true cuando de verdad se pide salir (menú de la bandeja)

// Manda un mensaje a la ventana SOLO si todavía existe — evita el
// "Object has been destroyed" que salta cuando algo (como el puerto
// serial cerrándose) intenta avisarle a la ventana después de que ya
// se cerró (por ejemplo, al salir de la app).
function safeSend(channel, ...args) {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

// --inicio-oculto es el argumento que le pasamos cuando se auto-inicia con
// Windows (ver app:setAutoLaunch más abajo) — arranca directo a la bandeja,
// sin mostrar la ventana ni robarle el foco a lo que ya estabas usando.
const startHidden = process.argv.includes('--inicio-oculto');

// Iconos (build/icon.png / icon.ico). En la app instalada NO están dentro del asar:
// build/ es la carpeta de recursos del empaquetador, así que se copian aparte con
// extraResources (ver package.json) y viven en la carpeta resources/.
function resolveIconPath(fileName) {
  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, fileName), path.join(__dirname, 'build', fileName)]
    : [path.join(__dirname, 'build', fileName)];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

// Ícono de la bandeja. Si no se encuentra ningún archivo se dibuja uno de emergencia
// (círculo blanco) para que la bandeja SIEMPRE exista: con la ventana escondida es
// la única forma de volver a abrir la app.
function getTrayIcon() {
  for (const name of ['icon.png', 'icon.ico']) {
    const p = resolveIconPath(name);
    if (!p) continue;
    const img = nativeImage.createFromPath(p);
    if (!img.isEmpty()) return img;
  }
  console.error('[tray] no se encontró build/icon.png ni icon.ico; usando un ícono de emergencia');
  const size = 32, buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inside = (x - 15.5) ** 2 + (y - 15.5) ** 2 <= 13 * 13;
      const o = (y * size + x) * 4;
      buf[o] = buf[o + 1] = buf[o + 2] = inside ? 255 : 0; // BGR
      buf[o + 3] = inside ? 255 : 0;                        // alfa
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 860,
    backgroundColor: '#0a0a0b',
    icon: resolveIconPath('icon.png') || undefined,
    autoHideMenuBar: true, // por si algún día se necesita, Alt la vuelve a mostrar
    show: !startHidden,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // por seguridad, script.js NO tiene Node directo
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile('index.html');
  mainWindow.webContents.once('did-finish-load', () => {
    startAutoConnect();
  });

  // Cerrar con la X no cierra la app de verdad — la manda a la bandeja.
  // Solo se cierra en serio si isQuitting está en true (viene del menú
  // "Salir" de la bandeja, o de un cierre real del sistema operativo).
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  tray = new Tray(getTrayIcon());
  tray.setToolTip('RHub');
  const menu = Menu.buildFromTemplate([
    { label: 'Abrir RHub', click: () => { mainWindow.show(); } },
    { type: 'separator' },
    { label: 'Salir', click: () => { isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
  tray.on('double-click', () => { mainWindow.show(); });
}

// Una sola instancia: si ya hay una abierta (aunque esté escondida en la bandeja),
// abrir el programa otra vez solo trae esa ventana al frente.
const gotSingleLock = app.requestSingleInstanceLock();
if (!gotSingleLock) app.quit();

app.on('second-instance', (_e, argv) => {
  if (argv.includes('--inicio-oculto')) return; // arranque automático de Windows: no abrir la ventana
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

// Quita del todo el menú File/Edit/View/Window/Help (autoHideMenuBar solo
// lo oculta, pero Alt lo sigue mostrando; esto lo elimina por completo).
Menu.setApplicationMenu(null);

app.whenReady().then(() => {
  if (!gotSingleLock) return; // esta es la segunda instancia: ya se está cerrando
  loadConfigFromDisk();
  initSpotify(); // antes que la ventana y la bandeja: si algo de eso falla, Spotify igual arranca
  createWindow();
  try {
    createTray();
  } catch (e) {
    console.error('[tray] no se pudo crear la bandeja:', e.message);
  }
});

app.on('before-quit', () => {
  isQuitting = true; // red de seguridad: cubre Cmd+Q en mac u otros cierres del SO
  if (spotify) spotify.stopPolling();
});

app.on('window-all-closed', () => {
  // Con el tray activo la ventana normalmente solo se "hide()", nunca se
  // destruye de verdad — esto solo corre si de verdad se cerró todo.
  stopAutoConnect();
  closeSerial();
  if (process.platform !== 'darwin') app.quit();
});

// --- Auto-inicio con Windows, configurable desde la UI ---
// En Windows, getLoginItemSettings() solo encuentra la entrada si se le pasan los
// MISMOS argumentos con los que se registró; sin ellos siempre decía "desactivado"
// y el interruptor se apagaba solo al volver a abrir Ajustes.
const AUTOLAUNCH_ARGS = ['--inicio-oculto']; // arranca a la bandeja, sin abrir ventana

ipcMain.handle('app:getAutoLaunch', () => {
  return app.getLoginItemSettings({ args: AUTOLAUNCH_ARGS }).openAtLogin;
});

ipcMain.handle('app:setAutoLaunch', (_e, enabled) => {
  app.setLoginItemSettings({
    openAtLogin: !!enabled,
    args: AUTOLAUNCH_ARGS,
  });
  return app.getLoginItemSettings({ args: AUTOLAUNCH_ARGS }).openAtLogin; // lo que quedó de verdad
});

// =============================================================
// 2) CONFIG EN DISCO (esto reemplaza el localStorage + exportar/importar)
// =============================================================
const CONFIG_PATH = path.join(app.getPath('userData'), 'config-deck.json');

let deckConfig = {
  profiles: [{ name: 'Perfil Principal', cols: 3, rows: 3, buttons: Array(9).fill({ type: 'none', label: '', value: null }) }],
  activeProfile: 0,
};

function loadConfigFromDisk() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      deckConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      console.log('[config] cargada desde', CONFIG_PATH);
    }
  } catch (e) {
    console.error('[config] error leyendo config, uso default:', e);
  }
}

function saveConfigToDisk(data) {
  deckConfig = data;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

ipcMain.handle('config:load', () => deckConfig);
ipcMain.handle('config:save', (_e, data) => {
  saveConfigToDisk(data);
  sendDisplayConfig();   // si cambió el estilo o las pantallas, el RHub se entera ya
  return true;
});

// =============================================================
// 2b) PANTALLAS PERSONALIZABLES — estilo, colores y widgets (display.js)
//     más las imágenes y el video, que van en trozos binarios (IMG:) con ACK.
// =============================================================
const displayConfig = () => Display.normalize(deckConfig.display);
const screenHasSpotify = (n) => Display.hasType(displayConfig().screens[n], 'spotify');
let lastDisplaySent = '';

function sendDisplayConfig(force = false) {
  if (!port || !port.isOpen) return;
  const out = Display.configLines(displayConfig()).join('');
  if (!force && out === lastDisplaySent) return;
  lastDisplaySent = out;
  port.write(out);
}

const IMG_CHUNK_PX = 1536;           // 3 KB por trozo: cabe en el búfer serie de 4 KB del ESP32
const IMG_ACK_TIMEOUT_MS = 1000;
let ackWaiters = [];
let imgQueue = Promise.resolve();

function waitAck() {
  return new Promise((resolve) => {
    const waiter = (ok) => { clearTimeout(timer); resolve(ok); };
    const timer = setTimeout(() => { ackWaiters = ackWaiters.filter((w) => w !== waiter); resolve(false); }, IMG_ACK_TIMEOUT_MS);
    ackWaiters.push(waiter);
  });
}

// Manda un bloque de píxeles RGB565 (little-endian) al búfer de imagen del RHub.
// Un trozo a la vez y esperando el ACK, para no desbordar el búfer serie del ESP32.
function sendImage({ x, y, w, h, scale }, bytes) {
  const job = imgQueue.then(async () => {
    if (!port || !port.isOpen || !bytes || bytes.length !== w * h * 2) return false;
    const data = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length);
    for (let start = 0; start < w * h; start += IMG_CHUNK_PX) {
      const count = Math.min(IMG_CHUNK_PX, w * h - start);
      if (!port || !port.isOpen) return false;
      port.write(Buffer.concat([
        Buffer.from(`IMG:${x},${y},${w},${h},${scale},${start},${count}\n`),
        data.subarray(start * 2, (start + count) * 2),
      ]));
      if (!(await waitAck())) return false;
    }
    return true;
  });
  imgQueue = job.catch(() => false);
  return job;
}
ipcMain.handle('display:image', (_e, rect, bytes) => sendImage(rect, bytes));

// =============================================================
// 3) PUERTO SERIAL — un solo puerto para todo el RHub
//    (botones de la matriz y pantalla TFT)
// =============================================================
let port = null;
let parser = null;

ipcMain.handle('serial:list', async () => {
  const ports = await SerialPort.list();
  return ports.map((p) => ({ path: p.path, manufacturer: p.manufacturer || '' }));
});

ipcMain.handle('serial:connect', async (_e, pathStr) => {
  openSerial(pathStr);
  return true;
});

ipcMain.handle('serial:disconnect', () => {
  closeSerial();
  return true;
});

function openSerial(pathStr) {
  closeSerial();
  port = new SerialPort({ path: pathStr, baudRate: 115200 });
  parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

  port.on('open', () => {
    safeSend('serial:status', true);
    sendLog(`Conectado a ${pathStr}`);
    startSystemStats();
    onOledConnected();
    setTimeout(() => sendDisplayConfig(true), 300);   // estilo y pantallas del usuario
  });
  port.on('close', () => {
    safeSend('serial:status', false);
    sendLog(`Desconectado de ${pathStr}`);
    stopSystemStats();
    onOledDisconnected();
  });
  port.on('error', (err) => {
    console.error('[serial] error:', err.message);
    safeSend('serial:status', false);
    sendLog(`Error de puerto (${pathStr}): ${err.message}`);
  });

  parser.on('data', (line) => {
    line = line.trim();

    if (line === 'ACK') {             // el ESP32 terminó de recibir un trozo de imagen/video
      const w = ackWaiters.shift();
      if (w) w(true);
      return;
    }

    if (line.startsWith('BTN:')) {
      const idx = parseInt(line.slice(4), 10);
      if (Number.isNaN(idx)) return;
      // Avisa a la UI para la animación del botón
      safeSend('serial:btn', idx);
      // Ejecuta la acción real en el sistema operativo
      runRealAction(idx);
      return;
    }

    if (line.startsWith('SCR:')) {
      const n = parseInt(line.slice(4), 10);
      if (!Number.isNaN(n)) {
        safeSend('screen:changed', n);
        onOledScreen(n); // Spotify: entrar/salir de "Ahora suena" en la pantalla física
      }
      return;
    }
  });
}

function closeSerial() {
  if (port && port.isOpen) port.close();
  port = null;
  parser = null;
  stopSystemStats();
  lastDisplaySent = '';
  ackWaiters.splice(0).forEach((w) => w(false));
}

// =============================================================
// 3c) ESTADÍSTICAS DEL SISTEMA — RAM/CPU/GPU/hora, para las
//     pantallas de la TFT. Van PC -> ESP32 (al revés que BTN).
// =============================================================
let lastCpuTemp = null;
let lastGpuTemp = null;

// La temperatura no cambia rápido y consultarla es "caro" (llama a
// nvidia-smi / sensores del SO por debajo) — la refrescamos cada 4s
// en vez de cada segundo, y reusamos el último valor mientras tanto.
async function refreshTemps() {
  try {
    const cpuData = await si.cpuTemperature();
    lastCpuTemp = (cpuData && typeof cpuData.main === 'number' && cpuData.main > 0) ? Math.round(cpuData.main) : null;
  } catch (e) {
    lastCpuTemp = null;
  }
  try {
    const gfx = await si.graphics();
    const withTemp = gfx.controllers.find(c => typeof c.temperatureGpu === 'number' && c.temperatureGpu > 0);
    lastGpuTemp = withTemp ? Math.round(withTemp.temperatureGpu) : null;
  } catch (e) {
    lastGpuTemp = null;
  }
}

function sendSystemStats() {
  if (!port || !port.isOpen) return;

  const totalGB = os.totalmem() / (1024 ** 3);
  const freeGB = os.freemem() / (1024 ** 3);
  const usedGB = (totalGB - freeGB).toFixed(1);
  const totalGBStr = totalGB.toFixed(1);

  const cpuTemp = lastCpuTemp !== null ? lastCpuTemp : -1;
  const gpuTemp = lastGpuTemp !== null ? lastGpuTemp : -1;

  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();

  const line = `SYS:${usedGB},${totalGBStr},${cpuTemp},${gpuTemp},${hh}:${mm},${dd}/${mo}/${yyyy}\n`;
  port.write(line);

  // Mismos datos, hacia la UI — así el visor en pantalla puede mostrar
  // lo mismo que la pantalla física sin tener que ir y volver por el ESP32.
  safeSend('sys:stats', {
    ramUsedGB: usedGB, ramTotalGB: totalGBStr,
    cpuTemp, gpuTemp,
    time: `${hh}:${mm}`, date: `${dd}/${mo}/${yyyy}`,
  });
}

// --- Botón "Cambiar pantalla" de la app (y la acción "Cambiar pantalla" de los botones) ---
function sendNextScreen() {
  if (port && port.isOpen) {
    port.write('NEXT\n');
    return true;
  }
  return false; // no conectado — antes esto devolvía true igual, por error
}
ipcMain.handle('screen:next', () => sendNextScreen());

let statsInterval = null;
let tempRefreshInterval = null;

function startSystemStats() {
  refreshTemps(); // primera lectura ya
  if (tempRefreshInterval) clearInterval(tempRefreshInterval);
  tempRefreshInterval = setInterval(refreshTemps, 4000);

  if (statsInterval) clearInterval(statsInterval);
  statsInterval = setInterval(sendSystemStats, 1000);
}

function stopSystemStats() {
  if (statsInterval) clearInterval(statsInterval);
  if (tempRefreshInterval) clearInterval(tempRefreshInterval);
  statsInterval = null;
  tempRefreshInterval = null;
}

function sendLog(msg) {
  console.log('[auto-connect]', msg);
  safeSend('serial:log', msg);
}

// --- Auto-conectar: busca el ESP32 solo, sin que haya que darle a "Conectar" ---
let autoConnectTimer = null;

async function tryAutoConnect() {
  if (port && port.isOpen) return; // ya conectado
  try {
    const ports = await SerialPort.list();
    if (ports.length === 0) {
      sendLog('Auto-conectar: no se detectó ningún puerto serie todavía.');
      return;
    }
    // Prioridad: 1) coincide por fabricante conocido, 2) si solo hay un
    // puerto disponible úsalo directo (el ESP32-C3 con USB nativo a veces
    // no reporta fabricante), 3) si hay varios y ninguno matchea, no
    // adivines — pide que se conecte manualmente para no tomar el puerto
    // equivocado.
    let chosen = ports.find((p) => /usb|cdc|cp210|ch340|espressif/i.test(p.manufacturer || ''));
    if (!chosen && ports.length === 1) chosen = ports[0];

    if (chosen) {
      sendLog(`Auto-conectar: probando ${chosen.path}...`);
      openSerial(chosen.path);
    } else {
      sendLog(`Auto-conectar: ${ports.length} puertos detectados, ninguno identificado como ESP32 `
        + `(${ports.map(p => `${p.path}${p.manufacturer ? ' - ' + p.manufacturer : ''}`).join(', ')}). `
        + `Conéctalo manualmente con el botón "Conectar".`);
    }
  } catch (e) {
    sendLog('Auto-conectar: error listando puertos - ' + e.message);
  }
}

function startAutoConnect() {
  tryAutoConnect(); // intenta de inmediato
  if (autoConnectTimer) clearInterval(autoConnectTimer);
  // sigue intentando cada 3s (por si el ESP32 se conecta después, o se
  // desenchufa y se vuelve a enchufar)
  autoConnectTimer = setInterval(tryAutoConnect, 3000);
}

function stopAutoConnect() {
  if (autoConnectTimer) clearInterval(autoConnectTimer);
  autoConnectTimer = null;
}

// =============================================================
// 3d) SPOTIFY — cuenta, acciones de los botones y pantalla "Ahora suena"
//     de la TFT (PC -> ESP32: SPT:, SPTT:, SPTA:, SPTK:, SPTR:, SPTC).
//     La API, los tokens y las acciones viven en spotify.js; aquí solo se
//     conecta con la ventana (IPC), los botones y el puerto serie.
// =============================================================
const OLED_RESYNC_MS = 5000;        // cada cuánto se re-sincroniza el progreso (el ESP32 lo interpola solo)
const OLED_ENTER_QUIET_MS = 450;    // el firmware está animando el deslizamiento y no lee serial
const ART_CACHE_MAX = 30;

let spotify = null;
let oledScreen = 0;                 // pantalla que tiene la TFT física ahora (según SCR:n)
let uiScreen = 0;                   // pantalla que se ve en el visor de la ventana
let oledSent = newOledSent();
let oledQuietUntil = 0;
let oledEnterTimer = null;
let oledTicker = null;
let artSendToken = 0;
const artCache = new Map();         // url -> { lines, color } | null (falló)
const artInFlight = new Map();

function newOledSent() {
  return { key: null, title: null, artist: null, artUrl: undefined, stateAt: 0, progAt: 0, playing: false };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let spotifyInitError = null;

function initSpotify() {
  if (spotify) return;
  try {
    const client = new SpotifyClient({
      userDataPath: app.getPath('userData'),
      safeStorage,
      openExternal: (url) => shell.openExternal(url),
    });
    client.on('log', (m) => sendLog(m));
    client.on('status', (st) => safeSend('spotify:status', st));
    client.on('state', (snap) => {
      const cached = snap.artUrl ? artCache.get(snap.artUrl) : null;
      safeSend('spotify:state', cached ? { ...snap, artColor: cached.color } : snap);
      prepareArt(snap);
      pushSpotifyToOled(snap);
    });
    spotify = client;
    spotifyInitError = null;
    client.init();
  } catch (e) {
    console.error('[spotify] no se pudo iniciar:', e);
    spotifyInitError = e && e.message ? e.message : String(e);
  }
}

// Si el arranque falló, se reintenta al usarlo y el mensaje dice la causa real.
function spotifyNotReady() {
  return { ok: false, error: `Spotify no pudo iniciar${spotifyInitError ? ': ' + spotifyInitError : '.'} Revisa la consola de la app.` };
}

// Ejecuta una acción de la biblioteca (botón físico, botón de la app o paso de una cadena).
async function runSpotifyAction(id) {
  if (!spotify) initSpotify();
  if (!spotify) return spotifyNotReady();
  const r = await spotify.runAction(id);
  if (r.ok) {
    if (r.message) safeSend('spotify:notice', { message: r.message, type: 'success' });
    if (VOLUME_ACTIONS.includes(id)) sendVolumeToOled();
  } else {
    sendLog(`Spotify: ${r.error}`);
    safeSend('spotify:notice', { message: r.error, type: 'error' });
  }
  return r;
}

ipcMain.handle('spotify:getStatus', () => { if (!spotify) initSpotify(); return spotify ? spotify.getStatus() : null; });
ipcMain.handle('spotify:getState', () => {
  if (!spotify) initSpotify();
  if (!spotify) return null;
  const snap = spotify.getSnapshot();
  const cached = snap.artUrl ? artCache.get(snap.artUrl) : null;
  return cached ? { ...snap, artColor: cached.color } : snap;
});
ipcMain.handle('spotify:setClientId', (_e, id) => { if (!spotify) initSpotify(); return spotify ? spotify.setClientId(id) : spotifyNotReady(); });
ipcMain.handle('spotify:connect', () => { if (!spotify) initSpotify(); return spotify ? spotify.connect() : spotifyNotReady(); });
ipcMain.handle('spotify:disconnect', () => (spotify ? spotify.disconnect() : { ok: true }));
ipcMain.handle('spotify:runAction', (_e, id) => runSpotifyAction(id));
ipcMain.on('spotify:viewScreen', (_e, n) => {
  uiScreen = Number(n) || 0;
  updateSpotifyView();
});

// El polling rápido solo hace falta si "Ahora suena" está a la vista (ventana u OLED).
function updateSpotifyView() {
  if (!spotify) return;
  spotify.setViewActive(screenHasSpotify(uiScreen) || (!!port && port.isOpen && screenHasSpotify(oledScreen)));
}

// Barra de volumen en el OLED (la muestra el firmware unos segundos, en cualquier pantalla).
function sendVolumeToOled() {
  const v = spotify && spotify.getSnapshot().volume;
  if (typeof v !== 'number' || !port || !port.isOpen) return;
  port.write(`SPV:${Math.max(0, Math.min(100, Math.round(v)))}\n`);
}

/* ------------------------------- portada ------------------------------- */
// Baja la imagen, la deja en 64x64 y la convierte a RGB565 (SPTK + filas SPTR). Cachea por URL.
async function getArt(url) {
  if (artCache.has(url)) return artCache.get(url);
  if (artInFlight.has(url)) return artInFlight.get(url);
  const job = (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const img = nativeImage.createFromBuffer(Buffer.from(await res.arrayBuffer()));
      if (img.isEmpty()) throw new Error('imagen vacía');
      const bgra = img.resize({ width: spotifyOled.ART_SIZE, height: spotifyOled.ART_SIZE, quality: 'best' }).toBitmap();
      if (bgra.length < spotifyOled.ART_SIZE * spotifyOled.ART_SIZE * 4) throw new Error('tamaño inesperado');
      const art = spotifyOled.bgraToArt(bgra);
      artCache.set(url, art);
      if (artCache.size > ART_CACHE_MAX) artCache.delete(artCache.keys().next().value);
      return art;
    } catch (e) {
      sendLog(`Spotify: no se pudo procesar la portada (${e.message}).`);
      artCache.set(url, null);
      setTimeout(() => { if (artCache.get(url) === null) artCache.delete(url); }, 60000); // reintenta luego
      return null;
    } finally {
      artInFlight.delete(url);
    }
  })();
  artInFlight.set(url, job);
  return job;
}

// Para la ventana: la 1.ª vez que aparece una portada, avisa su color promedio.
function prepareArt(snap) {
  const url = snap && snap.artUrl;
  if (!url || artCache.has(url) || artInFlight.has(url)) return;
  getArt(url).then((art) => { if (art) safeSend('spotify:art', { url, color: art.color }); });
}

/* --------------------------- OLED: Ahora suena --------------------------- */
function oledIsOnSpotify() {
  return !!port && port.isOpen && screenHasSpotify(oledScreen);
}

function pushSpotifyToOled(snap, force = false) {
  if (!snap || !oledIsOnSpotify()) return;
  const now = Date.now();
  if (!force && now < oledQuietUntil) return;

  const p = spotifyOled.playbackCode(snap);
  const active = p <= 1;
  const flags = active ? spotifyOled.flagsBits(snap) : 0;
  const dur = active ? Math.round(snap.durationMs || 0) : 0;
  const prog = active ? Math.round(snap.progressMs || 0) : 0;
  const key = `${p}|${flags}|${dur}`;
  const [titleLine, artistLine] = spotifyOled.buildTextLines(snap);

  const textChanged = force || titleLine !== oledSent.title || artistLine !== oledSent.artist;
  const predicted = oledSent.playing ? oledSent.progAt + (now - oledSent.stateAt) : oledSent.progAt;
  const jumped = active && Math.abs(prog - predicted) > 1500;          // seek / salto
  const stateDue = force || textChanged || jumped || key !== oledSent.key || now - oledSent.stateAt >= OLED_RESYNC_MS;

  let out = '';
  if (stateDue) {
    out += spotifyOled.buildStateLine(snap);
    Object.assign(oledSent, { key, stateAt: now, progAt: prog, playing: p === 1 });
  }
  if (textChanged) {
    out += titleLine + artistLine;
    oledSent.title = titleLine;
    oledSent.artist = artistLine;
  }
  if (out) port.write(out);

  const url = active ? (snap.artUrl || null) : null;
  if (force || url !== oledSent.artUrl) {
    oledSent.artUrl = url;
    sendArtToOled(url);
  }
}

// Las 64 filas de la portada son ~17 KB: se mandan en tandas (~2 KB) para no desbordar
// el buffer de recepción del ESP32 (4 KB) mientras redibuja la pantalla.
async function sendArtToOled(url) {
  const token = ++artSendToken;
  const art = url ? await getArt(url) : null;
  if (token !== artSendToken || !oledIsOnSpotify()) return;
  if (!art) { port.write(spotifyOled.CLEAR_ART_LINE); return; }
  for (let i = 0; i < art.lines.length; i += 8) {
    if (token !== artSendToken || !oledIsOnSpotify()) return;
    port.write(art.lines.slice(i, i + 8).join(''));
    await sleep(30);
  }
}

// El ESP32 avisó (SCR:n) que cambió de pantalla.
function onOledScreen(n) {
  const wasSpotify = screenHasSpotify(oledScreen);
  oledScreen = n;
  updateSpotifyView();
  clearTimeout(oledEnterTimer);
  if (screenHasSpotify(n) && !wasSpotify) {
    oledSent = newOledSent();
    oledQuietUntil = Date.now() + OLED_ENTER_QUIET_MS;
    oledEnterTimer = setTimeout(() => {
      if (!spotify) return;
      spotify.refreshState();                                   // estado fresco al abrir la pantalla
      pushSpotifyToOled(spotify.getSnapshot(), true);
    }, OLED_ENTER_QUIET_MS);
  } else if (!screenHasSpotify(n)) {
    artSendToken++;                                             // corta una portada a medio mandar
  }
}

function onOledConnected() {
  oledScreen = 0;                     // al conectar el ESP32 arranca en la hora
  oledSent = newOledSent();
  updateSpotifyView();
  if (oledTicker) clearInterval(oledTicker);
  // Mantiene el progreso al día (re-sync cada ~5 s) aunque Spotify no mande cambios.
  oledTicker = setInterval(() => { if (spotify) pushSpotifyToOled(spotify.getSnapshot()); }, 1000);
}

function onOledDisconnected() {
  if (oledTicker) clearInterval(oledTicker);
  oledTicker = null;
  clearTimeout(oledEnterTimer);
  artSendToken++;
  oledScreen = 0;
  oledSent = newOledSent();
  updateSpotifyView();
}

// =============================================================
// 4) EJECUCIÓN REAL DE ACCIONES (esto reemplaza los toasts vacíos)
// =============================================================
const KEY_MAP = {
  Espacio: Key.Space, Enter: Key.Enter, Ctrl: Key.LeftControl, Alt: Key.LeftAlt,
  Shift: Key.LeftShift, Win: Key.LeftSuper, Escape: Key.Escape, Tab: Key.Tab,
  Backspace: Key.Backspace, Delete: Key.Delete,
  ArrowUp: Key.Up, ArrowDown: Key.Down, ArrowLeft: Key.Left, ArrowRight: Key.Right,
  F1: Key.F1, F2: Key.F2, F3: Key.F3, F4: Key.F4, F5: Key.F5, F6: Key.F6,
  F7: Key.F7, F8: Key.F8, F9: Key.F9, F10: Key.F10, F11: Key.F11, F12: Key.F12,
};

function resolveKey(name) {
  if (!name) return null;
  if (KEY_MAP[name]) return KEY_MAP[name];
  if (name.length === 1 && Key[name.toUpperCase()]) return Key[name.toUpperCase()];
  return null;
}

const MEDIA_KEY_MAP = {
  play_pause: Key.AudioPlay, next: Key.AudioNext, prev: Key.AudioPrev,
  stop: Key.AudioStop, vol_up: Key.AudioVolUp, vol_down: Key.AudioVolDown, mute: Key.AudioMute,
};

// Escribe un texto de varias líneas: cada salto de línea del texto se convierte en
// un Enter de verdad (keyboard.type no maneja bien el "\n"). Un Enter al final del
// texto también se manda, así puedes terminar con una línea vacía para enviar.
async function typeText(text) {
  const lines = String(text || '').split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]) await keyboard.type(lines[i]);
    if (i < lines.length - 1) {
      await keyboard.pressKey(Key.Enter);
      await keyboard.releaseKey(Key.Enter);
      await new Promise((r) => setTimeout(r, 40)); // deja que la app receptora procese el Enter
    }
  }
}

const VOLUME_ACTIONS = ['vol_up', 'vol_down'];
// Acciones de Spotify que NO muestran su nombre en el OLED al presionarlas (el cambio
// se ve solo en la pantalla "Ahora suena", o en la barra de volumen). Para que otra
// acción tampoco lo muestre, agrega su id aquí (ids en spotify-actions.js).
const SILENT_SPOTIFY_ACTIONS = ['play_pause', 'next', 'prev', ...VOLUME_ACTIONS];

async function runRealAction(idx) {
  const profile = deckConfig.profiles[deckConfig.activeProfile];
  const btn = profile && profile.buttons[idx];
  if (!btn || btn.type === 'none') return;

  // Le dice al ESP32 qué acción es esta (para que el OLED muestre el
  // nombre en vez de solo el número de botón). Máximo 30 caracteres,
  // sin salto de línea — el firmware corta a 32 igual, esto es solo prolijo.
  // La fuente del OLED solo tiene ASCII: toAscii quita tildes/ñ/emojis.
  if (port && port.isOpen) {
    let name = btn.label;
    if (!name && btn.type === 'spotify') {
      const meta = SPOTIFY_ACTIONS.find((a) => a.id === (btn.value && btn.value.action));
      name = meta ? meta.label : 'Spotify';
    }
    const label = spotifyOled.toAscii(name || '', 30) || `Boton ${idx + 1}`;
    // "ACT:" vacío = el firmware no muestra el nombre (pausa, anterior, siguiente y
    // volumen; este último muestra su barra con SPV:, más abajo).
    const silent = btn.type === 'screen'   // el deslizamiento del OLED ya es el aviso
      || (btn.type === 'spotify' && SILENT_SPOTIFY_ACTIONS.includes(btn.value && btn.value.action));
    port.write(silent ? 'ACT:\n' : `ACT:${label}\n`);
  }

  await executeAction(btn);
}

async function executeAction(btn) {
  if (!btn || btn.type === 'none') return;

  try {
    if (btn.type === 'key') {
      const k = resolveKey(btn.value);
      if (k) { await keyboard.pressKey(k); await keyboard.releaseKey(k); }
    } else if (btn.type === 'combo') {
      const mods = (btn.value?.mods || []).map(resolveKey).filter(Boolean);
      const key = resolveKey(btn.value?.key);
      const combo = key ? [...mods, key] : mods;
      if (combo.length) {
        await keyboard.pressKey(...combo);
        await keyboard.releaseKey(...combo);
      }
    } else if (btn.type === 'macro') {
      await typeText(btn.value?.text);
    } else if (btn.type === 'media') {
      const k = MEDIA_KEY_MAP[btn.value?.key];
      if (k) { await keyboard.pressKey(k); await keyboard.releaseKey(k); }
    } else if (btn.type === 'app') {
      openAppOrUrl(btn.value?.target);
    } else if (btn.type === 'twitch' && btn.value?.action !== 'clip') {
      clipboard.writeText(btn.value?.action === 'msg_discord' ? '!discord' : '!redes');
    } else if (btn.type === 'profile') {
      const n = deckConfig.profiles.length;
      deckConfig.activeProfile = (btn.value?.target || 'next') === 'next'
        ? (deckConfig.activeProfile + 1) % n
        : (deckConfig.activeProfile - 1 + n) % n;
      saveConfigToDisk(deckConfig);
      safeSend('config:changed', deckConfig);
    } else if (btn.type === 'screen') {
      sendNextScreen();
    } else if (btn.type === 'steam') {
      await switchSteamAccount(btn.value?.accountName);
    } else if (btn.type === 'spotify') {
      await runSpotifyAction(btn.value && btn.value.action);
    } else if (btn.type === 'chain') {
      for (const step of btn.value?.steps || []) {
        if (step.type === 'url') {
          openAppOrUrl(step.val);
        } else if (step.type === 'delay') {
          await new Promise((r) => setTimeout(r, parseInt(step.val, 10) || 0));
        } else if (step.type === 'text') {
          await typeText(step.val);
        } else if (step.type === 'key') {
          const k = resolveKey(step.val);
          if (k) { await keyboard.pressKey(k); await keyboard.releaseKey(k); }
        } else if (step.type === 'combo') {
          const mods = (step.val?.mods || []).map(resolveKey).filter(Boolean);
          const key = resolveKey(step.val?.key);
          const combo = key ? [...mods, key] : mods;
          if (combo.length) { await keyboard.pressKey(...combo); await keyboard.releaseKey(...combo); }
        } else if (step.type === 'media') {
          const k = MEDIA_KEY_MAP[step.val];
          if (k) { await keyboard.pressKey(k); await keyboard.releaseKey(k); }
        } else if (step.type === 'spotify') {
          await runSpotifyAction(step.val);
        }
      }
    }
    // 'sound', 'obs' y el clip de 'twitch' se siguen manejando en script.js
    // (Audio del navegador y WebSocket de OBS funcionan igual dentro de Electron)
  } catch (err) {
    console.error('[action] error ejecutando', btn.type, err);
  }
}

function openAppOrUrl(target) {
  if (!target) return;
  const t = target.trim();
  if (t.startsWith('http://') || t.startsWith('https://') || /^[a-z]+:/i.test(t)) {
    shell.openExternal(t);
  } else if (fs.existsSync(t)) {
    shell.openPath(t);
  } else {
    shell.openExternal(t);
  }
}

ipcMain.handle('action:open-app', (_e, target) => {
  openAppOrUrl(target);
  return true;
});

// Para cuando el usuario hace clic en un botón desde la UI (prueba manual),
// no solo cuando lo presiona el ESP32 físico.
ipcMain.handle('action:key', async (_e, btn) => {
  await executeAction(btn);
  return true;
});

// =============================================================
// 5) CAMBIAR DE CUENTA DE STEAM (solo Windows)
// =============================================================
// Cómo funciona: Steam guarda en el registro de Windows cuál es la
// cuenta que debe iniciar sesión automáticamente al abrir (AutoLoginUser).
// Cerramos Steam, cambiamos ese valor a la cuenta elegida, y lo volvemos
// a abrir. Solo evita la pantalla de contraseña si esa cuenta ya tenía
// activado "Recordar mi contraseña" alguna vez en ese Steam — si no,
// Steam va a pedir la contraseña igual, solo que con el usuario ya
// puesto. Esto es una limitación de Steam mismo, no de RHub.

function execAsync(cmd) {
  return new Promise((resolve) => {
    exec(cmd, { windowsHide: true }, (err, stdout) => resolve(err ? null : stdout));
  });
}

async function getSteamPath() {
  const out = await execAsync('reg query "HKCU\\Software\\Valve\\Steam" /v SteamPath');
  const match = out && out.match(/SteamPath\s+REG_SZ\s+(.+)/i);
  if (match) return match[1].trim().replace(/\//g, '\\');
  // Rutas por defecto si no se encontró en el registro
  const fallbacks = ['C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam'];
  return fallbacks.find((p) => fs.existsSync(p)) || null;
}

function parseLoginUsersVdf(content) {
  const accounts = [];
  const blockRegex = /"(\d{17})"\s*\{([^}]*)\}/g;
  let m;
  while ((m = blockRegex.exec(content))) {
    const body = m[2];
    const field = (name) => {
      const mm = body.match(new RegExp(`"${name}"\\s*"([^"]*)"`, 'i'));
      return mm ? mm[1] : '';
    };
    const accountName = field('AccountName');
    if (!accountName) continue;
    accounts.push({
      steamId: m[1],
      accountName,
      personaName: field('PersonaName') || accountName,
      rememberPassword: field('RememberPassword') === '1',
    });
  }
  return accounts;
}

ipcMain.handle('steam:list-accounts', async () => {
  if (process.platform !== 'win32') return { ok: false, error: 'El cambio de cuenta de Steam solo funciona en Windows.' };
  const steamPath = await getSteamPath();
  if (!steamPath) return { ok: false, error: 'No se encontró la instalación de Steam.' };
  const vdfPath = path.join(steamPath, 'config', 'loginusers.vdf');
  if (!fs.existsSync(vdfPath)) return { ok: false, error: 'No se encontraron cuentas guardadas de Steam.' };
  try {
    const content = fs.readFileSync(vdfPath, 'utf-8');
    const accounts = parseLoginUsersVdf(content);
    return { ok: true, accounts };
  } catch (e) {
    return { ok: false, error: 'No se pudo leer la lista de cuentas: ' + e.message };
  }
});

async function switchSteamAccount(accountName) {
  if (!accountName || process.platform !== 'win32') return;
  const steamPath = await getSteamPath();
  if (!steamPath) { sendLog('Steam: no se encontró la instalación.'); return; }

  await execAsync('taskkill /F /IM steam.exe');
  await new Promise((r) => setTimeout(r, 1500)); // darle tiempo a cerrar del todo

  await execAsync(`reg add "HKCU\\Software\\Valve\\Steam" /v AutoLoginUser /t REG_SZ /d "${accountName}" /f`);
  await execAsync('reg add "HKCU\\Software\\Valve\\Steam" /v RememberPassword /t REG_DWORD /d 1 /f');

  const steamExe = path.join(steamPath, 'steam.exe');
  execFile(steamExe, [], { detached: true });
  sendLog(`Steam: cambiando a la cuenta "${accountName}"...`);
}