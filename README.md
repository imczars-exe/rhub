# RHub — versión app de escritorio

> **Hardware actual:** macropad 3×3 con pantalla TFT ST7789 de 2.25" (76×284) y
> ESP32-C3 SuperMini, sin sliders. Armado, cableado, PCB y cómo subir el firmware:
> **[guía de armado](https://retrohub-delta.vercel.app/guia)**.

## Instalación (primera vez)

1. Instala [Node.js](https://nodejs.org) (LTS) si no lo tienes.
2. En esta carpeta:
   ```
   npm install
   ```
   Esto va a compilar `serialport` y `@nut-tree-fork/nut-js` (tienen
   partes nativas en C++, tarda un poco la primera vez).

## Correr en modo desarrollo

```
npm start
```

Se abre la ventana de la app. Conecta el ESP32-C3 por USB, dale a
"Conectar", configura tus botones — se guardan solos en:
- Windows: `%APPDATA%\retro-deck\config-deck.json`
- Linux: `~/.config/retro-deck/config-deck.json`

## Generar el instalador / .exe

```
npm run dist
```

Te deja el instalador en la carpeta `dist/` (`RHub-Setup-1.0.0.exe`).
Ya viene con el estilo de la app: ícono propio, sidebar y header del
asistente de instalación con el mismo logo y fondo oscuro que usa Retro
Deck. Como `oneClick` está desactivado, el instalador muestra el asistente
completo (elegir carpeta, acceso directo en escritorio/menú inicio, etc.)
en vez del instalador silencioso de un clic.

Si quieres cambiar el logo/colores del instalador, los archivos fuente
están en `build/`:
- `build/icon.ico` — ícono de la app y del instalador (multi-resolución)
- `build/installerSidebar.bmp` — panel lateral (164×314px)
- `build/installerHeader.bmp` — banner superior (150×57px)

Edítalos y vuelve a correr `npm run dist`.

### Si `npm run dist` falla con "Cannot create symbolic link" (winCodeSign)

Es un bug conocido de `electron-builder` en Windows: intenta descargar
herramientas de firma de código para macOS aunque solo compilas para
Windows, y extraerlas necesita crear symlinks — algo que Windows bloquea
por defecto sin permisos especiales. El script `dist` ya viene arreglado
(usa `CSC_IDENTITY_AUTO_DISCOVERY=false` para que ni intente esa
descarga), así que con `npm install` de nuevo (para traer `cross-env`)
debería bastar. Si aún así vuelve a pasar, dos alternativas:

1. Activa el "Modo desarrollador" de Windows: Configuración → Privacidad
   y seguridad → Para desarrolladores → actívalo. Deja crear symlinks sin
   permisos de administrador.
2. O corre la terminal como Administrador antes de `npm run dist`.

## Hardware y firmware

Todo lo del aparato físico (materiales, tabla de pines, cómo soldar la matriz
con diodos, dónde va cada cosa en la carcasa, cómo subir el firmware y qué
revisar si algo no anda) está en la **[guía de armado](https://retrohub-delta.vercel.app/guia)**.

El firmware es `retrohub_firmware/retrohub_firmware.ino`. La pantalla tiene
3 vistas que se recorren con el botón "Cambiar pantalla" de la app (o con un
botón de la matriz que tenga la acción "Cambiar pantalla"):

1. **Hora** y fecha.
2. **Sistema:** RAM, temperatura de CPU y de GPU.
3. **Ahora suena:** Spotify, con la portada a color.

La vista previa de la app (arriba de los botones) muestra lo mismo que la
pantalla física.

> El mixer de volumen (sliders + `svcl.exe`) se quitó junto con los sliders.
> La carpeta `bin/` con `svcl.exe` ya no se usa ni se empaqueta; puedes borrarla.

## Notas importantes

- **`resolveKey` en `main.js`** solo mapea las teclas más comunes (A-Z,
  0-9, F1-F12, flechas, Enter, Espacio, Ctrl/Alt/Shift/Win, Escape, Tab,
  Backspace, Delete). Si capturas una tecla rara desde la UI y no
  funciona al presionar el botón físico, es porque falta agregarla al
  `KEY_MAP` — dime cuál y la agrego.
- **Windows**: la primera vez que `nut-js` intente mandar teclas, es
  posible que Windows Defender/SmartScreen pida confirmación (por ser una
  librería nueva sin firma). Es normal, dale "permitir".
- **Multiplataforma**: como está armado con `serialport` + `nut-js` +
  `electron-builder`, en teoría corre igual en Windows, Linux y macOS —
  pero solo lo probé conceptualmente aquí, así que prueba bien en tu
  máquina antes de darlo por bueno.
- El protocolo serie sigue siendo `BTN:N` @ 115200 hacia la PC; el detalle
  completo está al principio de `retrohub_firmware.ino`.


## Spotify: biblioteca de acciones + pantalla "Ahora suena"

Agrega dos cosas: **acciones de Spotify** en la Biblioteca (y como paso dentro
de una Cadena) y una pantalla **"Ahora suena"** que se ve en el visor de la
app y en la pantalla TFT, con portada a color, título, artista, progreso y estado.

### Qué necesitas
- **Spotify Premium** (la API de Spotify solo deja controlar la reproducción con Premium).
- Una app gratis en <https://developer.spotify.com/dashboard> (te da un *Client ID*).

### Conectar (una sola vez)
1. Dashboard de Spotify → **Create app**. En *Redirect URIs* pon EXACTAMENTE:
   `http://127.0.0.1:9911/callback` (con `127.0.0.1`, no `localhost`; Spotify ya no acepta `localhost`).
   En *APIs used* marca **Web API**. Copia el **Client ID**.
2. RHub → **Configuración → Spotify** → pega el Client ID → **Conectar Spotify**.
   Se abre el navegador, aceptas el permiso y listo. No hay *client secret*
   (usa el flujo PKCE); el token de renovación se guarda cifrado con `safeStorage`
   en `config-spotify.json`, junto a `config-deck.json`.

### Usar las acciones
Biblioteca → **Spotify** → arrástralo a un botón → elige la acción → **Guardar**.
Acciones: reproducir/pausar, siguiente, anterior, me gusta, aleatorio, repetir
(cicla no repetir → lista → canción), volumen de Spotify ±10 %, adelantar/retroceder
10 s. También hay un paso **Acción de Spotify** en la Cadena. Los botones muestran
el estado (play↔pausa, corazón lleno, aleatorio/repetir encendidos).

Para agregar más acciones: añade una entrada en `spotify-actions.js` y su
función en `_handlers` de `spotify.js`; los menús se arman solos.

### Pantalla "Ahora suena" (firmware)
Ya viene incluida en `retrohub_firmware.ino`. La app manda la portada en 64×64 a
color (RGB565) solo mientras esa pantalla está a la vista; en las otras no se
manda nada extra por el puerto serie.

### Límites de Spotify que conviene conocer (2026)
- Apps en *Development Mode*: el dueño de la app necesita Premium activo y hay un
  máximo de **5 usuarios** en la allowlist (para uso personal sobra).
- El *refresh token* **vence ~6 meses después de la primera autorización**
  (refrescar el token de acceso no reinicia ese reloj). Cuando pase, la app avisa
  ("La sesión venció") y basta con volver a conectar.
- Hay cuota de peticiones. Por eso el estado se consulta cada 3–5 s solo cuando
  "Ahora suena" está a la vista (app o pantalla física) y cada 20 s si no; se respeta
  `Retry-After` y `QUOTA_EXCEEDED`.
- Necesita un dispositivo de Spotify abierto (app de escritorio, móvil…). Si está
  abierto pero "dormido", el botón de reproducir lo despierta.

### Pruebas
`npm test` corre las pruebas de `spotify.js` (login PKCE, renovación de token,
límites 429, cada acción) y de `spotify-oled.js` (texto ASCII, portada a color RGB565)
con un `fetch` simulado, sin tocar la red.
(`spotify-oled.js` conserva el nombre de cuando la pantalla era un OLED.)
