// URL de vídeos de YouTube (Música, experimento 02). Módulo PURO: sin DOM ni red.
// Solo acepta dominios oficiales de YouTube y un ID de 11 caracteres [A-Za-z0-9_-]:
// cualquier otra cosa se rechaza, así que el ID nunca lleva HTML ni otro esquema.

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const MAX_INPUT_LENGTH = 2048;
const WATCH_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']);
const PATH_PREFIXES = ['embed', 'shorts', 'live', 'v'];
const NOCOOKIE_HOSTS = new Set(['youtube-nocookie.com', 'www.youtube-nocookie.com']);
const EMBED_ORIGIN = 'https://www.youtube-nocookie.com';

function fail(error) {
  return { ok: false, error };
}

// Añade https:// a una dirección escrita sin esquema («youtu.be/…»), nunca a otro esquema.
function toUrl(text) {
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    return new URL(withScheme);
  } catch {
    return null;
  }
}

function idFromPath(url) {
  const [first, second] = url.pathname.split('/').filter(Boolean);
  if (url.hostname === 'youtu.be') return first;
  if (PATH_PREFIXES.includes(first)) return second;
  if (first === 'watch' && WATCH_HOSTS.has(url.hostname)) return url.searchParams.get('v');
  return null;
}

function isOfficialHost(hostname) {
  return hostname === 'youtu.be' || WATCH_HOSTS.has(hostname) || NOCOOKIE_HOSTS.has(hostname);
}

/**
 * ID del vídeo de una URL de YouTube (watch, youtu.be, embed, shorts, live,
 * nocookie, móvil o Music) o de un ID suelto.
 * @returns {{ ok: true, videoId: string } | { ok: false, error: string }}
 */
export function parseYouTubeUrl(input) {
  if (typeof input !== 'string') return fail('empty');
  const text = input.trim();
  if (text === '') return fail('empty');
  if (text.length > MAX_INPUT_LENGTH) return fail('too-long');
  if (VIDEO_ID.test(text)) return { ok: true, videoId: text };
  const url = toUrl(text);
  if (!url || !['https:', 'http:'].includes(url.protocol)) return fail('not-youtube');
  if (url.username || url.password || url.port || !isOfficialHost(url.hostname)) return fail('not-youtube');
  const id = idFromPath(url);
  return typeof id === 'string' && VIDEO_ID.test(id) ? { ok: true, videoId: id } : fail('no-video');
}

/**
 * Dirección del reproductor oficial incrustado (dominio sin cookies de YouTube),
 * con la IFrame Player API activada y sin reproducción automática.
 */
export function embedUrl(videoId, pageOrigin) {
  if (!VIDEO_ID.test(videoId)) throw new TypeError('ID de vídeo no válido');
  // disablekb=1 (02.2): sin atajos de teclado del reproductor. Con el foco en el vídeo,
  // las letras de la frase («l», «j», «k», espacio, números…) lo movían o pausaban.
  const params = new URLSearchParams({ enablejsapi: '1', origin: pageOrigin, playsinline: '1', rel: '0', disablekb: '1' });
  return `${EMBED_ORIGIN}/embed/${videoId}?${params}`;
}

export const YOUTUBE_EMBED_ORIGIN = EMBED_ORIGIN;
