// Sonidos de teclado (experimento 02.4). Módulo PURO: sin DOM, sin almacenamiento
// (storage.js guarda y lee la clave) y sin Web Audio (sound.js los sintetiza).
//
// Preferencias por CONTEXTO, no perfiles: «typing» (Academia, Biblioteca, Práctica libre)
// y «music» (Música, donde no deben competir con la canción). Solo se guarda lo que el
// usuario ha cambiado en cada contexto; lo demás usa los valores por defecto. Así, activar
// los sonidos en Música se conserva y nunca se fuerza el apagado al volver a entrar.
import { normalizeVolume } from './volume.js';

export const KEY_SOUND_KEY = 'typingquest:keys:v1';
const KEY_SOUND_VERSION = 1;
export const KEY_SOUND_CONTEXTS = Object.freeze(['typing', 'music']);
export const DEFAULT_KEY_SOUND = Object.freeze({
  typing: Object.freeze({ enabled: true, volume: 50 }),
  music: Object.freeze({ enabled: false, volume: 50 }),
});
// Sonidos de tecla que pueden solaparse como máximo (pulsaciones muy rápidas). Exp. 02.5:
// 2 (antes 3), porque cada tecla suena ahora más fuerte; a 10 teclas/s apenas se solapan.
export const MAX_KEY_VOICES = 2;

/** Contexto de los sonidos de teclado para una ruta de la navegación. */
export function keySoundContext(route) {
  return route === 'music' ? 'music' : 'typing';
}

/** Explicación breve, en el panel, de a qué se aplica el ajuste visible. */
export function keySoundContextText(context) {
  return context === 'music'
    ? 'Ajuste para Música (aparte del resto).'
    : 'Ajuste para Academia, Biblioteca y Práctica libre.';
}

function validSetting(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (typeof value.enabled !== 'boolean' || typeof value.volume !== 'number') return null;
  const volume = normalizeVolume(value.volume);
  return volume === null ? null : { enabled: value.enabled, volume };
}

/** Preferencias guardadas (solo los contextos válidos); {} si no hay dato válido. */
export function parseKeySoundPreference(raw) {
  if (typeof raw !== 'string') return {};
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.version !== KEY_SOUND_VERSION) return {};
  const stored = {};
  for (const context of KEY_SOUND_CONTEXTS) {
    const setting = Object.hasOwn(data, context) ? validSetting(data[context]) : null;
    if (setting) stored[context] = setting;
  }
  return stored;
}

export function serializeKeySoundPreference(stored) {
  const data = { version: KEY_SOUND_VERSION };
  for (const context of KEY_SOUND_CONTEXTS) {
    const setting = validSetting(stored?.[context]);
    if (setting) data[context] = setting;
  }
  return JSON.stringify(data);
}

/** Ajuste completo de los dos contextos: lo guardado o, si falta, el valor por defecto. */
export function resolveKeySound(stored) {
  const resolved = {};
  for (const context of KEY_SOUND_CONTEXTS) {
    resolved[context] = validSetting(stored?.[context]) ?? { ...DEFAULT_KEY_SOUND[context] };
  }
  return resolved;
}

/** Nuevas preferencias guardadas tras un cambio explícito del usuario en un contexto. */
export function updateKeySound(stored, context, patch) {
  if (!KEY_SOUND_CONTEXTS.includes(context)) return stored;
  const current = resolveKeySound(stored)[context];
  const enabled = typeof patch?.enabled === 'boolean' ? patch.enabled : current.enabled;
  const volume = normalizeVolume(patch?.volume) ?? current.volume;
  return { ...stored, [context]: { enabled, volume } };
}

/**
 * Ganancia de las teclas RELATIVA al volumen general. Exp. 02.5: lineal, porque el general ya
 * aplica la curva; dos curvas seguidas atenuaban de más (50 % y 50 % ≈ −24 dB, casi inaudible).
 */
export function keySoundGain(setting) {
  const volume = normalizeVolume(setting?.volume);
  return setting?.enabled && volume !== null ? volume / 100 : 0;
}

/**
 * Sonido de una entrada según el motor: 'correct', 'error', 'backspace' o null. Una
 * entrada rechazada devuelve el MISMO estado (pegado, exceso, bloqueo, retroceso sin
 * efecto): silencio. Una pulsación nunca da dos sonidos.
 */
export function classifyKeystroke(previous, next) {
  if (!previous || !next || previous === next) return null;
  const before = previous.typed.length;
  const after = next.typed.length;
  if (after < before) return 'backspace';
  if (after !== before + 1) return null;
  return next.typed[after - 1] === next.text[after - 1] ? 'correct' : 'error';
}

/** ¿Puede empezar otro sonido de tecla? `ends`: final (s) de los que se programaron. */
export function allowKeyVoice(ends, now) {
  return ends.filter((end) => end > now).length < MAX_KEY_VOICES;
}

/**
 * Sonido de tecla de una entrada, o null si la entrada completa un fragmento o termina
 * la partida: entonces suena SOLO su confirmación (nunca tecla + confirmación).
 */
export function keySoundFor(previous, next) {
  if (!previous || !next) return null;
  if (next.status === 'finished' || next.segmentIndex > previous.segmentIndex) return null;
  return classifyKeystroke(previous, next);
}
