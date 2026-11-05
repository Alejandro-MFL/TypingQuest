// Preferencia de volumen de los efectos (experimento 01). Módulo PURO: sin DOM,
// sin almacenamiento (storage.js guarda y lee la clave) y sin Web Audio.
//
// 0 % = silencio; 100 % = el máximo definido por sound.js. La versión estable no
// guardaba el sonido (solo CONFIG.soundEnabled al cargar): no hay datos antiguos que
// migrar, y sin preferencia guardada se respeta ese estado inicial.

export const VOLUME_KEY = 'typingquest:sound:v1';
const VOLUME_VERSION = 1;
export const DEFAULT_VOLUME = 70;
export const VOLUME_STEP = 5;
const LOW_VOLUME_LIMIT = 50;

/** Entero de 0 a 100, o null si no es un volumen válido (acepta el texto de un range). */
export function normalizeVolume(value) {
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = typeof value === 'string' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isFinite(number) || number < 0 || number > 100) return null;
  return Math.round(number);
}

export function serializeVolumePreference(volume) {
  return JSON.stringify({ version: VOLUME_VERSION, volume: normalizeVolume(volume) });
}

/** Volumen guardado, o null si no hay dato válido (localStorage es entrada no fiable). */
export function parseVolumePreference(raw) {
  if (typeof raw !== 'string') return null;
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.version !== VOLUME_VERSION) return null;
  return Object.hasOwn(data, 'volume') && typeof data.volume === 'number' ? normalizeVolume(data.volume) : null;
}

/**
 * Volumen al cargar: el guardado si existe (también 0); si no, el estado inicial
 * anterior (CONFIG.soundEnabled): desactivado → 0, nunca se activa por sorpresa.
 */
export function initialVolume({ stored, legacyEnabled }) {
  if (stored !== null && stored !== undefined) return stored;
  return legacyEnabled ? DEFAULT_VOLUME : 0;
}

/** Ganancia general (0-1) con curva cuadrática: el oído percibe el volumen de forma no lineal. */
export function volumeGain(volume) {
  const v = normalizeVolume(volume);
  return v === null ? 0 : (v / 100) ** 2;
}

/** Icono del botón: 'muted' (0 %), 'low' (< 50 %) o 'high'. */
export function volumeLevel(volume) {
  if (volume <= 0) return 'muted';
  return volume < LOW_VOLUME_LIMIT ? 'low' : 'high';
}

export function formatVolume(volume) {
  return `${volume} %`;
}

/** Nombre accesible y título del botón de la cabecera. */
export function volumeButtonLabel(volume) {
  return volume <= 0 ? 'Volumen: silenciado' : `Volumen: ${formatVolume(volume)}`;
}
