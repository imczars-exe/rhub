/*
 * RHUB — firmware del macropad (carcasa de Fusion: 3x3 + pantalla TFT)
 * ESP32-C3 SuperMini + pantalla TFT ST7789 de 2.25" (76x284, SPI)
 *
 * Librerías necesarias (Arduino IDE > Herramientas > Administrar bibliotecas):
 *   - Adafruit GFX Library
 *   - Adafruit ST7735 and ST7789 Library
 *
 * Configuración de placa (Herramientas):
 *   - Board: "ESP32C3 Dev Module"
 *   - USB CDC On Boot: "Enabled"   <-- IMPORTANTE, si no el Serial no funciona por USB nativo
 *
 * Conexiones: ver CABLEADO.md en la carpeta del proyecto (los pines están abajo).
 *
 * Protocolo serie (115200 baud):
 *
 *   ESP32 -> PC (texto plano, un evento por línea — así lo espera la app):
 *     BTN:<idx>              -> botón de la matriz presionado (idx 0-8)
 *     SCR:<n>                -> cambió la pantalla activa (índice en la lista de pantallas)
 *     ACK                    -> terminó de recibir un trozo de imagen/video (IMG:)
 *
 *   PC -> ESP32:
 *     SYS:<ramUsadaGB>,<ramTotalGB>,<cpuTemp>,<gpuTemp>,<HH:MM>,<DD/MM/AAAA>   (una vez por segundo)
 *         cpuTemp/gpuTemp llegan en -1 si la PC no pudo leerlos (se muestra "--")
 *     NEXT          -> pasar a la siguiente pantalla (botón "Cambiar pantalla" de la app
 *                      o un botón de la matriz con la acción "Cambiar pantalla")
 *     ACT:<texto>   -> nombre de la acción del botón recién presionado. "ACT:" vacío = no mostrar nada.
 *     SPV:<0-100>   -> volumen de Spotify: muestra una barra con el % por 2 segundos
 *     SPT:..., SPTT:..., SPTA:..., SPTK:..., SPTR:..., SPTC
 *                   -> datos de Spotify para "Ahora suena" (detalle en la sección SPOTIFY).
 *     STY:<estilo>,<acento>,<fondo>,<texto>
 *                   -> estilo (0 actual · 1 minimal · 2 terminal · 3 color) y colores en 4 hex RGB565
 *     SCN:<n>       -> cuántas pantallas hay (1-8)
 *     SCD:<i>,<layout>,<w0>,<w1>,<w2>
 *                   -> distribución de la pantalla i (0 1 hueco · 1 dos · 2 tres · 3 grande + 2 chicos)
 *                      y el widget de cada hueco (ver enum Widget)
 *     SCT:<i>,<hueco>,<texto>   -> texto del widget "Texto"; en clima, disco
 *                      y red es "etiqueta|valor" y la app lo renueva cada segundo
 *     IMG:<x>,<y>,<w>,<h>,<escala>,<inicio>,<cantidad>  + <cantidad>*2 bytes RGB565 little-endian
 *                   -> trozo de una imagen o cuadro de video para el búfer de imagen; responde ACK.
 *                      escala 2 = cada píxel se dibuja 2x2 (el video viaja a media resolución).
 *
 * Sin datos de la PC por unos segundos (app cerrada) se muestra el salvapantallas: logo + "RHub".
 *
 * Al presionar cualquier botón de la matriz, la pantalla muestra el nombre de su
 * acción por 2 segundos y vuelve sola a la hora. Si estabas en "Ahora suena" con
 * algo cargado en Spotify, vuelve a esa pantalla.
 */

#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>

// Un valor de CPU/RAM/GPU listo para dibujar (lo arma getStat()). Va aquí arriba porque
// el IDE de Arduino genera los prototipos de las funciones antes que el resto del código.
struct StatInfo {
  const char* label;
  const char* unit;
  char value[12];
  char note[12];
  float level;
  bool temp;
  int raw;      // -1 = sin dato
};

// ---------- Pines: matriz de botones (3x3, con diodos 1N4148) ----------
// Fila 0 = fila de arriba (la más cercana a la pantalla), columna 0 = izquierda,
// mirando el macropad de frente. Las filas se ponen en LOW de a una y las
// columnas se leen con pull-up: el diodo va con la raya (cátodo) hacia la fila.
const uint8_t ROW_PINS[3] = {5, 6, 7};
const uint8_t COL_PINS[3] = {8, 10, 20};

// Si al probar los botones salen "al revés" (el de arriba a la izquierda manda
// BTN:8), pon esto en 1 en vez de recablear.
#define MATRIX_ROTATED_180 0

// ---------- Pines: pantalla TFT ST7789 (SPI) ----------
#define TFT_SCK   4   // SCL en la serigrafía de la pantalla
#define TFT_MOSI  3   // SDA en la serigrafía de la pantalla
#define TFT_DC    1
#define TFT_CS    0
#define TFT_RST   2   // la pantalla trae pull-up en RES: mantiene alto este pin de arranque
#define TFT_BL    21  // BLK: luz de fondo

#define TFT_PANEL_W 76    // tamaño nativo del panel (vertical)
#define TFT_PANEL_H 284
// 1 = horizontal. Si la imagen sale de cabeza en la carcasa, pon 3.
#define TFT_ROTATION 1
// Brillo de la luz de fondo, 0-255.
#define TFT_BRIGHTNESS 200
// Si los colores salen en negativo (fondo blanco, texto negro), pon 1.
#define TFT_INVERT_FIX 0

#define SCREEN_WIDTH  284
#define SCREEN_HEIGHT 76

Adafruit_ST7789 tft = Adafruit_ST7789(&SPI, TFT_CS, TFT_DC, TFT_RST);

// Todo se dibuja primero aquí (en RAM) y se manda entero a la pantalla:
// así no parpadea. 284x76x2 bytes = 43 KB.
GFXcanvas16 frame(SCREEN_WIDTH, SCREEN_HEIGHT);

// ---------- Colores (RGB565) ----------
static inline uint16_t rgb(uint8_t r, uint8_t g, uint8_t b) {
  return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3);
}
// Fondo, texto y acento los elige el usuario en la app (STY:); los tonos
// intermedios salen de mezclar el texto con el fondo.
uint16_t C_BG     = 0x0000;
uint16_t C_TEXT   = 0xFFFF;
uint16_t C_ACCENT = 0xFFFF;
uint16_t C_DIM    = rgb(150, 150, 158);
uint16_t C_FAINT  = rgb(70, 70, 76);
uint16_t C_TRACK  = rgb(38, 38, 42);
const uint16_t C_WARN  = rgb(251, 191, 36);
const uint16_t C_HOT   = rgb(248, 113, 113);
const uint16_t C_OK    = rgb(61, 220, 110);

// Mezcla a -> b; t de 0 (todo a) a 255 (todo b).
static uint16_t blend565(uint16_t a, uint16_t b, uint8_t t) {
  int r = ((a >> 11) * (255 - t) + (b >> 11) * t) / 255;
  int g = (((a >> 5) & 63) * (255 - t) + ((b >> 5) & 63) * t) / 255;
  int bl = ((a & 31) * (255 - t) + (b & 31) * t) / 255;
  return (r << 11) | (g << 5) | bl;
}

static void applyColors(uint16_t accent, uint16_t bg, uint16_t text) {
  C_ACCENT = accent; C_BG = bg; C_TEXT = text;
  C_DIM   = blend565(bg, text, 150);
  C_FAINT = blend565(bg, text, 70);
  C_TRACK = blend565(bg, text, 38);
}

// ---------- Estilo de las pantallas (STY:) ----------
enum Style : uint8_t { ST_ACTUAL, ST_MINIMAL, ST_TERMINAL, ST_COLOR };
uint8_t uiStyle = ST_ACTUAL;

// Ícono de bocina, 8x8 px a 1 bit (overlay de volumen de Spotify).
static const unsigned char PROGMEM ICON_VOLUME[8] = {
  0b00011000,
  0b00111000,
  0b01111111,
  0b01111111,
  0b01111111,
  0b01111111,
  0b00111000,
  0b00011000
};

// ---------- Estado de botones de la matriz (con debounce) ----------
bool btnState[9]     = {false};
bool btnLastRead[9]  = {false};
unsigned long lastDebounceTime[9] = {0};
const unsigned long DEBOUNCE_MS = 30;

// ---------- Pantallas (las arma el usuario en la app: SCN/SCD/SCT) ----------
// Cada pantalla tiene una distribución con 1-3 huecos y un widget por hueco.
enum Widget : uint8_t { W_NONE, W_CLOCK, W_SYSTEM, W_CPU, W_RAM, W_GPU, W_SPOTIFY, W_IMAGE, W_TEXT, W_VIDEO, W_WEATHER, W_DISK, W_NET, W_COUNT };
#define MAX_SCREENS 8
#define MAX_TEXT 40

struct ScreenDef {
  uint8_t layout;
  uint8_t widget[3];
  char text[3][MAX_TEXT + 1];
};
// Huecos de cada distribución {x, y, w, h} — iguales a LAYOUTS en display.js.
static const uint8_t LAYOUT_SLOTS[4] = {1, 2, 3, 3};
static const int16_t LAYOUT_RECTS[4][3][4] = {
  {{0, 0, 284, 76}},
  {{0, 0, 142, 76}, {142, 0, 142, 76}},
  {{0, 0, 95, 76}, {95, 0, 94, 76}, {189, 0, 95, 76}},
  {{0, 0, 180, 76}, {180, 0, 104, 38}, {180, 38, 104, 38}},
};
// Mientras la app no mande otras, las 3 de siempre: hora · sistema · ahora suena.
ScreenDef screens[MAX_SCREENS] = {
  {0, {W_CLOCK}, {""}}, {0, {W_SYSTEM}, {""}}, {0, {W_SPOTIFY}, {""}},
};
uint8_t numScreens = 3;
uint8_t currentScreen = 0; // arranca en la primera, la principal

static bool screenHas(uint8_t i, uint8_t widget) {
  const ScreenDef& s = screens[i];
  for (uint8_t k = 0; k < LAYOUT_SLOTS[s.layout]; k++) if (s.widget[k] == widget) return true;
  return false;
}

// Búfer de imagen del tamaño de la pantalla: los widgets Imagen y Video dibujan
// su hueco desde aquí. La app manda las imágenes de la pantalla que se ve (IMG:)
// y se borra al cambiar de pantalla. 43 KB.
static uint16_t imgBuf[SCREEN_WIDTH * SCREEN_HEIGHT];

// Salvapantallas: sin nada de la PC durante este tiempo (app cerrada) se ve el logo.
unsigned long lastRxMs = 0;
const unsigned long SAVER_AFTER_MS = 4000;

// ---------- Feedback de botón presionado (overlay temporal de 2s) ----------
bool showingBtnFeedback = false;
unsigned long btnFeedbackUntil = 0;
int lastPressedBtn = -1;
const unsigned long BTN_FEEDBACK_MS = 2000;

// Nombre de la acción del botón presionado. Lo manda la app justo después de BTN:n
// como "ACT:<texto>" (ya sin tildes). Si no llega (botón sin acción), se muestra "Boton N".
char actLabel[32] = "";
unsigned long btnPressAt = 0;
const unsigned long ACT_WAIT_MS = 150; // cuánto se espera el ACT: antes de mostrar el overlay

// Overlay de volumen de Spotify: la app manda "SPV:<0-100>" al subir/bajar el volumen.
int spVolume = 0;
bool showingVolume = false;
unsigned long volumeUntil = 0;
const unsigned long VOLUME_SHOW_MS = 2000;

// ---------- Datos del sistema (llegan de la PC por SYS:) ----------
float sysRamUsedGB = 0, sysRamTotalGB = 0;
int   sysCpuTemp = -1, sysGpuTemp = -1;
char  sysTime[8]  = "--:--";
char  sysDate[12] = "--/--/----";
unsigned long lastSysDataMs = 0;
const unsigned long SYS_DATA_TIMEOUT_MS = 5000;

// ---------- Buffer de lectura serial (línea por línea) ----------
// Las filas de la portada (SPTR) son las líneas más largas: ~266 caracteres.
static char lineBuf[320];
static size_t lineLen = 0;
static bool lineOverflow = false;

// ---------- Temporizadores ----------
unsigned long lastMatrixScan  = 0;
unsigned long lastDisplayDraw = 0;
const unsigned long MATRIX_INTERVAL_MS  = 5;
const unsigned long DISPLAY_INTERVAL_MS = 80;

void renderScreen();  // definidas más abajo
void updateDisplay();

// Manda el frame (RAM) completo a la pantalla.
static void pushFrame(const uint16_t* buf) {
  tft.drawRGBBitmap(0, 0, (uint16_t*)buf, SCREEN_WIDTH, SCREEN_HEIGHT);
}

// Escribe un texto centrado en horizontal dentro de [x0, x0+w).
static void printCentered(const char* text, int x0, int w, int y, uint8_t size, uint16_t color) {
  int16_t bx, by;
  uint16_t tw, th;
  frame.setTextSize(size);
  frame.setTextColor(color);
  frame.getTextBounds(text, 0, 0, &bx, &by, &tw, &th);
  frame.setCursor(x0 + ((int)w - (int)tw) / 2, y);
  frame.print(text);
}

// =====================================================================
//  SPOTIFY: pantalla "Ahora suena"
// =====================================================================
// Protocolo (lo manda main.js):
//     SPT:<p>,<progreso_ms>,<duracion_ms>,<flags>
//          p: 0 pausado · 1 sonando · 2 nada sonando · 3 Spotify sin conectar
//          flags: 1 aleatorio · 2 repetir lista · 4 repetir canción · 8 me gusta
//     SPTT:<titulo>   SPTA:<artista>     (ASCII)
//     SPTK:<4 hex>                       (color de acento RGB565 de la portada; borra la portada anterior)
//     SPTR:<fila>,<256 hex>              (fila de la portada 64x64, 64 píxeles RGB565)
//     SPTC                               (sin portada)
// El progreso lo interpola este módulo con millis(); la PC solo lo
// re-sincroniza cada ~5 s (o cuando hay un cambio).

#define ART_SIZE 64

struct SpotifyNow {
  uint8_t  state;            // 0 pausado, 1 sonando, 2 nada, 3 sin conectar
  uint32_t progMs;
  uint32_t durMs;
  uint8_t  flags;
  unsigned long rxAt;        // millis() cuando llegó el último SPT:
  char     title[48];
  char     artist[48];
  unsigned long titleAt;     // para reiniciar la marquesina al cambiar el texto
  unsigned long artistAt;
  bool     hasArt;
  uint16_t accent;
};
static SpotifyNow spotifyNow = { 3, 0, 0, 0, 0, "", "", 0, 0, false, 0xFFFF };
static uint16_t spArt[ART_SIZE * ART_SIZE];     // 8 KB

static const int NP_TEXT_X = 80;                 // columna de texto, a la derecha de la portada
static const int NP_TEXT_W = SCREEN_WIDTH - NP_TEXT_X - 6;
static GFXcanvas1 spTextCanvas(NP_TEXT_W, 16);   // 1 línea de texto recortada (hasta tamaño 2)

static int spHexNibble(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

static bool spHex16(const char* s, uint16_t* out) {
  uint16_t v = 0;
  for (int i = 0; i < 4; i++) {
    int n = spHexNibble(s[i]);
    if (n < 0) return false;
    v = (v << 4) | n;
  }
  *out = v;
  return true;
}

static void spCopyText(char* dst, size_t cap, const char* src, unsigned long* stamp) {
  if (strncmp(dst, src, cap - 1) != 0) {   // solo reinicia la marquesina si el texto cambió
    strncpy(dst, src, cap - 1);
    dst[cap - 1] = '\0';
    *stamp = millis();
  }
}

// Devuelve true si la línea era de Spotify (SPT*) y ya se procesó.
static bool spotifyHandleLine(const char* line) {
  if (strncmp(line, "SPT", 3) != 0) return false;

  if (strncmp(line, "SPT:", 4) == 0) {
    unsigned p = 3, fl = 0;
    unsigned long prog = 0, dur = 0;
    if (sscanf(line + 4, "%u,%lu,%lu,%u", &p, &prog, &dur, &fl) == 4) {
      spotifyNow.state = (uint8_t)(p > 3 ? 3 : p);
      spotifyNow.progMs = prog;
      spotifyNow.durMs = dur;
      spotifyNow.flags = (uint8_t)fl;
      spotifyNow.rxAt = millis();
    }
    return true;
  }
  if (strncmp(line, "SPTT:", 5) == 0) {
    spCopyText(spotifyNow.title, sizeof(spotifyNow.title), line + 5, &spotifyNow.titleAt);
    return true;
  }
  if (strncmp(line, "SPTA:", 5) == 0) {
    spCopyText(spotifyNow.artist, sizeof(spotifyNow.artist), line + 5, &spotifyNow.artistAt);
    return true;
  }
  if (strncmp(line, "SPTK:", 5) == 0) {          // portada nueva: color de acento y lienzo vacío
    uint16_t c;
    if (spHex16(line + 5, &c)) spotifyNow.accent = c;
    memset(spArt, 0, sizeof(spArt));
    spotifyNow.hasArt = true;                    // las filas van llegando de arriba a abajo
    return true;
  }
  if (strncmp(line, "SPTR:", 5) == 0) {
    const char* comma = strchr(line + 5, ',');
    if (comma) {
      int y = atoi(line + 5);
      const char* hex = comma + 1;
      if (y >= 0 && y < ART_SIZE && strlen(hex) >= ART_SIZE * 4) {
        uint16_t row[ART_SIZE];
        for (int x = 0; x < ART_SIZE; x++) {
          if (!spHex16(hex + x * 4, &row[x])) return true;   // fila dañada: se ignora
        }
        memcpy(&spArt[y * ART_SIZE], row, sizeof(row));
        spotifyNow.hasArt = true;
      }
    }
    return true;
  }
  if (strcmp(line, "SPTC") == 0) {
    spotifyNow.hasArt = false;
    spotifyNow.accent = C_TEXT;
    return true;
  }
  return false;
}

static uint32_t spProgressNow() {
  if (spotifyNow.state == 1 && spotifyNow.durMs) {
    uint32_t v = spotifyNow.progMs + (uint32_t)(millis() - spotifyNow.rxAt);
    return v > spotifyNow.durMs ? spotifyNow.durMs : v;
  }
  return spotifyNow.progMs;
}

static void spFormatTime(char* out, size_t cap, uint32_t ms) {
  uint32_t s = ms / 1000;
  snprintf(out, cap, "%lu:%02lu", (unsigned long)(s / 60), (unsigned long)(s % 60));
}

// Una línea de texto dentro de la columna de texto; si no cabe, hace
// pausa -> desplaza -> pausa -> vuelve (marquesina).
static void spDrawMarquee(const char* text, unsigned long since, int y, uint8_t size, uint16_t color) {
  const int px = (int)strlen(text) * 6 * size;
  int off = 0;
  if (px > NP_TEXT_W) {
    const int span = px - NP_TEXT_W + 6 * size;
    const unsigned long PAUSE = 1400, MS_PER_PX = 25;
    const unsigned long cycle = PAUSE + (unsigned long)span * MS_PER_PX + PAUSE;
    const unsigned long t = (millis() - since) % cycle;
    if (t < PAUSE) off = 0;
    else if (t < PAUSE + (unsigned long)span * MS_PER_PX) off = (int)((t - PAUSE) / MS_PER_PX);
    else off = span;
  }
  spTextCanvas.fillScreen(0);
  spTextCanvas.setTextWrap(false);
  spTextCanvas.setTextSize(size);
  spTextCanvas.setTextColor(1);
  spTextCanvas.setCursor(-off, 0);
  spTextCanvas.print(text);
  frame.drawBitmap(NP_TEXT_X, y, spTextCanvas.getBuffer(), NP_TEXT_W, 8 * size, color);
}

static const uint8_t SP_HEART_9x8[] = {   // 2 bytes por fila, MSB primero
  0x77, 0x00, 0xFF, 0x80, 0xFF, 0x80, 0x7F, 0x00, 0x3E, 0x00, 0x1C, 0x00, 0x08, 0x00, 0x00, 0x00
};

// Íconos chicos (10x8) de la fila de estado.
static void spIconShuffle(int x, int y, uint16_t c) {
  frame.drawLine(x, y + 1, x + 7, y + 7, c);
  frame.drawLine(x, y + 7, x + 7, y + 1, c);
  frame.drawFastHLine(x + 5, y + 1, 4, c); frame.drawFastVLine(x + 8, y + 1, 3, c);
  frame.drawFastHLine(x + 5, y + 7, 4, c); frame.drawFastVLine(x + 8, y + 5, 3, c);
}
static void spIconRepeat(int x, int y, uint16_t c, bool one) {
  frame.drawRoundRect(x, y + 1, 10, 7, 2, c);
  frame.fillTriangle(x + 6, y - 1, x + 6, y + 3, x + 8, y + 1, c);
  if (one) { frame.fillRect(x + 3, y + 3, 4, 3, C_BG); frame.drawFastVLine(x + 5, y + 3, 3, c); }
}

static void spDrawNotePlaceholder(int x, int y) {
  frame.drawRoundRect(x, y, ART_SIZE, ART_SIZE, 6, C_FAINT);
  // corchea simple: dos cabezas y una barra
  frame.fillCircle(x + 25, y + 42, 5, C_DIM);
  frame.fillCircle(x + 41, y + 38, 5, C_DIM);
  frame.fillRect(x + 29, y + 18, 2, 24, C_DIM);
  frame.fillRect(x + 45, y + 14, 2, 24, C_DIM);
  frame.fillTriangle(x + 29, y + 18, x + 47, y + 14, x + 47, y + 19, C_DIM);
  frame.fillTriangle(x + 29, y + 18, x + 29, y + 23, x + 47, y + 19, C_DIM);
}

// Escribe text recortado con "..." si no cabe en w píxeles.
static void printClipped(const char* text, int x, int y, int w, uint8_t size, uint16_t color) {
  char buf[MAX_TEXT + 8];
  const int maxChars = w / (6 * size);
  if (maxChars <= 0) return;
  strncpy(buf, text, sizeof(buf) - 1);
  buf[sizeof(buf) - 1] = '\0';
  if ((int)strlen(buf) > maxChars) {
    if (maxChars > 3) { buf[maxChars - 3] = '\0'; strcat(buf, "..."); }
    else buf[maxChars] = '\0';
  }
  frame.setTextWrap(false);
  frame.setTextSize(size);
  frame.setTextColor(color);
  frame.setCursor(x, y);
  frame.print(buf);
}

// Spotify en un hueco chico: título, artista y barra de progreso (sin portada).
static void drawSpotifyCompact(int x, int y, int w, int h) {
  const uint16_t accent = uiStyle == ST_TERMINAL ? C_ACCENT : spotifyNow.accent;
  if (spotifyNow.state >= 2) {
    printClipped("Spotify", x + 8, y + h / 2 - 10, w - 16, 1, C_TEXT);
    printClipped(spotifyNow.state == 3 ? "Sin conectar" : "Nada sonando", x + 8, y + h / 2 + 2, w - 16, 1, C_DIM);
    return;
  }
  const uint8_t ts = (h >= 60 && w >= 150) ? 2 : 1;
  const int top = y + (h - (8 * ts + 22)) / 2;
  printClipped(spotifyNow.title, x + 8, top, w - 16, ts, C_TEXT);
  printClipped(spotifyNow.artist, x + 8, top + 8 * ts + 4, w - 16, 1, C_DIM);
  const uint32_t cur = spProgressNow();
  const int bw = w - 16;
  const int fill = spotifyNow.durMs ? (int)(((uint64_t)cur * bw) / spotifyNow.durMs) : 0;
  frame.fillRoundRect(x + 8, top + 8 * ts + 18, bw, 3, 1, C_TRACK);
  if (fill > 0) frame.fillRoundRect(x + 8, top + 8 * ts + 18, fill, 3, 1, accent);
}

// Pantalla "Ahora suena": portada 64x64 · título/artista con marquesina ·
// estado · barra de progreso y tiempos.
static void drawScreenNowPlaying() {
  const int artX = 6, artY = 6;
  frame.setTextWrap(false);

  if (spotifyNow.state >= 2) {                       // sin conectar / nada sonando
    spDrawNotePlaceholder(artX, artY);
    frame.setTextSize(2);
    frame.setTextColor(C_TEXT);
    frame.setCursor(NP_TEXT_X, 12);
    frame.print("Spotify");
    frame.setTextSize(1);
    frame.setTextColor(C_DIM);
    frame.setCursor(NP_TEXT_X, 38);
    frame.print(spotifyNow.state == 3 ? "Sin conectar" : "Nada sonando");
    frame.setTextColor(C_FAINT);
    frame.setCursor(NP_TEXT_X, 52);
    frame.print(spotifyNow.state == 3 ? "Conectalo en la app > Config." : "Dale play en Spotify");
    return;
  }

  const uint16_t accent = uiStyle == ST_TERMINAL ? C_ACCENT : spotifyNow.accent;

  if (spotifyNow.hasArt) frame.drawRGBBitmap(artX, artY, spArt, ART_SIZE, ART_SIZE);
  else spDrawNotePlaceholder(artX, artY);

  spDrawMarquee(spotifyNow.title, spotifyNow.titleAt, 6, 2, C_TEXT);
  spDrawMarquee(spotifyNow.artist, spotifyNow.artistAt, 26, 1, C_DIM);

  // fila de estado: play/pausa + aleatorio + repetir + me gusta
  const int sy = 40;
  if (spotifyNow.state == 1) frame.fillTriangle(NP_TEXT_X, sy, NP_TEXT_X, sy + 8, NP_TEXT_X + 7, sy + 4, C_TEXT);
  else { frame.fillRect(NP_TEXT_X, sy, 3, 9, C_TEXT); frame.fillRect(NP_TEXT_X + 5, sy, 3, 9, C_TEXT); }
  spIconShuffle(NP_TEXT_X + 20, sy, (spotifyNow.flags & 1) ? accent : C_FAINT);
  spIconRepeat(NP_TEXT_X + 38, sy, (spotifyNow.flags & 6) ? accent : C_FAINT, spotifyNow.flags & 4);
  frame.drawBitmap(NP_TEXT_X + 56, sy, SP_HEART_9x8, 9, 8, (spotifyNow.flags & 8) ? accent : C_FAINT);

  // progreso
  const uint32_t cur = spProgressNow();
  const int w = spotifyNow.durMs ? (int)(((uint64_t)cur * NP_TEXT_W) / spotifyNow.durMs) : 0;
  frame.fillRoundRect(NP_TEXT_X, 55, NP_TEXT_W, 4, 2, C_TRACK);
  if (w > 0) frame.fillRoundRect(NP_TEXT_X, 55, w, 4, 2, accent);

  char a[12], b[12];
  spFormatTime(a, sizeof(a), cur);
  spFormatTime(b, sizeof(b), spotifyNow.durMs);
  frame.setTextSize(1);
  frame.setTextColor(C_DIM);
  frame.setCursor(NP_TEXT_X, 64);
  frame.print(a);
  frame.setCursor(NP_TEXT_X + NP_TEXT_W - (int)strlen(b) * 6, 64);
  frame.print(b);
}

// =====================================================================
//  TRANSICIÓN ENTRE PANTALLAS (deslizamiento horizontal)
// =====================================================================
static uint16_t frameFrom[SCREEN_WIDTH * SCREEN_HEIGHT];   // lo que se veía (43 KB)
static uint16_t frameMix[SCREEN_WIDTH * SCREEN_HEIGHT];    // cuadro intermedio (43 KB)

static void goToScreen(uint8_t next, int8_t dir) {
  uint16_t* to = frame.getBuffer();
  memcpy(frameFrom, to, sizeof(frameFrom));

  currentScreen = next;
  memset(imgBuf, 0, sizeof(imgBuf));     // la app manda las imágenes de la pantalla nueva al ver SCR:
  renderScreen();                        // dibuja la pantalla nueva en "frame", todavía sin mostrarla

  Serial.print("SCR:");                  // la PC se entera YA, sin esperar a la animación
  Serial.println(next);

  const int FRAMES = 10;
  const size_t ROW = SCREEN_WIDTH * sizeof(uint16_t);
  for (int i = 1; i < FRAMES; i++) {
    const float t = (float)i / FRAMES;
    const float u = 1.0f - t;
    const float ease = 1.0f - u * u * u; // ease-out cúbico: arranca rápido, frena suave
    const int off = (int)(ease * SCREEN_WIDTH + 0.5f);
    for (int y = 0; y < SCREEN_HEIGHT; y++) {
      uint16_t* d = frameMix + y * SCREEN_WIDTH;
      const uint16_t* f = frameFrom + y * SCREEN_WIDTH;
      const uint16_t* n = to + y * SCREEN_WIDTH;
      if (dir > 0) {                     // lo nuevo entra por la derecha
        memcpy(d, f + off, ROW - off * sizeof(uint16_t));
        memcpy(d + SCREEN_WIDTH - off, n, off * sizeof(uint16_t));
      } else {                           // lo nuevo entra por la izquierda
        memcpy(d + off, f, ROW - off * sizeof(uint16_t));
        memcpy(d, n + SCREEN_WIDTH - off, off * sizeof(uint16_t));
      }
    }
    pushFrame(frameMix);
  }
  pushFrame(to);
}

void setup() {
  Serial.setRxBufferSize(4096); // ANTES de begin(): no perder filas de portada mientras se anima
  Serial.begin(115200);

  for (int i = 0; i < 3; i++) {
    pinMode(ROW_PINS[i], OUTPUT);
    digitalWrite(ROW_PINS[i], HIGH);
  }
  for (int i = 0; i < 3; i++) {
    pinMode(COL_PINS[i], INPUT_PULLUP);
  }

  SPI.begin(TFT_SCK, -1, TFT_MOSI, TFT_CS);
  tft.init(TFT_PANEL_W, TFT_PANEL_H);
  tft.setSPISpeed(40000000);
  tft.setRotation(TFT_ROTATION);
#if TFT_INVERT_FIX
  tft.invertDisplay(false);
#endif
  tft.fillScreen(C_BG);

  pinMode(TFT_BL, OUTPUT);
  analogWrite(TFT_BL, TFT_BRIGHTNESS);

  if (!frame.getBuffer()) Serial.println("LOG:sin memoria para el frame de la pantalla");

  updateDisplay();   // arranca en el salvapantallas hasta que la app mande datos
}

void scanMatrix() {
  for (int r = 0; r < 3; r++) {
    for (int rr = 0; rr < 3; rr++) {
      digitalWrite(ROW_PINS[rr], rr == r ? LOW : HIGH);
    }
    delayMicroseconds(30);

    for (int c = 0; c < 3; c++) {
      int idx = r * 3 + c;
      bool raw = (digitalRead(COL_PINS[c]) == LOW);

      if (raw != btnLastRead[idx]) {
        lastDebounceTime[idx] = millis();
        btnLastRead[idx] = raw;
      }
      if ((millis() - lastDebounceTime[idx]) > DEBOUNCE_MS) {
        if (raw != btnState[idx]) {
          btnState[idx] = raw;
          if (btnState[idx]) { // solo al presionar, no al soltar
#if MATRIX_ROTATED_180
            int realIdx = 8 - idx;
#else
            int realIdx = idx;
#endif
            Serial.print("BTN:");
            Serial.println(realIdx);

            // Dispara el overlay con el nombre de la acción por 2 segundos
            lastPressedBtn = realIdx;
            actLabel[0] = '\0';          // se llena cuando llegue ACT: de la app
            btnPressAt = millis();
            showingBtnFeedback = true;
            btnFeedbackUntil = millis() + BTN_FEEDBACK_MS;
            lastDisplayDraw = 0; // fuerza redibujado inmediato
          }
        }
      }
    }
  }
  for (int rr = 0; rr < 3; rr++) digitalWrite(ROW_PINS[rr], HIGH);
}

// Cambia de pantalla y avisa a la PC (lo pide la app con NEXT).
// goToScreen() anima el cambio y ya manda "SCR:n" a la PC.
void goToNextScreen() {
  uint8_t next = (currentScreen + 1) % numScreens;
  showingBtnFeedback = false; // navegar cancela el overlay del botón para poder animar
  showingVolume = false;      // ...y el de volumen
  goToScreen(next, 1);
  lastDisplayDraw = millis();
}

// ---------- Recibe datos de la PC ----------
void parseIncomingLine(const char* line);

// Trozo binario en curso (IMG:): los píxeles van directo al búfer de imagen.
static int binX, binY, binW, binH, binScale;
static uint32_t binPix = 0, binLeft = 0;  // binLeft = píxeles que faltan de este trozo
static int binLo = -1;                    // primer byte del píxel, esperando el segundo
static bool binLastChunk = false;         // este trozo completa la imagen: recién ahí se redibuja

static void binPutPixel(uint16_t v) {
  const int px = binPix % binW, py = binPix / binW;
  for (int dy = 0; dy < binScale; dy++) {
    const int Y = binY + py * binScale + dy;
    if (Y >= SCREEN_HEIGHT) break;
    for (int dx = 0; dx < binScale; dx++) {
      const int X = binX + px * binScale + dx;
      if (X < SCREEN_WIDTH) imgBuf[Y * SCREEN_WIDTH + X] = v;
    }
  }
  binPix++;
}

void readIncomingSerial() {
  static uint8_t chunk[256];
  while (Serial.available() > 0) {
    lastRxMs = millis();
    if (binLeft) {                       // trozo binario: se lee de a bloques, no byte por byte
      size_t want = binLeft * 2 - (binLo >= 0 ? 1 : 0);
      size_t n = Serial.read(chunk, min((size_t)Serial.available(), min(want, sizeof(chunk))));
      for (size_t i = 0; i < n && binLeft; i++) {
        if (binLo < 0) { binLo = chunk[i]; continue; }
        binPutPixel((uint16_t)(binLo | (chunk[i] << 8)));
        binLo = -1;
        if (--binLeft == 0) {
          Serial.println("ACK");
          if (binLastChunk) lastDisplayDraw = 0;   // cuadro completo: mostrarlo ya
        }
      }
      continue;
    }
    int b = Serial.read();
    char c = (char)b;
    if (c == '\n') {
      if (!lineOverflow) {
        lineBuf[lineLen] = '\0';
        parseIncomingLine(lineBuf);
      }
      lineLen = 0;
      lineOverflow = false;
    } else if (c != '\r') {
      if (lineLen < sizeof(lineBuf) - 1) lineBuf[lineLen++] = c;
      else lineOverflow = true;          // línea demasiado larga: se descarta entera
    }
  }
}

// SYS:<ramUsada>,<ramTotal>,<cpu>,<gpu>,<HH:MM>,<DD/MM/AAAA>
static void parseSysLine(const char* s) {
  char buf[64];
  strncpy(buf, s, sizeof(buf) - 1);
  buf[sizeof(buf) - 1] = '\0';

  char* parts[6];
  int n = 0;
  char* p = buf;
  parts[n++] = p;
  while (*p && n < 6) {
    if (*p == ',') { *p = '\0'; parts[n++] = p + 1; }
    p++;
  }
  if (n < 6) return;

  sysRamUsedGB  = atof(parts[0]);
  sysRamTotalGB = atof(parts[1]);
  sysCpuTemp    = atoi(parts[2]);
  sysGpuTemp    = atoi(parts[3]);
  strncpy(sysTime, parts[4], sizeof(sysTime) - 1);
  strncpy(sysDate, parts[5], sizeof(sysDate) - 1);
  lastSysDataMs = millis();
}

void parseIncomingLine(const char* line) {
  if (strcmp(line, "NEXT") == 0) {
    goToNextScreen();
    return;
  }

  if (strncmp(line, "ACT:", 4) == 0) {         // nombre de la acción del botón recién presionado
    strncpy(actLabel, line + 4, sizeof(actLabel) - 1);
    actLabel[sizeof(actLabel) - 1] = '\0';
    if (!actLabel[0]) showingBtnFeedback = false; // "ACT:" vacío = esta acción no muestra su nombre
    lastDisplayDraw = 0;                       // redibuja ya
    return;
  }

  if (strncmp(line, "SPV:", 4) == 0) {         // volumen de Spotify -> barra por unos segundos
    int v = atoi(line + 4);
    spVolume = v < 0 ? 0 : (v > 100 ? 100 : v);
    showingVolume = true;
    volumeUntil = millis() + VOLUME_SHOW_MS;
    showingBtnFeedback = false;                // reemplaza al overlay del botón
    lastDisplayDraw = 0;
    return;
  }

  if (spotifyHandleLine(line)) return;         // SPT*: ya la consumió el módulo de Spotify

  if (strncmp(line, "SYS:", 4) == 0) { parseSysLine(line + 4); return; }

  if (strncmp(line, "STY:", 4) == 0) {         // estilo y colores
    unsigned st = 0;
    unsigned short acc, bg, txt;
    if (sscanf(line + 4, "%u,%hx,%hx,%hx", &st, &acc, &bg, &txt) == 4) {
      uiStyle = st > ST_COLOR ? ST_ACTUAL : (uint8_t)st;
      applyColors(acc, bg, txt);
      lastDisplayDraw = 0;
    }
    return;
  }

  if (strncmp(line, "SCN:", 4) == 0) {         // cuántas pantallas hay
    int n = atoi(line + 4);
    numScreens = n < 1 ? 1 : (n > MAX_SCREENS ? MAX_SCREENS : n);
    if (currentScreen >= numScreens) {
      currentScreen = 0;
      memset(imgBuf, 0, sizeof(imgBuf));
      Serial.println("SCR:0");
    }
    lastDisplayDraw = 0;
    return;
  }

  if (strncmp(line, "SCD:", 4) == 0) {         // distribución y widgets de una pantalla
    int i, lay, w0, w1, w2;
    if (sscanf(line + 4, "%d,%d,%d,%d,%d", &i, &lay, &w0, &w1, &w2) == 5 && i >= 0 && i < MAX_SCREENS) {
      ScreenDef& s = screens[i];
      s.layout = (lay < 0 || lay > 3) ? 0 : lay;
      const int w[3] = {w0, w1, w2};
      for (int k = 0; k < 3; k++) {
        s.widget[k] = (w[k] < 0 || w[k] >= W_COUNT) ? W_NONE : w[k];
        s.text[k][0] = '\0';                   // el texto llega después en SCT:
      }
      lastDisplayDraw = 0;
    }
    return;
  }

  if (strncmp(line, "SCT:", 4) == 0) {         // texto del widget "Texto"
    char* end;
    long i = strtol(line + 4, &end, 10);
    if (*end != ',') return;
    long k = strtol(end + 1, &end, 10);
    if (*end != ',' || i < 0 || i >= MAX_SCREENS || k < 0 || k > 2) return;
    strncpy(screens[i].text[k], end + 1, MAX_TEXT);
    screens[i].text[k][MAX_TEXT] = '\0';
    lastDisplayDraw = 0;
    return;
  }

  if (strncmp(line, "IMG:", 4) == 0) {         // empieza un trozo binario de imagen/video
    int x, y, w, h, s;
    unsigned long start, count;
    if (sscanf(line + 4, "%d,%d,%d,%d,%d,%lu,%lu", &x, &y, &w, &h, &s, &start, &count) == 7
        && w > 0 && h > 0 && (s == 1 || s == 2) && x >= 0 && y >= 0
        && x + w * s <= SCREEN_WIDTH && y + h * s <= SCREEN_HEIGHT
        && count > 0 && start + count <= (unsigned long)w * h) {
      binX = x; binY = y; binW = w; binH = h; binScale = s;
      binPix = start; binLeft = count; binLo = -1;
      binLastChunk = start + count == (unsigned long)w * h;
    }
    return;
  }
}

// =====================================================================
//  PANTALLAS
// =====================================================================

static uint16_t tempColor(int t) {
  if (t >= 85) return C_HOT;
  if (t >= 75) return C_WARN;
  return C_TEXT;
}

// Verde / amarillo / rojo según qué tan lleno está (estilo Color).
static uint16_t levelColor(float level) {
  if (level >= 0.85f) return C_HOT;
  if (level >= 0.7f) return C_WARN;
  return C_OK;
}

static int textW(const char* s, uint8_t size) { return (int)strlen(s) * 6 * size; }

// Tamaño de letra más grande (hasta maxSize) con el que el texto entra en w x h.
static uint8_t fitSize(const char* s, int w, int h, uint8_t maxSize) {
  for (uint8_t sz = maxSize; sz > 1; sz--) if (textW(s, sz) <= w && 8 * sz <= h) return sz;
  return 1;
}

static void printAt(const char* s, int x, int y, uint8_t size, uint16_t color) {
  frame.setTextWrap(false);
  frame.setTextSize(size);
  frame.setTextColor(color);
  frame.setCursor(x, y);
  frame.print(s);
}

static const char* const DAYS[7] = {"DOM", "LUN", "MAR", "MIE", "JUE", "VIE", "SAB"};
static const char* const MONTHS[12] = {"ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"};

// Día de la semana (0 = domingo), algoritmo de Sakamoto.
static int weekdayOf(int d, int m, int y) {
  static const int t[] = {0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4};
  if (m < 3) y -= 1;
  return (y + y / 4 - y / 100 + y / 400 + t[m - 1] + d) % 7;
}

// ---------- Widget: hora y fecha ----------
static void drawClock(int x, int y, int w, int h) {
  int d = 0, m = 0, yr = 0;
  const bool hasDate = sscanf(sysDate, "%d/%d/%d", &d, &m, &yr) == 3 && m >= 1 && m <= 12;
  char shortDate[12];
  if (hasDate) snprintf(shortDate, sizeof(shortDate), "%02d %s", d, MONTHS[m - 1]);
  else strcpy(shortDate, "-- ---");
  const char* day = hasDate ? DAYS[weekdayOf(d, m, yr)] : "---";

  switch (uiStyle) {
    case ST_MINIMAL: {
      if (w < 150) break;                    // hueco angosto: igual que el estilo actual
      const uint8_t s = fitSize(sysTime, w * 2 / 3 - 12, h - 12, 5);
      printAt(sysTime, x + 12, y + (h - 8 * s) / 2, s, C_TEXT);
      printAt(day, x + w - 12 - textW(day, 1), y + h / 2 - 10, 1, C_DIM);
      printAt(shortDate, x + w - 12 - textW(shortDate, 1), y + h / 2 + 3, 1, C_DIM);
      return;
    }
    case ST_TERMINAL: {
      char t[10];
      snprintf(t, sizeof(t), "%s%s", sysTime, (millis() / 500) % 2 ? "_" : " ");
      const bool prompt = h >= 50;
      const uint8_t s = fitSize(t, w - 16, h - (prompt ? 22 : 8), 4);
      const int top = y + (h - 8 * s - (prompt ? 14 : 0)) / 2;
      if (prompt) printClipped("rhub@deck:~$ time", x + 8, top, w - 16, 1, blend565(C_BG, C_ACCENT, 140));
      printAt(t, x + 8, top + (prompt ? 14 : 0), s, C_ACCENT);
      return;
    }
    case ST_COLOR: {
      const bool side = w >= 180;            // fecha al lado; si no cabe, abajo
      const int pillW = textW(shortDate, 1) + 12;
      const uint8_t s = fitSize(sysTime, side ? w - pillW - 24 : w - 16, h - (side ? 12 : 26), 5);
      const int tw = textW(sysTime, s);
      const int tx = side ? x + 12 : x + (w - tw) / 2;
      const int ty = side ? y + (h - 8 * s) / 2 : y + (h - 8 * s - 18) / 2;
      char hh[3] = {sysTime[0], sysTime[1], '\0'};
      printAt(hh, tx, ty, s, C_TEXT);        // hora con los dos puntos en el color de acento
      printAt(":", tx + 12 * s, ty, s, C_ACCENT);
      printAt(sysTime + 3, tx + 18 * s, ty, s, C_TEXT);
      const int px = side ? x + w - 12 - pillW : x + (w - pillW) / 2;
      const int py = side ? y + (h - 14) / 2 : ty + 8 * s + 6;
      frame.fillRoundRect(px, py, pillW, 14, 4, C_ACCENT);
      printAt(shortDate, px + 6, py + 3, 1, C_BG);
      return;
    }
  }
  // Actual (y Minimal en huecos angostos): hora grande centrada y fecha abajo.
  const uint8_t ds = (h >= 60 && w >= 200) ? 2 : 1;
  const uint8_t s = fitSize(sysTime, w - 12, h - 8 * ds - 10, 5);
  const int top = y + (h - 8 * s - 6 - 8 * ds) / 2;
  printCentered(sysTime, x, w, top, s, C_TEXT);
  printCentered(sysDate, x, w, top + 8 * s + 6, ds, C_DIM);
}

// ---------- Widgets: CPU, RAM, GPU ----------

static void getStat(uint8_t widget, StatInfo* st) {
  st->note[0] = '\0';
  st->temp = widget != W_RAM;
  if (widget == W_RAM) {
    st->label = "RAM";
    st->unit = "G";
    st->raw = sysRamTotalGB > 0 ? 1 : -1;
    snprintf(st->value, sizeof(st->value), "%.1f", sysRamUsedGB);
    snprintf(st->note, sizeof(st->note), "de %.0f", sysRamTotalGB);
    st->level = sysRamTotalGB > 0 ? sysRamUsedGB / sysRamTotalGB : 0;
  } else {
    const int t = widget == W_CPU ? sysCpuTemp : sysGpuTemp;
    st->label = widget == W_CPU ? "CPU" : "GPU";
    st->unit = t >= 0 ? "\367C" : "";      // "\367" = símbolo de grados en la fuente de Adafruit
    st->raw = t;
    if (t >= 0) snprintf(st->value, sizeof(st->value), "%d", t);
    else strcpy(st->value, "--");
    st->level = t / 100.0f;
  }
}

static void drawStat(const StatInfo& st, int x, int y, int w, int h, bool single = false) {
  const float lv = st.level < 0 ? 0 : (st.level > 1 ? 1 : st.level);
  char v[16];
  if (single && (uiStyle == ST_MINIMAL || uiStyle == ST_TERMINAL)) {   // solo en su hueco: valor grande, no una fila chica
    snprintf(v, sizeof(v), "%s%s", st.value, st.temp ? (st.raw >= 0 ? "C" : "") : st.unit);
    const uint8_t s = fitSize(v, w - 10, h - 18, 4);
    const int top = y + (h - 8 * s - 12) / 2;
    printCentered(v, x, w, top, s, st.raw < 0 ? C_DIM : (uiStyle == ST_TERMINAL ? C_ACCENT : C_TEXT));
    printCentered(st.label, x, w, top + 8 * s + 4, 1, C_DIM);
    return;
  }
  switch (uiStyle) {
    case ST_MINIMAL: {                       // una fila: etiqueta · barra · valor
      snprintf(v, sizeof(v), "%s%s", st.value, st.unit);
      const int cy = y + h / 2 - 4;
      printAt(st.label, x + 10, cy, 1, C_DIM);
      const int vx = x + w - 10 - textW(v, 1);
      const int bx = x + 34, bw = vx - 8 - bx;
      if (bw > 8) {
        frame.fillRoundRect(bx, cy + 2, bw, 4, 2, C_TRACK);
        if (lv > 0) frame.fillRoundRect(bx, cy + 2, (int)(bw * lv + 0.5f), 4, 2, C_ACCENT);
      }
      printAt(v, vx, cy, 1, C_TEXT);
      return;
    }
    case ST_TERMINAL: {                      // CPU [#####-----] 48C
      snprintf(v, sizeof(v), "%s%s", st.value, st.temp ? (st.raw >= 0 ? "C" : "") : st.unit);
      const int cells = (w - 16 - textW(st.label, 1) - textW(v, 1) - 24) / 6;
      char line[64];
      int n = snprintf(line, sizeof(line), "%s [", st.label);
      const int filled = cells > 0 ? (int)(cells * lv + 0.5f) : 0;
      for (int i = 0; i < cells && n < (int)sizeof(line) - 16; i++) line[n++] = i < filled ? '#' : '-';
      snprintf(line + n, sizeof(line) - n, "] %s", v);
      printAt(line, x + 8, y + h / 2 - 4, 1, C_ACCENT);
      return;
    }
    case ST_COLOR: {                         // valor grande con color según el nivel, etiqueta abajo
      snprintf(v, sizeof(v), "%s%s", st.value, st.temp ? (st.raw >= 0 ? "\367" : "") : st.unit);
      const uint8_t s = fitSize(v, w - 10, h - 18, 3);
      const int top = y + (h - 8 * s - 12) / 2;
      printCentered(v, x, w, top, s, st.raw < 0 ? C_DIM : levelColor(lv));
      printCentered(st.label, x, w, top + 8 * s + 4, 1, C_DIM);
      return;
    }
  }
  // Actual: etiqueta (+ nota), valor grande y barra, como la pantalla de sistema de siempre.
  const bool tall = h >= 60;
  const uint16_t color = st.temp ? tempColor(st.raw) : C_TEXT;
  printAt(st.label, x + 10, y + (tall ? 8 : 4), 1, C_DIM);
  if (st.note[0] && w >= 90) printAt(st.note, x + w - 10 - textW(st.note, 1), y + (tall ? 8 : 4), 1, C_FAINT);
  printAt(st.value, x + 10, y + (tall ? 24 : 14), tall ? 3 : 2, color);
  frame.setTextSize(1);
  frame.setTextColor(C_DIM);
  frame.print(st.unit);
  const int bw = w - 20, by = y + h - (tall ? 16 : 5);
  frame.fillRoundRect(x + 10, by, bw, 4, 2, C_TRACK);
  if (lv > 0) frame.fillRoundRect(x + 10, by, (int)(bw * lv + 0.5f), 4, 2, color);
}

// ---------- Widget: sistema (RAM + CPU + GPU) ----------
static void drawSystem(int x, int y, int w, int h) {
  static const uint8_t ORDER[3] = {W_RAM, W_CPU, W_GPU};
  const bool rows = uiStyle == ST_MINIMAL || uiStyle == ST_TERMINAL;
  StatInfo st;
  for (int i = 0; i < 3; i++) {
    getStat(ORDER[i], &st);
    if (rows) {
      const int rh = (h - 8) / 3;
      drawStat(st, x, y + 4 + i * rh, w, rh);
    } else {
      const int cw = w / 3;
      drawStat(st, x + i * cw, y, i == 2 ? w - 2 * cw : cw, h);
      if (i > 0 && uiStyle == ST_ACTUAL) frame.drawFastVLine(x + i * cw, y + 10, h - 20, C_TRACK);
    }
  }
}

// ---------- Widget: texto ----------
static void drawText(const char* text, int x, int y, int w, int h) {
  if (!text[0]) return;
  char buf[MAX_TEXT + 3];
  snprintf(buf, sizeof(buf), uiStyle == ST_TERMINAL ? "> %s" : "%s", text);
  const uint16_t color = (uiStyle == ST_TERMINAL || uiStyle == ST_COLOR) ? C_ACCENT : C_TEXT;
  const uint8_t s = fitSize(buf, w - 16, h - 8, 4);
  if (textW(buf, s) <= w - 16) printCentered(buf, x, w, y + (h - 8 * s) / 2, s, color);
  else printClipped(buf, x + 8, y + (h - 8) / 2, w - 16, 1, color);
}

// ---------- Widgets con datos: clima, disco y red ----------
// La app manda "etiqueta|valor" por SCT: el valor va grande (en dos filas si trae "~"; { y } son las flechas de bajada y subida) y la
// etiqueta chica debajo, partida en dos renglones si no cabe en el hueco.
// Texto chico centrado; si aun así no cabe, se recorta.
static void printFit(const char* s, int x, int w, int y, uint16_t color) {
  if (textW(s, 1) <= w - 8) printCentered(s, x, w, y, 1, color);
  else printClipped(s, x + 4, y, w - 8, 1, color);
}

static void drawInfo(const char* text, int x, int y, int w, int h) {
  if (!text[0]) return;
  char label[MAX_TEXT + 1], value[MAX_TEXT + 1];
  const char* bar = strchr(text, '|');
  if (bar) {
    const size_t n = bar - text;
    memcpy(label, text, n);
    label[n] = '\0';
    strncpy(value, bar + 1, MAX_TEXT);
  } else {
    label[0] = '\0';
    strncpy(value, text, MAX_TEXT);
  }
  value[MAX_TEXT] = '\0';

  // Etiqueta: una línea si cabe; si no, se parte en el último espacio que quepa (la segunda se recorta).
  const int maxChars = (w - 8) / 6;
  char line1[MAX_TEXT + 1], line2[MAX_TEXT + 1];
  strncpy(line1, label, MAX_TEXT);
  line1[MAX_TEXT] = '\0';
  line2[0] = '\0';
  if ((int)strlen(label) > maxChars && maxChars > 3) {
    int cut = maxChars;
    while (cut > 0 && label[cut] != ' ') cut--;
    if (cut == 0) cut = maxChars;                    // palabra sin espacios: se corta a la fuerza
    memcpy(line1, label, cut);
    line1[cut] = '\0';
    strncpy(line2, label + cut + (label[cut] == ' ' ? 1 : 0), MAX_TEXT);
    line2[MAX_TEXT] = '\0';
  }
  const int labelLines = !label[0] ? 0 : (line2[0] ? 2 : 1);

  // Valor: una o dos filas, lo más grande que quepa.
  char* tilde = strchr(value, '~');
  char row2[MAX_TEXT + 1];
  row2[0] = '\0';
  if (tilde) {
    *tilde = '\0';
    strncpy(row2, tilde + 1, MAX_TEXT);
    row2[MAX_TEXT] = '\0';
  }
  // Flechas: el juego de caracteres de la pantalla trae ↑ (0x18) y ↓ (0x19); la app manda } y { en su lugar.
  for (char* p = value; *p; p++) { if (*p == '{') *p = 0x19; else if (*p == '}') *p = 0x18; }
  for (char* p = row2; *p; p++) { if (*p == '{') *p = 0x19; else if (*p == '}') *p = 0x18; }
  const int rows = row2[0] ? 2 : 1;
  const int availH = h - 6 - (labelLines ? 4 + 9 * labelLines : 0);
  const int longest = textW(value, 1) > textW(row2, 1) ? 1 : 2;     // cuál de las dos filas es más ancha
  uint8_t s = fitSize(longest == 1 ? value : row2, w - 12, availH / rows, 4);
  const uint16_t color = (uiStyle == ST_TERMINAL || uiStyle == ST_COLOR) ? C_ACCENT : C_TEXT;
  const int blockH = rows * 8 * s + (rows - 1) * 3 + (labelLines ? 4 + 9 * labelLines : 0);
  int top = y + (h - blockH) / 2;
  printCentered(value, x, w, top, s, color);
  if (rows == 2) { top += 8 * s + 3; printCentered(row2, x, w, top, s, color); }
  if (!labelLines) return;
  top += 8 * s + 4;
  printFit(line1, x, w, top, C_DIM);
  if (line2[0]) printFit(line2, x, w, top + 9, C_DIM);
}

// ---------- Widgets: imagen y video (desde el búfer de imagen) ----------
static void drawImageRect(int x, int y, int w, int h) {
  for (int r = 0; r < h; r++) frame.drawRGBBitmap(x, y + r, &imgBuf[(y + r) * SCREEN_WIDTH + x], w, 1);
}

// Dibuja todos los huecos de la pantalla actual.
static void drawCurrentScreen() {
  const ScreenDef& s = screens[currentScreen];
  for (uint8_t k = 0; k < LAYOUT_SLOTS[s.layout]; k++) {
    const int16_t* r = LAYOUT_RECTS[s.layout][k];
    const int x = r[0], y = r[1], w = r[2], h = r[3];
    switch (s.widget[k]) {
      case W_CLOCK:  drawClock(x, y, w, h); break;
      case W_SYSTEM: drawSystem(x, y, w, h); break;
      case W_CPU: case W_RAM: case W_GPU: {
        StatInfo st;
        getStat(s.widget[k], &st);
        drawStat(st, x, y, w, h, true);
        break;
      }
      case W_SPOTIFY:
        if (w == SCREEN_WIDTH) drawScreenNowPlaying();
        else drawSpotifyCompact(x, y, w, h);
        break;
      case W_IMAGE: case W_VIDEO: drawImageRect(x, y, w, h); break;
      case W_TEXT:  drawText(s.text[k], x, y, w, h); break;
      case W_WEATHER: case W_DISK: case W_NET: drawInfo(s.text[k], x, y, w, h); break;
    }
    // separador entre huecos (no encima de imágenes, que llenan su hueco)
    if (s.widget[k] != W_IMAGE && s.widget[k] != W_VIDEO) {
      if (x > 0) frame.drawFastVLine(x, y + 8, h - 16, C_TRACK);
      if (y > 0) frame.drawFastHLine(x + 8, y, w - 16, C_TRACK);
    }
  }
}

// ---------- Salvapantallas: logo + "RHub" centrados (app cerrada) ----------
static void drawScreensaver() {
  const int L = 44, gap = 14, tw = textW("RHub", 3);
  const int x0 = (SCREEN_WIDTH - (L + gap + tw)) / 2, y0 = (SCREEN_HEIGHT - L) / 2;
  frame.fillScreen(0x0000);
  frame.fillRoundRect(x0, y0, L, L, 10, rgb(28, 28, 31));
  frame.drawRoundRect(x0, y0, L, L, 10, rgb(58, 58, 64));
  for (int i = 0; i < 4; i++) {              // los 4 cuadritos del logo, contorno de 2 px
    const int cx = x0 + 11 + (i % 2) * 12, cy = y0 + 11 + (i / 2) * 12;
    frame.drawRoundRect(cx, cy, 10, 10, 3, 0xFFFF);
    frame.drawRoundRect(cx + 1, cy + 1, 8, 8, 2, 0xFFFF);
  }
  printAt("RHub", x0 + L + gap, (SCREEN_HEIGHT - 24) / 2, 3, 0xFFFF);
}

// ---------- Overlay: acción del botón — se muestra 2s tras presionar cualquier botón ----------
void drawScreenBtnFeedback() {
  char label[32];
  if (actLabel[0]) {
    strncpy(label, actLabel, sizeof(label) - 1);
    label[sizeof(label) - 1] = '\0';
  } else {
    snprintf(label, sizeof(label), "Boton %d", lastPressedBtn + 1); // +1: mostramos 1-9, no 0-8
  }

  int16_t x1, y1;
  uint16_t w, h;
  frame.setTextWrap(false);
  for (uint8_t size = 3; size >= 2; size--) {     // lo más grande que quepa en una línea
    frame.setTextSize(size);
    frame.getTextBounds(label, 0, 0, &x1, &y1, &w, &h);
    if (w <= SCREEN_WIDTH - 16) {
      printCentered(label, 0, SCREEN_WIDTH, (SCREEN_HEIGHT - 8 * size) / 2, size, C_TEXT);
      return;
    }
  }
  printCentered(label, 0, SCREEN_WIDTH, 34, 1, C_TEXT);  // 30 caracteres a tamaño 1 siempre caben
}

// ---------- Overlay: volumen de Spotify (barra horizontal + %) ----------
void drawScreenVolumeOverlay() {
  const int y = 30;
  const int barX = 44, barW = 170;
  frame.drawBitmap(16, y + 1, ICON_VOLUME, 8, 8, C_TEXT);
  frame.fillRoundRect(barX, y + 2, barW, 8, 4, C_TRACK);
  int fill = map(spVolume, 0, 100, 0, barW);
  if (fill > 0) frame.fillRoundRect(barX, y + 2, fill, 8, 4, spotifyNow.accent);

  char txt[6];
  snprintf(txt, sizeof(txt), "%d%%", spVolume);
  frame.setTextSize(2);
  frame.setTextColor(C_TEXT);
  frame.setCursor(SCREEN_WIDTH - 16 - (int)strlen(txt) * 12, y - 1);  // alineado a la derecha
  frame.print(txt);
}

// Dibuja en "frame" (RAM) lo que toca mostrar ahora, sin mandarlo a la pantalla.
void renderScreen() {
  frame.fillScreen(C_BG);
  // Cada pantalla arranca con el texto en estado normal (las anteriores pueden haber
  // dejado otro tamaño o el wrap apagado).
  frame.setTextSize(1);
  frame.setTextColor(C_TEXT);
  frame.setTextWrap(true);

  // App cerrada (o recién encendido): salvapantallas con el logo, guardado aquí en el firmware.
  if (lastRxMs == 0 || millis() - lastRxMs > SAVER_AFTER_MS) {
    showingBtnFeedback = false;
    showingVolume = false;
    drawScreensaver();
    return;
  }

  if (showingVolume) {
    if (millis() < volumeUntil) {
      drawScreenVolumeOverlay();
      return;
    }
    showingVolume = false; // terminó: sigue la pantalla que estaba (Spotify, etc.)
  }

  // Recién presionado: se espera un instante el ACT: de la app para no mostrar
  // "Boton N" y que cambie a la acción medio segundo después.
  bool esperandoAct = showingBtnFeedback && !actLabel[0] && (millis() - btnPressAt < ACT_WAIT_MS);

  if (showingBtnFeedback && !esperandoAct) {
    if (millis() < btnFeedbackUntil) {
      drawScreenBtnFeedback();
      return;
    } else {
      showingBtnFeedback = false;
      // Si la pantalla tiene Spotify con algo cargado (sonando o en pausa) o un video,
      // te quedas ahí; en cualquier otro caso vuelve a la primera pantalla.
      bool quedarse = (screenHas(currentScreen, W_SPOTIFY) && spotifyNow.state <= 1) || screenHas(currentScreen, W_VIDEO);
      if (!quedarse && currentScreen != 0) {
        currentScreen = 0;
        memset(imgBuf, 0, sizeof(imgBuf));
        Serial.println("SCR:0");          // la app sigue a la pantalla física
      }
    }
  }

  drawCurrentScreen();
}

void updateDisplay() {
  renderScreen();
  pushFrame(frame.getBuffer());
}

void loop() {
  unsigned long now = millis();

  if (now - lastMatrixScan >= MATRIX_INTERVAL_MS) {
    lastMatrixScan = now;
    scanMatrix();
  }

  readIncomingSerial();

  if (now - lastDisplayDraw >= DISPLAY_INTERVAL_MS) {
    lastDisplayDraw = now;
    updateDisplay();
  }
}
