// Frases y sincronización de Música (experimento 02). Módulo PURO: sin DOM, red ni reloj.
//
// Una frase empieza en su marca LRC y termina donde empieza la línea siguiente (también
// una pausa vacía). La última termina con el vídeo solo si su duración es fiable; si no,
// el final queda sin determinar (null) y la interfaz ofrece un control manual.
// Desfase: positivo = la letra llega más tarde; se suma a todas las marcas.
import { sanitizeText, findUnsupportedChars } from './text-prep.js';

// 02.1: deslizador de −30 a +30 s.
export const MAX_OFFSET_MS = 30_000;
const OFFSET_STEP_MS = 100;
// Una última frase de más de 20 s hasta el final del vídeo suele incluir un final
// instrumental: no se usa como final (no se inventa una duración).
export const MAX_LAST_PHRASE_MS = 20_000;
const MIN_WINDOW_MS = 500;

// Quita lo que el motor no puede escribir (emojis, marcas sueltas) y vuelve a sanear.
function typeableText(text) {
  const removed = findUnsupportedChars(text).reduce((t, char) => t.split(char).join(' '), text);
  return sanitizeText(removed);
}

/**
 * Frases que escribir a partir de las líneas de parseLrc (ya ordenadas).
 * @returns {{ index: number, text: string, startMs: number, nextMs: number | null }[]}
 */
export function buildPhrases(lines) {
  const phrases = [];
  lines.forEach((line, i) => {
    const text = typeableText(line.text);
    if (text === '') return;
    const next = lines[i + 1];
    phrases.push({ index: phrases.length, text, startMs: line.timeMs, nextMs: next ? next.timeMs : null });
  });
  return phrases;
}

function lastPhraseEnd(startMs, videoDurationMs) {
  const valid = Number.isFinite(videoDurationMs) && videoDurationMs > startMs;
  return valid && videoDurationMs - startMs <= MAX_LAST_PHRASE_MS ? videoDurationMs : null;
}

/**
 * Ventana de reproducción de una frase con el desfase aplicado.
 * @returns {{ startMs: number, endMs: number | null }} endMs null = final desconocido
 */
export function phraseWindow(phrase, { offsetMs = 0, videoDurationMs } = {}) {
  const startMs = Math.max(0, phrase.startMs + offsetMs);
  if (phrase.nextMs === null) return { startMs, endMs: lastPhraseEnd(startMs, videoDurationMs) };
  return { startMs, endMs: Math.max(phrase.nextMs + offsetMs, startMs + MIN_WINDOW_MS) };
}

/** Índice de la frase que suena en `timeMs`, o -1 (antes de empezar o en una pausa). */
export function phraseIndexAt(phrases, timeMs, options = {}) {
  for (let i = phrases.length - 1; i >= 0; i--) {
    const { startMs, endMs } = phraseWindow(phrases[i], options);
    if (timeMs >= startMs) return endMs === null || timeMs < endMs ? i : -1;
  }
  return -1;
}

/** Desfase dentro de ±30 s, en pasos de 0,1 s. */
export function clampOffset(ms) {
  if (!Number.isFinite(ms)) return 0;
  const rounded = Math.round(ms / OFFSET_STEP_MS) * OFFSET_STEP_MS;
  return Math.min(MAX_OFFSET_MS, Math.max(-MAX_OFFSET_MS, rounded)) || 0;
}

/**
 * Desfase total: el del usuario menos el [offset] del archivo LRC (que, por el formato,
 * adelanta la letra cuando es positivo).
 */
export function effectiveOffset(userOffsetMs, lrcOffsetMs = 0) {
  return userOffsetMs - lrcOffsetMs;
}

const SECONDS = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** «+0,3 s», «−1,5 s» o «0,0 s». */
export function formatOffset(ms) {
  const value = SECONDS.format(Math.abs(ms) / 1000);
  if (ms === 0) return `${value} s`;
  return `${ms > 0 ? '+' : '−'}${value} s`;
}

/** Efecto del desfase en una frase sencilla. */
export function describeOffset(ms) {
  if (ms === 0) return 'Sin desfase: la letra usa los tiempos originales.';
  const value = `${SECONDS.format(Math.abs(ms) / 1000)} s`;
  return ms > 0 ? `La letra se muestra ${value} más tarde.` : `La letra se muestra ${value} antes.`;
}

// --- 02.1: escritura mientras suena la canción ------------------------------------

// Valores EXPERIMENTALES (configurables en las pruebas): la frase aparece `leadMs` antes
// de cantarse y debe terminarse `safetyMs` antes de que empiece la siguiente frase.
export const DEFAULT_TIMING = Object.freeze({ leadMs: 1000, safetyMs: 300 });

/**
 * Momentos de la frase `index` con el desfase: aparición (showAtMs), inicio (startMs) y
 * límite para terminarla (deadlineMs; null en la última). El límite es la siguiente
 * FRASE escribible, así que las pausas instrumentales intermedias se escuchan enteras.
 * Si dos frases están más cerca que el margen, el límite es el propio inicio.
 */
export function phraseTimes(phrases, index, { offsetMs = 0, leadMs = DEFAULT_TIMING.leadMs, safetyMs = DEFAULT_TIMING.safetyMs } = {}) {
  const startMs = Math.max(0, phrases[index].startMs + offsetMs);
  const showAtMs = Math.max(0, startMs - leadMs);
  const next = phrases[index + 1];
  const deadlineMs = next ? Math.max(startMs, next.startMs + offsetMs - safetyMs) : null;
  return { showAtMs, startMs, deadlineMs };
}

/** Frase que corresponde a `timeMs` tras un salto: la primera cuyo límite no ha pasado. */
export function phraseForTime(phrases, timeMs, timing) {
  for (let i = 0; i < phrases.length; i++) {
    const { deadlineMs } = phraseTimes(phrases, i, timing);
    if (deadlineMs === null || timeMs < deadlineMs) return i;
  }
  return phrases.length - 1;
}

const MAX_EXTRAPOLATION_MS = 500;

/**
 * Tiempo estimado del vídeo: getCurrentTime() de YouTube se actualiza a saltos, así que,
 * reproduciendo, se suma el tiempo local desde que cambió la última lectura (máx. 0,5 s).
 */
export function estimatePlayerTime({ reportedMs, reportedAtMs, now, playing }) {
  if (!Number.isFinite(reportedMs) || !playing) return reportedMs;
  return reportedMs + Math.min(Math.max(0, now - reportedAtMs), MAX_EXTRAPOLATION_MS);
}

const SLOW_TICK_MS = 200;
const MIN_TICK_MS = 20;
const TICK_MARGIN_MS = 40;

/** Espera hasta la próxima lectura: 200 ms, o menos al acercarse un momento importante. */
export function nextTickDelay(msUntilNext) {
  if (msUntilNext === null || !Number.isFinite(msUntilNext)) return SLOW_TICK_MS;
  return Math.min(SLOW_TICK_MS, Math.max(MIN_TICK_MS, msUntilNext - TICK_MARGIN_MS));
}
