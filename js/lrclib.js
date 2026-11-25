// Cliente de LRCLIB (Música, experimento 02): solo LECTURA del endpoint estable
// GET /api/search (https://lrclib.net/docs). `fetch` y el reloj se inyectan (pruebas).
//
// Normas del servicio que se respetan: identificación con la cabecera `Lrclib-Client`
// (el navegador no permite cambiar User-Agent), una petición a la vez y, tras un 429 o
// 503, ninguna petición hasta que pase `Retry-After` (sin reintentos automáticos).
// Las letras solo se guardan en memoria mientras se usan: nunca en localStorage.
import { sanitizeText } from './text-prep.js';

export const LRCLIB_SEARCH_URL = 'https://lrclib.net/api/search';
const MAX_QUERY_LENGTH = 300;
const MAX_FIELD_LENGTH = 300;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRY_AFTER_S = 60;
const MAX_RETRY_AFTER_S = 3600;

function cleanField(value) {
  return typeof value === 'string' ? sanitizeText(value).slice(0, MAX_FIELD_LENGTH) : null;
}

function isOptionalString(value) {
  return value === null || value === undefined || typeof value === 'string';
}

// Registro de la API → datos que usa la interfaz, o null si no es válido.
function toResult(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { id, trackName, artistName, albumName, duration, instrumental, syncedLyrics, plainLyrics } = raw;
  const validDuration = duration === null || duration === undefined || (Number.isFinite(duration) && duration >= 0);
  if (!Number.isSafeInteger(id) || id <= 0 || typeof trackName !== 'string' || typeof artistName !== 'string'
    || !isOptionalString(albumName) || !isOptionalString(syncedLyrics) || !isOptionalString(plainLyrics) || !validDuration) {
    return null;
  }
  return {
    id, track: cleanField(trackName), artist: cleanField(artistName), album: cleanField(albumName) || null,
    durationS: Number.isFinite(duration) ? duration : null, instrumental: instrumental === true,
    synced: syncedLyrics && syncedLyrics.trim() ? syncedLyrics : null, hasPlain: Boolean(plainLyrics && plainLyrics.trim()),
  };
}

// Las letras sincronizadas primero; el resto conserva el orden de LRCLIB.
function toResults(list) {
  const results = list.map(toResult);
  const valid = results.filter(Boolean);
  const sorted = [...valid.filter((r) => r.synced), ...valid.filter((r) => !r.synced)];
  return { ok: true, results: sorted, discarded: results.length - valid.length };
}

function retryAfterSeconds(response) {
  const value = Number(response.headers.get('Retry-After'));
  return Number.isFinite(value) && value > 0 ? Math.min(Math.ceil(value), MAX_RETRY_AFTER_S) : DEFAULT_RETRY_AFTER_S;
}

async function readJson(response) {
  if (!/json/i.test(response.headers.get('Content-Type') ?? '')) return { ok: false };
  try {
    return { ok: true, data: await response.json() };
  } catch {
    return { ok: false };
  }
}

function searchUrl(track, artist) {
  const params = new URLSearchParams({ track_name: track });
  if (artist) params.set('artist_name', artist);
  return `${LRCLIB_SEARCH_URL}?${params}`;
}

/**
 * @param {{ fetchImpl: typeof fetch, clientName: string, now: () => number, timeoutMs?: number }} options
 */
export function createLrclibClient({ fetchImpl, clientName, now, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  let blockedUntil = 0;
  let busy = false;

  function block(response) {
    const seconds = retryAfterSeconds(response);
    blockedUntil = now() + seconds * 1000;
    return seconds;
  }

  async function interpret(response) {
    if (response.status === 429) return { ok: false, error: 'rate-limited', retryAfterS: block(response) };
    if (response.status === 503) return { ok: false, error: 'unavailable', retryAfterS: block(response) };
    if (response.status === 404) return { ok: true, results: [], discarded: 0 };
    if (response.status >= 500) return { ok: false, error: 'unavailable' };
    if (!response.ok) return { ok: false, error: 'http-error' };
    const body = await readJson(response);
    return body.ok && Array.isArray(body.data) ? toResults(body.data) : { ok: false, error: 'invalid' };
  }

  async function request(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: 'GET', headers: { 'Lrclib-Client': clientName }, credentials: 'omit', signal: controller.signal,
      });
      return await interpret(response);
    } catch (error) {
      return { ok: false, error: error?.name === 'AbortError' ? 'timeout' : 'network' };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Busca por título (obligatorio) y artista (opcional). Nunca lanza. */
  async function search({ track, artist }) {
    const title = typeof track === 'string' ? track.trim() : '';
    const singer = typeof artist === 'string' ? artist.trim() : '';
    if (!title) return { ok: false, error: 'missing-track' };
    if (title.length > MAX_QUERY_LENGTH || singer.length > MAX_QUERY_LENGTH) return { ok: false, error: 'too-long' };
    const waitMs = blockedUntil - now();
    if (waitMs > 0) return { ok: false, error: 'rate-limited', retryAfterS: Math.ceil(waitMs / 1000) };
    if (busy) return { ok: false, error: 'busy' };
    busy = true;
    try {
      return await request(searchUrl(title, singer));
    } finally {
      busy = false;
    }
  }

  return { search };
}

const MESSAGES = Object.freeze({
  'missing-track': 'Escribe al menos el título de la canción.',
  'too-long': 'El título o el artista son demasiado largos.',
  busy: 'Ya hay una búsqueda en curso. Espera a que termine.',
  network: 'No se pudo conectar con LRCLIB. Revisa tu conexión a Internet e inténtalo de nuevo.',
  timeout: 'LRCLIB tarda demasiado en responder. Inténtalo de nuevo más tarde.',
  unavailable: 'LRCLIB no responde en este momento. Inténtalo de nuevo más tarde.',
  invalid: 'LRCLIB ha devuelto datos no válidos. Inténtalo de nuevo más tarde.',
  'http-error': 'LRCLIB no ha podido atender la búsqueda. Revisa el título y el artista.',
});

/** Mensaje comprensible de un error del cliente. */
export function lrclibErrorMessage(error, retryAfterS) {
  if (error === 'rate-limited') {
    return `Se han hecho demasiadas búsquedas seguidas. Espera ${retryAfterS} s antes de volver a buscar.`;
  }
  return MESSAGES[error] ?? 'No se pudo completar la búsqueda.';
}

/** Duración «m:ss» de LRCLIB (segundos), o «—». */
export function formatTrackDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
