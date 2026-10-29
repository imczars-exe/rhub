# RHub

App de escritorio y firmware para un macropad 3×3 con pantalla TFT y ESP32-C3.

## Cómo ponerlo a funcionar

1. Arma el macropad y sube el firmware siguiendo la **[guía de armado](https://rhubmacro.vercel.app/guia)**.
2. Descarga el instalador `RHub-Setup-<versión>.exe` de la última versión en [Releases](https://github.com/imczars-exe/rhub/releases/latest) e instálalo.
3. Conecta el macropad por USB, abre RHub y pulsa **Conectar**.

### Desde el código

Necesitas [Node.js](https://nodejs.org) (LTS).

```
npm install
npm start
```

Para generar el instalador: `npm run dist` (queda en `dist/`).

## Versiones

Todas las versiones están en [Releases](https://github.com/imczars-exe/rhub/releases).

## Guía y PCB

- Guía de armado: https://rhubmacro.vercel.app/guia
- Gerbers de la PCB: [gerbers.zip](https://github.com/imczars-exe/rhub/releases/download/v1.0.0/gerbers.zip)

---

# RHub (English)

Desktop app and firmware for a 3×3 macropad with a TFT screen and an ESP32-C3.

## Getting it running

1. Build the macropad and flash the firmware following the **[build guide](https://rhubmacro.vercel.app/guide)**.
2. Download `RHub-Setup-<version>.exe` from the latest version in [Releases](https://github.com/imczars-exe/rhub/releases/latest) and install it.
3. Plug the macropad in over USB, open RHub and click **Conectar** (Connect).

### From source

You need [Node.js](https://nodejs.org) (LTS).

```
npm install
npm start
```

To build the installer: `npm run dist` (output goes to `dist/`).

## Versions

All versions are in [Releases](https://github.com/imczars-exe/rhub/releases).

## Guide and PCB

- Build guide: https://rhubmacro.vercel.app/guide
- PCB gerbers: [gerbers.zip](https://github.com/imczars-exe/rhub/releases/download/v1.0.0/gerbers.zip)
