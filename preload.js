const { contextBridge, ipcRenderer, webUtils } = require('electron');

// Todo lo que script.js puede llamar como window.deckAPI.algo()
contextBridge.exposeInMainWorld('deckAPI', {
  // --- Puerto serial (reemplaza navigator.serial) ---
  listPorts: () => ipcRenderer.invoke('serial:list'),
  connectSerial: (path) => ipcRenderer.invoke('serial:connect', path),
  disconnectSerial: () => ipcRenderer.invoke('serial:disconnect'),
  onButtonPress: (callback) => ipcRenderer.on('serial:btn', (_e, idx) => callback(idx)),
  onSerialStatus: (callback) => ipcRenderer.on('serial:status', (_e, connected) => callback(connected)),
  onConfigChanged: (callback) => ipcRenderer.on('config:changed', (_e, data) => callback(data)),
  onSerialLog: (callback) => ipcRenderer.on('serial:log', (_e, msg) => callback(msg)),

  // --- Config persistida en disco (reemplaza localStorage) ---
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: (data) => ipcRenderer.invoke('config:save', data),

  // --- Acciones reales del sistema operativo ---
  runKeyAction: (btn) => ipcRenderer.invoke('action:key', btn),
  openApp: (target) => ipcRenderer.invoke('action:open-app', target),
  listSteamAccounts: () => ipcRenderer.invoke('steam:list-accounts'),

  // --- Pantallas de la TFT: botón "Cambiar pantalla" + espejo en vivo.
  //     screen:changed avisa cuál quedó activa, sin importar si la cambió
  //     la app o un botón de la matriz. ---
  screen: {
    next: () => ipcRenderer.invoke('screen:next'),
    onChanged: (callback) => ipcRenderer.on('screen:changed', (_e, n) => callback(n)),
    // Píxeles RGB565 para el búfer de imagen del RHub (widgets Imagen y Video)
    sendImage: (rect, bytes) => ipcRenderer.invoke('display:image', rect, bytes),
    // Ruta real de un archivo elegido con <input type="file"> (para recordar el video)
    pathForFile: (file) => webUtils.getPathForFile(file),
  },

  // --- Estadísticas del sistema (RAM/CPU/GPU/hora) para el visor en vivo,
  //     los mismos datos que se le mandan al ESP32 por SYS: ---
  system: {
    onStats: (callback) => ipcRenderer.on('sys:stats', (_e, stats) => callback(stats)),
  },

  // --- Spotify: acciones, estado de "Ahora suena" y conexión de la cuenta.
  //     Las acciones de los botones físicos las ejecuta main.js directamente;
  //     esto es para configurar la cuenta y pintar el estado en la ventana. ---
  spotify: {
    getStatus: () => ipcRenderer.invoke('spotify:getStatus'),
    getState: () => ipcRenderer.invoke('spotify:getState'),
    setClientId: (id) => ipcRenderer.invoke('spotify:setClientId', id),
    connect: () => ipcRenderer.invoke('spotify:connect'),
    disconnect: () => ipcRenderer.invoke('spotify:disconnect'),
    runAction: (id) => ipcRenderer.invoke('spotify:runAction', id),
    // Qué pantalla del visor está a la vista (para el polling adaptativo)
    setViewScreen: (n) => ipcRenderer.send('spotify:viewScreen', n),
    onState: (callback) => ipcRenderer.on('spotify:state', (_e, snap) => callback(snap)),
    onStatus: (callback) => ipcRenderer.on('spotify:status', (_e, st) => callback(st)),
    onArt: (callback) => ipcRenderer.on('spotify:art', (_e, art) => callback(art)),
    onNotice: (callback) => ipcRenderer.on('spotify:notice', (_e, n) => callback(n)),
  },

  // --- App: quedarse en segundo plano y auto-inicio con Windows ---
  appSettings: {
    getAutoLaunch: () => ipcRenderer.invoke('app:getAutoLaunch'),
    setAutoLaunch: (enabled) => ipcRenderer.invoke('app:setAutoLaunch', enabled),
  },
});
