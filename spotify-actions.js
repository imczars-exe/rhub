'use strict';

/* =====================================================================
   BIBLIOTECA DE ACCIONES DE SPOTIFY — metadatos compartidos

   Este archivo es la ÚNICA fuente de verdad de qué acciones existen.
   Lo usan los dos lados:
     - main.js / spotify.js  -> require('./spotify-actions')
     - script.js (renderer)  -> <script src="spotify-actions.js"> deja
                                window.SPOTIFY_ACTIONS

   Para agregar una acción nueva:
     1) añádela aquí (id, label, desc, icon)
     2) implementa su handler en spotify.js  (this._handlers[id])
     3) si necesita un ícono nuevo, agrégalo a ICON_PATHS en script.js
   El select de "Configurar Acción" y el de la Cadena se arman solos.

   icon = clave de ICON_PATHS. Algunas acciones cambian de ícono según el
   estado (play/pausa, corazón lleno, repetir-1) — eso lo resuelve
   spotifyIconFor() en script.js.
   ===================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SPOTIFY_ACTIONS = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  return [
    { id: 'play_pause', label: 'Reproducir / Pausar',            desc: 'Alterna según lo que esté sonando', icon: 'sp_play' },
    { id: 'next',       label: 'Siguiente canción',              desc: 'Salta a la siguiente',              icon: 'sp_next' },
    { id: 'prev',       label: 'Canción anterior',               desc: 'Vuelve (o reinicia si ya avanzó)',  icon: 'sp_prev' },
    { id: 'like',       label: 'Me gusta (guardar / quitar)',    desc: 'Guarda o quita la canción actual',  icon: 'sp_heart' },
    { id: 'shuffle',    label: 'Aleatorio (activar / desactivar)', desc: 'Alterna el modo aleatorio',       icon: 'sp_shuffle' },
    { id: 'repeat',     label: 'Repetir (cambiar modo)',         desc: 'No repetir → lista → canción',      icon: 'sp_repeat' },
    { id: 'vol_up',     label: 'Subir volumen de Spotify',       desc: '+10 % (solo Spotify, no Windows)',  icon: 'sp_volUp' },
    { id: 'vol_down',   label: 'Bajar volumen de Spotify',       desc: '−10 % (solo Spotify, no Windows)',  icon: 'sp_volDown' },
    { id: 'seek_fwd',   label: 'Adelantar 10 segundos',          desc: 'Avanza dentro de la canción',       icon: 'sp_fwd10' },
    { id: 'seek_back',  label: 'Retroceder 10 segundos',         desc: 'Retrocede dentro de la canción',    icon: 'sp_back10' },
  ];
});
