// Adaptador de la YouTube IFrame Player API oficial (Música, experimento 02):
// https://developers.google.com/youtube/iframe_api_reference
//
// - La API solo se carga al pedir un vídeo (script oficial, nunca en las demás pantallas).
// - El iframe lo crea TypingQuest con el reproductor oficial sin cookies, sus controles y
//   `referrerPolicy` propio: la página usa `no-referrer` y YouTube necesita conocer el
//   origen de la página que lo incrusta (si no, el reproductor falla con el error 153).
// - Sin claves de API, sin descargas, sin subtítulos y sin reproducción automática.
import { embedUrl } from './youtube-url.js';

export const YOUTUBE_IFRAME_API_URL = 'https://www.youtube.com/iframe_api';
const API_TIMEOUT_MS = 15_000;

const STATE_NAMES = Object.freeze({ '-1': 'unstarted', 0: 'ended', 1: 'playing', 2: 'paused', 3: 'buffering', 5: 'cued' });
const ERROR_KINDS = Object.freeze({ 2: 'invalid', 5: 'html5', 100: 'not-found', 101: 'not-embeddable', 150: 'not-embeddable', 153: 'configuration' });

export function playerStateName(code) {
  return STATE_NAMES[code] ?? 'other';
}

export function playerErrorKind(code) {
  return ERROR_KINDS[code] ?? 'unknown';
}

// Una carga por ventana; si falla, se puede reintentar.
const pendingLoads = new WeakMap();

/**
 * Carga la API oficial una sola vez y resuelve con `YT`.
 * @returns {Promise<object>} rechaza con Error('load') si el script no carga
 */
export function loadYouTubeApi({ doc = document, win = window } = {}) {
  if (win.YT?.Player) return Promise.resolve(win.YT);
  if (pendingLoads.has(win)) return pendingLoads.get(win);
  const promise = new Promise((resolve, reject) => {
    const script = doc.createElement('script');
    const fail = () => {
      clearTimeout(timer);
      pendingLoads.delete(win);
      script.remove();
      reject(new Error('load'));
    };
    const timer = setTimeout(fail, API_TIMEOUT_MS);
    const previous = win.onYouTubeIframeAPIReady;
    win.onYouTubeIframeAPIReady = () => {
      clearTimeout(timer);
      if (typeof previous === 'function') previous();
      resolve(win.YT);
    };
    script.addEventListener('error', fail);
    script.src = YOUTUBE_IFRAME_API_URL;
    doc.head.append(script);
  });
  pendingLoads.set(win, promise);
  return promise;
}

function createIframe(doc, videoId, origin) {
  const iframe = doc.createElement('iframe');
  iframe.title = 'Reproductor de vídeo de YouTube';
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  iframe.setAttribute('allow', 'encrypted-media; picture-in-picture; fullscreen');
  iframe.className = 'music-player-frame';
  iframe.src = embedUrl(videoId, origin);
  return iframe;
}

/**
 * Reproductor de un vídeo dentro de `container`. Tiempos en milisegundos; antes de
 * `onReady` las órdenes no hacen nada y los tiempos son NaN.
 */
export function createYouTubePlayer({ doc = document, YT, container, videoId, origin, onReady, onStateChange, onError }) {
  const iframe = createIframe(doc, videoId, origin);
  container.replaceChildren(iframe);
  let ready = false;
  let destroyed = false;
  const player = new YT.Player(iframe, {
    events: {
      onReady: () => { ready = true; onReady?.(); },
      onStateChange: (event) => onStateChange?.(playerStateName(event.data)),
      onError: (event) => onError?.(playerErrorKind(event.data)),
    },
  });
  const usable = () => ready && !destroyed;
  const seconds = (read) => {
    if (!usable()) return NaN;
    const value = Number(read());
    return Number.isFinite(value) && value > 0 ? value * 1000 : NaN;
  };
  return {
    play() { if (usable()) player.playVideo(); },
    pause() { if (usable()) player.pauseVideo(); },
    seekTo(ms) { if (usable()) player.seekTo(Math.max(0, ms) / 1000, true); },
    currentTimeMs() {
      if (!usable()) return NaN;
      const value = Number(player.getCurrentTime());
      return Number.isFinite(value) && value >= 0 ? value * 1000 : NaN;
    },
    durationMs: () => seconds(() => player.getDuration()),
    state: () => (usable() ? playerStateName(player.getPlayerState()) : 'other'),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      try { player.destroy(); } catch { /* el reproductor ya no existe */ }
      container.replaceChildren();
    },
  };
}
