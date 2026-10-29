'use strict';

const STORAGE_KEY = 'consoleDeck_v4.3';

// Cuándo != null, el próximo keydown se usa para capturar una tecla/combo
// dentro de un paso de la cadena de acciones, en vez del capturador
// principal de tecla/combo del panel de configuración.
let chainCaptureTarget = null; // { index, mode: 'key' | 'combo' }

/* -------- Iconos SVG propios (uno por tipo de acción, sin emojis) -------- */
const ICON_PATHS = {
  key:     '<circle cx="7" cy="14" r="3.4"/><path d="M9.4 11.6 19 2M15 6l2.5 2.5M12 9l2 2"/>',
  combo:   '<rect x="2" y="7" width="7" height="7" rx="1.5"/><rect x="15" y="7" width="7" height="7" rx="1.5"/><path d="M11 10.5h2M12 9.5v2"/>',
  obs:     '<rect x="2" y="6" width="13" height="12" rx="2"/><path d="M15 10l6-3.5v11L15 14"/>',
  steam:   '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.6"/><path d="M9.5 12h-6M17 7l-4.2 3.3"/>',
  sound:   '<path d="M3 9v6h4l5 4V5L7 9H3z"/><path d="M16 9a5 5 0 0 1 0 6M19 6.5a9 9 0 0 1 0 11"/>',
  profile: '<path d="M12 3 3 7.5 12 12l9-4.5L12 3z"/><path d="M3 13.5 12 18l9-4.5"/>',
  screen:  '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  chain:   '<circle cx="5" cy="5" r="2.1"/><circle cx="12" cy="12" r="2.1"/><circle cx="19" cy="19" r="2.1"/><path d="M7 6.5 10 10.5M14 13.5 17 17.5"/>',
  twitch:  '<circle cx="12" cy="12" r="2.3"/><path d="M7.8 8.8a6 6 0 0 0 0 8.4M16.2 8.8a6 6 0 0 1 0 8.4M4.5 5.5a10.5 10.5 0 0 0 0 13M19.5 5.5a10.5 10.5 0 0 1 0 13"/>',
  media:   '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  app:     '<path d="M14 4h6v6M20 4 10 14M8 6H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3"/>',
  macro:   '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M9 9h.01M12 9h.01M15 9h.01M18 9h.01M6 13h8"/>',
  none:    '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  check:   '<path d="M20 6 9 17l-5-5"/>',
  alert:   '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>',
  /* -- íconos de apps reconocidas (para la acción "Abrir App / URL") -- */
  discord:   '<rect x="3" y="9" width="18" height="9" rx="4"/><path d="M7 9V7a5 5 0 0 1 10 0v2"/><circle cx="9" cy="13.5" r="1.2"/><circle cx="15" cy="13.5" r="1.2"/>',
  spotify:   '<path d="M5 10a11 8 0 0 1 14 0M6.5 13.3a8.5 6 0 0 1 11 0M8 16.3a6 4 0 0 1 8 0"/>',
  steam:     '<rect x="4" y="4" width="10" height="10" rx="2.5"/><rect x="10" y="10" width="10" height="10" rx="2.5"/>',
  youtube:   '<rect x="2" y="5" width="20" height="14" rx="4"/><path d="M10 9l6 3-6 3V9z"/>',
  browser:   '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a13 13 0 0 1 0 18M12 3a13 13 0 0 0 0 18"/>',
  vscode:    '<path d="M8 6 3 12l5 6M16 6l5 6-5 6M14 4l-4 16"/>',
  github:    '<circle cx="6" cy="6" r="2.2"/><circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="12" r="2.2"/><path d="M6 8.2V15.8M8 6h4a4 4 0 0 1 4 4"/>',
  minecraft: '<path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>',
  terminal:  '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 9l4 3-4 3M13 15h5"/>',
  calc:      '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 7h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01"/>',
  notion:    '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  slack:     '<rect x="3" y="4" width="8" height="8" rx="2"/><rect x="13" y="4" width="8" height="8" rx="2"/><rect x="3" y="14" width="8" height="8" rx="2"/><rect x="13" y="14" width="8" height="8" rx="2"/>',
  videocall: '<rect x="2" y="6" width="13" height="12" rx="2"/><path d="M15 10l6-3.5v11L15 14"/>',
  chat:      '<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.3 0-2.5-.3-3.6-.9L3 20l1-5.7A8.5 8.5 0 1 1 21 11.5z"/>',
  /* -- Spotify: íconos de las acciones (algunos cambian según el estado) -- */
  sp_play:      '<path d="M7 4.5v15l12-7.5z"/>',
  sp_pause:     '<rect x="6" y="4.5" width="4.2" height="15" rx="1.2"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.2"/>',
  sp_next:      '<path d="M5 5v14l10-7z"/><path d="M19 5v14"/>',
  sp_prev:      '<path d="M19 5v14L9 12z"/><path d="M5 5v14"/>',
  sp_heart:     '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  sp_heartFill: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  sp_shuffle:   '<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
  sp_repeat:    '<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  sp_repeatOne: '<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><path d="M11 10l1.4-.9V15"/>',
  sp_volUp:     '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>',
  sp_volDown:   '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>',
  sp_fwd10:     '<path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/><path d="M9.4 10.3 10.8 9.5V15M13.2 9.5h2.6V15h-2.6z"/>',
  sp_back10:    '<path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/><path d="M9.4 10.3 10.8 9.5V15M13.2 9.5h2.6V15h-2.6z"/>'
};
/* Íconos que se dibujan rellenos (el resto es solo contorno) */
const FILLED_ICONS = new Set(['sp_play', 'sp_pause', 'sp_next', 'sp_prev', 'sp_heartFill']);
/* Detección de la app por palabras clave presentes en la ruta/URL configurada */
const APP_ICON_RULES = [
  { key: 'discord',   words: ['discord'] },
  { key: 'spotify',   words: ['spotify'] },
  { key: 'steam',     words: ['steam'] },
  { key: 'youtube',   words: ['youtube', 'youtu.be'] },
  { key: 'minecraft', words: ['minecraft'] },
  { key: 'github',    words: ['github'] },
  { key: 'vscode',    words: ['vscode', 'code.exe', 'visual studio code'] },
  { key: 'notion',    words: ['notion'] },
  { key: 'slack',     words: ['slack'] },
  { key: 'videocall', words: ['zoom', 'teams', 'meet.google'] },
  { key: 'chat',      words: ['whatsapp', 'wa.me', 'telegram', 't.me'] },
  { key: 'terminal',  words: ['cmd', 'powershell', 'terminal', 'bash', 'wt.exe'] },
  { key: 'calc',      words: ['calc'] },
  { key: 'browser',   words: ['chrome', 'firefox', 'edge', 'http://', 'https://'] }
];
const APP_ICON_LABELS = {
  discord: 'Discord', spotify: 'Spotify', steam: 'Steam', youtube: 'YouTube',
  minecraft: 'Minecraft', github: 'GitHub', vscode: 'VS Code', notion: 'Notion',
  slack: 'Slack', videocall: 'Videollamada', chat: 'Mensajería', terminal: 'Terminal',
  calc: 'Calculadora', browser: 'Navegador web'
};
function detectAppIconKey(target) {
  if (!target) return null;
  const t = target.toLowerCase();
  for (const rule of APP_ICON_RULES) {
    if (rule.words.some(w => t.includes(w))) return rule.key;
  }
  return null;
}
function resolveIconKey(btn) {
  if (btn && btn.type === 'spotify') return spotifyIconFor(btn.value && btn.value.action, spotifyState);
  if (btn && btn.type === 'app' && btn.value?.target) {
    const found = detectAppIconKey(btn.value.target);
    if (found) return found;
  }
  return (btn && btn.type) || 'none';
}
function svgIcon(name, size) {
  size = size || 20;
  const p = ICON_PATHS[name] || ICON_PATHS.none;
  const fill = FILLED_ICONS.has(name) ? 'currentColor' : 'none';
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="${fill}" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
}
const TYPE_ICON = {};
Object.keys(ICON_PATHS).forEach(k => TYPE_ICON[k] = svgIcon(k, 22));

let state = {
  connected: false,
  port: null,
  reader: null,
  obsSocket: null,
  obsConnected: false,
  obsScenes: [],
  steamAccounts: [],
  obsConnecting: false,
  selectedIndex: null,
  selectedActionType: 'none',
  recordingMode: null,
  capturedKey: null,
  capturedCombo: { mods: [], key: '' },
  soundDataUrl: null,
  chainSteps: [],
  profiles: [{ name: 'Perfil Principal', cols: 3, rows: 3, buttons: Array(9).fill({ type:'none', label:'', value:null }) }],
  activeProfile: 0,
  display: RHUB_DISPLAY.defaultDisplay(), // estilo, colores y pantallas de la TFT (display.js)
};

let spotifyState = null;   // último snapshot de "Ahora suena" (lo manda main.js)
let spotifyStatus = null;  // estado de la conexión (sin conectar / conectado / venció...)

const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

function toast(msg, type = '') {
  const t = $('#toast');
  const icon = type === 'success' ? svgIcon('check', 15) : type === 'error' ? svgIcon('alert', 15) : '';
  t.innerHTML = icon + `<span>${msg}</span>`;
  t.className = 'show ' + type;
  clearTimeout(t._timer); t._timer = setTimeout(() => { t.className = ''; }, 2600);
}

function log(msg, cls = '') {
  const box = $('#logContent'); const line = document.createElement('div');
  line.className = 'log-line ' + cls; line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  box.appendChild(line); box.scrollTop = box.scrollHeight;
}

function initActionLibraryDrag() {
  const cards = $$('.action-card');
  cards.forEach((card, i) => {
    card.style.animationDelay = (i * 0.04) + 's';
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('sourceType', 'library');
      e.dataTransfer.setData('actionType', card.dataset.type);
      e.dataTransfer.effectAllowed = 'copy';
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
  });
}

function autoConnectOBS() {
  if (state.obsConnected || state.obsConnecting) return;
  state.obsConnecting = true;
  const url = 'ws://127.0.0.1:4455';
  try {
    const ws = new WebSocket(url);
    state.obsSocket = ws;
    ws.onopen = () => {};
    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.op === 0) ws.send(JSON.stringify({ op: 1, d: { rpcVersion: 1 } }));
        if (msg.op === 2) {
          state.obsConnected = true; state.obsConnecting = false;
          $('#obsBadge').className = 'conn-badge obs-on'; $('#obsText').textContent = 'OBS conectado';
          fetchOBSScenes();
        }
        if (msg.op === 7 && msg.d && msg.d.requestId === 'get_scenes') {
          const data = msg.d.responseData || {};
          state.obsScenes = data.scenes || [];
          updateOBSSceneDropdown();
        }
      } catch (err) {}
    };
    ws.onclose = () => {
      state.obsConnected = false; state.obsConnecting = false; state.obsSocket = null;
      $('#obsBadge').className = 'conn-badge disconnected'; $('#obsText').textContent = 'OBS Desconectado';
      setTimeout(autoConnectOBS, 4000);
    };
    ws.onerror = () => { state.obsConnecting = false; };
  } catch(e) { state.obsConnecting = false; setTimeout(autoConnectOBS, 4000); }
}

function fetchOBSScenes() {
  if (!state.obsSocket || !state.obsConnected) return;
  state.obsSocket.send(JSON.stringify({ op: 6, d: { requestType: 'GetSceneList', requestId: 'get_scenes' } }));
}

function updateOBSSceneDropdown() {
  const sel = $('#obsSceneSelect'); 
  if (!sel) return;
  
  const optionsContainer = sel.querySelector('.custom-select-options');
  const triggerText = sel.querySelector('.custom-select-trigger span');
  
  if (!optionsContainer) return;
  
  optionsContainer.innerHTML = '';
  
  if (state.obsScenes.length === 0) {
    triggerText.textContent = 'Sin escenas';
    return;
  }
  
  state.obsScenes.forEach((sc, idx) => {
    const name = sc.sceneName || sc.name;
    if (!name) return;
    
    const opt = document.createElement('div');
    opt.className = 'custom-select-option' + (idx === 0 ? ' selected' : '');
    opt.dataset.value = name;
    opt.textContent = name;
    
    opt.onclick = () => {
      triggerText.textContent = name;
      optionsContainer.querySelectorAll('.custom-select-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      sel.classList.remove('open');
    };
    
    optionsContainer.appendChild(opt);
  });
  
  if (state.obsScenes.length > 0) {
    const firstName = state.obsScenes[0].sceneName || state.obsScenes[0].name;
    triggerText.textContent = firstName;
  }
}

async function fetchSteamAccounts(selectAccountName) {
  const hint = $('#steamHint');
  if (!window.deckAPI) {
    if (hint) hint.textContent = 'Esto solo funciona dentro de la app de escritorio.';
    return;
  }
  const result = await window.deckAPI.listSteamAccounts();
  if (!result.ok) {
    state.steamAccounts = [];
    updateSteamAccountDropdown();
    if (hint) hint.textContent = result.error;
    return;
  }
  state.steamAccounts = result.accounts;
  updateSteamAccountDropdown(selectAccountName);
  if (hint) {
    const withoutPassword = result.accounts.filter(a => !a.rememberPassword).length;
    hint.textContent = withoutPassword > 0
      ? `${withoutPassword} cuenta(s) van a pedir contraseña (no tenían "Recordar contraseña" activado en Steam).`
      : '';
  }
}

function updateSteamAccountDropdown(selectAccountName) {
  const sel = $('#steamAccountSelect');
  if (!sel) return;
  const optionsContainer = sel.querySelector('.custom-select-options');
  const triggerText = sel.querySelector('.custom-select-trigger span');
  if (!optionsContainer) return;

  optionsContainer.innerHTML = '';

  if (state.steamAccounts.length === 0) {
    triggerText.textContent = 'Sin cuentas detectadas';
    return;
  }

  state.steamAccounts.forEach((acc, idx) => {
    const isSelected = selectAccountName ? acc.accountName === selectAccountName : idx === 0;
    const opt = document.createElement('div');
    opt.className = 'custom-select-option' + (isSelected ? ' selected' : '');
    opt.dataset.value = acc.accountName;
    opt.textContent = acc.personaName + (acc.rememberPassword ? '' : ' (pedirá contraseña)');

    opt.onclick = () => {
      triggerText.textContent = acc.personaName;
      optionsContainer.querySelectorAll('.custom-select-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      sel.classList.remove('open');
    };

    optionsContainer.appendChild(opt);
    if (isSelected) triggerText.textContent = acc.personaName;
  });
}

function sendOBSCommand(action, param) {
  if (!state.obsConnected || !state.obsSocket) return;
  let requestType = '', requestData = {};
  if (action === 'switch_scene') { requestType = 'SetCurrentProgramScene'; requestData = { sceneName: param }; }
  else if (action === 'toggle_mic') { requestType = 'ToggleInputMute'; requestData = { inputName: 'Mic/Aux' }; }
  else if (action === 'toggle_stream') { requestType = 'ToggleStream'; }
  else if (action === 'toggle_record') { requestType = 'ToggleRecord'; }
  state.obsSocket.send(JSON.stringify({ op: 6, d: { requestType, requestData, requestId: 'cmd_' + Date.now() } }));
}

async function executeButtonAction(btn) {
  if (!btn || btn.type === 'none') return;
  log(`Ejecutando: ${btn.type} - ${btn.label}`, 'log-out');

  if (btn.type === 'sound' && btn.value?.audioData) {
    const audio = new Audio(btn.value.audioData); audio.play();
    toast('Reproduciendo: ' + btn.label, 'success');
  }
  else if (btn.type === 'profile') {
    const dir = btn.value?.target || 'next';
    state.activeProfile = dir === 'next' ? (state.activeProfile + 1) % state.profiles.length : (state.activeProfile - 1 + state.profiles.length) % state.profiles.length;
    // En Electron, main.js ya hizo este mismo cambio y ya lo guardó en
    // disco (para tenerlo disponible al ejecutar acciones reales); acá solo
    // repintamos, sin volver a guardar, para no pisar esa escritura.
    if (!window.deckAPI) saveState();
    renderAll();
    toast(`Capa activa: ${getActiveProfile().name}`, 'success');
  }
  else if (btn.type === 'chain' && btn.value?.steps) {
    toast('Ejecutando cadena...', 'success');
    for (const step of btn.value.steps) {
      if (step.type === 'url') window.open(step.val, '_blank');
      else if (step.type === 'delay') await new Promise(r => setTimeout(r, parseInt(step.val, 10) || 500));
    }
  }
  else if (btn.type === 'twitch') {
    const act = btn.value?.action; const channel = btn.value?.channel || 'twitch';
    if (act === 'clip') { window.open(`https://twitch.tv/${channel}/clip`, '_blank'); toast('Clip creado', 'success'); }
    else if (act === 'msg_redes') { navigator.clipboard.writeText('!redes'); toast('!redes copiado', 'success'); }
    else if (act === 'msg_discord') { navigator.clipboard.writeText('!discord'); toast('!discord copiado', 'success'); }
  }
  else if (btn.type === 'obs') sendOBSCommand(btn.value.action, btn.value.scene);
  else if (btn.type === 'app' && btn.value?.target) {
    // main.js ya abrió la app/URL de verdad al recibir BTN:N desde el ESP32.
    // En Electron NO la repetimos acá — ese doble llamado era el bug del
    // "se abre dos veces". Solo se abre acá en el fallback sin Electron.
    if (!window.deckAPI) window.open(btn.value.target, '_blank');
  }
  else if (btn.type === 'media' || btn.type === 'macro' || btn.type === 'key' || btn.type === 'combo') {
    toast('Activado: ' + btn.label, 'success');
    // Igual que con 'app': en Electron, main.js ya disparó la tecla/macro
    // real al recibir el BTN:N del ESP32 — no se repite acá.
  }
}

function formatKeyName(e) {
  if (e.key === ' ') return 'Espacio';
  if (e.key === 'Control') return 'Ctrl';
  if (e.key === 'Alt') return 'Alt';
  if (e.key === 'Shift') return 'Shift';
  if (e.key === 'Meta') return 'Win';
  if (e.key.length === 1) return e.key.toUpperCase();
  return e.key;
}

function startRecording(mode) {
  state.recordingMode = mode;
  if (mode === 'key') { $('#keyCaptureField').classList.add('recording'); $('#keyTextPrompt').textContent = 'PRESIONA UNA TECLA...'; }
  else if (mode === 'combo') { $('#comboCaptureField').classList.add('recording'); $('#comboTextPrompt').textContent = 'PRESIONA EL ATAJO...'; }
}

function stopRecording() {
  state.recordingMode = null;
  $('#keyCaptureField').classList.remove('recording');
  $('#comboCaptureField').classList.remove('recording');
}

window.addEventListener('keydown', (e) => {
  if (chainCaptureTarget) {
    e.preventDefault(); e.stopPropagation();
    if (e.key === 'Escape') { chainCaptureTarget = null; renderChainSteps(); return; }
    const isMod = ['Control', 'Alt', 'Shift', 'Meta'].includes(e.key);
    const { index, mode } = chainCaptureTarget;
    if (mode === 'key') {
      if (isMod) return;
      state.chainSteps[index].val = formatKeyName(e);
      chainCaptureTarget = null;
    } else {
      const mods = [];
      if (e.ctrlKey) mods.push('Ctrl'); if (e.altKey) mods.push('Alt'); if (e.shiftKey) mods.push('Shift'); if (e.metaKey) mods.push('Win');
      const key = isMod ? '' : formatKeyName(e);
      state.chainSteps[index].val = { mods, key };
      if (!isMod) chainCaptureTarget = null;
    }
    renderChainSteps();
    return;
  }
  if (!state.recordingMode) return;
  e.preventDefault(); e.stopPropagation();
  if (e.key === 'Escape') { stopRecording(); renderCapturedKeyViews(); return; }
  const isMod = ['Control', 'Alt', 'Shift', 'Meta'].includes(e.key);
  if (state.recordingMode === 'key') {
    if (isMod) return; state.capturedKey = formatKeyName(e); stopRecording(); renderCapturedKeyViews();
  } else if (state.recordingMode === 'combo') {
    const mods = [];
    if (e.ctrlKey) mods.push('Ctrl'); if (e.altKey) mods.push('Alt'); if (e.shiftKey) mods.push('Shift'); if (e.metaKey) mods.push('Win');
    const key = isMod ? '' : formatKeyName(e); state.capturedCombo = { mods, key };
    if (!isMod) stopRecording(); renderCapturedKeyViews();
  }
});

function renderCapturedKeyViews() {
  const keyField = $('#keyCaptureField');
  keyField.innerHTML = state.capturedKey ? `<span class="key-chip">${state.capturedKey}</span>` : `<span id="keyTextPrompt">Haz clic aquí y presiona una tecla</span>`;
  const comboField = $('#comboCaptureField');
  const c = state.capturedCombo;
  if ((c.mods && c.mods.length > 0) || c.key) {
    let html = c.mods.map(m => `<span class="key-chip mod">${m}</span>`).join(' + ');
    if (c.key) html += (c.mods.length ? ' + ' : '') + `<span class="key-chip">${c.key}</span>`;
    comboField.innerHTML = html;
  } else { comboField.innerHTML = `<span id="comboTextPrompt">Haz clic aquí y presiona el atajo</span>`; }
}

async function connectSerial() {
  // Si corre dentro de Electron (window.deckAPI existe), usa el puerto
  // serial real vía main.js. Si no, cae de vuelta a WebSerial (navegador).
  if (window.deckAPI) {
    try {
      const ports = await window.deckAPI.listPorts();
      if (!ports.length) { toast('No se encontró ningún puerto', 'error'); return; }
      // Si hay varios puertos, toma el primero que parezca USB/CDC (el ESP32);
      // si tienes más de un dispositivo conectado, cambia este filtro.
      const chosen = ports.find(p => /usb|cdc|cp210|ch340/i.test(p.manufacturer)) || ports[0];
      await window.deckAPI.connectSerial(chosen.path);
    } catch (e) { toast('Error al conectar: ' + e.message, 'error'); }
    return;
  }
  try {
    if (!('serial' in navigator)) { toast('Usa Chrome o Edge', 'error'); return; }
    state.port = await navigator.serial.requestPort();
    await state.port.open({ baudRate: 115200 });
    state.connected = true;
    $('#connBadge').className = 'conn-badge connected'; $('#connText').textContent = 'Arduino Conectado';
    $('#btnConnect').style.display = 'none'; // sin botón de desconectar
    toast('Arduino conectado', 'success');
    readSerial();
  } catch (e) {}
}

function setupElectronSerialListeners() {
  if (!window.deckAPI) return;
  window.deckAPI.onSerialStatus((connected) => {
    state.connected = connected;
    $('#connBadge').className = 'conn-badge' + (connected ? ' connected' : '');
    $('#connText').textContent = connected ? 'RHub conectado' : 'Desconectado';
    $('#btnConnect').style.display = connected ? 'none' : ''; // conectado: sin botón de desconectar
    if (connected) { toast('RHub conectado', 'success'); schedulePushMedia(800); }
    else stopVideoStream();
  });
  window.deckAPI.onConfigChanged((data) => {
    state.profiles = data.profiles; state.activeProfile = data.activeProfile;
    if (data.display) state.display = RHUB_DISPLAY.normalize(data.display);
    renderAll();
  });
  window.deckAPI.onSerialLog((msg) => log(msg));
  window.deckAPI.onButtonPress((idx) => {
    // main.js ya ejecutó la acción real (tecla/app/etc). Aquí solo
    // animamos y disparamos las acciones que SÍ puede hacer el navegador
    // (sonido, OBS, cambio de perfil visual, etc.)
    animateButtonPress(idx);
    executeButtonAction(getActiveProfile().buttons[idx]);
  });
}

async function readSerial() {
  const decoder = new TextDecoder();
  while (state.port && state.connected) {
    try {
      state.reader = state.port.readable.getReader();
      let buf = '';
      while (true) {
        const { value, done } = await state.reader.read();
        if (done) break;
        buf += decoder.decode(value);
        let nl;
        while ((nl = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
          if (line.startsWith('BTN:')) {
            const idx = parseInt(line.slice(4), 10);
            if (!isNaN(idx)) {
              animateButtonPress(idx);
              executeButtonAction(getActiveProfile().buttons[idx]);
            }
          }
        }
      }
    } catch(e) { break; }
    finally { if (state.reader) state.reader.releaseLock(); }
  }
}

// Botón físico presionado: resorte (hunde y rebota) + aro de luz + onda desde el centro.
function animateButtonPress(idx) {
  const el = $$('.deck-btn')[idx];
  if (!el) return;
  el.classList.remove('pressed');
  void el.offsetWidth; // reinicia la animación si se presiona varias veces seguidas
  el.classList.add('pressed');

  const ripple = document.createElement('span');
  ripple.className = 'btn-ripple';
  ripple.innerHTML = '<i></i>';
  el.appendChild(ripple);
  setTimeout(() => ripple.remove(), 700);

  clearTimeout(el._pressTimer);
  el._pressTimer = setTimeout(() => el.classList.remove('pressed'), 620);
}

const CHAIN_STEP_LABELS = {
  url: 'Abrir Enlace/App', delay: 'Esperar (ms)', text: 'Escribir texto',
  key: 'Presionar tecla', combo: 'Combinación', media: 'Tecla multimedia',
  spotify: 'Acción de Spotify',
};
const CHAIN_MEDIA_OPTIONS = [
  ['play_pause', 'Reproducir/Pausar'], ['next', 'Siguiente'], ['prev', 'Anterior'],
  ['stop', 'Detener'], ['vol_up', 'Subir volumen'], ['vol_down', 'Bajar volumen'], ['mute', 'Silenciar'],
];

function chainStepValueHTML(step, i) {
  if (step.type === 'delay') return `<input type="text" class="input step-val" value="${step.val || ''}" placeholder="Ej: 1000" data-i="${i}">`;
  if (step.type === 'url') return `<input type="text" class="input step-val" value="${step.val || ''}" placeholder="https:// o ruta a un .exe" data-i="${i}">`;
  if (step.type === 'text') return `<input type="text" class="input step-val" value="${step.val || ''}" placeholder="Texto a escribir" data-i="${i}">`;
  if (step.type === 'media') {
    const opts = CHAIN_MEDIA_OPTIONS.map(([v, l]) => `<option value="${v}" ${step.val === v ? 'selected' : ''}>${l}</option>`).join('');
    return `<select class="select step-media" data-i="${i}"><option value="">Elegir...</option>${opts}</select>`;
  }
  if (step.type === 'spotify') {
    const opts = (window.SPOTIFY_ACTIONS || []).map(a => `<option value="${a.id}" ${step.val === a.id ? 'selected' : ''}>${a.label}</option>`).join('');
    return `<select class="select step-spotify" data-i="${i}"><option value="">Elegir...</option>${opts}</select>`;
  }
  if (step.type === 'key') {
    const capturing = chainCaptureTarget && chainCaptureTarget.index === i && chainCaptureTarget.mode === 'key';
    const label = step.val ? `<span class="key-chip">${step.val}</span>` : (capturing ? 'PRESIONA UNA TECLA...' : 'Clic y presiona una tecla');
    return `<button class="btn chain-capture-btn ${capturing ? 'recording' : ''}" data-capture="${i}" data-mode="key">${label}</button>`;
  }
  if (step.type === 'combo') {
    const capturing = chainCaptureTarget && chainCaptureTarget.index === i && chainCaptureTarget.mode === 'combo';
    const c = step.val || {};
    let label = 'Clic y presiona el atajo';
    if (capturing) label = 'PRESIONA EL ATAJO...';
    else if ((c.mods && c.mods.length) || c.key) {
      label = (c.mods || []).map(m => `<span class="key-chip mod">${m}</span>`).join(' + ') + (c.key ? (c.mods?.length ? ' + ' : '') + `<span class="key-chip">${c.key}</span>` : '');
    }
    return `<button class="btn chain-capture-btn ${capturing ? 'recording' : ''}" data-capture="${i}" data-mode="combo">${label}</button>`;
  }
  return '';
}

function renderChainSteps() {
  const box = $('#chainStepsList'); box.innerHTML = '';
  state.chainSteps.forEach((step, i) => {
    const row = document.createElement('div'); row.className = 'chain-step';
    const options = Object.entries(CHAIN_STEP_LABELS).map(([v, l]) => `<option value="${v}" ${step.type === v ? 'selected' : ''}>${l}</option>`).join('');
    row.innerHTML = `
      <select class="select step-type">${options}</select>
      ${chainStepValueHTML(step, i)}
      <button class="btn" onclick="removeChainStep(${i})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
    `;
    row.querySelector('.step-type').onchange = (e) => {
      const newType = e.target.value;
      state.chainSteps[i] = { type: newType, val: newType === 'combo' ? { mods: [], key: '' } : '' };
      if (chainCaptureTarget?.index === i) chainCaptureTarget = null;
      renderChainSteps();
    };
    const valInput = row.querySelector('.step-val');
    if (valInput) valInput.oninput = (e) => { state.chainSteps[i].val = e.target.value; };
    const mediaSelect = row.querySelector('.step-media');
    if (mediaSelect) mediaSelect.onchange = (e) => { state.chainSteps[i].val = e.target.value; };
    const spotifySelect = row.querySelector('.step-spotify');
    if (spotifySelect) spotifySelect.onchange = (e) => { state.chainSteps[i].val = e.target.value; };
    const captureBtn = row.querySelector('.chain-capture-btn');
    if (captureBtn) captureBtn.onclick = () => {
      const mode = captureBtn.dataset.mode;
      chainCaptureTarget = (chainCaptureTarget?.index === i) ? null : { index: i, mode };
      renderChainSteps();
    };
    box.appendChild(row);
  });
}
window.removeChainStep = (i) => { state.chainSteps.splice(i, 1); if (chainCaptureTarget?.index === i) chainCaptureTarget = null; renderChainSteps(); };

async function loadState() {
  if (window.deckAPI) {
    try {
      const d = await window.deckAPI.loadConfig();
      state.profiles = d.profiles || state.profiles;
      state.activeProfile = d.activeProfile || 0;
      state.display = RHUB_DISPLAY.normalize(d.display);
    } catch (e) { console.error('Error cargando config de disco:', e); }
    return;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY); if (!raw) return;
    const d = JSON.parse(raw); state.profiles = d.profiles || state.profiles; state.activeProfile = d.activeProfile || 0; state.display = RHUB_DISPLAY.normalize(d.display);
  } catch (e) {}
}

function saveState() {
  const data = { profiles: state.profiles, activeProfile: state.activeProfile, display: state.display };
  if (window.deckAPI) { window.deckAPI.saveConfig(data); }
  else { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
}

function getActiveProfile() { return state.profiles[state.activeProfile]; }

// Reemplaza window.prompt(), que Electron no soporta (lanza error si se
// llama). Devuelve una Promise con el texto, o null si cancela.
function showPrompt(title, defaultValue = '', okLabel = 'Crear') {
  return new Promise((resolve) => {
    const overlay = $('#promptOverlay'), input = $('#promptInput');
    $('#promptTitle').textContent = title;
    $('#promptOk').textContent = okLabel;
    input.value = defaultValue;
    overlay.classList.add('open');
    setTimeout(() => { input.focus(); input.select(); }, 30);

    const cleanup = (value) => {
      overlay.classList.remove('open');
      $('#promptOk').onclick = null; $('#promptCancel').onclick = null;
      input.onkeydown = null;
      resolve(value);
    };
    $('#promptOk').onclick = () => cleanup(input.value.trim() || null);
    $('#promptCancel').onclick = () => cleanup(null);
    input.onkeydown = (e) => {
      if (e.key === 'Enter') cleanup(input.value.trim() || null);
      if (e.key === 'Escape') cleanup(null);
    };
  });
}

function swapButtons(from, to) {
  const btns = getActiveProfile().buttons;
  [btns[from], btns[to]] = [btns[to], btns[from]];
  state.selectedIndex = to;
  saveState();
  renderAll();
}

function renderAll() {
  renderGrid();
  renderSidebar();
  renderConfig();
}

let gridEntered = false;
function renderGrid() {
  const p = getActiveProfile(); const grid = $('#deckGrid'); grid.innerHTML = '';
  p.buttons.forEach((btn, i) => {
    const el = document.createElement('div');
    el.className = 'deck-btn' + (i === state.selectedIndex ? ' selected' : '') + (btn.type === 'none' ? ' empty' : '') + (gridEntered ? '' : ' enter');
    if (!gridEntered) el.style.animationDelay = (i * 0.035) + 's';
    el.draggable = true;
    if (btn.type === 'spotify') {
      // Los botones de Spotify reflejan el estado (play/pausa, corazón, aleatorio...)
      const act = btn.value && btn.value.action;
      el.dataset.spAction = act || '';
      el.dataset.spIcon = resolveIconKey(btn);
      if (spotifyToggleOn(act, spotifyState)) el.classList.add('sp-on');
    }
    const iconHTML = svgIcon(resolveIconKey(btn), 30);
    const labelHTML = btn.label ? `<span class="btn-label">${btn.label}</span>` : '';
    el.innerHTML = `<span class="btn-index">${i+1}</span><span class="btn-icon">${iconHTML}</span>${labelHTML}`;

    el.onclick = () => selectButton(i);

    el.ondragstart = (e) => {
      e.dataTransfer.setData('sourceType', 'deck');
      e.dataTransfer.setData('fromIndex', String(i));
      e.dataTransfer.effectAllowed = 'move';
      $('#trashZone').classList.add('armed');
    };

    el.ondragend = () => {
      $('#trashZone').classList.remove('armed', 'drag-over');
    };

    el.ondragover = (e) => {
      e.preventDefault();
      el.classList.add('drag-over');
    };
    
    el.ondragleave = () => {
      el.classList.remove('drag-over');
    };
    
    el.ondrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.remove('drag-over');
      
      const sourceType = e.dataTransfer.getData('sourceType');

      if (sourceType === 'library') {
        const actionType = e.dataTransfer.getData('actionType');
        if (actionType) {
          p.buttons[i] = { type: actionType, label: '', value: null };
          state.selectedIndex = i;
          state.selectedActionType = actionType;
          state.capturedKey = null;
          state.capturedCombo = { mods: [], key: '' };
          state.soundDataUrl = null;
          state.chainSteps = [];
          saveState();
          renderAll();
          toast('Acción asignada', 'success');
        }
      } 
      else if (sourceType === 'deck') {
        const fromIndex = parseInt(e.dataTransfer.getData('fromIndex'), 10);
        if (!isNaN(fromIndex) && fromIndex !== i) {
          swapButtons(fromIndex, i);
          toast('Botón reordenado', 'success');
        }
      }
    };

    grid.appendChild(el);
  });
  gridEntered = true;
}

function selectButton(i) {
  state.selectedIndex = i;
  const btn = getActiveProfile().buttons[i];
  if (btn) {
    state.selectedActionType = btn.type;
    if (btn.type === 'key') state.capturedKey = btn.value;
    if (btn.type === 'combo') state.capturedCombo = btn.value || { mods: [], key: '' };
    if (btn.type === 'sound') state.soundDataUrl = btn.value?.audioData || null;
    if (btn.type === 'chain') state.chainSteps = btn.value?.steps || [];
  }
  renderAll();
}

let sidebarEntered = false;
function renderSidebar() {
  const list = $('#profileList'); list.innerHTML = '';
  state.profiles.forEach((p, i) => {
    const el = document.createElement('div');
    el.className = 'profile-item' + (i === state.activeProfile ? ' active' : '') + (sidebarEntered ? '' : ' enter');
    if (!sidebarEntered) el.style.animationDelay = (i * 0.05) + 's';
    el.innerHTML = `<div class="p-icon">${i+1}</div><div class="p-name">${p.name}</div><button class="p-rename" title="Renombrar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button><button class="p-del"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>`;
    el.onclick = async (e) => {
      if (e.target.closest('.p-del')) {
        if (state.profiles.length > 1) { state.profiles.splice(i, 1); state.activeProfile = 0; saveState(); renderAll(); }
        return;
      }
      if (e.target.closest('.p-rename')) {
        const newName = await showPrompt('Renombrar perfil:', p.name, 'Guardar');
        if (newName) { p.name = newName; saveState(); renderAll(); }
        return;
      }
      state.activeProfile = i; saveState(); renderAll();
    };
    el.ondblclick = async (e) => {
      if (e.target.closest('.p-del') || e.target.closest('.p-rename')) return;
      const newName = await showPrompt('Renombrar perfil:', p.name, 'Guardar');
      if (newName) { p.name = newName; saveState(); renderAll(); }
    };
    list.appendChild(el);
  });
  sidebarEntered = true;
}

function renderConfig() {
  const idx = state.selectedIndex; const body = $('#configBody'); const empty = $('#emptyConfig');
  if (idx === null) { body.style.display = 'none'; empty.style.display = 'block'; return; }
  empty.style.display = 'none'; body.style.display = 'block';

  const btn = getActiveProfile().buttons[idx];
  showFields(btn.type);

    // Inicializar modo de captura/selección de tecla
  if (btn.type === 'key') {
    const extendedKeys = ['F13','F14','F15','F16','F17','F18','F19','F20','F21','F22','F23','F24'];
    $('#keyCaptureMode').style.display = 'none';
    $('#keySelectMode').style.display = 'none';
    
    $('#btnKeyCapture').onclick = () => {
      $('#keyCaptureMode').style.display = 'block';
      $('#keySelectMode').style.display = 'none';
      $('#btnKeyCapture').style.background = 'var(--panel-2)';
      $('#btnKeySelect').style.background = '';
    };
    
    $('#btnKeySelect').onclick = () => {
      $('#keyCaptureMode').style.display = 'none';
      $('#keySelectMode').style.display = 'block';
      $('#btnKeyCapture').style.background = '';
      $('#btnKeySelect').style.background = 'var(--panel-2)';
      updateKeySelectPreview();
    };
    
    // Mostrar modo correcto según valor actual
    if (state.capturedKey && extendedKeys.includes(state.capturedKey)) {
      $('#btnKeySelect').click();
      $('#keySelectDropdown').value = state.capturedKey;
      updateKeySelectPreview();
    } else if (state.capturedKey) {
      $('#btnKeyCapture').click();
    } else {
      $('#btnKeyCapture').click();
    }
  }

  $('#caIcon').innerHTML = TYPE_ICON[resolveIconKey(btn)] || TYPE_ICON.none;
  $('#caName').textContent = btn.type === 'none' ? 'Sin acción' : (btn.label || 'Configurar');
  $('#caDesc').textContent = `Botón ${idx + 1}`;
  // Cargar la etiqueta personalizada en el campo de texto
  $('#btnLabelInput').value = btn.label || '';

  renderCapturedKeyViews();

  if (btn.type === 'obs' && btn.value) {
    const obsSelect = $('#obsActionSelect');
    if (obsSelect && obsSelect.setValue) obsSelect.setValue(btn.value.action || 'switch_scene');
    updateOBSSceneDropdown();
  }
  if (btn.type === 'steam') {
    fetchSteamAccounts(btn.value?.accountName);
  }
  if (btn.type === 'profile' && btn.value) {
    const profSelect = $('#profileTargetSelect');
    if (profSelect && profSelect.setValue) profSelect.setValue(btn.value.target || 'next');
  }
  if (btn.type === 'twitch' && btn.value) {
    const twitchSelect = $('#twitchActionSelect');
    if (twitchSelect && twitchSelect.setValue) twitchSelect.setValue(btn.value.action || 'clip');
    $('#channelName').value = btn.value.channel || '';
  }
  if (btn.type === 'media' && btn.value) {
    const mediaSelect = $('#mediaSelect');
    if (mediaSelect && mediaSelect.setValue) mediaSelect.setValue(btn.value.key);
  }
  if (btn.type === 'spotify') {
    const spSelect = $('#spotifyActionSelect');
    if (spSelect && spSelect.setValue) spSelect.setValue((btn.value && btn.value.action) || 'play_pause');
    updateSpotifyFieldHints();
  }
  if (btn.type === 'app') { $('#appTarget').value = btn.value?.target || ''; updateAppIconHint($('#appTarget').value); }
  if (btn.type === 'macro' && btn.value) $('#macroText').value = btn.value.text || '';
  if (btn.type === 'chain') renderChainSteps();
}

function showFields(type) {
  $$('.action-field').forEach(f => f.style.display = 'none');
  if (type !== 'none') {
    const field = $(`[data-for="${type}"]`);
    if (field) field.style.display = 'block';
  }
}

function updateAppIconHint(target) {
  const hint = $('#appIconHint'); if (!hint) return;
  const key = detectAppIconKey(target);
  hint.textContent = key ? `Ícono detectado: ${APP_ICON_LABELS[key]}` : (target ? 'Sin coincidencia, se usará el ícono genérico' : '');
  $('#caIcon').innerHTML = key ? TYPE_ICON[key] : TYPE_ICON.app;
}

function saveAction() {
  const idx = state.selectedIndex; if (idx === null) return;
  // Obtener la etiqueta personalizada
  const customLabel = $('#btnLabelInput').value.trim();
  const type = state.selectedActionType;
  let label = 'Acción', value = null;

  if (type === 'key') { value = state.capturedKey; label = value || 'Tecla'; }
  else if (type === 'combo') { value = { ...state.capturedCombo }; label = [...value.mods, value.key].filter(Boolean).join('+'); }
    else if (type === 'obs') {
    const obsActionSel = $('#obsActionSelect');
    const obsSceneSel = $('#obsSceneSelect');
    const act = obsActionSel && obsActionSel.getValue ? obsActionSel.getValue() : 'switch_scene';
    const sceneOpt = obsSceneSel ? obsSceneSel.querySelector('.custom-select-option.selected') : null;
    const scene = sceneOpt ? sceneOpt.dataset.value : '';
    const actText = obsActionSel ? obsActionSel.querySelector('.custom-select-trigger span').textContent : 'OBS';
    value = { action: act, scene }; 
    label = act === 'switch_scene' ? `${scene||'Escena'}` : actText;
  }
  else if (type === 'sound') {
    value = { audioData: state.soundDataUrl }; label = 'Sonido';
  }
  else if (type === 'profile') {
  const profSelect = $('#profileTargetSelect');
  const target = profSelect && profSelect.getValue ? profSelect.getValue() : 'next';
  value = { target }; 
  label = target === 'next' ? 'Siguiente perfil' : 'Perfil anterior';
  }
  else if (type === 'screen') {
    value = {}; label = 'Pantalla'; // main.js manda NEXT al ESP32 (ver runRealAction)
  }
  else if (type === 'chain') {
    value = { steps: [...state.chainSteps] }; label = 'Cadena';
  }
  else if (type === 'twitch') {
  const twitchSelect = $('#twitchActionSelect');
  const act = twitchSelect && twitchSelect.getValue ? twitchSelect.getValue() : 'clip';
  const channel = $('#channelName').value.trim();
  value = { action: act, channel }; 
  label = act === 'clip' ? 'Clip' : act;
  }
  else if (type === 'media') {
  const mediaSelect = $('#mediaSelect');
  const key = mediaSelect && mediaSelect.getValue ? mediaSelect.getValue() : 'play_pause';
  const labelText = mediaSelect ? mediaSelect.querySelector('.custom-select-trigger span').textContent : 'Media';
  value = { key }; 
  label = labelText;
  }
  else if (type === 'spotify') {
    const spSelect = $('#spotifyActionSelect');
    const action = spSelect && spSelect.getValue ? spSelect.getValue() : 'play_pause';
    const meta = (window.SPOTIFY_ACTIONS || []).find(a => a.id === action);
    value = { action }; label = meta ? meta.label : 'Spotify';
  }
  else if (type === 'app') {
    const target = $('#appTarget').value.trim();
    const key = detectAppIconKey(target);
    value = { target }; label = key ? APP_ICON_LABELS[key] : 'App';
  }
  else if (type === 'steam') {
    const steamSelect = $('#steamAccountSelect');
    const accountName = steamSelect ? steamSelect.querySelector('.custom-select-option.selected')?.dataset.value : '';
    const acc = state.steamAccounts.find(a => a.accountName === accountName);
    value = { accountName: accountName || '' };
    label = acc ? acc.personaName : 'Steam';
  }
  else if (type === 'macro') { value = { text: $('#macroText').value }; label = 'Macro'; }

    // Si hay etiqueta personalizada, usarla. Si está vacía, guardar vacío
    const finalLabel = customLabel !== '' ? customLabel : '';
    getActiveProfile().buttons[idx] = { type, label: finalLabel, value };

    saveState();
    renderGrid();
    toast('Guardado', 'success');
}

function clearAction() {
  const idx = state.selectedIndex;
  if (idx === null) return;

  if (!confirm(i18n.t('¿Deseas limpiar esta acción?'))) return;

  clearButtonAt(idx);
}

// Limpia un botón sin pedir confirmación (usado al soltarlo en la papelera)
function clearButtonAt(idx) {
  getActiveProfile().buttons[idx] = { type: 'none', label: '', value: null };
  if (state.selectedIndex === idx) {
    state.selectedIndex = null;
    state.selectedActionType = 'none';
    state.capturedKey = null;
    state.capturedCombo = { mods: [], key: '' };
    state.soundDataUrl = null;
    state.chainSteps = [];
  }
  saveState();
  renderAll();
}

function setupWindowControls() {
  const api = window.deckAPI;
  if (!api || !api.winMinimize) return;
  const max = $('#winMax');
  const paint = (isMax) => {
    max.title = max.ariaLabel = isMax ? 'Restaurar' : 'Maximizar';
    max.innerHTML = isMax
      ? '<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1"><rect x="0.5" y="2.5" width="7" height="7"/><path d="M2.5 2.5V0.5h7v7h-2"/></svg>'
      : '<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1"><rect x="0.5" y="0.5" width="9" height="9"/></svg>';
  };
  $('#winMin').onclick = api.winMinimize;
  max.onclick = api.winToggleMax;
  $('#winClose').onclick = api.winClose;
  api.onWinState(paint);
  api.winIsMax().then(paint);
}

function setupSettingsUI() {
  const overlay = $('#settingsOverlay');
  const langBtns = $$('.lang-switch [data-lang]');
  const markLang = () => langBtns.forEach((b) => b.classList.toggle('on', b.dataset.lang === i18n.getLang()));
  langBtns.forEach((b) => { b.onclick = () => { i18n.setLang(b.dataset.lang); renderAll(); markLang(); }; });
  markLang();
  document.addEventListener('langchange', markLang);
  const toggle = $('#toggleAutoLaunch');
  if (!overlay || !toggle) return;

  const open = async () => {
    overlay.classList.add('open');
    if (window.deckAPI?.appSettings) {
      const enabled = await window.deckAPI.appSettings.getAutoLaunch();
      setToggleState(enabled);
    }
  };
  const close = () => overlay.classList.remove('open');
  const setToggleState = (enabled) => {
    toggle.classList.toggle('active', enabled);
    toggle.setAttribute('aria-checked', String(enabled));
  };

  $('#btnSettings').onclick = open;
  $('#btnSettingsClose').onclick = close;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  toggle.onclick = async () => {
    const next = !toggle.classList.contains('active');
    setToggleState(next); // optimista, se ve al toque
    if (window.deckAPI?.appSettings) {
      await window.deckAPI.appSettings.setAutoLaunch(next);
    }
  };
}
document.addEventListener('DOMContentLoaded', () => { setupSettingsUI(); setupWindowControls(); });

function setupTrashZone() {
  const zone = $('#trashZone');
  zone.ondragover = (e) => { e.preventDefault(); zone.classList.add('drag-over'); };
  zone.ondragleave = () => zone.classList.remove('drag-over');
  zone.ondrop = (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over', 'armed');
    if (e.dataTransfer.getData('sourceType') !== 'deck') return;
    const idx = parseInt(e.dataTransfer.getData('fromIndex'), 10);
    if (isNaN(idx)) return;
    clearButtonAt(idx);
    toast('Botón limpiado', 'success');
  };
}

// Deseleccionar el botón activo al hacer clic afuera de la grilla y del
// panel de configuración (pero no al hacer clic dentro del panel, para no
// interrumpir la edición).
document.addEventListener('click', (e) => {
  if (state.selectedIndex === null) return;
  if (e.target.closest('.deck-btn') || e.target.closest('.config-panel')) return;
  state.selectedIndex = null;
  state.selectedActionType = 'none';
  renderAll();
});

function updateKeySelectPreview() {
  const sel = $('#keySelectDropdown');
  const preview = $('#keySelectPreview');
  if (sel && preview) {
    const value = sel.value;
    preview.innerHTML = value ? `<span class="key-chip">${value}</span>` : '—';
    state.capturedKey = value;
  }
}

/* ============================================
   CUSTOM SELECT SYSTEM
   ============================================ */

function initCustomSelect(selectId) {
  const select = document.getElementById(selectId);
  if (!select || !select.classList.contains('custom-select')) return;

  const trigger = select.querySelector('.custom-select-trigger');
  const options = select.querySelectorAll('.custom-select-option');
  const triggerText = trigger.querySelector('span');

  let currentValue = null;
  const selectedOption = select.querySelector('.custom-select-option.selected');
  if (selectedOption) {
    currentValue = selectedOption.dataset.value;
  }

  trigger.onclick = (e) => {
    e.stopPropagation();
    closeAllSelects();
    select.classList.toggle('open');
  };

  options.forEach(opt => {
    opt.onclick = () => {
      currentValue = opt.dataset.value;
      triggerText.textContent = opt.textContent;
      
      options.forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      
      select.classList.remove('open');
      
      // Trigger change event
      select.dispatchEvent(new Event('change'));
    };
  });

  // Método para obtener el valor
  select.getValue = () => currentValue;
  
  // Método para establecer el valor
  select.setValue = (value) => {
    const option = select.querySelector(`[data-value="${value}"]`);
    if (option) {
      currentValue = value;
      triggerText.textContent = option.textContent;
      options.forEach(o => o.classList.remove('selected'));
      option.classList.add('selected');
    }
  };
}

function closeAllSelects() {
  document.querySelectorAll('.custom-select.open').forEach(s => s.classList.remove('open'));
}

// Cerrar dropdowns al hacer clic fuera
document.addEventListener('click', () => {
  closeAllSelects();
});

// Inicializar todos los custom selects
function initAllCustomSelects() {
  ['obsActionSelect', 'obsSceneSelect', 'profileTargetSelect', 'twitchActionSelect', 'mediaSelect', 'steamAccountSelect', 'spotifyActionSelect'].forEach(id => {
    initCustomSelect(id);
  });
}

async function init() {
  await loadState(); renderAll();
  applyPreviewTheme(); renderOledDots(); renderOledScreen();   // el visor con las pantallas guardadas
  initActionLibraryDrag();
  setupTrashZone();
  setupElectronSerialListeners();

  $('#btnConnect').onclick = connectSerial;
  $('#btnSave').onclick = saveAction;
  $('#btnClear').onclick = clearAction;
  const btnRefreshSteam = $('#btnRefreshSteamAccounts');
  if (btnRefreshSteam) btnRefreshSteam.onclick = () => fetchSteamAccounts();
  $('#keyCaptureField').onclick = () => startRecording('key');
    const keySelect = $('#keySelectDropdown');
  if (keySelect) {
    keySelect.onchange = updateKeySelectPreview;
  }
  $('#comboCaptureField').onclick = () => startRecording('combo');

  $('#soundFile').onchange = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const r = new FileReader();
    r.onload = () => { state.soundDataUrl = r.result; toast('Audio cargado', 'success'); };
    r.readAsDataURL(file);
  };

  $('#btnAddChainStep').onclick = () => {
    state.chainSteps.push({ type: 'url', val: '' }); renderChainSteps();
  };

  $('#appTarget').oninput = (e) => updateAppIconHint(e.target.value);

  $('#logHeader').onclick = () => $('#logBar').classList.toggle('open');

  $('#btnNewProfile').onclick = async () => {
    const name = await showPrompt('Nombre del nuevo perfil:');
    if (name) {
      state.profiles.push({ name, cols: 3, rows: 3, buttons: Array(9).fill({ type:'none', label:'', value:null }) });
      state.activeProfile = state.profiles.length - 1;
      saveState(); renderAll();
    }
  };

  $('#btnExport').onclick = () => {
    // Exporta TODOS los perfiles (no solo el activo) para que el companion
    // script de Python (esp32_listener.py) pueda ejecutar acciones reales
    // y cambiar de perfil igual que lo hace esta app en el navegador.
    const full = { profiles: state.profiles, activeProfile: state.activeProfile };
    const blob = new Blob([JSON.stringify(full, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'config-deck.json'; a.click();
  };

  $('#btnImport').onclick = () => $('#importFile').click();
  $('#importFile').onchange = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const p = JSON.parse(r.result);
        if (p && Array.isArray(p.profiles)) {
          // Archivo de config completo (varios perfiles)
          state.profiles = p.profiles; state.activeProfile = p.activeProfile || 0;
        } else {
          // Archivo de un solo perfil (formato antiguo)
          state.profiles.push(p); state.activeProfile = state.profiles.length - 1;
        }
        saveState(); renderAll(); toast('Importado', 'success');
      } catch (err) { toast('JSON inválido', 'error'); }
    };
    r.readAsText(file);
  };

  populateSpotifySelect();   // las opciones vienen de spotify-actions.js
  initAllCustomSelects();

  autoConnectOBS();
}

/* ============================================
   CUSTOM SELECT SYSTEM
   ============================================ */

function initCustomSelect(selectId) {
  const select = document.getElementById(selectId);
  if (!select || !select.classList.contains('custom-select')) return;

  const trigger = select.querySelector('.custom-select-trigger');
  const options = select.querySelectorAll('.custom-select-option');
  const triggerText = trigger.querySelector('span');

  let currentValue = null;
  const selectedOption = select.querySelector('.custom-select-option.selected');
  if (selectedOption) {
    currentValue = selectedOption.dataset.value;
  }

  trigger.onclick = (e) => {
  e.stopPropagation();
  
  // Guardar si ESTE select estaba abierto antes
  const wasOpen = select.classList.contains('open');
  
  // Cerrar todos los demás
  closeAllSelects();
  
  // Si NO estaba abierto, abrirlo
  if (!wasOpen) {
    select.classList.add('open');
  }
};

  options.forEach(opt => {
    opt.onclick = () => {
      currentValue = opt.dataset.value;
      triggerText.textContent = opt.textContent;
      
      options.forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      
      select.classList.remove('open');
      
      select.dispatchEvent(new Event('change'));
    };
  });

  select.getValue = () => currentValue;
  
  select.setValue = (value) => {
    const option = select.querySelector(`[data-value="${value}"]`);
    if (option) {
      currentValue = value;
      triggerText.textContent = option.textContent;
      options.forEach(o => o.classList.remove('selected'));
      option.classList.add('selected');
    }
  };
}

function closeAllSelects() {
  document.querySelectorAll('.custom-select.open').forEach(s => s.classList.remove('open'));
}

document.addEventListener('click', () => {
  closeAllSelects();
});

function initAllCustomSelects() {
  ['obsActionSelect', 'obsSceneSelect', 'profileTargetSelect', 'twitchActionSelect', 'mediaSelect', 'steamAccountSelect', 'spotifyActionSelect'].forEach(id => {
    initCustomSelect(id);
  });
}

/* =====================================================================
   VISOR — espejo en vivo de la pantalla TFT (284x76) del RHub.
   Dibuja la pantalla activa de la lista del usuario (state.display, ver
   display.js) con el mismo estilo, colores y widgets que el firmware.
   ===================================================================== */
const D = window.RHUB_DISPLAY;
let lastSysStats = null; // { ramUsedGB, ramTotalGB, cpuTemp, gpuTemp, time, date }
let currentScreenIndex = 0;

const screenCount = () => state.display.screens.length;
const currentScreen = () => state.display.screens[currentScreenIndex];
// "Ahora suena" grande (con portada) = Spotify en una pantalla de 1 hueco
const screenHasNowPlaying = () => currentScreen().layout === 'full' && currentScreen().slots[0].type === 'spotify';
const screenUsesStats = () => currentScreen().slots.some((w) => ['clock', 'system', 'cpu', 'ram', 'gpu'].includes(w.type));

// Color de la temperatura, igual que en la pantalla física
function tempClass(t) {
  if (t >= 85) return ' hot';
  if (t >= 75) return ' warn';
  return '';
}
// Verde / amarillo / rojo según el nivel (estilo Color)
const levelClass = (lv) => (lv >= 0.85 ? ' hot' : lv >= 0.7 ? ' warn' : ' ok');

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fileUrl = (p) => 'file:///' + encodeURI(String(p).replace(/\\/g, '/'));

const DAYS = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];
const MONTHS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

function clockParts() {
  const s = lastSysStats;
  const time = s ? s.time : '--:--';
  const m = s && /^(\d+)\/(\d+)\/(\d+)$/.exec(s.date);
  if (!m) return { time, date: '--/--/----', day: '---', short: '-- ---' };
  const d = new Date(+m[3], +m[2] - 1, +m[1]);
  return { time, date: s.date, day: DAYS[d.getDay()], short: `${m[1]} ${MONTHS[+m[2] - 1]}` };
}

function statInfo(type) {
  const s = lastSysStats;
  if (type === 'ram') {
    const used = s ? parseFloat(s.ramUsedGB) : 0, total = s ? parseFloat(s.ramTotalGB) : 0;
    return { label: 'RAM', value: s ? used.toFixed(1) : '--', unit: 'G', note: s ? `de ${Math.round(total)}` : '', level: total ? used / total : 0, temp: false, raw: s ? 1 : -1 };
  }
  const t = s ? (type === 'cpu' ? s.cpuTemp : s.gpuTemp) : -1;
  return { label: type.toUpperCase(), value: t >= 0 ? String(t) : '--', unit: t >= 0 ? '°C' : '', note: '', level: Math.max(0, t) / 100, temp: true, raw: t };
}

function statHTML(st, style, width = D.W) {
  const lv = Math.max(0, Math.min(1, st.level || 0));
  const pct = lv * 100;
  if (style === 'minimal') {
    return `<div class="w-row"><span class="dim">${st.label}</span><span class="w-bar"><i style="width:${pct}%"></i></span><b>${st.value}${st.unit}</b></div>`;
  }
  if (style === 'terminal') {
    const cells = width >= 200 ? 10 : width >= 120 ? 6 : 3, filled = Math.round(cells * lv);   // como el firmware: según el ancho del hueco
    const unit = st.temp ? (st.raw >= 0 ? 'C' : '') : st.unit;
    return `<div class="w-term-row">${st.label} [${'#'.repeat(filled)}${'-'.repeat(cells - filled)}] ${st.value}${unit}</div>`;
  }
  if (style === 'color') {
    const unit = st.temp ? (st.raw >= 0 ? '°' : '') : st.unit;
    return `<div class="w-color-stat${st.raw < 0 ? ' none' : levelClass(lv)}"><b>${st.value}${unit}</b><span class="dim">${st.label}</span></div>`;
  }
  const cls = st.temp ? tempClass(st.raw) : '';
  return `
    <div class="tft-stat${cls}">
      <div class="tft-stat-head"><span>${st.label}</span><span>${st.note}</span></div>
      <div class="tft-stat-val">${st.value}<small>${st.unit}</small></div>
      <div class="tft-stat-bar"><i style="width:${pct}%"></i></div>
    </div>`;
}

function clockHTML(style, wide) {
  const c = clockParts();
  if (style === 'minimal' && wide) {
    return `<div class="w-clock-min"><b>${c.time}</b><span class="dim">${c.day}<br>${c.short}</span></div>`;
  }
  if (style === 'terminal') {
    return `<div class="w-clock-term"><span class="w-prompt">rhub@deck:~$ time</span><b>${c.time}<i class="w-cursor">_</i></b></div>`;
  }
  if (style === 'color') {
    const [hh, mm] = c.time.split(':');
    return `<div class="w-clock-color${wide ? ' wide' : ''}"><b>${hh}<em>:</em>${mm}</b><span class="w-pill">${c.short}</span></div>`;
  }
  return `<div class="w-clock"><div class="tft-clock-time">${c.time}</div><div class="tft-clock-date">${c.date}</div></div>`;
}

function spotifyCompactHTML() {
  const snap = spotifyState;
  const live = snap && snap.status === 'connected' && snap.active && snap.title;
  if (!live) {
    const off = !snap || snap.status !== 'connected';
    return `<div class="w-sp"><b>Spotify</b><span class="dim">${off ? 'Sin conectar' : 'Nada sonando'}</span></div>`;
  }
  const prog = snap.isPlaying ? Math.min(snap.durationMs, snap.progressMs + (Date.now() - snap.at)) : snap.progressMs;
  const pct = snap.durationMs ? (prog / snap.durationMs) * 100 : 0;
  return `<div class="w-sp"><b>${esc(snap.title)}</b><span class="dim">${esc(snap.artist || '')}</span><span class="w-bar sp"><i style="width:${pct}%"></i></span></div>`;
}

function widgetHTML(w, rect, style) {
  const [, , rw] = rect;
  switch (w.type) {
    case 'clock': return clockHTML(style, rw >= 150);
    case 'system': {
      const rows = style === 'minimal' || style === 'terminal';
      return `<div class="${rows ? 'w-rows' : 'tft-stats'}">${['ram', 'cpu', 'gpu'].map((t) => statHTML(statInfo(t), style, rw)).join('')}</div>`;
    }
    case 'cpu': case 'ram': case 'gpu': return `<div class="w-single">${statHTML(statInfo(w.type), style, rw)}</div>`;
    case 'spotify': return rw === D.W ? buildNowPlayingHTML() : spotifyCompactHTML();
    case 'text': return w.text ? `<div class="w-text">${style === 'terminal' ? '&gt; ' : ''}${esc(w.text)}</div>` : '';
    case 'image': return w.image ? `<img class="w-media" src="${w.image}" alt="">` : '<div class="w-empty">Imagen</div>';
    case 'video': return w.video ? `<video class="w-media" src="${fileUrl(w.video)}" autoplay muted loop playsinline></video>` : '<div class="w-empty">Video</div>';
    default: return '';
  }
}

// Colores del usuario como variables CSS del visor (los tonos intermedios salen por color-mix en el CSS).
function applyPreviewTheme() {
  const { accent, bg, text } = state.display.colors;
  document.querySelectorAll('#oledPreview, #sePreview').forEach((p) => {
    p.style.setProperty('--tft-accent', accent);
    p.style.setProperty('--tft-bg', bg);
    p.style.setProperty('--tft-text', text);
    p.dataset.style = state.display.style;
  });
}

// Rellena el contenedor con la pantalla activa (sin animaciones).
function paintOledScreen(content, index = currentScreenIndex) {
  const screen = state.display.screens[index];
  const style = state.display.style;
  const rects = D.slotRects(screen);
  content.dataset.screen = index;
  content.innerHTML = screen.slots.map((w, k) => {
    const [x, y, rw, rh] = rects[k];
    const pos = `left:${(x / D.W) * 100}%;top:${(y / D.H) * 100}%;width:${(rw / D.W) * 100}%;height:${(rh / D.H) * 100}%`;
    const media = w.type === 'image' || w.type === 'video';
    const div = media ? '' : `${x > 0 ? ' div-l' : ''}${y > 0 ? ' div-t' : ''}`;
    return `<div class="tft-slot w-${w.type}${div}" style="${pos}">${widgetHTML(w, rects[k], style)}</div>`;
  }).join('');
}

const OLED_EASE = 'cubic-bezier(.22,.9,.32,1)';
const prefersReducedMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

// Dibuja el visor. Con animate=true hace una transición: la pantalla que se
// va se desliza y se desenfoca hacia un lado mientras la nueva entra desde el
// otro, las filas entran escalonadas y el marco del visor da un destello.
// dir = +1 cuando avanza (entra por la derecha), -1 cuando retrocede.
function renderOledScreen(animate, dir = 1) {
  const content = $('#oledContent');
  if (!content) return;
  const preview = content.parentElement;
  const animated = !!animate && !prefersReducedMotion();

  // Copia de la pantalla saliente, para animarla mientras se pinta la nueva
  let ghost = null;
  if (animated && content.firstElementChild) {
    ghost = content.cloneNode(true);
    ghost.removeAttribute('id');
    ghost.classList.add('oled-ghost');
    ghost.style.left = content.offsetLeft + 'px';
    ghost.style.top = content.offsetTop + 'px';
    ghost.style.width = content.offsetWidth + 'px';
    ghost.style.height = content.offsetHeight + 'px';
    preview.appendChild(ghost);
  }

  applyPreviewTheme();
  paintOledScreen(content);
  if (screenHasNowPlaying()) updateNowPlayingView(spotifyState, { instant: true });
  else npStop();
  renderEditorPreview();

  if (!animated) return;

  const dx = 48 * dir;
  if (ghost) {
    const out = ghost.animate(
      [{ transform: 'translateX(0)', opacity: 1, filter: 'blur(0px)' },
       { transform: `translateX(${-dx}px)`, opacity: 0, filter: 'blur(3px)' }],
      { duration: 300, easing: OLED_EASE, fill: 'forwards' });
    out.onfinish = out.oncancel = () => ghost.remove();
  }
  content.animate(
    [{ transform: `translateX(${dx}px)`, opacity: 0, filter: 'blur(3px)' },
     { transform: 'translateX(0)', opacity: 1, filter: 'blur(0px)' }],
    { duration: 420, delay: 50, easing: OLED_EASE, fill: 'backwards' });

  content.querySelectorAll('.tft-clock-time, .tft-clock-date, .tft-stat, .tft-wait, .np-art, .np-meta')
    .forEach((el, i) => el.animate(
      [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: 320, delay: 90 + i * 55, easing: OLED_EASE, fill: 'backwards' }));

  preview.classList.remove('flash');
  void preview.offsetWidth;
  preview.classList.add('flash');
}

// Puntos indicadores: el de la pantalla activa se alarga (transición por CSS)
function renderOledDots() {
  const box = $('#oledDots');
  if (!box) return;
  if (box.childElementCount !== screenCount()) {
    box.innerHTML = Array.from({ length: screenCount() }, () => '<span></span>').join('');
  }
  Array.from(box.children).forEach((d, i) => d.classList.toggle('on', i === currentScreenIndex));
}

// Único punto de entrada para cambiar de pantalla (botón de la app, botón de
// la matriz vía SCR:n, etc.). Elige el camino más corto para decidir hacia dónde desliza.
function setOledScreen(n, animate = true) {
  const N = screenCount();
  n = ((Number(n) % N) + N) % N;
  if (n === currentScreenIndex) return; // p. ej. el eco SCR:n del dispositivo tras el clic local
  const forward = (n - currentScreenIndex + N) % N;
  const dir = forward <= N / 2 ? 1 : -1;
  currentScreenIndex = n;
  renderOledDots();
  renderOledScreen(animate, dir);
  if (window.deckAPI && window.deckAPI.spotify) window.deckAPI.spotify.setViewScreen(n);
}

function setupScreenSwitcher() {
  renderOledDots();
  renderOledScreen(); // estado inicial, sin animar
  if (window.deckAPI && window.deckAPI.spotify) window.deckAPI.spotify.setViewScreen(currentScreenIndex);
  if (!window.deckAPI) return;

  if (window.deckAPI.screen) {
    window.deckAPI.screen.onChanged((n) => { setOledScreen(n); pushScreenMedia(); }); // cambio real: animar y mandarle sus imágenes/video
  }
  if (window.deckAPI.system) {
    window.deckAPI.system.onStats((stats) => {
      lastSysStats = stats;
      if (screenUsesStats()) renderOledScreen();
    });
  }

  const btnNext = $('#btnScreenNext');
  if (btnNext) {
    btnNext.onclick = async () => {
      btnNext.classList.remove('go');
      void btnNext.offsetWidth;
      btnNext.classList.add('go'); // la flecha "sale y vuelve a entrar"
      // Cambia local YA, sin esperar al dispositivo — así se puede
      // probar cómo se ve incluso sin nada conectado todavía.
      setOledScreen(currentScreenIndex + 1);
      // Si además hay un RHub real conectado, lo sincroniza también.
      if (window.deckAPI.screen) await window.deckAPI.screen.next();
    };
  }
}
document.addEventListener('DOMContentLoaded', () => setupScreenSwitcher());

/* ---------- Imágenes y video hacia el RHub (búfer de imagen del firmware) ---------- */
const media = { token: 0, videoEl: null, pushTimer: null };

// Dibuja el contenido llenando w x h y recortando lo que sobre (como object-fit: cover).
function coverDraw(ctx, el, srcW, srcH, w, h) {
  const s = Math.max(w / srcW, h / srcH);
  const sw = w / s, sh = h / s;
  ctx.drawImage(el, (srcW - sw) / 2, (srcH - sh) / 2, sw, sh, 0, 0, w, h);
}

async function imageBytes(src, w, h) {
  const img = new Image();
  img.src = src;
  await img.decode();
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  coverDraw(ctx, img, img.naturalWidth, img.naturalHeight, w, h);
  return D.rgbaTo565(ctx.getImageData(0, 0, w, h).data);
}

function stopVideoStream() {
  media.token++;
  if (media.videoEl) {
    media.videoEl.pause();
    media.videoEl.removeAttribute('src');
    media.videoEl.load();
    media.videoEl = null;
  }
}

// Transmite el video al RHub mientras su pantalla esté activa (cada cuadro espera el ACK del ESP32).
async function streamVideo(path, token) {
  const v = document.createElement('video');
  v.muted = true; v.loop = true; v.playsInline = true;
  v.src = fileUrl(path);
  media.videoEl = v;
  v.play().catch(() => toast('No se pudo abrir el video', 'error'));
  const cv = document.createElement('canvas');
  cv.width = D.VIDEO_W; cv.height = D.VIDEO_H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  while (token === media.token) {
    const t0 = performance.now();
    let ok = false;
    if (v.readyState >= 2 && v.videoWidth) {
      coverDraw(ctx, v, v.videoWidth, v.videoHeight, D.VIDEO_W, D.VIDEO_H);
      const bytes = D.rgbaTo565(ctx.getImageData(0, 0, D.VIDEO_W, D.VIDEO_H).data);
      ok = await window.deckAPI.screen.sendImage({ x: 0, y: 0, w: D.VIDEO_W, h: D.VIDEO_H, scale: 2 }, bytes);
    }
    // hasta ~25 cuadros por segundo; si el RHub no respondió, reintenta con calma
    await new Promise((r) => setTimeout(r, ok ? Math.max(0, 40 - (performance.now() - t0)) : 300));
  }
}

// Manda lo que necesita la pantalla activa del RHub: las imágenes de sus huecos y, si tiene, el video en vivo.
async function pushScreenMedia() {
  stopVideoStream();
  if (!state.connected || !window.deckAPI || !window.deckAPI.screen || !window.deckAPI.screen.sendImage) return;
  const token = media.token;
  const screen = currentScreen();
  const rects = D.slotRects(screen);
  for (const [k, w] of screen.slots.entries()) {
    if (token !== media.token) return;
    const [x, y, rw, rh] = rects[k];
    if (w.type === 'image' && w.image) {
      try {
        await window.deckAPI.screen.sendImage({ x, y, w: rw, h: rh, scale: 1 }, await imageBytes(w.image, rw, rh));
      } catch (e) { console.error('Imagen para el RHub:', e); }
    } else if (w.type === 'video' && w.video) {
      streamVideo(w.video, token);
    }
  }
}

function schedulePushMedia(delay = 250) {
  clearTimeout(media.pushTimer);
  media.pushTimer = setTimeout(pushScreenMedia, delay);
}

/* ---------- Editor de pantallas (botón "Personalizar") ---------- */
const SLOT_LABELS = {
  full: ['Pantalla completa'],
  split: ['Izquierda', 'Derecha'],
  thirds: ['Izquierda', 'Centro', 'Derecha'],
  big2: ['Grande', 'Arriba', 'Abajo'],
};
const SE_ICONS = {
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};

// Único punto para cambiar state.display: valida, guarda (main.js lo manda al RHub) y repinta.
function updateDisplay(mutate, { pushMedia = true, rerenderEditor = true } = {}) {
  mutate(state.display);
  state.display = D.normalize(state.display);
  if (currentScreenIndex >= screenCount()) currentScreenIndex = 0;
  saveState();
  applyPreviewTheme();
  renderOledDots();
  renderOledScreen();
  if (rerenderEditor) renderScreenEditor();
  if (pushMedia) schedulePushMedia();
}

function slotExtraHTML(w, i, k) {
  if (w.type === 'text') {
    return `<input type="text" class="input se-text" data-i="${i}" data-k="${k}" maxlength="${D.MAX_TEXT}" placeholder="Texto a mostrar" value="${esc(w.text || '')}">`;
  }
  if (w.type === 'image') {
    return `<div class="se-media">${w.image ? `<img src="${w.image}" alt="">` : ''}
      <button type="button" class="btn se-pick" data-kind="image" data-i="${i}" data-k="${k}">${w.image ? 'Cambiar imagen' : 'Elegir imagen'}</button></div>`;
  }
  if (w.type === 'video') {
    const name = w.video ? w.video.split(/[\\/]/).pop() : '';
    return `<div class="se-media">${name ? `<span class="se-file" title="${esc(w.video)}">${esc(name)}</span>` : ''}
      <button type="button" class="btn se-pick" data-kind="video" data-i="${i}" data-k="${k}">${name ? 'Cambiar video' : 'Elegir video'}</button></div>`;
  }
  return '';
}

let seIndex = 0;   // pantalla que muestra la vista previa del editor (no cambia la del RHub)
function renderEditorPreview() {
  const box = $('#screenEditorOverlay'), c = $('#seContent');
  if (!c || !box.classList.contains('open') || !state.display.screens[seIndex]) return;
  paintOledScreen(c, seIndex);
  $('#sePreviewLabel').textContent = `Pantalla ${seIndex + 1}`;
}

function renderScreenEditor() {
  const box = $('#screenEditorOverlay');
  if (!box || !box.classList.contains('open')) return;
  const d = state.display;
  seIndex = Math.min(seIndex, d.screens.length - 1);
  renderEditorPreview();
  $('#seStyles').innerHTML = D.STYLES.map((s) => `
    <button type="button" class="se-style${s.id === d.style ? ' on' : ''}" data-style="${s.id}">
      <span class="se-style-prev" style="background:${s.colors.bg};color:${s.colors.text}">12<b style="color:${s.colors.accent}">:</b>34</span>
      ${s.label}
    </button>`).join('');
  $('#seAccent').value = d.colors.accent;
  $('#seBg').value = d.colors.bg;
  $('#seText').value = d.colors.text;
  $('#seCount').textContent = `${d.screens.length} de ${D.MAX_SCREENS}`;
  $('#seAddScreen').disabled = d.screens.length >= D.MAX_SCREENS;
  $('#seScreens').innerHTML = d.screens.map((s, i) => `
    <div data-i="${i}" class="se-screen${i === seIndex ? ' current' : ''}">
      <div class="se-screen-head">
        <span class="se-screen-name">Pantalla ${i + 1}</span>
        <select class="input se-layout" data-i="${i}" aria-label="Distribución de la pantalla ${i + 1}">
          ${D.LAYOUTS.map((l) => `<option value="${l.id}"${l.id === s.layout ? ' selected' : ''}>${l.label}</option>`).join('')}
        </select>
        <button type="button" class="se-icon" data-act="up" data-i="${i}" aria-label="Subir pantalla ${i + 1}"${i === 0 ? ' disabled' : ''}>${SE_ICONS.up}</button>
        <button type="button" class="se-icon" data-act="down" data-i="${i}" aria-label="Bajar pantalla ${i + 1}"${i === d.screens.length - 1 ? ' disabled' : ''}>${SE_ICONS.down}</button>
        <button type="button" class="se-icon" data-act="del" data-i="${i}" aria-label="Borrar pantalla ${i + 1}"${d.screens.length === 1 ? ' disabled' : ''}>${SE_ICONS.del}</button>
      </div>
      ${s.slots.map((w, k) => `
        <div class="se-slot">
          <span class="se-slot-label">${SLOT_LABELS[s.layout][k]}</span>
          <select class="input se-widget" data-i="${i}" data-k="${k}" aria-label="Widget de ${SLOT_LABELS[s.layout][k]}">
            ${D.WIDGETS.filter((m) => !m.fullOnly || s.layout === 'full').map((m) => `<option value="${m.id}"${m.id === w.type ? ' selected' : ''}>${m.label}</option>`).join('')}
          </select>
          ${slotExtraHTML(w, i, k)}
        </div>`).join('')}
    </div>`).join('');
}

// Achica la imagen elegida (lado mayor 568 px) para que la config no pese de más.
async function loadPickedImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const s = Math.min(1, 568 / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.naturalWidth * s);
    cv.height = Math.round(img.naturalHeight * s);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', 0.88);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function setupScreenEditor() {
  const overlay = $('#screenEditorOverlay');
  const fileInput = $('#seFile');
  if (!overlay) return;
  let pickTarget = null;
  let textTimer = null;

  const open = () => { seIndex = currentScreenIndex; overlay.classList.add('open'); renderScreenEditor(); };
  // La vista previa del editor sigue a la pantalla que tocas o editas.
  overlay.addEventListener('pointerdown', (e) => {
    const card = e.target.closest('.se-screen');
    if (card && +card.dataset.i !== seIndex) { seIndex = +card.dataset.i; renderEditorPreview(); overlay.querySelectorAll('.se-screen').forEach((c) => c.classList.toggle('current', +c.dataset.i === seIndex)); }
  });
  const close = () => overlay.classList.remove('open');
  $('#btnScreenEdit').onclick = open;
  $('#seClose').onclick = close;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  overlay.addEventListener('click', (e) => {
    const style = e.target.closest('.se-style');
    if (style) {
      const def = D.STYLES.find((s) => s.id === style.dataset.style);
      updateDisplay((d) => { d.style = def.id; d.colors = { ...def.colors }; }, { pushMedia: false });
      return;
    }
    const act = e.target.closest('.se-icon');
    if (act && !act.disabled) {
      const i = +act.dataset.i;
      updateDisplay((d) => {
        const s = d.screens;
        if (act.dataset.act === 'up') [s[i - 1], s[i]] = [s[i], s[i - 1]];
        if (act.dataset.act === 'down') [s[i + 1], s[i]] = [s[i], s[i + 1]];
        if (act.dataset.act === 'del') s.splice(i, 1);
      });
      return;
    }
    const pick = e.target.closest('.se-pick');
    if (pick) {
      pickTarget = { kind: pick.dataset.kind, i: +pick.dataset.i, k: +pick.dataset.k };
      fileInput.accept = pickTarget.kind === 'image' ? 'image/*' : 'video/*';
      fileInput.value = '';
      fileInput.click();
    }
  });

  $('#seAddScreen').onclick = () => updateDisplay((d) => { d.screens.push({ layout: 'full', slots: [{ type: 'clock' }] }); });
  $('#seResetColors').onclick = () => {
    const def = D.STYLES.find((s) => s.id === state.display.style);
    updateDisplay((d) => { d.colors = { ...def.colors }; }, { pushMedia: false });
  };

  // Colores: el visor cambia mientras arrastras; se guarda al soltar.
  [['seAccent', 'accent'], ['seBg', 'bg'], ['seText', 'text']].forEach(([id, key]) => {
    const input = $('#' + id);
    input.addEventListener('input', () => { state.display.colors[key] = input.value; applyPreviewTheme(); });
    input.addEventListener('change', () => updateDisplay((d) => { d.colors[key] = input.value; }, { pushMedia: false, rerenderEditor: false }));
  });

  overlay.addEventListener('change', (e) => {
    const t = e.target;
    if (t.classList.contains('se-layout')) {
      updateDisplay((d) => { d.screens[+t.dataset.i].layout = t.value; });
    } else if (t.classList.contains('se-widget')) {
      updateDisplay((d) => { d.screens[+t.dataset.i].slots[+t.dataset.k] = { type: t.value }; });
    }
  });

  overlay.addEventListener('input', (e) => {
    const t = e.target;
    if (!t.classList.contains('se-text')) return;
    clearTimeout(textTimer);
    textTimer = setTimeout(() => updateDisplay((d) => { d.screens[+t.dataset.i].slots[+t.dataset.k].text = t.value; },
      { pushMedia: false, rerenderEditor: false }), 300);
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file || !pickTarget) return;
    const { kind, i, k } = pickTarget;
    try {
      if (kind === 'image') {
        const image = await loadPickedImage(file);
        updateDisplay((d) => { d.screens[i].slots[k] = { type: 'image', image }; });
      } else {
        const video = window.deckAPI.screen.pathForFile(file);
        if (!video) { toast('No se pudo leer la ruta del video', 'error'); return; }
        updateDisplay((d) => { d.screens[i].slots[k] = { type: 'video', video }; });
      }
    } catch (err) {
      console.error(err);
      toast(kind === 'image' ? 'No se pudo abrir la imagen' : 'No se pudo abrir el video', 'error');
    }
  });
}
document.addEventListener('DOMContentLoaded', () => setupScreenEditor());

document.addEventListener('DOMContentLoaded', async () => {
  const splashStart = Date.now();
  await init();
  // Que se vea al menos ~3s, aunque init() termine antes.
  const remaining = 3000 - (Date.now() - splashStart);
  setTimeout(() => {
    const splash = $('#splashScreen');
    if (splash) { splash.classList.add('fade-out'); setTimeout(() => splash.remove(), 550); }
  }, Math.max(remaining, 0));
});

/* =====================================================================
   SPOTIFY (lado ventana)
   - Íconos/estado de los botones de Spotify en el deck
   - Pantalla "Ahora suena" del visor (espejo de la pantalla 3 de la TFT)
   - Sección Spotify de Configuración (Client ID, conectar, desconectar)

   La lógica real (API, tokens, acciones) vive en spotify.js (main.js).
   Aquí solo se pinta lo que main.js manda por spotify:state / :status.
   ===================================================================== */

// Ícono según acción y estado (play↔pausa, corazón lleno, repetir-1…)
function spotifyIconFor(action, snap) {
  if (!action) return 'spotify';
  switch (action) {
    case 'play_pause': return snap && snap.isPlaying ? 'sp_pause' : 'sp_play';
    case 'like':       return snap && snap.liked === true ? 'sp_heartFill' : 'sp_heart';
    case 'repeat':     return snap && snap.repeat === 'track' ? 'sp_repeatOne' : 'sp_repeat';
    default: {
      const meta = (window.SPOTIFY_ACTIONS || []).find(a => a.id === action);
      return meta ? meta.icon : 'spotify';
    }
  }
}

// ¿El modo del botón está "encendido"? (aleatorio, repetir, me gusta)
function spotifyToggleOn(action, snap) {
  if (!snap) return false;
  if (action === 'shuffle') return !!snap.shuffle;
  if (action === 'repeat') return !!snap.repeat && snap.repeat !== 'off';
  if (action === 'like') return snap.liked === true;
  return false;
}

function populateSpotifySelect() {
  const box = $('#spotifyActionSelect .custom-select-options');
  const actions = window.SPOTIFY_ACTIONS || [];
  if (!box || !actions.length) return;
  box.innerHTML = actions.map((a, i) =>
    `<div class="custom-select-option${i === 0 ? ' selected' : ''}" data-value="${a.id}">${a.label}</div>`).join('');
  const trigger = $('#spotifyActionSelect .custom-select-trigger span');
  if (trigger) trigger.textContent = actions[0].label;
}

function updateSpotifyFieldHints() {
  const hint = $('#spotifyActionHint');
  const sel = $('#spotifyActionSelect');
  if (hint && sel && sel.getValue) {
    const meta = (window.SPOTIFY_ACTIONS || []).find(a => a.id === sel.getValue());
    hint.textContent = meta ? meta.desc : '';
  }
  const note = $('#spotifyConnNote');
  if (note) {
    const st = spotifyStatus && spotifyStatus.state;
    if (!window.deckAPI || st === 'connected') { note.style.display = 'none'; note.innerHTML = ''; }
    else {
      note.style.display = 'block';
      note.innerHTML = `Spotify no está conectado. <button type="button" class="link-btn" id="spOpenSettings">Abrir Configuración</button>`;
      const b = $('#spOpenSettings');
      if (b) b.onclick = () => $('#btnSettings').click();
    }
  }
}

// Cambia el ícono con una transición corta (sale girando, entra con rebote)
function swapIcon(box, html) {
  if (prefersReducedMotion() || !box.animate) { box.innerHTML = html; return; }
  const out = box.animate(
    [{ transform: 'scale(1) rotate(0deg)', opacity: 1 }, { transform: 'scale(.4) rotate(-40deg)', opacity: 0 }],
    { duration: 110, easing: 'ease-in' });
  out.onfinish = () => {
    box.innerHTML = html;
    box.animate(
      [{ transform: 'scale(.4) rotate(40deg)', opacity: 0 }, { transform: 'scale(1) rotate(0deg)', opacity: 1 }],
      { duration: 280, easing: 'cubic-bezier(.34,1.56,.64,1)' });
  };
}

function updateSpotifyDeckButtons() {
  $$('.deck-btn[data-sp-action]').forEach((el) => {
    const action = el.dataset.spAction;
    const key = spotifyIconFor(action, spotifyState);
    el.classList.toggle('sp-on', spotifyToggleOn(action, spotifyState));
    if (el.dataset.spIcon !== key) {
      el.dataset.spIcon = key;
      const box = el.querySelector('.btn-icon');
      if (box) swapIcon(box, svgIcon(key, 30));
    }
  });
  const caIcon = $('#caIcon');
  const idx = state.selectedIndex;
  if (caIcon && idx !== null) {
    const btn = getActiveProfile().buttons[idx];
    if (btn && btn.type === 'spotify') caIcon.innerHTML = TYPE_ICON[resolveIconKey(btn)] || TYPE_ICON.spotify;
  }
}

/* --------------------------- pantalla "Ahora suena" --------------------------- */
const npView = { raf: 0, lastCur: '' };

function nowPlayingRoot() { return $('#oledContent .np'); }

function fmtTime(ms) {
  const s = Math.max(0, Math.floor((ms || 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function buildNowPlayingHTML() {
  return `
    <div class="np" data-mode="off" style="--np-color:#dfe7ea">
      <div class="np-glow"></div>
      <div class="np-art">
        <img class="np-img" alt="" draggable="false">
        <span class="np-ph">${svgIcon('media', 22)}</span>
        <span class="np-badge">${svgIcon('sp_pause', 9)}</span>
      </div>
      <div class="np-meta">
        <div class="np-title"><span></span></div>
        <div class="np-artist"><span></span></div>
        <div class="np-flags">
          <span class="np-flag np-shuffle">${svgIcon('sp_shuffle', 11)}</span>
          <span class="np-flag np-repeat">${svgIcon('sp_repeat', 11)}</span>
          <span class="np-flag np-like">${svgIcon('sp_heart', 11)}</span>
        </div>
        <div class="np-progress">
          <div class="np-bar"><div class="np-fill"></div></div>
          <div class="np-times"><span class="np-t-cur">0:00</span><span class="np-t-dur">-:--</span></div>
        </div>
      </div>
    </div>`;
}

function npMode(snap) {
  if (!snap || (snap.status !== 'connected' && snap.status !== 'reauth')) return 'off';
  if (snap.status === 'reauth') return 'reauth';
  if (!snap.active || !snap.title) return 'idle';
  return snap.isPlaying ? 'playing' : 'paused';
}

// Título/artista: si no caben, hacen un vaivén de lectura (marquesina).
// Se maneja con Web Animations para poder cancelarla limpiamente cada vez
// que cambia el texto (así nunca queda una animación vieja desplazando el nuevo).
function setNpText(wrap, text) {
  const span = wrap.firstElementChild;
  span.getAnimations().forEach((a) => a.cancel());
  wrap.classList.remove('scroll');
  span.textContent = text || '';
  if (prefersReducedMotion() || !span.animate) return;
  requestAnimationFrame(() => {
    if (span.textContent !== (text || '')) return; // ya cambió otra vez
    const over = span.scrollWidth - wrap.clientWidth;
    if (over <= 4) return;
    const dx = over + 8;
    span.getAnimations().forEach((a) => a.cancel());
    wrap.classList.add('scroll');
    span.animate(
      [{ transform: 'translateX(0)', offset: 0 },
       { transform: 'translateX(0)', offset: 0.18 },
       { transform: `translateX(${-dx}px)`, offset: 0.52 },
       { transform: `translateX(${-dx}px)`, offset: 0.68 },
       { transform: 'translateX(0)', offset: 1 }],
      { duration: Math.max(6, dx / 16) * 1000, iterations: Infinity, easing: 'ease-in-out' });
  });
}

function updateNowPlayingView(snap, opts = {}) {
  const root = nowPlayingRoot();
  if (!root) return;
  const mode = npMode(snap);
  const instant = !!opts.instant || prefersReducedMotion();
  const live = mode === 'playing' || mode === 'paused';
  root.dataset.mode = mode;

  // Textos (con una transición corta cuando cambia la canción)
  let title, artist;
  if (mode === 'off')         { title = 'Conecta Spotify';  artist = 'Configuración → Spotify'; }
  else if (mode === 'reauth') { title = 'Reconecta Spotify'; artist = 'La sesión venció'; }
  else if (mode === 'idle')   { title = 'Nada sonando';      artist = 'Dale play en Spotify'; }
  else                        { title = snap.title;          artist = snap.artist || snap.album || ''; }
  const key = live ? (snap.trackId || snap.title) : mode;
  if (root.dataset.key !== key) {
    const hadPrev = !!root.dataset.key;
    root.dataset.key = key;
    setNpText(root.querySelector('.np-title'), title);
    setNpText(root.querySelector('.np-artist'), artist);
    if (hadPrev && !instant) {
      root.querySelector('.np-meta').animate(
        [{ opacity: 0, transform: 'translateY(7px)' }, { opacity: 1, transform: 'translateY(0)' }],
        { duration: 320, easing: OLED_EASE });
    }
  }

  // Portada: se precarga y aparece con un fundido + zoom suave
  const url = live ? (snap.artUrl || '') : '';
  if (root.dataset.art !== url) {
    root.dataset.art = url;
    const img = root.querySelector('.np-img');
    if (!url) { img.classList.remove('ready'); img.removeAttribute('src'); }
    else {
      const pre = new Image();
      pre.onload = () => {
        if (root.dataset.art !== url) return;
        img.src = url;
        img.classList.add('ready');
        if (!instant) img.animate(
          [{ opacity: 0, transform: 'scale(1.14)' }, { opacity: 1, transform: 'scale(1)' }],
          { duration: 450, easing: OLED_EASE });
      };
      pre.src = url;
    }
  }
  if (snap && snap.artColor) root.style.setProperty('--np-color', snap.artColor);

  // Iconos de estado (aleatorio / repetir / me gusta)
  root.querySelector('.np-shuffle').classList.toggle('on', live && !!snap.shuffle);
  const rep = root.querySelector('.np-repeat');
  rep.classList.toggle('on', live && snap.repeat !== 'off');
  const repKey = live && snap.repeat === 'track' ? 'sp_repeatOne' : 'sp_repeat';
  if (rep.dataset.icon !== repKey) { rep.dataset.icon = repKey; rep.innerHTML = svgIcon(repKey, 11); }
  const like = root.querySelector('.np-like');
  like.classList.toggle('on', live && snap.liked === true);
  const likeKey = live && snap.liked === true ? 'sp_heartFill' : 'sp_heart';
  if (like.dataset.icon !== likeKey) { like.dataset.icon = likeKey; like.innerHTML = svgIcon(likeKey, 11); }

  root.querySelector('.np-t-dur').textContent = live && snap.durationMs ? fmtTime(snap.durationMs) : '-:--';
  npKick();
}

// Barra de progreso: se anima a 60 fps desde el último dato (main.js manda uno cada ~3 s).
function npTick() {
  npView.raf = 0;
  const root = nowPlayingRoot();
  const snap = spotifyState;
  if (!root || !screenHasNowPlaying()) return;
  const live = snap && snap.status === 'connected' && snap.active && snap.title;
  let prog = 0;
  let pct = 0;
  if (live && snap.durationMs) {
    prog = snap.isPlaying ? Math.min(snap.durationMs, snap.progressMs + (Date.now() - snap.at)) : snap.progressMs;
    pct = prog / snap.durationMs;
  }
  root.querySelector('.np-fill').style.transform = `scaleX(${pct})`;
  const t = live ? fmtTime(prog) : '0:00';
  if (t !== npView.lastCur) { npView.lastCur = t; root.querySelector('.np-t-cur').textContent = t; }
  if (live && snap.isPlaying) npView.raf = requestAnimationFrame(npTick);
}
function npKick() { if (!npView.raf) npView.raf = requestAnimationFrame(npTick); }
function npStop() { if (npView.raf) cancelAnimationFrame(npView.raf); npView.raf = 0; }

/* ------------------------------ eventos y ajustes ------------------------------ */
function onSpotifyState(snap) {
  spotifyState = snap;
  updateSpotifyDeckButtons();
  if (screenHasNowPlaying()) updateNowPlayingView(snap);
  else if (D.hasType(currentScreen(), 'spotify')) renderOledScreen();   // Spotify chico: se repinta
}

function setupSpotifyUI() {
  const api = window.deckAPI && window.deckAPI.spotify;
  if (!api) return;

  const sel = $('#spotifyActionSelect');
  if (sel) sel.addEventListener('change', updateSpotifyFieldHints);

  api.onState(onSpotifyState);
  api.onArt((art) => {
    if (spotifyState && spotifyState.artUrl === art.url) {
      spotifyState.artColor = art.color;
      if (screenHasNowPlaying()) updateNowPlayingView(spotifyState);
    }
  });
  api.onNotice((n) => toast(n.message, n.type));
  api.onStatus((st) => { spotifyStatus = st; renderSpotifySettings(); updateSpotifyFieldHints(); });

  api.getStatus().then((st) => { spotifyStatus = st; renderSpotifySettings(); updateSpotifyFieldHints(); });
  api.getState().then((snap) => { if (snap) onSpotifyState(snap); });

  // --- Configuración > Spotify ---
  const clientInput = $('#spClientId');
  const btnConnect = $('#spConnect');
  const btnDisconnect = $('#spDisconnect');
  const msg = $('#spMsg');
  const uri = $('#spRedirectUri');

  const setMsg = (text, kind) => { msg.textContent = text || ''; msg.dataset.kind = kind || ''; };

  $('#spCopyUri').onclick = async () => {
    try { await navigator.clipboard.writeText(uri.textContent); toast('Redirect URI copiado', 'success'); }
    catch (e) { toast('No se pudo copiar', 'error'); }
  };

  btnConnect.onclick = async () => {
    setMsg('');
    const saved = await api.setClientId(clientInput.value);
    if (!saved.ok) { setMsg(saved.error, 'error'); return; }
    if (!clientInput.value.trim()) { setMsg('Pega primero el Client ID de tu app de Spotify.', 'error'); return; }
    btnConnect.classList.add('busy');
    btnConnect.textContent = 'Esperando al navegador…';
    const r = await api.connect();
    btnConnect.classList.remove('busy');
    btnConnect.textContent = 'Conectar Spotify';
    if (r.ok) { setMsg('', ''); toast('Spotify conectado', 'success'); }
    else if (r.error !== 'cancelado') setMsg(r.error, 'error');
  };

  btnDisconnect.onclick = async () => { await api.disconnect(); setMsg('Sesión de Spotify cerrada.', 'info'); };
}

function renderSpotifySettings() {
  const st = spotifyStatus;
  const box = $('#spStatus');
  if (!st || !box) return;
  const text = $('#spStatusText');
  const clientInput = $('#spClientId');
  const msg = $('#spMsg');
  $('#spRedirectUri').textContent = st.redirectUri;
  if (clientInput && document.activeElement !== clientInput) clientInput.value = st.clientId || '';

  box.dataset.state = st.state;
  const labels = {
    'no-client': 'Falta el Client ID',
    disconnected: 'Sin conectar',
    reauth: 'La sesión venció · vuelve a conectar',
    connected: st.userName ? `Conectado como ${st.userName}` : 'Conectado',
  };
  text.textContent = labels[st.state] || st.state;
  $('#spDisconnect').style.display = st.state === 'connected' || st.state === 'reauth' ? '' : 'none';
  $('#spConnect').textContent = st.state === 'reauth' ? 'Reconectar' : (st.state === 'connected' ? 'Volver a conectar' : 'Conectar Spotify');

  if (msg && msg.dataset.kind !== 'error') {
    if (st.state === 'connected' && st.error) { msg.textContent = st.error; msg.dataset.kind = 'warn'; }
    else if (st.state === 'connected' && st.reauthBy) {
      msg.textContent = `Spotify pide reconectar cada ~6 meses (próxima vez: hacia el ${new Date(st.reauthBy).toLocaleDateString(i18n.getLang())}).`;
      msg.dataset.kind = 'info';
    } else { msg.textContent = ''; msg.dataset.kind = ''; }
  }
}

document.addEventListener('DOMContentLoaded', () => setupSpotifyUI());