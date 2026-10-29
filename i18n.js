/* Idioma de la app (es / en). El código y el HTML están escritos en español; este
 * módulo traduce al inglés en el momento de mostrar: busca cada texto en el
 * diccionario EN (texto exacto) y, si no está, en las reglas RX (textos con números
 * o nombres adentro). Un texto sin traducción se queda en español.
 * Para agregar un texto nuevo basta una línea en EN o RX. */
(function (root) {
  const EN = {
    // Encabezado y perfiles
    'OBS desconectado': 'OBS disconnected', 'OBS Desconectado': 'OBS disconnected', 'OBS conectado': 'OBS connected',
    'RHub desconectado': 'RHub disconnected', 'RHub conectado': 'RHub connected',
    'Conectar': 'Connect', 'Desconectar': 'Disconnect', 'Configuración': 'Settings',
    'Perfiles': 'Profiles', 'Nuevo perfil': 'New profile', 'Exportar JSON': 'Export JSON', 'Importar JSON': 'Import JSON',
    'Arrastra acciones o reordena los botones': 'Drag actions or reorder the buttons',
    'Arrastrar para mover': 'Drag to move',
    'Cambiar pantalla': 'Change screen', 'Personalizar': 'Customize',
    'Pasa a la siguiente pantalla del RHub': 'Switches to the next RHub screen',
    'Estilo, colores y widgets de las pantallas': 'Style, colors and widgets for the screens',
    // Panel de configuración
    'Configurar Acción': 'Configure Action',
    'Arrastra una acción o haz clic en un botón': 'Drag an action or click a button',
    'Arrastra una acción desde la biblioteca hacia cualquier botón del deck o haz clic en uno configurado.': 'Drag an action from the library onto any deck button, or click one that is already set up.',
    'Sin acción': 'No action', 'Ninguna acción asignada': 'No action assigned', 'Acción': 'Action', 'Configurar': 'Configure',
    'Etiqueta del botón (opcional)': 'Button label (optional)',
    'Máximo 12 caracteres. Si está vacío, solo se mostrará el ícono.': 'Max 12 characters. If empty, only the icon is shown.',
    'Deja vacío para solo mostrar ícono': 'Leave empty to show only the icon',
    'Método de asignación': 'Assignment method', '⌨️ Capturar': '⌨️ Capture', '📋 Seleccionar': '📋 Select',
    'Presiona la tecla en tu teclado': 'Press the key on your keyboard', 'Haz clic aquí y presiona una tecla': 'Click here and press a key',
    'Selecciona una tecla': 'Select a key', 'PRESIONA UNA TECLA...': 'PRESS A KEY...', 'PRESIONA EL ATAJO...': 'PRESS THE SHORTCUT...',
    'Clic y presiona una tecla': 'Click and press a key', 'Clic y presiona el atajo': 'Click and press the shortcut',
    '↑ Flecha Arriba': '↑ Up Arrow', '↓ Flecha Abajo': '↓ Down Arrow', '← Flecha Izquierda': '← Left Arrow', '→ Flecha Derecha': '→ Right Arrow',
    'Espacio': 'Space', 'Bloq Mayús': 'Caps Lock', 'Bloq Num': 'Num Lock', 'Bloq Despl': 'Scroll Lock', 'Impr Pant': 'Print Screen', 'Pausa': 'Pause',
    '▶️ Play/Pausa': '▶️ Play/Pause', '⏭️ Siguiente': '⏭️ Next', '⏮️ Anterior': '⏮️ Previous', '🔊 Volumen +': '🔊 Volume +', '🔉 Volumen -': '🔉 Volume -', '🔇 Silenciar': '🔇 Mute',
    'Vista previa:': 'Preview:', 'Vista previa': 'Preview',
    'Presiona para capturar la combinación': 'Press to capture the combination', 'Haz clic aquí y presiona el atajo': 'Click here and press the shortcut',
    'Acción de OBS': 'OBS action', 'Cambiar a escena': 'Switch to scene', 'Alternar silenciar micrófono': 'Toggle mic mute',
    'Iniciar / Detener Transmisión': 'Start / Stop Streaming', 'Iniciar / Detener Grabación': 'Start / Stop Recording',
    'Seleccionar escena de OBS': 'Select OBS scene', 'Cargando escenas...': 'Loading scenes...', 'Sin escenas': 'No scenes',
    'Cuenta de Steam': 'Steam account', 'Buscando cuentas...': 'Looking for accounts...', 'Volver a buscar cuentas': 'Search for accounts again',
    'Sin cuentas detectadas': 'No accounts detected', '(pedirá contraseña)': '(will ask for password)',
    'Seleccionar archivo de audio (.mp3, .wav, .ogg)': 'Select audio file (.mp3, .wav, .ogg)',
    'Acción de Perfil': 'Profile action', 'Siguiente Perfil': 'Next Profile', 'Perfil Anterior': 'Previous Profile',
    'Pasa a la siguiente pantalla del RHub (hora → sistema → ahora suena), igual que el botón "Cambiar pantalla" de la app.': 'Switches to the next RHub screen (clock → system → now playing), just like the app\'s "Change screen" button.',
    'Pasos a ejecutar en orden:': 'Steps to run in order:', 'Agregar Paso': 'Add Step', '+ Agregar Paso': '+ Add Step',
    'Función de Streamer': 'Streamer function', 'Crear Clip en Twitch': 'Create Twitch Clip',
    'Enviar comando !redes en chat': 'Send !redes command in chat', 'Enviar comando !discord en chat': 'Send !discord command in chat',
    'Nombre de tu canal (ej: ibai)': 'Your channel name (e.g. ibai)', 'Tu canal de Twitch o Kick': 'Your Twitch or Kick channel',
    'Control multimedia': 'Media control', 'Reproducir / Pausar': 'Play / Pause', 'Siguiente canción': 'Next track', 'Canción anterior': 'Previous track',
    'Detener reproducción': 'Stop playback', 'Subir volumen': 'Volume up', 'Bajar volumen': 'Volume down', 'Silenciar audio': 'Mute audio',
    'Acción de Spotify': 'Spotify action', 'Ruta o Enlace Web': 'Path or Web Link', 'Texto a escribir': 'Text to type',
    'Ej: spotify: , discord: , https://youtube.com o calc:': 'E.g. spotify: , discord: , https://youtube.com or calc:',
    'Texto que se tipeará...': 'Text to be typed...', 'https:// o ruta a un .exe': 'https:// or path to an .exe',
    'Guardar': 'Save', 'Limpiar': 'Clear', 'Guardado': 'Saved', 'Esperar (ms)': 'Wait (ms)', 'Escribir texto': 'Type text', 'Abrir Enlace/App': 'Open Link/App',
    'Abrir Enlace/Aplicación': 'Open Link/App', 'Atajo de teclado': 'Keyboard shortcut', 'Tecla': 'Key', 'Esperar': 'Wait', 'Mensajería': 'Messaging',
    // Biblioteca
    'Biblioteca': 'Library', 'Teclado y atajos': 'Keyboard & shortcuts', 'Tecla simple': 'Single key', 'Asigna A-Z, Enter, F1-F12': 'Assign A-Z, Enter, F1-F12',
    'Combinación': 'Key combo', 'Atajos Ctrl, Alt, Shift': 'Ctrl, Alt, Shift shortcuts', 'Cadena Acciones': 'Action Chain', 'Macro multiestación': 'Multi-step macro',
    'Abrir App / URL': 'Open App / URL', 'Lanza programas o web': 'Launches programs or web', 'Macro de texto': 'Text macro', 'Escribe texto auto': 'Types text automatically',
    'Streaming': 'Streaming', 'Escenas, mic, stream': 'Scenes, mic, stream', 'Soundboard': 'Soundboard', 'Reproduce sonido MP3': 'Plays an MP3 sound',
    'Música': 'Music', 'Multimedia': 'Media', 'Play, pause, vol+': 'Play, pause, vol+', 'Play, siguiente, me gusta…': 'Play, next, like…',
    'Juegos y comunidad': 'Games & community', 'Cambiar cuenta de Steam': 'Switch Steam account', 'Solo Windows': 'Windows only',
    'Twitch / Kick': 'Twitch / Kick', 'Clips y comandos': 'Clips and commands', 'Cambiar Perfil': 'Switch Profile', 'Salto entre capas': 'Jump between layers',
    'Cambiar Pantalla': 'Change Screen', 'Siguiente pantalla del RHub': 'Next RHub screen',
    'Registro de comunicación': 'Communication log', 'Soltar para limpiar': 'Drop to clear',
    // Configuración
    'Iniciar con Windows': 'Start with Windows', 'Idioma': 'Language',
    'Se abre directo en la bandeja del sistema, sin mostrar la ventana': 'Opens straight to the system tray without showing the window',
    'Sin conectar': 'Not connected', 'Necesitas Spotify Premium y crear una app gratis en': 'You need Spotify Premium and a free app at',
    '. Pega aquí su': '. Paste its', 'y registra este': 'here and register this', 'exactamente igual:': 'exactly as shown:',
    'Copiar': 'Copy', 'Conectar Spotify': 'Connect Spotify', 'Listo': 'Done', 'Client ID (32 caracteres)': 'Client ID (32 characters)',
    // Editor de pantallas
    'Personalizar pantallas': 'Customize screens', 'Estilo': 'Style', 'Colores': 'Colors', 'Acento': 'Accent', 'Fondo': 'Background', 'Texto': 'Text',
    'Colores del estilo': 'Style colors', 'Pantallas': 'Screens', '+ Agregar pantalla': '+ Add screen', 'Nombre': 'Name', 'Cancelar': 'Cancel', 'Crear': 'Create',
    '"Cambiar pantalla" las recorre en este orden. Imagen y video se ven en el RHub mientras la app está abierta; el video solo va en una pantalla de 1 hueco.': '"Change screen" cycles through them in this order. Image and video show on the RHub while the app is open; video only works on a 1-slot screen.',
    'Actual': 'Current', 'Minimal': 'Minimal', 'Terminal': 'Terminal', 'Color': 'Color',
    '1 grande': '1 large', '2 iguales': '2 equal', '3 iguales': '3 equal', '1 grande + 2 chicos': '1 large + 2 small',
    'Vacío': 'Empty', 'Hora y fecha': 'Time and date', 'Sistema (RAM, CPU, GPU)': 'System (RAM, CPU, GPU)', 'Imagen': 'Image', 'Video': 'Video',
    'Pantalla completa': 'Full screen', 'Izquierda': 'Left', 'Derecha': 'Right', 'Centro': 'Center', 'Grande': 'Large', 'Arriba': 'Top', 'Abajo': 'Bottom',
    'Texto a mostrar': 'Text to display', 'Elegir imagen': 'Choose image', 'Cambiar imagen': 'Change image', 'Elegir video': 'Choose video', 'Cambiar video': 'Change video',
    // Spotify (acciones y estados)
    'Alterna según lo que esté sonando': 'Toggles depending on what is playing', 'Salta a la siguiente': 'Skips to the next one',
    'Vuelve (o reinicia si ya avanzó)': 'Goes back (or restarts if already played a bit)', 'Me gusta (guardar / quitar)': 'Like (save / remove)',
    'Guarda o quita la canción actual': 'Saves or removes the current track', 'Aleatorio (activar / desactivar)': 'Shuffle (on / off)',
    'Alterna el modo aleatorio': 'Toggles shuffle mode', 'Repetir (cambiar modo)': 'Repeat (change mode)', 'No repetir → lista → canción': 'No repeat → playlist → track',
    'Subir volumen de Spotify': 'Spotify volume up', '+10 % (solo Spotify, no Windows)': '+10 % (Spotify only, not Windows)',
    'Bajar volumen de Spotify': 'Spotify volume down', '−10 % (solo Spotify, no Windows)': '−10 % (Spotify only, not Windows)',
    'Adelantar 10 segundos': 'Skip forward 10 seconds', 'Avanza dentro de la canción': 'Moves forward within the track',
    'Retroceder 10 segundos': 'Skip back 10 seconds', 'Retrocede dentro de la canción': 'Moves back within the track',
    'Nada sonando': 'Nothing playing', 'La sesión venció': 'Session expired', 'Dale play en Spotify': 'Press play in Spotify',
    'La sesión venció · vuelve a conectar': 'Session expired · reconnect', 'Falta el Client ID': 'Client ID missing',
    'Configuración → Spotify': 'Settings → Spotify', 'Abrir Configuración': 'Open Settings',
    'Spotify no está conectado.': 'Spotify is not connected.', 'Esperando al navegador…': 'Waiting for the browser…',
    'Sesión de Spotify cerrada.': 'Spotify session closed.', 'Pega primero el Client ID de tu app de Spotify.': 'Paste your Spotify app\'s Client ID first.',
    'Spotify conectado': 'Spotify connected', 'Redirect URI copiado': 'Redirect URI copied', 'No se pudo copiar': 'Could not copy',
    'Falta el Client ID de Spotify. Pégalo en Configuración → Spotify.': 'Spotify Client ID missing. Paste it in Settings → Spotify.',
    'Spotify no está conectado. Conéctalo en Configuración → Spotify.': 'Spotify is not connected. Connect it in Settings → Spotify.',
    'La sesión de Spotify venció. Vuelve a conectarla en Configuración → Spotify.': 'Your Spotify session expired. Reconnect it in Settings → Spotify.',
    'No hay ningún dispositivo de Spotify activo. Abre Spotify y dale play una vez.': 'No active Spotify device. Open Spotify and press play once.',
    'Esa acción requiere Spotify Premium.': 'That action requires Spotify Premium.',
    'Tu cuenta no está en la lista de usuarios de la app. Agrégala en el Dashboard de Spotify → Users Management.': 'Your account is not in the app\'s user list. Add it in the Spotify Dashboard → Users Management.',
    'Sin conexión con Spotify.': 'No connection to Spotify.', 'No hay nada sonando en Spotify.': 'Nothing is playing on Spotify.',
    'Este dispositivo no permite cambiar el volumen desde Spotify.': 'This device does not allow changing the volume from Spotify.',
    'Spotify no permitió esa acción en este momento.': 'Spotify did not allow that action right now.', 'Error de Spotify.': 'Spotify error.',
    'Error desconocido con Spotify.': 'Unknown Spotify error.', 'Guardada en Me gusta': 'Saved to Liked Songs', 'Quitada de Me gusta': 'Removed from Liked Songs',
    'Aleatorio activado': 'Shuffle on', 'Aleatorio desactivado': 'Shuffle off',
    'El Client ID debe tener 32 caracteres (letras a-f y números). Cópialo tal cual del Dashboard de Spotify.': 'The Client ID must be 32 characters (letters a-f and numbers). Copy it exactly from the Spotify Dashboard.',
    'No se pudo conectar con Spotify.': 'Could not connect to Spotify.', 'Se agotó el tiempo de espera (5 min).': 'Timed out (5 min).',
    'Se inició otro intento de conexión.': 'Another connection attempt was started.', 'Respuesta de Spotify inválida.': 'Invalid response from Spotify.',
    // Avisos
    'Ejecutando cadena...': 'Running chain...', 'Clip creado': 'Clip created', '!redes copiado': '!redes copied', '!discord copiado': '!discord copied',
    'No se encontró ningún puerto': 'No port found', 'Usa Chrome o Edge': 'Use Chrome or Edge', 'Arduino conectado': 'Arduino connected',
    'Acción asignada': 'Action assigned', 'Botón reordenado': 'Button reordered', 'Botón limpiado': 'Button cleared', 'Audio cargado': 'Audio loaded',
    'Importado': 'Imported', 'JSON inválido': 'Invalid JSON', 'No se pudo abrir el video': 'Could not open the video',
    'No se pudo leer la ruta del video': 'Could not read the video path', 'No se pudo abrir la imagen': 'Could not open the image',
    'Esto solo funciona dentro de la app de escritorio.': 'This only works inside the desktop app.',
    'Sin coincidencia, se usará el ícono genérico': 'No match, the generic icon will be used',
    'Nombre del nuevo perfil:': 'New profile name:', 'Imagen para el RHub:': 'Image for the RHub:', '¿Deseas limpiar esta acción?': 'Clear this action?',
    'Renombrar': 'Rename', 'Eliminar': 'Delete', 'Cerrar': 'Close', 'Minimizar': 'Minimize', 'Maximizar': 'Maximize', 'Restaurar': 'Restore', 'Abrir RHub': 'Open RHub', 'Salir': 'Quit',
    'Perfil Principal': 'Main Profile', 'Nada': 'None',
    'El cambio de cuenta de Steam solo funciona en Windows.': 'Steam account switching only works on Windows.',
    'No se encontró la instalación de Steam.': 'Steam installation not found.', 'No se encontraron cuentas guardadas de Steam.': 'No saved Steam accounts found.',
    'Sin conexión': 'Offline', 'Volver a conectar': 'Reconnect', 'Conectado': 'Connected', 'Desconectado': 'Disconnected',
  };

  const RX = [
    [/^Conectado como (.*)$/, 'Connected as $1'], [/^Reproduciendo: (.*)$/, 'Playing: $1'], [/^Capa activa: (.*)$/, 'Active layer: $1'], [/^Activado: (.*)$/, 'Activated: $1'],
    [/^Error al conectar: (.*)$/, 'Connection error: $1'], [/^Botón (\d+)$/, 'Button $1'], [/^Pantalla (\d+)$/, 'Screen $1'],
    [/^(\d+) de (\d+)$/, '$1 of $2'], [/^de (\d+)$/, 'of $1'], [/^Distribución de la pantalla (\d+)$/, 'Layout of screen $1'],
    [/^Widget de (.*)$/, (_, a) => 'Widget for ' + (tr(a) ?? a)], [/^Subir pantalla (\d+)$/, 'Move screen $1 up'], [/^Bajar pantalla (\d+)$/, 'Move screen $1 down'],
    [/^Borrar pantalla (\d+)$/, 'Delete screen $1'], [/^Ícono detectado: (.*)$/, 'Detected icon: $1'],
    [/^(\d+) cuenta\(s\) van a pedir contraseña .*$/, '$1 account(s) will ask for a password (they did not have "Remember password" on in Steam).'],
    [/^Pasos?: (.*)$/, 'Step: $1'], [/^Volumen de Spotify: (\d+) %$/, 'Spotify volume: $1 %'],
    [/^Spotify agotó la cuota de la app\. Reintento en ~(\d+) s\.$/, 'Spotify used up the app quota. Retrying in ~$1 s.'],
    [/^Spotify pidió ir más despacio\. Reintento en ~(\d+) s\.$/, 'Spotify asked to slow down. Retrying in ~$1 s.'],
    [/^Acción de Spotify desconocida: (.*)$/, 'Unknown Spotify action: $1'], [/^Spotify respondió (\d+)\.$/, 'Spotify responded $1.'],
    [/^Spotify pide reconectar cada ~6 meses \(próxima vez: hacia el (.*)\)\.$/, 'Spotify asks you to reconnect every ~6 months (next time: around $1).'],
    [/^No se pudo leer la lista de cuentas: (.*)$/, 'Could not read the account list: $1'],
    [/^Spotify no pudo iniciar(.*) Revisa la consola de la app\.$/, 'Spotify could not start$1 Check the app console.'],
  ];

  const ATTRS = ['title', 'placeholder', 'aria-label'];
  const SKIP = '[data-no-i18n], .btn-label, .p-name, .se-file, script, style, textarea, input, #logBox, .log-line, .oled-preview-content';
  let lang = 'es';

  function tr(s) {
    const m = s.match(/^(\s*)([\s\S]*?)(\s*)$/);
    const core = m[2].replace(/\s+/g, ' ');
    if (!core) return null;
    let out = EN[core];
    if (out === undefined) for (const [re, rep] of RX) if (re.test(core)) { out = core.replace(re, rep); break; }
    return out === undefined ? null : m[1] + out + m[3];
  }
  // t('texto en español') -> texto en el idioma activo (para código que arma textos).
  const t = (s) => (lang === 'en' ? (tr(s) ?? s) : s);

  const orig = new WeakMap(); // nodo de texto -> { es, en }
  function doText(n) {
    if (n.parentElement && n.parentElement.closest(SKIP)) return;
    const rec = orig.get(n);
    if (rec && n.nodeValue === rec.en) return; // lo escribimos nosotros
    const es = n.nodeValue, en = tr(es);
    if (lang === 'en' && en !== null && en !== es) { orig.set(n, { es, en }); n.nodeValue = en; }
    else orig.set(n, { es, en: null });
  }
  function doAttrs(el) {
    if (el.closest && el.closest('[data-no-i18n]')) return;
    for (const a of ATTRS) {
      if (!el.hasAttribute(a)) continue;
      const k = 'i18n' + a.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase());
      const cur = el.getAttribute(a);
      if (el.dataset[k + 'En'] === cur) continue;
      const en = tr(cur);
      el.dataset[k] = cur;
      if (lang === 'en' && en !== null && en !== cur) { el.setAttribute(a, en); el.dataset[k + 'En'] = en; }
      else delete el.dataset[k + 'En'];
    }
  }
  function walk(node) {
    if (node.nodeType === 3) { doText(node); return; }
    if (node.nodeType !== 1) return;
    doAttrs(node);
    for (let c = node.firstChild; c; c = c.nextSibling) walk(c);
  }
  function restore(node) {
    if (node.nodeType === 3) { const r = orig.get(node); if (r && r.en !== null && node.nodeValue === r.en) node.nodeValue = r.es; return; }
    if (node.nodeType !== 1) return;
    for (const a of ATTRS) {
      const k = 'i18n' + a.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase());
      if (node.dataset && node.dataset[k + 'En'] !== undefined && node.getAttribute(a) === node.dataset[k + 'En']) { node.setAttribute(a, node.dataset[k]); delete node.dataset[k + 'En']; }
    }
    for (let c = node.firstChild; c; c = c.nextSibling) restore(c);
  }

  let obs = null;
  function start() {
    if (obs || typeof MutationObserver === 'undefined') return;
    obs = new MutationObserver((list) => {
      if (lang !== 'en') return;
      for (const m of list) {
        if (m.type === 'childList') m.addedNodes.forEach(walk);
        else if (m.type === 'characterData') doText(m.target);
        else if (m.type === 'attributes') doAttrs(m.target);
      }
    });
    obs.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  function setLang(l) {
    lang = l === 'en' ? 'en' : 'es';
    try { localStorage.setItem('rhub-lang', lang); } catch (e) { /* sin almacenamiento */ }
    document.documentElement.lang = lang;
    if (lang === 'en') walk(document.body); else restore(document.body);
    if (root.deckAPI && root.deckAPI.setLanguage) root.deckAPI.setLanguage(lang);
    document.dispatchEvent(new CustomEvent('langchange', { detail: lang }));
  }
  function initialLang() {
    try { const s = localStorage.getItem('rhub-lang'); if (s === 'es' || s === 'en') return s; } catch (e) { /* ignora */ }
    return /^es/i.test(navigator.language || 'es') ? 'es' : 'en';
  }
  function init() { start(); setLang(initialLang()); }

  const api = { t, tr, setLang, getLang: () => lang, init, EN, RX };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.i18n = api;
    if (document.body) init(); else document.addEventListener('DOMContentLoaded', init);
  }
})(typeof window !== 'undefined' ? window : globalThis);
