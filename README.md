# RHub

App de escritorio y firmware para un macropad 3×3 con pantalla TFT y ESP32-C3.

## Cómo ponerlo a funcionar

1. Arma el macropad y sube el firmware siguiendo la **[guía de armado](https://retrohub-delta.vercel.app/guia)**.
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

- Guía de armado: https://retrohub-delta.vercel.app/guia
- Gerbers de la PCB: [gerbers.zip](https://github.com/imczars-exe/rhub/releases/download/v1.0.0/gerbers.zip)
